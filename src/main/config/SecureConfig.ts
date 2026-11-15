import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Minimal surface of Electron's safeStorage we depend on, defined locally
 * so this module can be unit tested without Electron installed/running.
 * safeStorage encrypts using OS-level credential storage (DPAPI on
 * Windows), which is why we use it instead of plain JSON for secrets.
 */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/**
 * SecureConfig
 * ------------
 * Stores the football-data provider API key encrypted at rest via
 * Electron's safeStorage, in a file separate from the main SQLite database
 * and from the git repository (the file lives under the OS user-data
 * directory, which is gitignored and machine-specific).
 *
 * Rule enforced here: the API key never appears in:
 *  - the SQLite database (Database.ts never touches it)
 *  - any file inside the repository
 *  - any bundle shipped to the renderer process (renderer only ever
 *    receives `isConfigured: boolean`, via IPC, never the raw key)
 */
export class SecureConfig {
  private readonly filePath: string;

  constructor(
    private readonly safeStorage: SafeStorageLike,
    userDataDir: string,
  ) {
    this.filePath = path.join(userDataDir, "football-provider.key.enc");
  }

  hasApiKey(): boolean {
    return fs.existsSync(this.filePath);
  }

  setApiKey(plainTextKey: string): void {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error(
        "OS-level secure storage is unavailable on this system; cannot safely store the API key.",
      );
    }
    const trimmed = plainTextKey.trim();
    if (trimmed.length === 0) {
      this.clearApiKey();
      return;
    }
    const encrypted = this.safeStorage.encryptString(trimmed);
    fs.writeFileSync(this.filePath, encrypted);
  }

  getApiKey(): string | null {
    if (!this.hasApiKey()) return null;
    const encrypted = fs.readFileSync(this.filePath);
    try {
      return this.safeStorage.decryptString(encrypted);
    } catch {
      // Encrypted blob unreadable (e.g. moved to another machine/user) -
      // treat as not configured rather than crashing.
      return null;
    }
  }

  clearApiKey(): void {
    if (fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }
  }
}
