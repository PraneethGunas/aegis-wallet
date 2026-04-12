/**
 * Bitcoin key derivation + transaction signing (CLIENT-SIDE only)
 * Uses: @scure/btc-signer, @scure/bip32, @scure/bip39
 *
 * Key paths (mainnet):
 *   funding_key:  m/86h/0h/0h/0/0  (P2TR Taproot — signs L1 txs)
 *   auth_key:     m/84h/0h/0h/0/0  (Native SegWit — L2 auth only)
 */

import * as btc from "@scure/btc-signer";
import { hex } from "@scure/base";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

// Active key material (held in memory only, cleared on discard)
let _fundingKey = null;
let _authKey = null;
let _root = null; // BIP32 root for deriving indexed addresses

/**
 * Derive funding and auth keys from 32-byte PRF entropy.
 *
 * entropy → BIP39 mnemonic (never shown to user) → BIP32 master key
 * → funding_key at m/86'/0'/0'/0/0 (Taproot, for L1 signing)
 * → auth_key at m/84'/0'/0'/0/0 (SegWit, for L2 auth only)
 *
 * Returns { fundingKey, authKey } (HDKey objects)
 */
export function deriveKeys(entropy) {
  if (!(entropy instanceof Uint8Array) || entropy.length !== 32) {
    throw new Error("entropy must be a 32-byte Uint8Array");
  }

  // Convert entropy to BIP39 mnemonic (256-bit entropy → 24-word mnemonic)
  const mnemonic = entropyToMnemonic(entropy, wordlist);

  // Mnemonic → BIP32 seed (no passphrase)
  const seed = mnemonicToSeedSync(mnemonic);

  // BIP32 master key — kept for deriving fresh addresses at higher indices
  _root = HDKey.fromMasterSeed(seed);

  // Derive funding key: m/86'/0'/0'/0/0 (BIP86 Taproot, index 0)
  _fundingKey = _root.derive("m/86'/0'/0'/0/0");

  // Derive auth key: m/84'/0'/0'/0/0 (BIP84 Native SegWit)
  _authKey = _root.derive("m/84'/0'/0'/0/0");

  return {
    fundingKey: _fundingKey,
    authKey: _authKey,
  };
}

/**
 * Derive P2TR (Taproot) address at a specific index.
 * Path: m/86'/0'/0'/0/{index}
 *
 * index=0 is the default funding address. Higher indices are fresh
 * receive addresses — avoids address reuse without Silent Payments.
 */
export function getFundingAddress(fundingKeyOrIndex) {
  let key;
  if (typeof fundingKeyOrIndex === "number") {
    if (!_root) throw new Error("No root key. Call deriveKeys() first.");
    key = _root.derive(`m/86'/0'/0'/0/${fundingKeyOrIndex}`);
  } else {
    key = fundingKeyOrIndex || _fundingKey;
  }
  if (!key) throw new Error("No funding key available. Call deriveKeys() first.");

  const xOnlyPubkey = key.publicKey.slice(1);
  const payment = btc.p2tr(xOnlyPubkey);
  return payment.address;
}

/**
 * Get a fresh receive address by incrementing the derivation index.
 * Index is persisted in localStorage so it survives refreshes.
 * Each call returns a new unused address (m/86'/0'/0'/0/N).
 */
export function getNextFundingAddress() {
  if (!_root) throw new Error("No root key. Call deriveKeys() first.");

  const idx = parseInt(localStorage.getItem("aegis_address_index") || "0");
  const nextIdx = idx + 1;
  localStorage.setItem("aegis_address_index", String(nextIdx));

  const address = getFundingAddress(nextIdx);
  // Update the current receive address
  localStorage.setItem("aegis_funding_address", address);

  return { address, index: nextIdx };
}

/**
 * Get the current receive address index.
 */
export function getCurrentAddressIndex() {
  return parseInt(localStorage.getItem("aegis_address_index") || "0");
}

