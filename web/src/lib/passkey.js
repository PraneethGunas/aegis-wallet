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
const CREDENTIAL_KEY = "aegis_credential_id";

/**
 * Convert a string to a Uint8Array (UTF-8 encoded) for use as PRF salt
 */
function saltToBytes(salt) {
  return new TextEncoder().encode(salt);
}

/**
 * Convert an ArrayBuffer to a base64url string (for credential IDs)
 */
function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Convert a base64url string back to a Uint8Array
 */
function base64urlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Extract PRF output from WebAuthn extension results.
 * Returns 32-byte Uint8Array entropy or null if PRF not supported.
 */
function extractPrfOutput(extensionResults) {
  const prf = extensionResults?.prf;
  if (!prf?.results?.first) {
    return null;
  }
  return new Uint8Array(prf.results.first);
}

/**
 * Create a new wallet via WebAuthn passkey with PRF extension.
 *
 * 1. navigator.credentials.create() with PRF extension
 * 2. Extract 32-byte PRF entropy
 * 3. Store credential ID in localStorage
 * 4. Return { credentialId, publicKey, entropy }
 */
export async function createWallet() {
  const salt = saltToBytes(PRF_SALT);

  // Generate a random user ID for the WebAuthn credential
  const userId = crypto.getRandomValues(new Uint8Array(32));

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: {
        name: "Aegis Wallet",
        id: window.location.hostname,
      },
      user: {
        id: userId,
        name: "aegis-user",
        displayName: "Aegis Wallet User",
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" }, // ES256
        { alg: -257, type: "public-key" }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      extensions: {
        prf: {
          eval: {
            first: salt,
          },
        },
      },
    },
  });

  const credentialId = bufferToBase64url(credential.rawId);
  const publicKey = bufferToBase64url(
    credential.response.getPublicKey
      ? credential.response.getPublicKey()
      : credential.response.attestationObject
  );

  // Extract PRF entropy
  const extensionResults = credential.getClientExtensionResults();
  let entropy = extractPrfOutput(extensionResults);

  // If PRF was not available during creation (some authenticators only support
  // it during assertion), immediately do a get() to retrieve it
  if (!entropy) {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: window.location.hostname,
        allowCredentials: [
          {
            type: "public-key",
            id: credential.rawId,
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

    const assertionExtensions = assertion.getClientExtensionResults();
    entropy = extractPrfOutput(assertionExtensions);

    if (!entropy) {
      throw new Error(
        "Your device does not support the PRF extension. " +
          "Please use a device with biometric authentication (Face ID, Touch ID, Windows Hello)."
      );
    }
  }

  // Store credential ID for future authentication
  localStorage.setItem(CREDENTIAL_KEY, credentialId);

  return { credentialId, publicKey, entropy };
}

/**
 * Authenticate with an existing passkey and re-derive PRF entropy.
 *
 * 1. navigator.credentials.get() with PRF extension
 * 2. Re-derive 32-byte entropy from same salt
 * 3. Return { credentialId, entropy }
 */
export async function authenticate() {
  const salt = saltToBytes(PRF_SALT);
  const storedCredentialId = localStorage.getItem(CREDENTIAL_KEY);

  const options = {
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: window.location.hostname,
      userVerification: "required",
      extensions: {
        prf: {
          eval: {
            first: salt,
          },
        },
      },
    },
  };

  // If we have a stored credential ID, scope to it
  if (storedCredentialId) {
    options.publicKey.allowCredentials = [
      {
        type: "public-key",
        id: base64urlToBuffer(storedCredentialId).buffer,
      },
    ];
  }

  const assertion = await navigator.credentials.get(options);

  const credentialId = bufferToBase64url(assertion.rawId);
  const extensionResults = assertion.getClientExtensionResults();
  const entropy = extractPrfOutput(extensionResults);

  if (!entropy) {
    throw new Error(
      "Failed to derive key material from passkey. " +
        "Your device may not support the PRF extension."
    );
  }

  // Update stored credential ID
  localStorage.setItem(CREDENTIAL_KEY, credentialId);

  return { credentialId, entropy };
}

/**
 * Return stored credential ID from localStorage, or null if not set.
 */
export function getCredentialId() {
  return localStorage.getItem(CREDENTIAL_KEY);
}

/**
 * Clear stored credential (for logout/disconnect).
 */
export function clearCredential() {
  localStorage.removeItem(CREDENTIAL_KEY);
}
