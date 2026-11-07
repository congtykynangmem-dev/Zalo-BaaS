// packages/crypto/src/aes.ts

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Output format: Uint8Array containing [12-byte IV][Ciphertext + 16-byte Tag]
 *
 * @param plaintext The string to encrypt.
 * @param keyBase64 32-byte master encryption key encoded in Base64.
 * @returns Uint8Array of the combined payload.
 */
export async function encryptAesGcm(plaintext: string, keyBase64: string): Promise<Uint8Array> {
  const binaryString = atob(keyBase64);
  const keyRaw = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    keyRaw[i] = binaryString.charCodeAt(i);
  }
  if (keyRaw.length !== 32) {
    throw new Error('Master key must be 32 bytes for AES-256');
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyRaw,
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
 * @param keyBase64 32-byte master encryption key encoded in Base64.
 * @returns Decrypted plaintext string.
 */
export async function decryptAesGcm(
  encryptedBytes: Uint8Array,
  keyBase64: string
): Promise<string> {
  if (encryptedBytes.length < 12 + 16) {
    throw new Error('Invalid encrypted payload length');
  }

  const binaryString = atob(keyBase64);
  const keyRaw = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    keyRaw[i] = binaryString.charCodeAt(i);
  }
  if (keyRaw.length !== 32) {
    throw new Error('Master key must be 32 bytes for AES-256');
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyRaw,
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
