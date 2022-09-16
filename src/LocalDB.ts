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

const buildStorageShim = () => {
  // @ts-ignore
  let localStorageShim: Storage = {}

  localStorageShim.setItem = (key: string, val: string) => {
    localStorageShim[key] = val
  }

  localStorageShim.getItem = (key: string) => {
    return localStorageShim[key]
  }

  localStorageShim.removeItem = (key: string) => {
    delete localStorageShim[key]
  }

  return localStorageShim
}

export class LocalDB {
  keyPrefix = 'dbdb'
  localStorage: ReturnType<typeof buildStorageShim>

  appId: t.GUID

  constructor(appId: t.GUID) {
    this.appId = appId

    this.localStorage = globalThis.localStorage || buildStorageShim()
  }

  set(val: WrappedState, address: t.IDString): void {
    const key = this.buildKey(address)
    this.localStorage.setItem(key, JSON.stringify(val))
  }

  get(address: t.IDString): WrappedState | undefined {
    const key = this.buildKey(address)
    return this.getByKey(key)
  }

  getAll(): WrappedState[] {
    const lsKeys = Object.keys(this.localStorage)
    const ourKeys = lsKeys.filter(key => key.indexOf(this.buildKey('')) > -1)
    return ourKeys.map(this.getByKey)
  }

  // Remove a single item
  remove(address: t.IDString): void {
    const key = this.buildKey(address)
    this.localStorage.removeItem(key)
  }

  // Remove all items
  clear(): void {
    this.getAll().forEach(wrapped => {
      this.remove(wrapped.id)
    })
  }

  buildKey(address: t.IDString) {
    return `${this.keyPrefix}-${this.appId}-${address}`
  }

  private getByKey = (key: string): WrappedState | null => {
    const gotten = this.localStorage.getItem(key)
    if (!gotten) return null
    return JSON.parse(gotten)
  }

}

