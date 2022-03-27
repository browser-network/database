import * as t from './types.d'

export type WrappedState<S = unknown> = {
  // Identify this bit of state by who it belongs to
  id: t.IDString

  // Every state has a timestamp to represent when it was last updated.
  // If there's a newer timestamp than the one we have on file, we check
  // its veracity and save it.
  timestamp: t.TimeStamp

  // Every state has to be signed by the user. This is how we verify
  // the veracity of each state
  signature: t.HexString

  // This will be hashed and included in signature to ensure the veracity
  // of someone's data.
  state: S

  // To ensure veracity of state
  publicKey: t.PublicKey
}

type SupportedMetaKeys = 'clientId'

export class LocalDB {
  keyPrefix = 'dbdb'

  appId: t.GUID

  constructor(appId: t.GUID) {
    this.appId = appId
  }

  set(val: WrappedState, clientId: t.IDString): void {
    const key = this.buildKey(clientId)
    localStorage.setItem(key, JSON.stringify(val))
  }

  get(clientId: t.IDString): WrappedState | undefined {
    const key = this.buildKey(clientId)
    return this.getByKey(key)
  }

  getAll(): WrappedState[] {
    const lsKeys = Object.keys(localStorage)
    const ourKeys = lsKeys.filter(key => key.indexOf(this.buildKey('')) > -1)
    return ourKeys.map(this.getByKey)
  }

  setMeta(key: SupportedMetaKeys, val: string) {
    return localStorage.setItem(key, val)
  }

  getMeta(key: SupportedMetaKeys) {
    return localStorage.getItem(key)
  }

  buildKey(clientId: t.IDString) {
    return `${this.keyPrefix}-${this.appId}-${clientId}`
  }

  private getByKey(key: string): WrappedState {
    return JSON.parse(localStorage.getItem(key))
  }

}

