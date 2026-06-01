// ── Project + prompt-record IndexedDB storage ─────────────────────────────────
// Uses its own database (ryfine_projects) separate from the repo-context DB
// to avoid version-migration conflicts.

import type { Project, PromptRecord } from './projects';

const DB_NAME    = 'ryfine_projects';
const DB_VERSION = 1;
const PROJECTS   = 'projects';
const RECORDS    = 'prompt_records';

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROJECTS)) {
        db.createObjectStore(PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(RECORDS)) {
        const store = db.createObjectStore(RECORDS, { keyPath: 'id' });
        store.createIndex('byProject', 'projectId', { unique: false });
        store.createIndex('byCreatedAt', 'createdAt', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error ?? new Error('Could not open project storage.'));
  });
}

// ── Generic helpers ───────────────────────────────────────────────────────────

function getAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror   = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror    = () => { db.close(); reject(tx.error); };
  });
}

function put<T>(db: IDBDatabase, storeName: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(value);
    req.onerror   = () => reject(req.error);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => { db.close(); reject(tx.error); };
    tx.onabort    = () => { db.close(); reject(tx.error); };
  });
}

function del(db: IDBDatabase, storeName: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(id);
    req.onerror   = () => reject(req.error);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => { db.close(); reject(tx.error); };
  });
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function loadProjects(): Promise<Project[]> {
  const db = await openDB();
  if (!db) return [];
  const all = await getAll<Project>(db, PROJECTS);
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveProject(project: Project): Promise<void> {
  const db = await openDB();
  if (!db) return;
  await put(db, PROJECTS, { ...project, updatedAt: new Date().toISOString() });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  await del(db, PROJECTS, id);
  // cascade-delete all records for this project
  const records = await getProjectHistory(id);
  for (const r of records) {
    const db2 = await openDB();
    if (db2) await del(db2, RECORDS, r.id);
  }
}

// ── Prompt records ────────────────────────────────────────────────────────────

export async function addPromptRecord(record: PromptRecord): Promise<void> {
  const db = await openDB();
  if (!db) return;
  await put(db, RECORDS, record);
}

export async function updateRecordFeedback(
  recordId: string,
  feedback: 'up' | 'down',
): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(RECORDS, 'readwrite');
    const store = tx.objectStore(RECORDS);
    const getReq = store.get(recordId);
    getReq.onsuccess = () => {
      const record = getReq.result as PromptRecord | undefined;
      if (!record) { resolve(); return; }
      store.put({ ...record, feedback });
    };
    tx.oncomplete  = () => { db.close(); resolve(); };
    tx.onerror     = () => { db.close(); reject(tx.error); };
  });
}

export async function getProjectHistory(projectId: string): Promise<PromptRecord[]> {
  const db = await openDB();
  if (!db) return [];
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(RECORDS, 'readonly');
    const index = tx.objectStore(RECORDS).index('byProject');
    const req   = index.getAll(projectId);
    req.onsuccess = () => {
      const sorted = (req.result as PromptRecord[])
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      resolve(sorted);
    };
    req.onerror   = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror    = () => { db.close(); reject(tx.error); };
  });
}

/** Returns the N most-recent records — used for few-shot injection. */
export async function getRecentRecords(projectId: string, limit = 3): Promise<PromptRecord[]> {
  const all = await getProjectHistory(projectId);
  return all.slice(0, limit);
}

export async function searchAllRecords(query: string, limit = 50): Promise<PromptRecord[]> {
  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) {
    return [];
  }

  const db = await openDB();
  if (!db) {
    return [];
  }

  const records = await getAll<PromptRecord>(db, RECORDS);
  return records
    .filter((record) => record.input.toLowerCase().includes(trimmedQuery) || record.output.toLowerCase().includes(trimmedQuery))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}
