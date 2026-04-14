/**
 * WebAuthn PRF key derivation (CLIENT-SIDE only)
 *
 * Wallet flow:
 *   1. createWallet()  — credentials.create() ONCE to register passkey
 *                         then immediate credentials.get() to eval PRF
 *   2. authenticate()  — credentials.get() with stored credential + salt
 *                         always returns the same 32-byte entropy
 *
 * PRF guarantee: same credential + same salt = same output, every time.
 * Each credentials.create() makes a NEW credential with a NEW PRF secret.
 * Never call create() twice — that generates a different wallet.
 *
 * Salt: "aegis-wallet-v1"
 */

const PRF_SALT = "aegis-wallet-v1";
const CREDENTIAL_KEY = "aegis_credential_id";

function saltToBytes(salt) {
  return new TextEncoder().encode(salt);
}

function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function extractPrfOutput(extensionResults) {
  const prf = extensionResults?.prf;
  if (!prf?.results?.first) return null;
  return new Uint8Array(prf.results.first);
}

/**
 * Check if a wallet credential already exists.
 */
export function hasExistingWallet() {
  return !!localStorage.getItem(CREDENTIAL_KEY);
}

/**
 * Create a new wallet. Call ONCE — ever.
 *
 * 1. credentials.create() to register passkey (signals PRF support)
 * 2. Immediately credentials.get() to evaluate PRF with our salt
 * 3. Store credential ID — this is the permanent wallet identity
 *
 * Calling this again creates a DIFFERENT wallet with DIFFERENT keys.
 */
export async function createWallet() {
  // Guard: refuse to create if wallet already exists
  if (hasExistingWallet()) {
    throw new Error(
      "Wallet already exists. Use authenticate() to open it. " +
      "Creating again would generate a different wallet with different keys."
    );
  }

  const userId = crypto.getRandomValues(new Uint8Array(32));

  const salt = saltToBytes(PRF_SALT);

  // Register the passkey — try PRF eval during create (one biometric if supported)
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: {
        name: "Aegis Wallet",
        id: window.location.hostname,
      },
      user: {
        id: userId,
        name: `aegis-${new Date().toISOString().slice(0, 10)}`,
        displayName: `Aegis Wallet (${new Date().toLocaleDateString()})`,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },   // ES256
        { alg: -257, type: "public-key" },  // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      extensions: {
        prf: { eval: { first: salt } },  // Try eval during create
      },
    },
  });

  const credentialId = bufferToBase64url(credential.rawId);
  const publicKey = bufferToBase64url(
    credential.response.getPublicKey
      ? credential.response.getPublicKey()
      : credential.response.attestationObject
  );

  const createExtensions = credential.getClientExtensionResults();

  // Check if PRF is supported at all
  if (createExtensions?.prf?.enabled === false && !createExtensions?.prf?.results?.first) {
    throw new Error(
      "Your device does not support the PRF extension. " +
      "Please use a device with biometric authentication (Face ID, Touch ID, Windows Hello)."
    );
  }

  // Store credential ID — this is the permanent wallet identity
  localStorage.setItem(CREDENTIAL_KEY, credentialId);

  // Try to extract PRF output from create (one biometric path)
  let entropy = extractPrfOutput(createExtensions);

  if (!entropy) {
    // Authenticator doesn't support PRF during create — fall back to get() (second biometric)
    entropy = await evaluatePrf(credential.rawId);
  }

  return { credentialId, publicKey, entropy };
}

/**
 * Authenticate with the existing passkey and derive PRF entropy.
 * Same credential + same salt = same 32-byte output. Always.
 */
export async function authenticate() {
  const storedCredentialId = localStorage.getItem(CREDENTIAL_KEY);
  if (!storedCredentialId) {
    throw new Error("No wallet found. Create one first.");
  }

  const rawId = base64urlToBuffer(storedCredentialId).buffer;
  const entropy = await evaluatePrf(rawId, storedCredentialId);

  return { credentialId: storedCredentialId, entropy };
}

/**
 * Recover an existing wallet by showing the browser's passkey picker.
 * Calls credentials.get() with NO allowCredentials — browser shows ALL
 * passkeys for this domain. User picks one → PRF eval → same wallet restored.
 *
 * Use when the credential ID was lost (localStorage cleared) but the
 * passkey still exists on the device / iCloud / Google.
 */
export async function recoverWallet() {
  const salt = saltToBytes(PRF_SALT);

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: window.location.hostname,
      // No allowCredentials — browser shows ALL passkeys for this domain
      userVerification: "required",
      extensions: {
        prf: {
          eval: { first: salt },
        },
      },
    },
  });

  const credentialId = bufferToBase64url(assertion.rawId);
  const entropy = extractPrfOutput(assertion.getClientExtensionResults());

  if (!entropy) {
    throw new Error(
      "Failed to derive key material. The selected passkey may not support PRF."
    );
  }

  // Don't store yet — let the caller verify this is the right wallet first
  return { credentialId, entropy };
}

/**
 * Confirm recovery — store the credential ID after the user verifies it's the right wallet.
 */
export function confirmRecovery(credentialId) {
  localStorage.setItem(CREDENTIAL_KEY, credentialId);
}

/**
 * Core PRF evaluation via credentials.get().
 * This is where the deterministic 32-byte secret comes from.
 */
async function evaluatePrf(rawId, credentialIdB64) {
  const salt = saltToBytes(PRF_SALT);

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: window.location.hostname,
      allowCredentials: [
        {
          type: "public-key",
          id: rawId,
        },
      ],
      userVerification: "required",
      extensions: {
        prf: {
          eval: {
            first: salt,
          },
        },
      },
    },
  });

  const extensionResults = assertion.getClientExtensionResults();
  const entropy = extractPrfOutput(extensionResults);

  if (!entropy) {
    throw new Error(
      "Failed to derive key material from passkey. " +
      "Your device may not support the PRF extension."
    );
  }

  return entropy;
}

/**
 * Return stored credential ID, or null.
 */
export function getCredentialId() {
  return localStorage.getItem(CREDENTIAL_KEY);
}

/**
 * Clear stored credential (logout). Does NOT delete the passkey from the device.
 * User can re-authenticate later and get the same keys.
 */
export function clearCredential() {
  localStorage.removeItem(CREDENTIAL_KEY);
}
