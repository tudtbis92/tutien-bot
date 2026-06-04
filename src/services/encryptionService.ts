import crypto from 'node:crypto';
import { getT } from '../i18n/index.js';

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // 96 bits for GCM

  /**
   * Loads keys from process.env.FARM_ENCRYPTION_KEYS
   * @returns Record<string, Buffer>
   */
  private static getKeys(): Record<string, Buffer> {
    const keysEnv = process.env.FARM_ENCRYPTION_KEYS;
    if (!keysEnv) {
      throw new Error(getT('vi')('game:farming.errors.env_missing'));
    }

    let parsedKeys: Record<string, string>;
    try {
      parsedKeys = JSON.parse(keysEnv);
    } catch {
      throw new Error(getT('vi')('game:farming.errors.env_invalid'));
    }

    const keys: Record<string, Buffer> = {};
    for (const [version, hexKey] of Object.entries(parsedKeys)) {
      if (typeof hexKey !== 'string') {
        continue;
      }
      const keyBuffer = Buffer.from(hexKey, 'hex');
      if (keyBuffer.length !== 32) {
        throw new Error(`Key version ${version} must be exactly 32 bytes (64 hex characters).`);
      }
      keys[version] = keyBuffer;
    }

    if (Object.keys(keys).length === 0) {
      throw new Error(getT('vi')('game:farming.errors.keys_missing'));
    }

    return keys;
  }

  private static getKey(keyVersion: string): Buffer {
    const keys = this.getKeys();
    const key = keys[keyVersion];
    if (!key) {
      throw new Error(`Encryption key for version ${keyVersion} not found.`);
    }
    return key;
  }

  /**
   * Encrypts the given text using AES-256-GCM.
   */
  static encrypt(text: string, keyVersion: string): { encryptedData: string; iv: string; tag: string } {
    const key = this.getKey(keyVersion);
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return {
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      tag,
    };
  }

  /**
   * Decrypts the given encrypted data using AES-256-GCM.
   * Throws an error if the tag is invalid (tampered data) or key is incorrect.
   */
  static decrypt(encryptedData: string, ivHex: string, tagHex: string, keyVersion: string): string {
    const key = this.getKey(keyVersion);
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);

    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