/**
 * Get ALL derived addresses from index 0 to current.
 * Used for balance aggregation — we need to check every address we've shown.
 */
export function getAllFundingAddresses() {
  if (!_root) return [localStorage.getItem("aegis_funding_address")].filter(Boolean);

  const currentIdx = getCurrentAddressIndex();
  const addresses = [];
  for (let i = 0; i <= currentIdx; i++) {
    addresses.push(getFundingAddress(i));
  }
  return addresses;
}

/**
 * Get the auth key's public key as hex (for sending to backend during registration).
 */
export function getAuthPublicKey(authKey) {
  const key = authKey || _authKey;
  if (!key) throw new Error("No auth key available. Call deriveKeys() first.");
  return hex.encode(key.publicKey);
}

/**
 * Sign a PSBT (Partially Signed Bitcoin Transaction) in the browser.
 *
 * psbtHex — hex-encoded PSBT from the backend
 * fundingKey — HDKey (if not provided, uses cached key)
 *
 * Returns the signed transaction hex ready for broadcast.
 */
export function signTransaction(psbtHex, fundingKey) {
  const key = fundingKey || _fundingKey;
  if (!key) throw new Error("No funding key available. Call deriveKeys() first.");

  const tx = btc.Transaction.fromPSBT(hex.decode(psbtHex));

  // Sign all Taproot inputs with the private key
  tx.sign(key.privateKey);
  tx.finalize();

  return tx.hex;
}

/**
 * Build an unsigned PSBT for funding the Lightning wallet (L1 → L2).
 *
 * fundingKey — HDKey
 * lndAddress — LND's on-chain address (from backend)
 * amountSats — amount in satoshis to send
 * utxos — array of { txid, vout, value } from backend
 * feeRate — sat/vB fee rate
 *
 * Returns hex-encoded PSBT for signing.
 */
export function createFundLNTransaction(
  fundingKey,
  lndAddress,
  amountSats,
  utxos,
  feeRate = 2
) {
  const key = fundingKey || _fundingKey;
  if (!key) throw new Error("No funding key available. Call deriveKeys() first.");

  const xOnlyPubkey = key.publicKey.slice(1);
  const payment = btc.p2tr(xOnlyPubkey);

  const tx = new btc.Transaction();

  // Add inputs from UTXOs
  let totalInput = 0n;
  for (const utxo of utxos) {
    tx.addInput({
      txid: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: payment.script,
        amount: BigInt(utxo.value),
      },
      tapInternalKey: xOnlyPubkey,
    });
    totalInput += BigInt(utxo.value);
  }

  const amount = BigInt(amountSats);

  // Estimate fee (Taproot input ~58 vB, output ~43 vB)
  const estimatedVbytes = BigInt(utxos.length * 58 + 2 * 43 + 10);
  const fee = estimatedVbytes * BigInt(feeRate);

  if (totalInput < amount + fee) {
    throw new Error(
      `Insufficient funds: have ${totalInput} sats, need ${amount + fee} sats (including ${fee} fee)`
    );
  }

  // Output to LND
  tx.addOutputAddress(lndAddress, amount);

  // Change output back to our address
  const change = totalInput - amount - fee;
  if (change > 546n) {
    // Only add change if above dust limit
    tx.addOutputAddress(payment.address, change);
  }

  return hex.encode(tx.toPSBT());
}

/**
 * Check if keys are currently loaded in memory.
 */
export function isKeysLoaded() {
  return _root !== null;
}

/**
 * Zero out all key material from memory.
 * Call this when the user navigates away or the session ends.
 */
export function discardKeys() {
  if (_fundingKey?.privateKey) {
    _fundingKey.privateKey.fill(0);
  }
  if (_authKey?.privateKey) {
    _authKey.privateKey.fill(0);
  }
  _fundingKey = null;
  _authKey = null;
  _root = null;
}
