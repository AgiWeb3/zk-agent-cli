import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ProjectConfig, WalletRequestRecord, WalletSessionRecord } from './providers.js';

const STORAGE_DIR = path.join(os.homedir(), '.zk-agent');
const ENCRYPTION_KEY_FILE = path.join(STORAGE_DIR, '.encryption-key');

interface CipherData {
  iv: string;
  encrypted: string;
  authTag: string;
}

function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true, mode: 0o700 });

  for (const directory of ['wallets', 'requests']) {
    const fullPath = path.join(STORAGE_DIR, directory);
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true, mode: 0o700 });
  }
}

function getEncryptionKey(): Buffer {
  ensureStorageDir();
  if (fs.existsSync(ENCRYPTION_KEY_FILE)) return fs.readFileSync(ENCRYPTION_KEY_FILE);

  const key = randomBytes(32);
  fs.writeFileSync(ENCRYPTION_KEY_FILE, key, { mode: 0o600 });
  return key;
}

function encrypt(plaintext: string): CipherData {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    iv: iv.toString('hex'),
    encrypted,
    authTag: cipher.getAuthTag().toString('hex')
  };
}

function decrypt(cipherData: CipherData): string {
  const key = getEncryptionKey();
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(cipherData.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(cipherData.authTag, 'hex'));

  let decrypted = decipher.update(cipherData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), { mode: 0o600 });
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeEncryptedJson(filePath: string, value: unknown): void {
  writeJson(filePath, encrypt(JSON.stringify(value)));
}

function readEncryptedJson<T>(filePath: string): T {
  const cipherData = readJson<CipherData>(filePath);
  return JSON.parse(decrypt(cipherData)) as T;
}

export function storageDir(): string {
  ensureStorageDir();
  return STORAGE_DIR;
}

export async function saveProjectConfig(config: ProjectConfig): Promise<void> {
  ensureStorageDir();
  writeJson(path.join(STORAGE_DIR, 'config.json'), config);
}

export async function loadProjectConfig(): Promise<ProjectConfig | null> {
  const filePath = path.join(STORAGE_DIR, 'config.json');
  if (!fs.existsSync(filePath)) return null;
  return readJson<ProjectConfig>(filePath);
}

export async function saveWalletSession(record: WalletSessionRecord): Promise<void> {
  ensureStorageDir();
  writeEncryptedJson(path.join(STORAGE_DIR, 'wallets', `${record.walletName}.json`), record);
}

export async function loadWalletSession(walletName: string): Promise<WalletSessionRecord | null> {
  const filePath = path.join(STORAGE_DIR, 'wallets', `${walletName}.json`);
  if (!fs.existsSync(filePath)) return null;
  return readEncryptedJson<WalletSessionRecord>(filePath);
}

export async function listWalletNames(): Promise<string[]> {
  ensureStorageDir();
  return fs
    .readdirSync(path.join(STORAGE_DIR, 'wallets'))
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => entry.replace(/\.json$/, ''));
}

export async function listWalletRequestIds(): Promise<string[]> {
  ensureStorageDir();
  return fs
    .readdirSync(path.join(STORAGE_DIR, 'requests'))
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => entry.replace(/\.json$/, ''));
}

export async function deleteWalletSession(walletName: string): Promise<boolean> {
  const filePath = path.join(STORAGE_DIR, 'wallets', `${walletName}.json`);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

export async function saveWalletRequest(record: WalletRequestRecord): Promise<void> {
  ensureStorageDir();
  writeEncryptedJson(path.join(STORAGE_DIR, 'requests', `${record.requestId}.json`), record);
}

export async function loadWalletRequest(requestId: string): Promise<WalletRequestRecord | null> {
  const filePath = path.join(STORAGE_DIR, 'requests', `${requestId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return readEncryptedJson<WalletRequestRecord>(filePath);
}

export async function deleteWalletRequest(requestId: string): Promise<boolean> {
  const filePath = path.join(STORAGE_DIR, 'requests', `${requestId}.json`);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

export interface WalletRenameResult {
  wallet: WalletSessionRecord;
  updatedRequestIds: string[];
}

export async function renameWalletSession(
  walletName: string,
  nextWalletName: string
): Promise<WalletRenameResult> {
  ensureStorageDir();

  const currentName = walletName.trim();
  const targetName = nextWalletName.trim();

  if (!currentName) throw new Error('Current wallet name is required.');
  if (!targetName) throw new Error('New wallet name is required.');
  if (currentName === targetName) {
    throw new Error('New wallet name must be different from the current wallet name.');
  }

  const currentFilePath = path.join(STORAGE_DIR, 'wallets', `${currentName}.json`);
  const targetFilePath = path.join(STORAGE_DIR, 'wallets', `${targetName}.json`);

  if (!fs.existsSync(currentFilePath)) {
    throw new Error(`Wallet not found: ${currentName}`);
  }
  if (fs.existsSync(targetFilePath)) {
    throw new Error(`Wallet already exists: ${targetName}`);
  }

  const wallet = readEncryptedJson<WalletSessionRecord>(currentFilePath);
  wallet.walletName = targetName;
  writeEncryptedJson(targetFilePath, wallet);
  fs.unlinkSync(currentFilePath);

  const updatedRequestIds: string[] = [];
  for (const requestId of await listWalletRequestIds()) {
    const request = await loadWalletRequest(requestId);
    if (!request || request.walletName !== currentName) continue;
    request.walletName = targetName;
    await saveWalletRequest(request);
    updatedRequestIds.push(requestId);
  }

  return {
    wallet,
    updatedRequestIds
  };
}
