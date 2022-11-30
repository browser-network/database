import * as bnc from '@browser-network/crypto'
import { LocalDB, WrappedState } from './LocalDB'
import type Network from '@browser-network/network'
import type { Message } from '@browser-network/network'
import * as t from './types.d'
import { debugFactory } from './util'

const debug = debugFactory('Db')

// convenience
const wrapState = async <S>(state: S, address: t.IDString, pub: t.PublicKey, priv: t.PrivateKey): Promise<WrappedState<S>> => {
  const wrapp: Omit<WrappedState<S>, 'signature'> = {
    id: address,
    timestamp: Date.now(),
    state: state,
    publicKey: pub
  }

  const signature = await bnc.sign(priv, wrapp)
  const wrapped: WrappedState<S> = Object.assign(wrapp, { signature })

  return wrapped
}

// convenience
const verifySignature = (update: WrappedState) => {
  const { signature, ...wrapp } = update
  return bnc.verifySignature(wrapp, signature, update.publicKey)
}

type StateUpdateMessage = {
  type: 'state-update'
  data: WrappedState
  appId: string
}

type StateRequestMessage = {
  type: 'state-request'
  data: t.IDString // the address for the state for which you're looking
  appId: string
  destination: string
}

type StateOfferingMessage = {
  type: 'state-offering'
  data: StateOfferings
  appId: string
}

type DbMessage =
  StateUpdateMessage |
  StateOfferingMessage |
  StateRequestMessage

// We'll broadcast a mapping of what state we have and
// when it was last updated. If anyone has older, they'll
// ask us for this one and we'll send it over via a state-update.
type StateOfferings = {
  [stateId: t.GUID]: t.TimeStamp
}

type DbProps = {
  network: Network
  secret: string
  appId: string
}

// TODO I've seen a loop before, where state-offering messages are being spammed.
// I don't know how this would have happened as it seems to be hard coded to send only
// once per 5 seconds.
export default class Db<S> {
  appId: string
  network: Network<DbMessage>
  localDB: LocalDB
  networkId: t.IDString
  address: t.IDString
  publicKey: t.PublicKey
  secret: string
  switchAddress: t.SwitchAddress
  allowList: t.IDString[] = []

  private _denyList: { [address: t.PublicKey]: true } = {}
  private _onChangeHandlers: (() => void)[] = []

  constructor({ secret, appId, network }: DbProps) {
    this.networkId = network.networkId
    this.appId = appId
    this.localDB = new LocalDB(appId)
    this.address = network.address
    this.secret = secret
    this.network = network as Network<DbMessage>

    this.network.on('message', (message) => {
      if (message.appId !== this.appId) return
      this.onMessage(message)
    })

    // Here we derive the pub key from the private
    this.publicKey = bnc.derivePubKey(secret)

    setInterval(this.broadcastStateOfferings, 5000)
  }

  /**
  * @description This is how you write data to the network. This will put whatever
  * state you give it into a DB specific wrapper with your state in the `state` key.
  */
  async set(state: S): Promise<void> {
    // set to local state
    const data = await wrapState(state, this.address, this.publicKey, this.secret)
    this.setLocal(data)

    // send update into the network
    this.broadcastStateUpdate(data)
  }

  /**
  * @description Get the state of the user whose address is passed in.
  */
  get(address: t.IDString): WrappedState<S> | undefined {
    return this.localDB.get(address) as WrappedState<S>
  }

  /**
  * @description Get all entries from our local DB, wrapped in the DB's
  * WrappedState type.
  *
  * @TODO: Does it need to be wrapped? Does the user ever care about this
  * wrapping or should they just be able to go straight to their state?
  */
  getAll = () => this.localDB.getAll() as WrappedState<S>[]

  /**
  * @description This will fire every time we update our state. This way reactive
  * UIs can listen for changes and update based on the new state of the world
  */
  onChange(handler: () => void) {
    this._onChangeHandlers.push(handler)
  }

  /**
  * @description clear the DB of all listeners.
  */
  removeChangeHandlers() {
    this._onChangeHandlers = []
  }

  /**
  * @description clear the DB of a specific listener.
  */
  removeChangeHandler(func: Function) {
    const handlers = Array.from(this._onChangeHandlers)

    handlers.forEach((handler, i) => {
      if (handler === func) {
        this._onChangeHandlers.splice(i, 1)
      }
    })
  }

