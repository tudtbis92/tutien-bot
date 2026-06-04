import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { EncryptionService } from '../encryptionService.js';
import { initI18n } from '../../i18n/index.js';

describe('EncryptionService', () => {
  const mockKey1 = crypto.randomBytes(32).toString('hex');
  const mockKey2 = crypto.randomBytes(32).toString('hex');
  const originalEnv = process.env;

  beforeAll(async () => {
    await initI18n();
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.FARM_ENCRYPTION_KEYS = JSON.stringify({
      '1': mockKey1,
      '2': mockKey2,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should encrypt a string and return encrypted data, IV, and tag', () => {
    const text = 'my-secret-token';
    const result = EncryptionService.encrypt(text, '1');

    expect(result).toHaveProperty('encryptedData');
    expect(result).toHaveProperty('iv');
    expect(result).toHaveProperty('tag');
    
    // IV should be 12 bytes -> 24 hex chars
    expect(result.iv).toHaveLength(24);
    // GCM tag is 16 bytes -> 32 hex chars
    expect(result.tag).toHaveLength(32);
    expect(result.encryptedData).not.toBe(text);
  });

  it('should decrypt data correctly given the right key and IV', () => {
    const text = 'my-secret-token';
    const { encryptedData, iv, tag } = EncryptionService.encrypt(text, '2');
    
    const decrypted = EncryptionService.decrypt(encryptedData, iv, tag, '2');
    expect(decrypted).toBe(text);
  });

  it('should throw an error if the authentication tag is tampered with', () => {
    const text = 'my-secret-token';
    const { encryptedData, iv, tag } = EncryptionService.encrypt(text, '1');
    
    // Tamper with the tag
    const tamperedTag = tag.substring(0, tag.length - 1) + (tag.endsWith('0') ? '1' : '0');

    expect(() => {
      EncryptionService.decrypt(encryptedData, iv, tamperedTag, '1');
    }).toThrow(/Unsupported state or unable to authenticate data/i);
  });

  it('should throw an error if the data is tampered with', () => {
    const text = 'my-secret-token';
    const { encryptedData, iv, tag } = EncryptionService.encrypt(text, '1');
    
    const tamperedData = encryptedData.substring(0, encryptedData.length - 1) + (encryptedData.endsWith('0') ? '1' : '0');

    expect(() => {
      EncryptionService.decrypt(tamperedData, iv, tag, '1');
    }).toThrow(/Unsupported state or unable to authenticate data/i);
  });

  it('should support multiple keys via FARM_ENCRYPTION_KEYS env', () => {
    const text = 'secret-data';
    
    // Encrypt with key 1
    const enc1 = EncryptionService.encrypt(text, '1');
    const dec1 = EncryptionService.decrypt(enc1.encryptedData, enc1.iv, enc1.tag, '1');
    expect(dec1).toBe(text);

    // Encrypt with key 2
    const enc2 = EncryptionService.encrypt(text, '2');
    const dec2 = EncryptionService.decrypt(enc2.encryptedData, enc2.iv, enc2.tag, '2');
    expect(dec2).toBe(text);

    // Decrypting enc1 with key 2 should fail
    expect(() => {
      EncryptionService.decrypt(enc1.encryptedData, enc1.iv, enc1.tag, '2');
    }).toThrow(/Unsupported state or unable to authenticate data/i);
  });

  it('should handle missing keys or invalid JSON gracefully', () => {
    process.env.FARM_ENCRYPTION_KEYS = '';
    expect(() => EncryptionService.encrypt('text', '1')).toThrow(/missing|Thiếu/i);

    process.env.FARM_ENCRYPTION_KEYS = 'invalid-json';
    expect(() => EncryptionService.encrypt('text', '1')).toThrow(/not a valid JSON|không phải/i);

    process.env.FARM_ENCRYPTION_KEYS = JSON.stringify({ '1': 'not-32-bytes' });
    expect(() => EncryptionService.encrypt('text', '1')).toThrow(/exactly 32 bytes/i);

    process.env.FARM_ENCRYPTION_KEYS = JSON.stringify({ '1': mockKey1 });
    expect(() => EncryptionService.encrypt('text', '2')).toThrow(/not found/i);
  });
});
