import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ProjectConfig, WalletRequestRecord, WalletSessionRecord } from './providers.js';
import { migrateWalletSessionRecord } from './wallet-session.js';
import type { WorkflowCheckpointRecord } from './workflow-checkpoint.js';

interface CipherData {
  iv: string;
  encrypted: string;
  authTag: string;
}

function normalizeOptionalPath(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? path.resolve(trimmed) : null;
}

function resolveStorageDirPath(): string {
  return normalizeOptionalPath(process.env.ZK_AGENT_STORAGE_DIR) || path.join(os.homedir(), '.zk-agent');
}

function realUserHomeDir(): string {
  try {
    return os.userInfo().homedir || os.homedir();
  } catch {
    return os.homedir();
  }
}

function shouldEnforceTestStorageIsolation(): boolean {
  if (process.env.ZK_AGENT_ENFORCE_TEST_STORAGE === '1') return true;
  return process.execArgv.includes('--test');
}

function assertTestStorageIsolation(storageDirectory: string): void {
  if (!shouldEnforceTestStorageIsolation()) return;

  const resolvedStorageDir = path.resolve(storageDirectory);
  const realStorageDir = path.resolve(path.join(realUserHomeDir(), '.zk-agent'));

  if (
    resolvedStorageDir === realStorageDir ||
    resolvedStorageDir.startsWith(`${realStorageDir}${path.sep}`)
  ) {
    throw new Error(
      'Test storage isolation is enabled, but wallet storage still resolves to the real user ~/.zk-agent directory. Set HOME to an isolated temp directory or set ZK_AGENT_STORAGE_DIR explicitly before touching local storage.'
    );
  }
}

function ensureStorageDir(create = true): string {
  const storageDirectory = resolveStorageDirPath();
  assertTestStorageIsolation(storageDirectory);

  if (!create) return storageDirectory;
  if (!fs.existsSync(storageDirectory)) {
    fs.mkdirSync(storageDirectory, { recursive: true, mode: 0o700 });
  }

  for (const directory of ['wallets', 'requests', 'workflows']) {
    const fullPath = path.join(storageDirectory, directory);
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true, mode: 0o700 });
  }

  return storageDirectory;
}

function storagePath(...segments: string[]): string {
  return path.join(ensureStorageDir(false), ...segments);
}

function getEncryptionKey(): Buffer {
  const storageDirectory = ensureStorageDir();
  const encryptionKeyFile = path.join(storageDirectory, '.encryption-key');
  if (fs.existsSync(encryptionKeyFile)) return fs.readFileSync(encryptionKeyFile);

  const key = randomBytes(32);
  fs.writeFileSync(encryptionKeyFile, key, { mode: 0o600 });
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
  return ensureStorageDir();
}

function ensureStorageCollectionDir(collectionName: string): string {
  const storageDirectory = ensureStorageDir();
  const collectionDirectory = path.join(storageDirectory, collectionName);

  if (!fs.existsSync(collectionDirectory)) {
    fs.mkdirSync(collectionDirectory, { recursive: true, mode: 0o700 });
  }

  return collectionDirectory;
}

export async function saveEncryptedStorageRecord<T>(
  collectionName: string,
  recordId: string,
  value: T
): Promise<void> {
  const collectionDirectory = ensureStorageCollectionDir(collectionName);
  writeEncryptedJson(path.join(collectionDirectory, `${recordId}.json`), value);
}