  /**
  * @description Clear the local storage of everyone's items. Essentially resets the machine
  * to as if it's never seen the network before. If it is connected still, it will
  * rapidly start to repopulate.
  */
  clear = () => {
    this.localDB.clear()
    this.runChangeHandlers()
  }

  /**
  * @description Effectively blocks a user. Adds them to our deny list, which means we'll no longer
  * accept updates from them, which means we will no longer forward their updates as well. Also
  * removes their state from our storage. It's up to the developer to keep track of these (probably
  * within the state object that they store in this db), and repopulate this list on startup.
  * Calling deny with an address that's already blocked is a noop and O(1) time so don't worry about
  * spamming this call.
  */
 deny = (address: t.PublicKey) => {
   if (this._denyList[address]) { return }
   this._denyList[address] = true
   this.localDB.remove(address)
 }

 /**
 * @description Unblock a user. Removes them from our deny list, at which point the DB will naturally
 * start to repopulate that user's state.
 */
 allow = (address: t.PublicKey) => {
   delete this._denyList[address]
 }

  private onMessage = (message: DbMessage & Message) => {
    switch (message.type) {
      case 'state-offering': {
        debug(5, 'received state-offering:', message)
        return this.onStateOffering(message.data, message.address)
      }
      case 'state-request': {
        debug(5, 'received state-request:', message)
        return this.broadcastStateUpdateByStateId(message.data)
      }
      case 'state-update': {
        debug(5, 'received state-update:', message)
        return this.onStateUpdate(message.data)
      }
    }
  }

  private onStateOffering(offerings: StateOfferings, sender: t.IDString) {
    const requestState = (address: t.IDString) => {
      this.network.broadcast({
        type: 'state-request',
        appId: this.appId,
        destination: sender,
        data: address
      })
    }

    for (const remoteId in offerings) {
      const remoteStateTimestamp = offerings[remoteId]
      const localState = this.localDB.get(remoteId)

      if (!localState) {
        // we don't even have this state yet
        requestState(remoteId)
      } else if (localState.timestamp < remoteStateTimestamp) {
        // This means they have a newer offering, for which we will now ask
        requestState(remoteId)
      } // Otherwise we have a newer or equal version
    }
  }

  private async onStateUpdate(update: WrappedState) {
    // We won't accept state if:
    // * The sender is on our deny list, or
    // * We have an allow list going and the sender is not on it
    const isForbidden =
      this._denyList[update.publicKey] ||
      (this.allowList.length > 0 && !this.allowList.includes(update.publicKey))

    if (isForbidden) return debug(5, 'state update from pubKey not allowed:', update.publicKey)

    debug(5, 'received update from another node:', update)
    if (!(await this.verify(update))) { return }
    this.setLocal(update)
  }

  // Broadcast an update for a specific state id
  private broadcastStateUpdate(data: WrappedState) {
    this.network.broadcast({
      type: 'state-update',
      appId: this.appId,
      data: data
    })
  }

  private broadcastStateUpdateByStateId(stateId: t.GUID) {
    const data = this.localDB.get(stateId)
    if (!data) { return }
    this.broadcastStateUpdate(data)
  }

  /**
  * We will periodically inform the network of what states we have
  * and how old they are. If someone else hears that we have a state
  * newer than what they have on record, they can send us a request for
  * what we have.
  */
  private broadcastStateOfferings = () => {
    const offerings = {}
    for (const state of this.localDB.getAll()) {
      offerings[state.id] = state.timestamp
    }

    this.network.broadcast({
      type: 'state-offering',
      appId: this.appId,
      data: offerings
    })
  }

  private setLocal(wrapped: WrappedState) {
    this.localDB.set(wrapped, wrapped.id)

    // Every time we set local, we've updated our storage, and we
    // want to inform the user as such
    this.runChangeHandlers()
  }

  private runChangeHandlers = () => {
    this._onChangeHandlers.forEach(handler => handler())
  }

  private async verify(update: WrappedState): Promise<boolean> {
    // 1. verify timestamp is newer than last
    if (!this.isNew(update)) { return false }
    // 2. check veracity of signature
    if (!(await verifySignature(update))) {
      debug(1, 'update does not pass verification! update, local version:', update, this.localDB.get(update.id))
      // TODO add motrucka to rude list
      return false
    }

    return true
  }

  private isNew(update: WrappedState): boolean {
    const local = this.get(update.id)
    if (!local) return true
    return update.timestamp > local.timestamp
  }

}
