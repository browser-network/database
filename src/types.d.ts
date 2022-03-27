export type HexString = string
export type TimeStamp = number
export type GUID = string
export type IDString = string
export type SDPString = string
export type SwitchAddress = string
export type PublicKey = string
export type PrivateKey = string

export type States = { [id: t.HexString]: WrappedState }

declare namespace Crypto {
  export function randomUUID(): string
}
