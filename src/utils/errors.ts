/* eslint-disable max-classes-per-file */

/** Thrown when a worker fails to build the HDKey during init — i.e. the user
 *  provided invalid mnemonics/chaincode. Used by the UI layer to distinguish
 *  "bad credentials" from "bad data file" without string-matching on messages. */
export class RecoverHDKeyError extends Error {}

/** Thrown when network connectivity is detected during an offline-only operation. */
export class NetworkDetectedError extends Error {
  constructor() {
    super('Network detected — derive aborted')
    this.name = 'NetworkDetectedError'
  }
}
