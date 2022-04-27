import * as bnc from '@browser-network/crypto'

import { LocalDB, WrappedState } from './LocalDB'
import { Network, Message } from '@browser-network/network'
import * as t from './types.d'
import { debugFactory } from './util'

const debug = debugFactory('Dbdb')

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
}

type StateOfferingMessage = {
  type: 'state-offering'
  data: StateOfferings
  appId: string
}

type DbdbMessage =
  StateUpdateMessage |
  StateOfferingMessage |
  StateRequestMessage

// We'll broadcast a mapping of what state we have and
// when it was last updated. If anyone has older, they'll
// ask us for this one and we'll send it over via a state-update.
type StateOfferings = {
  [stateId: t.GUID]: t.TimeStamp
}

type DbdbProps = {
  secret: string
  appId: string
  network: Network
}

export class Dbdb<S> {
  appId: string
  network: Network
  localDB: LocalDB
  networkId: t.IDString
  address: t.IDString
  publicKey: t.PublicKey // TODO not sure yet if this will be itself or just be the address
  secret: string
  switchAddress: t.SwitchAddress
  allowList: t.IDString[] = []
  denyList: t.IDString[] = []

  _onChangeHandlers: (() => void)[] = []

  constructor({ secret, appId, network }: DbdbProps) {
    this.networkId = network.networkId
    this.appId = appId
    this.localDB = new LocalDB(appId)
    this.address = network.address
    this.secret = secret
    this.network = network

    this.network.on('message', ({ appId, message }) => {
      if (appId !== this.appId) return
      this.onMessage(message as DbdbMessage & Message)
    })

    // Here we derive the pub key from the private
    this.publicKey = bnc.derivePubKey(secret)

    setInterval(this.broadcastStateOfferings, 5000)
  }

  async set(state: S): Promise<void> {
    // set to local state
    const data = await wrapState(state, this.address, this.publicKey, this.secret)
    this.setLocal(data)

    // send update into the network
    this.broadcastStateUpdate(data)
  }

  get(address: t.IDString): WrappedState<S> | undefined {
    return this.localDB.get(address) as WrappedState<S>
  }

  getAll = () => this.localDB.getAll()

  // This will fire every time we update our state. This way reactive
  // UIs can listen for changes and update based on the new state of the world
  onChange(handler: () => void) {
    this._onChangeHandlers.push(handler)
  }

  // Generate the type of secret key that dbdb uses for its
  // cryptography.
  static generateSecret() {
    return bnc.generateSecret()
  }

  private onMessage = (message: DbdbMessage & Message) => {
    switch (message.type) {
      case 'state-offering': {
        debug(5, 'received state-offering:', message)
        return this.onStateOffering(message.data)
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

  private onStateOffering(offerings: StateOfferings) {
    const requestState = (address: t.IDString) => {
      this.network.broadcast({
        type: 'state-request',
        appId: this.appId,
        destination: address,
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
      this.denyList.includes(update.publicKey) ||
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

  // We will periodically inform the network of what states we have
  // and how old they are. If someone else hears that we have a state
  // newer than what they have on record, they can send us a request for
  // what we have.
  private broadcastStateOfferings = () => {
    const offerings = {}
    for (const state of this.localDB.getAll()) {
      offerings[state.id] = state.timestamp
    }

    this.network.broadcast<DbdbMessage>({
      type: 'state-offering',
      appId: this.appId,
      data: offerings
    })
  }

  private setLocal(wrapped: WrappedState) {
    this.localDB.set(wrapped, wrapped.id)

    // Every time we set local, we've updated our storage, and we
    // want to inform the user as such
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
