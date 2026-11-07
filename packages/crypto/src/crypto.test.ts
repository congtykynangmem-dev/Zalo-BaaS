// packages/crypto/src/crypto.test.ts
import { describe, it, expect } from 'vitest';
import {
  encryptAesGcm,
  decryptAesGcm,
  generateMasterKeyBase64,
  timingSafeEqualString,
} from './index.js';

describe('packages/crypto', () => {
  it('should encrypt and decrypt string accurately with AES-256-GCM', async () => {
    const masterKey = generateMasterKeyBase64();
    const secretMessage = 'zalo_bot_token_secret_123456789';

    const encrypted = await encryptAesGcm(secretMessage, masterKey);
    expect(encrypted).toBeInstanceOf(Uint8Array);
    expect(encrypted.length).toBeGreaterThan(12 + 16);

    const decrypted = await decryptAesGcm(encrypted, masterKey);
    expect(decrypted).toBe(secretMessage);
  });

  it('should fail decryption when using wrong key', async () => {
    const key1 = generateMasterKeyBase64();
    const key2 = generateMasterKeyBase64();
    const secretMessage = 'test_token';

    const encrypted = await encryptAesGcm(secretMessage, key1);

    await expect(decryptAesGcm(encrypted, key2)).rejects.toThrow();
  });

  it('should fail decryption when payload is tampered', async () => {
    const key = generateMasterKeyBase64();
    const secretMessage = 'tamper_test';

    const encrypted = await encryptAesGcm(secretMessage, key);
    // Tamper one byte
    encrypted[20] ^= 0xff;

    await expect(decryptAesGcm(encrypted, key)).rejects.toThrow();
  });

  it('timingSafeEqualString should compare equal and unequal strings correctly', () => {
    const token = 'my_secure_secret_token_12345';
    expect(timingSafeEqualString(token, token)).toBe(true);
    expect(timingSafeEqualString(token, 'my_secure_secret_token_12346')).toBe(false);
    expect(timingSafeEqualString(token, 'short')).toBe(false);
  });
});
