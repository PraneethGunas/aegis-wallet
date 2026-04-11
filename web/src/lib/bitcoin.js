/**
 * Bitcoin key derivation + transaction signing (CLIENT-SIDE only)
 * Uses: bitcoinjs-lib, bip39, tiny-secp256k1
 *
 * Key paths (mainnet):
 *   funding_key:  m/86h/0h/0h/0/0  (P2TR Taproot — signs L1 txs)
 *   auth_key:     m/84h/0h/0h/0/0  (Native SegWit — L2 auth only)
 */

export function deriveKeys(entropy) {
  // TODO: Implement BIP39 mnemonic (never shown) → BIP32 master key
  // → funding_key at m/86h/0h/0h/0/0
  // → auth_key at m/84h/0h/0h/0/0
  // Return { fundingKey, authKey }
  throw new Error("Not implemented");
}

export function getFundingAddress(fundingKey) {
  // TODO: Derive P2TR Taproot address for mainnet (bc1p...)
  throw new Error("Not implemented");
}

export function signTransaction(psbt, fundingKey) {
  // TODO: Sign a PSBT in browser, return signed hex
  throw new Error("Not implemented");
}

export function createFundLNTransaction(fundingKey, lndAddress, amount) {
  // TODO: Build PSBT for L1 → L2 funding
  throw new Error("Not implemented");
}

export function discardKeys() {
  // TODO: Zero out all key material from memory
}
