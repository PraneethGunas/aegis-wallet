/**
 * WebAuthn PRF key derivation (CLIENT-SIDE only)
 *
 * createWallet()     — navigator.credentials.create() with PRF extension
 * authenticate()     — navigator.credentials.get() with PRF, re-derives entropy
 * getCredentialId()  — return stored credential ID for API calls
 *
 * Salt: "aegis-wallet-v1"
 * PRF(passkey_credential, salt) → 32 bytes → BIP39 mnemonic → BIP32 master key
 */

const PRF_SALT = "aegis-wallet-v1";

export async function createWallet() {
  // TODO: Implement WebAuthn PRF credential creation
  // 1. navigator.credentials.create() with PRF extension
  // 2. Extract 32-byte PRF entropy
  // 3. Return { credentialId, publicKey, entropy }
  throw new Error("Not implemented");
}

export async function authenticate() {
  // TODO: Implement WebAuthn PRF authentication
  // 1. navigator.credentials.get() with PRF extension
  // 2. Re-derive 32-byte entropy from same salt
  // 3. Return { credentialId, entropy }
  throw new Error("Not implemented");
}

export function getCredentialId() {
  // TODO: Return stored credential ID from session/localStorage
  throw new Error("Not implemented");
}
