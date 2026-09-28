/* eslint-disable max-classes-per-file */
/**
 * Lightweight error classes shared between the main thread and the derive
 * worker. Kept free of any crypto/WASM imports so the UI can `instanceof`
 * them without dragging the whole chain-SDK graph into the main bundle.
 */

export class MissDataError extends Error {}

export class MissRequiredFieldError extends Error {}

export class UnsupportBlockChainError extends Error {}

export class ValidateAddressError extends Error {}

/** Thrown when the Liquid WASM call returns a non-success status. */
export class LiquidSDKError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LiquidSDKError'
  }
}