export async function loadEncryptedStorageRecord<T>(
  collectionName: string,
  recordId: string
): Promise<T | null> {
  const filePath = storagePath(collectionName, `${recordId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return readEncryptedJson<T>(filePath);
}

export async function listEncryptedStorageRecordIds(
  collectionName: string
): Promise<string[]> {
  const collectionDirectory = ensureStorageCollectionDir(collectionName);
  return fs
    .readdirSync(collectionDirectory)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => entry.replace(/\.json$/, ''));
}

export async function deleteEncryptedStorageRecord(
  collectionName: string,
  recordId: string
): Promise<boolean> {
  const filePath = storagePath(collectionName, `${recordId}.json`);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

export async function saveProjectConfig(config: ProjectConfig): Promise<void> {
  const storageDirectory = ensureStorageDir();
  writeJson(path.join(storageDirectory, 'config.json'), config);
}

export async function loadProjectConfig(): Promise<ProjectConfig | null> {
  const filePath = storagePath('config.json');
  if (!fs.existsSync(filePath)) return null;
  return readJson<ProjectConfig>(filePath);
}

export async function saveWalletSession(record: WalletSessionRecord): Promise<void> {
  await saveEncryptedStorageRecord('wallets', record.walletName, migrateWalletSessionRecord(record));
}

export async function loadWalletSession(walletName: string): Promise<WalletSessionRecord | null> {
  const record = await loadEncryptedStorageRecord<WalletSessionRecord>('wallets', walletName);
  return record ? migrateWalletSessionRecord(record) : null;
}

export async function listWalletNames(): Promise<string[]> {
  return listEncryptedStorageRecordIds('wallets');
}

export async function listWalletRequestIds(): Promise<string[]> {
  const storageDirectory = ensureStorageDir();
  return fs
    .readdirSync(path.join(storageDirectory, 'requests'))
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => entry.replace(/\.json$/, ''));
}

export async function deleteWalletSession(walletName: string): Promise<boolean> {
  return deleteEncryptedStorageRecord('wallets', walletName);
}

export async function saveWalletRequest(record: WalletRequestRecord): Promise<void> {
  await saveEncryptedStorageRecord('requests', record.requestId, record);
}

export async function loadWalletRequest(requestId: string): Promise<WalletRequestRecord | null> {
  return loadEncryptedStorageRecord<WalletRequestRecord>('requests', requestId);
}

export async function deleteWalletRequest(requestId: string): Promise<boolean> {
  return deleteEncryptedStorageRecord('requests', requestId);
}

export async function saveWorkflowCheckpoint(record: WorkflowCheckpointRecord): Promise<void> {
  await saveEncryptedStorageRecord('workflows', record.requestId, record);
}

export async function loadWorkflowCheckpoint(
  requestId: string
): Promise<WorkflowCheckpointRecord | null> {
  return loadEncryptedStorageRecord<WorkflowCheckpointRecord>('workflows', requestId);
}

export async function listWorkflowCheckpointIds(): Promise<string[]> {
  return listEncryptedStorageRecordIds('workflows');
}

export async function deleteWorkflowCheckpoint(requestId: string): Promise<boolean> {
  return deleteEncryptedStorageRecord('workflows', requestId);
}

export interface WalletRenameResult {
  wallet: WalletSessionRecord;
  updatedRequestIds: string[];
  updatedWorkflowRequestIds: string[];
}

export async function renameWalletSession(
  walletName: string,
  nextWalletName: string
): Promise<WalletRenameResult> {
  const storageDirectory = ensureStorageDir();

  const currentName = walletName.trim();
  const targetName = nextWalletName.trim();

  if (!currentName) throw new Error('Current wallet name is required.');
  if (!targetName) throw new Error('New wallet name is required.');
  if (currentName === targetName) {
    throw new Error('New wallet name must be different from the current wallet name.');
  }

  const currentFilePath = path.join(storageDirectory, 'wallets', `${currentName}.json`);
  const targetFilePath = path.join(storageDirectory, 'wallets', `${targetName}.json`);

  if (!fs.existsSync(currentFilePath)) {
    throw new Error(`Wallet not found: ${currentName}`);
  }
  if (fs.existsSync(targetFilePath)) {
    throw new Error(`Wallet already exists: ${targetName}`);
  }

  const wallet = migrateWalletSessionRecord(readEncryptedJson<WalletSessionRecord>(currentFilePath));
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

  const updatedWorkflowRequestIds: string[] = [];
  for (const requestId of await listWorkflowCheckpointIds()) {
    const checkpoint = await loadWorkflowCheckpoint(requestId);
    if (!checkpoint || checkpoint.walletName !== currentName) continue;
    checkpoint.walletName = targetName;
    await saveWorkflowCheckpoint(checkpoint);
    updatedWorkflowRequestIds.push(requestId);
  }

  return {
    wallet,
    updatedRequestIds,
    updatedWorkflowRequestIds
  };
}
