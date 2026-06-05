import type { ColorRule, ComparisonHistoryEntry, ComparisonResult, Mode, SequenceInput, TemplateType } from '../types.ts';
import { buildBatchStatistics } from './statistics.ts';

const HISTORY_STORAGE_KEY = 'hc-cozyseq-history-v1';
const HISTORY_FILE_DB_NAME = 'hc-cozyseq-history-file-db';
const HISTORY_FILE_STORE_NAME = 'handles';
const HISTORY_FILE_HANDLE_KEY = 'history-file';
const HISTORY_FILE_VERSION = 1;
export const HISTORY_FILE_SUGGESTED_NAME = 'hc-cozyseq-history.json';
export const HISTORY_LIMIT = 20;

interface HistoryFilePayload {
  version: number;
  app: string;
  updatedAt: string;
  entries: ComparisonHistoryEntry[];
}

interface HistoryFileReadResult {
  entries: ComparisonHistoryEntry[];
  warning: string | null;
}

interface HistoryFileRestoreResult {
  handle: FileSystemFileHandle | null;
  fileName: string | null;
  entries: ComparisonHistoryEntry[] | null;
  warning: string | null;
  needsPermission: boolean;
}

interface CreateHistoryEntryInput {
  mode: Mode;
  templateType: TemplateType;
  template: SequenceInput;
  queries: SequenceInput[];
  colorRules: ColorRule[];
  results: ComparisonResult[];
}

function cloneSequenceInput(input: SequenceInput): SequenceInput {
  return {
    id: input.id,
    name: input.name,
    sequence: input.sequence,
  };
}

function cloneColorRule(rule: ColorRule): ColorRule {
  return {
    id: rule.id,
    start: rule.start,
    end: rule.end,
    color: rule.color,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSequenceInput(value: unknown): value is SequenceInput {
  return (
    isPlainObject(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.sequence === 'string'
  );
}

function isColorRule(value: unknown): value is ColorRule {
  return (
    isPlainObject(value) &&
    typeof value.id === 'string' &&
    typeof value.start === 'number' &&
    (typeof value.end === 'number' || value.end === null) &&
    typeof value.color === 'string'
  );
}

function isHistoryEntry(value: unknown): value is ComparisonHistoryEntry {
  return (
    isPlainObject(value) &&
    typeof value.id === 'string' &&
    typeof value.createdAt === 'string' &&
    (value.mode === 'BLASTP' || value.mode === 'BLASTX') &&
    (value.templateType === 'Auto' || value.templateType === 'Protein' || value.templateType === 'DNA') &&
    isSequenceInput(value.template) &&
    Array.isArray(value.queries) &&
    value.queries.every(isSequenceInput) &&
    Array.isArray(value.colorRules) &&
    value.colorRules.every(isColorRule) &&
    typeof value.templateLength === 'number' &&
    typeof value.totalQueries === 'number' &&
    typeof value.mutatedQueries === 'number' &&
    typeof value.totalMutations === 'number' &&
    Array.isArray(value.summaries)
  );
}

function normalizeHistoryEntries(value: unknown): ComparisonHistoryEntry[] {
  if (Array.isArray(value)) return value.filter(isHistoryEntry);

  if (isPlainObject(value) && Array.isArray(value.entries)) {
    return value.entries.filter(isHistoryEntry);
  }

  return [];
}

function createHistoryFilePayload(entries: ComparisonHistoryEntry[]): HistoryFilePayload {
  return {
    version: HISTORY_FILE_VERSION,
    app: 'HC CozySeq',
    updatedAt: new Date().toISOString(),
    entries,
  };
}

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function hasIndexedDb(): boolean {
  return hasWindow() && 'indexedDB' in window;
}

export function supportsHistoryFileBinding(): boolean {
  return hasWindow() && 'showSaveFilePicker' in window && hasIndexedDb();
}

export function parseHistoryFilePayload(raw: string): ComparisonHistoryEntry[] {
  try {
    const parsed = JSON.parse(raw);
    return normalizeHistoryEntries(parsed);
  } catch {
    return [];
  }
}

export function serializeHistoryFilePayload(entries: ComparisonHistoryEntry[]): string {
  return JSON.stringify(createHistoryFilePayload(entries), null, 2);
}

export function createHistoryEntry({
  mode,
  templateType,
  template,
  queries,
  colorRules,
  results,
}: CreateHistoryEntryInput): ComparisonHistoryEntry {
  const stats = buildBatchStatistics(results);

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    mode,
    templateType,
    template: cloneSequenceInput(template),
    queries: queries.map(cloneSequenceInput),
    colorRules: colorRules.map(cloneColorRule),
    templateLength: Math.max(...results.map((result) => result.templateProteinUsed.length), 0),
    totalQueries: stats.totalQueries,
    mutatedQueries: stats.mutatedQueries,
    totalMutations: stats.totalMutations,
    summaries: results.map((result) => ({
      queryName: result.queryName,
      mutationSummary: result.mutationSummary,
      mutationCount: result.mutations.length,
      alignmentScore: result.metadata.alignmentScore,
      templateCoverage: result.metadata.templateCoverage,
      warnings: [...result.warnings],
    })),
  };
}

export function insertHistoryEntry(
  entries: ComparisonHistoryEntry[],
  entry: ComparisonHistoryEntry,
  limit = HISTORY_LIMIT,
): ComparisonHistoryEntry[] {
  return [entry, ...entries]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export function removeHistoryEntry(entries: ComparisonHistoryEntry[], id: string): ComparisonHistoryEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

export function mergeHistoryEntries(...groups: ComparisonHistoryEntry[][]): ComparisonHistoryEntry[] {
  const seen = new Set<string>();
  const merged: ComparisonHistoryEntry[] = [];

  groups.flat().forEach((entry) => {
    if (!isHistoryEntry(entry) || seen.has(entry.id)) return;
    seen.add(entry.id);
    merged.push(entry);
  });

  return merged
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, HISTORY_LIMIT);
}

export function readHistoryFromStorage(): ComparisonHistoryEntry[] {
  if (!hasWindow()) return [];

  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    return parseHistoryFilePayload(raw);
  } catch {
    return [];
  }
}

export function writeHistoryToStorage(entries: ComparisonHistoryEntry[]): string | null {
  if (!hasWindow()) return null;

  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
    return null;
  } catch {
    return '无法写入本地比对历史；浏览器存储可能已满或被禁用。';
  }
}

