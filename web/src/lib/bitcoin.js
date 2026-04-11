/**
 * Bitcoin key derivation + transaction signing (CLIENT-SIDE only)
 * Uses: bitcoinjs-lib, bip39, bip32, tiny-secp256k1, ecpair
 *
 * Key paths (mainnet):
 *   funding_key:  m/86h/0h/0h/0/0  (P2TR Taproot — signs L1 txs)
 *   auth_key:     m/84h/0h/0h/0/0  (Native SegWit — L2 auth only)
 */

import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { BIP32Factory } from "bip32";
import * as bip39 from "bip39";
import ECPairFactory from "ecpair";

// Initialize libraries with secp256k1
bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

const NETWORK = bitcoin.networks.bitcoin; // mainnet

// Active key material (held in memory only, cleared on discard)
let _fundingKey = null;
let _authKey = null;

/**
 * Derive funding and auth keys from 32-byte PRF entropy.
 *
 * entropy → BIP39 mnemonic (never shown to user) → BIP32 master key
 * → funding_key at m/86'/0'/0'/0/0 (Taproot, for L1 signing)
 * → auth_key at m/84'/0'/0'/0/0 (SegWit, for L2 auth only)
 *
 * Returns { fundingKey, authKey } (BIP32 node objects)
 */
export function deriveKeys(entropy) {
  if (!(entropy instanceof Uint8Array) || entropy.length !== 32) {
    throw new Error("entropy must be a 32-byte Uint8Array");
  }

  // Convert entropy to BIP39 mnemonic (256-bit entropy → 24-word mnemonic)
  const mnemonic = bip39.entropyToMnemonic(Buffer.from(entropy));

  // Mnemonic → BIP32 seed (no passphrase)
  const seed = bip39.mnemonicToSeedSync(mnemonic);

  // BIP32 master key
  const root = bip32.fromSeed(seed, NETWORK);

  // Derive funding key: m/86'/0'/0'/0/0 (BIP86 Taproot)
  _fundingKey = root.derivePath("m/86'/0'/0'/0/0");

  // Derive auth key: m/84'/0'/0'/0/0 (BIP84 Native SegWit)
  _authKey = root.derivePath("m/84'/0'/0'/0/0");

  return {
    fundingKey: _fundingKey,
    authKey: _authKey,
  };
}

/**
 * Derive P2TR (Taproot) address for mainnet from a funding key.
 * Returns a bc1p... address string.
 */
export function getFundingAddress(fundingKey) {
  const key = fundingKey || _fundingKey;
  if (!key) throw new Error("No funding key available. Call deriveKeys() first.");

  // For BIP86 Taproot (key-path only, no script tree):
  // Use the x-only public key (32 bytes, drop the prefix byte)
  const xOnlyPubkey = key.publicKey.subarray(1, 33);

  const { address } = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    network: NETWORK,
  });

  return address;
}

/**
 * Get the auth key's public key as hex (for sending to backend during registration).
 */
export function getAuthPublicKey(authKey) {
  const key = authKey || _authKey;
  if (!key) throw new Error("No auth key available. Call deriveKeys() first.");
  return key.publicKey.toString("hex");
}

/**
 * Sign a PSBT (Partially Signed Bitcoin Transaction) in the browser.
 *
 * psbtHex — hex-encoded PSBT from the backend
 * fundingKey — BIP32 key node (if not provided, uses cached key)
 *
 * Returns the signed transaction hex ready for broadcast.
 */
export function signTransaction(psbtHex, fundingKey) {
  const key = fundingKey || _fundingKey;
  if (!key) throw new Error("No funding key available. Call deriveKeys() first.");

  const psbt = bitcoin.Psbt.fromHex(psbtHex, { network: NETWORK });

  // For Taproot (P2TR), we need the tweaked key pair
  const xOnlyPubkey = key.publicKey.subarray(1, 33);

  // Create a signer with the tweaked private key for key-path spending
  const tweakedSigner = tweakSigner(key, { network: NETWORK });

  // Sign all inputs
  for (let i = 0; i < psbt.inputCount; i++) {
    try {
      psbt.signInput(i, tweakedSigner);
    } catch {
      // Input might not belong to this key (e.g., multi-input tx)
    }
  }

  psbt.finalizeAllInputs();
  return psbt.extractTransaction().toHex();
}

/**
 * Build an unsigned PSBT for funding the Lightning wallet (L1 → L2).
 *
 * fundingKey — BIP32 key node
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

  const xOnlyPubkey = key.publicKey.subarray(1, 33);
  const { output: myOutput } = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    network: NETWORK,
  });

  const psbt = new bitcoin.Psbt({ network: NETWORK });

  // Add inputs from UTXOs
  let totalInput = 0;
  for (const utxo of utxos) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: myOutput,
        value: utxo.value,
      },
      tapInternalKey: xOnlyPubkey,
    });
    totalInput += utxo.value;
  }

  // Estimate fee (Taproot input ~58 vB, output ~43 vB)
  const estimatedVbytes = utxos.length * 58 + 2 * 43 + 10;
  const fee = estimatedVbytes * feeRate;

  if (totalInput < amountSats + fee) {
    throw new Error(
      `Insufficient funds: have ${totalInput} sats, need ${amountSats + fee} sats (including ${fee} fee)`
    );
  }

  // Output to LND
  psbt.addOutput({
    address: lndAddress,
    value: amountSats,
  });

  // Change output back to our address
  const change = totalInput - amountSats - fee;
  if (change > 546) {
    // Only add change if above dust limit
    const fundingAddress = getFundingAddress(key);
    psbt.addOutput({
      address: fundingAddress,
      value: change,
    });
  }

  return psbt.toHex();
}

/**
 * Create a tweaked signer for Taproot key-path spending (BIP86).
 */
function tweakSigner(signer, opts = {}) {
  const privateKey = signer.privateKey;
  if (!privateKey) throw new Error("Private key required for signing");

  // Tweak the private key for key-path spending
  const tweakedPrivateKey = ecc.privateNegate(privateKey);

  // Use the parity-correct key
  const pubkey = ecc.pointFromScalar(privateKey);
  const pubkeyX = pubkey.subarray(1, 33);

  // Check if we need to negate
  const tweakHash = bitcoin.crypto.taggedHash(
    "TapTweak",
    Buffer.from(pubkeyX)
  );

  const tweakedKey = ecc.privateAdd(privateKey, tweakHash);
  if (!tweakedKey) throw new Error("Failed to tweak private key");

  // Check parity and possibly negate
  const tweakedPubkey = ecc.pointFromScalar(tweakedKey);
  const needsNegate = tweakedPubkey[0] === 3;

  const finalKey = needsNegate
    ? ecc.privateNegate(tweakedKey)
    : tweakedKey;

  return {
    publicKey: Buffer.from(tweakedPubkey.subarray(1, 33)),
    sign(hash) {
      return Buffer.from(ecc.signSchnorr(hash, finalKey));
    },
  };
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
}
