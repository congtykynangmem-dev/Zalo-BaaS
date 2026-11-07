// packages/crypto/src/aes.ts

/**
 * Normalizes any master key input (Base64, Hex, or passphrase) into a guaranteed 32-byte (256-bit) raw key.
 * 1. If valid Base64 decoding results in 32 bytes, uses it directly.
 * 2. If 64-char Hex string, decodes to 32 bytes.
 * 3. Fallback: Deterministically derives 32 bytes using SHA-256 for any passphrase or irregular string.
 *
 * @param keyInput Master key string in Base64, Hex, or plain passphrase format.
 * @returns 32-byte Uint8Array ready for AES-256 Web Crypto.
 */
export async function normalizeMasterKey(keyInput: string): Promise<Uint8Array> {
  if (!keyInput || typeof keyInput !== 'string') {
    throw new Error('Master key must be a non-empty string');
  }

  const trimmed = keyInput.trim();

  // 1. Try standard Base64 decoding
  try {
    const binary = atob(trimmed);
    if (binary.length === 32) {
      const raw = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        raw[i] = binary.charCodeAt(i);
      }
      return raw;
    }
  } catch {
    // Ignore Base64 decode error and proceed to fallbacks
  }

  // 2. Try 64-character Hex string (256-bit)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const raw = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      raw[i] = parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    }
    return raw;
  }

  // 3. Fallback: Deterministic SHA-256 derivation ensures any passphrase or irregular key yields exactly 32 bytes
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(trimmed));
  return new Uint8Array(digest);
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Output format: Uint8Array containing [12-byte IV][Ciphertext + 16-byte Tag]
 *
 * @param plaintext The string to encrypt.
 * @param keyBase64 Master encryption key (Base64 32 bytes, Hex, or passphrase).
 * @returns Uint8Array of the combined payload.
 */
export async function encryptAesGcm(plaintext: string, keyBase64: string): Promise<Uint8Array> {
  const keyRaw = await normalizeMasterKey(keyBase64);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyRaw as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  const ciphertextWithTag = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      tagLength: 128,
    },
    cryptoKey,
    data
  );

  const result = new Uint8Array(iv.length + ciphertextWithTag.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertextWithTag), iv.length);

  return result;
}

/**
 * Decrypts a combined [12-byte IV][Ciphertext + Tag] payload using AES-256-GCM.
 *
 * @param encryptedBytes Combined Uint8Array.
 * @param keyBase64 Master encryption key (Base64 32 bytes, Hex, or passphrase).
 * @returns Decrypted plaintext string.
 */
export async function decryptAesGcm(
  encryptedBytes: Uint8Array,
  keyBase64: string
): Promise<string> {
  if (encryptedBytes.length < 12 + 16) {
    throw new Error('Invalid encrypted payload length');
  }

  const keyRaw = await normalizeMasterKey(keyBase64);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyRaw as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const iv = encryptedBytes.slice(0, 12);
  const ciphertextWithTag = encryptedBytes.slice(12);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      tagLength: 128,
    },
    cryptoKey,
    ciphertextWithTag
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * Helper to generate a fresh 32-byte master key encoded in Base64.
 */
export function generateMasterKeyBase64(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