export function clearHistoryStorage(): string | null {
  if (!hasWindow()) return null;

  try {
    window.localStorage.removeItem(HISTORY_STORAGE_KEY);
    return null;
  } catch {
    return '无法清空本地比对历史；浏览器存储可能被禁用。';
  }
}

function openHistoryFileDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('indexedDB unavailable'));
      return;
    }

    const request = window.indexedDB.open(HISTORY_FILE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HISTORY_FILE_STORE_NAME)) {
        db.createObjectStore(HISTORY_FILE_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open history file database.'));
  });
}

function runIdbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

async function withHistoryFileStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openHistoryFileDb();

  try {
    const transaction = db.transaction(HISTORY_FILE_STORE_NAME, mode);
    const store = transaction.objectStore(HISTORY_FILE_STORE_NAME);
    return await action(store);
  } finally {
    db.close();
  }
}

async function getStoredHistoryFileHandle(): Promise<FileSystemFileHandle | null> {
  if (!supportsHistoryFileBinding()) return null;

  try {
    return await withHistoryFileStore('readonly', async (store) => {
      const result = await runIdbRequest(store.get(HISTORY_FILE_HANDLE_KEY));
      return result instanceof FileSystemFileHandle ? result : null;
    });
  } catch {
    return null;
  }
}

async function setStoredHistoryFileHandle(handle: FileSystemFileHandle): Promise<string | null> {
  if (!supportsHistoryFileBinding()) {
    return '当前浏览器不支持本地历史文件绑定。';
  }

  try {
    await withHistoryFileStore('readwrite', async (store) => {
      await runIdbRequest(store.put(handle, HISTORY_FILE_HANDLE_KEY));
    });
    return null;
  } catch {
    return '已选择历史文件，但无法记住这个文件句柄；刷新页面后可能需要重新绑定。';
  }
}

export async function clearStoredHistoryFileHandle(): Promise<string | null> {
  if (!hasIndexedDb()) return null;

  try {
    await withHistoryFileStore('readwrite', async (store) => {
      await runIdbRequest(store.delete(HISTORY_FILE_HANDLE_KEY));
    });
    return null;
  } catch {
    return '无法移除历史文件绑定；请稍后重试。';
  }
}

function getPermissionDescriptor(writable: boolean): FileSystemHandlePermissionDescriptor {
  return { mode: writable ? 'readwrite' : 'read' };
}

async function getHandlePermission(handle: FileSystemFileHandle, writable: boolean): Promise<PermissionState> {
  if (!handle.queryPermission) return 'granted';
  return handle.queryPermission(getPermissionDescriptor(writable));
}

async function ensureHandlePermission(handle: FileSystemFileHandle, writable: boolean): Promise<boolean> {
  if (!handle.requestPermission) return true;

  let state = await getHandlePermission(handle, writable);
  if (state === 'granted') return true;

  state = await handle.requestPermission(getPermissionDescriptor(writable));
  return state === 'granted';
}

export async function readHistoryFromFileHandle(handle: FileSystemFileHandle): Promise<HistoryFileReadResult> {
  try {
    const file = await handle.getFile();
    const raw = await file.text();

    if (!raw.trim()) {
      return { entries: [], warning: null };
    }

    const entries = parseHistoryFilePayload(raw);
    if (!entries.length) {
      return {
        entries: [],
        warning: '历史文件存在，但未解析到可用记录；将继续使用当前浏览器中的历史。',
      };
    }

    return { entries, warning: null };
  } catch {
    return {
      entries: [],
      warning: '无法读取已绑定的历史文件；将继续使用当前浏览器中的历史。',
    };
  }
}

export async function writeHistoryToFileHandle(
  handle: FileSystemFileHandle,
  entries: ComparisonHistoryEntry[],
): Promise<string | null> {
  try {
    const granted = await ensureHandlePermission(handle, true);
    if (!granted) return '未获得历史文件写入权限；这次结果仍保存在浏览器本地。';

    const writable = await handle.createWritable();
    await writable.write(serializeHistoryFilePayload(entries));
    await writable.close();
    return null;
  } catch {
    return '无法写入历史文件；这次结果仍保存在浏览器本地。';
  }
}

export async function restoreBoundHistoryFile(
  browserEntries: ComparisonHistoryEntry[],
): Promise<HistoryFileRestoreResult> {
  const handle = await getStoredHistoryFileHandle();
  if (!handle) {
    return {
      handle: null,
      fileName: null,
      entries: null,
      warning: null,
      needsPermission: false,
    };
  }

  const permission = await getHandlePermission(handle, false);
  if (permission !== 'granted') {
    return {
      handle,
      fileName: handle.name,
      entries: browserEntries.length ? browserEntries : null,
      warning: null,
      needsPermission: true,
    };
  }

  const fileHistory = await readHistoryFromFileHandle(handle);
  return {
    handle,
    fileName: handle.name,
    entries: mergeHistoryEntries(fileHistory.entries, browserEntries),
    warning: fileHistory.warning,
    needsPermission: false,
  };
}

export async function reconnectBoundHistoryFile(
  handle: FileSystemFileHandle,
  browserEntries: ComparisonHistoryEntry[],
): Promise<{
  granted: boolean;
  entries: ComparisonHistoryEntry[] | null;
  warning: string | null;
}> {
  const granted = await ensureHandlePermission(handle, true);
  if (!granted) {
    return {
      granted: false,
      entries: null,
      warning: '未获得历史文件权限；请允许浏览器访问这个本地 JSON 文件。',
    };
  }

  const fileHistory = await readHistoryFromFileHandle(handle);
  const mergedEntries = mergeHistoryEntries(browserEntries, fileHistory.entries);
  const writeError = await writeHistoryToFileHandle(handle, mergedEntries);

  return {
    granted: true,
    entries: mergedEntries,
    warning: writeError ?? fileHistory.warning,
  };
}

export async function chooseAndBindHistoryFile(
  browserEntries: ComparisonHistoryEntry[],
): Promise<{
  cancelled: boolean;
  handle: FileSystemFileHandle | null;
  entries: ComparisonHistoryEntry[] | null;
  warning: string | null;
}> {
  if (!supportsHistoryFileBinding()) {
    return {
      cancelled: false,
      handle: null,
      entries: null,
      warning: '当前浏览器不支持自动写入本地历史文件；请继续使用浏览器本地历史。',
    };
  }

  try {
    const picker = window.showSaveFilePicker;
    if (!picker) {
      return {
        cancelled: false,
        handle: null,
        entries: null,
        warning: '当前浏览器不支持自动写入本地历史文件；请继续使用浏览器本地历史。',
      };
    }

    const handle = await picker({
      suggestedName: HISTORY_FILE_SUGGESTED_NAME,
      types: [
        {
          description: 'HC CozySeq history',
          accept: { 'application/json': ['.json'] },
        },
      ],
    });

    const fileHistory = await readHistoryFromFileHandle(handle);
    const mergedEntries = mergeHistoryEntries(browserEntries, fileHistory.entries);
    const writeError = await writeHistoryToFileHandle(handle, mergedEntries);
    const rememberError = await setStoredHistoryFileHandle(handle);

    return {
      cancelled: false,
      handle,
      entries: mergedEntries,
      warning: writeError ?? rememberError ?? fileHistory.warning,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { cancelled: true, handle: null, entries: null, warning: null };
    }

    return {
      cancelled: false,
      handle: null,
      entries: null,
      warning: '无法创建或绑定历史文件；请稍后重试。',
    };
  }
}
