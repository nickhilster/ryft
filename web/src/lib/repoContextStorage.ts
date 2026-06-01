import { createRepoContextFile, MAX_UPLOAD_FILES, MAX_UPLOAD_TOTAL_CHARS, type RepoContextFile } from './repoContext';

const DB_NAME = 'ryfine';
const LEGACY_DB_NAME = 'promptboost';
const DB_VERSION = 1;
const STORE_NAME = 'repo-context';
const FILES_KEY = 'manual-files';

type IndexedDbWithDatabases = IDBFactory & {
  databases?: () => Promise<Array<{ name?: string }>>;
};

let repoContextMigrationPromise: Promise<void> | null = null;

function openDatabase(name: string): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open repo context storage.'));
  });
}

function getStoredValueFromDatabase(database: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not read repo context files.'));
  });
}

function setStoredValueInDatabase(database: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const request = transaction.objectStore(STORE_NAME).put(value, key);

    request.onsuccess = () => undefined;
    request.onerror = () => reject(request.error ?? new Error('Could not persist repo context files.'));

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not persist repo context files.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not persist repo context files.'));
  });
}

async function databaseExists(name: string): Promise<boolean> {
  if (typeof indexedDB === 'undefined') {
    return false;
  }

  const indexedDbFactory = indexedDB as IndexedDbWithDatabases;
  if (typeof indexedDbFactory.databases !== 'function') {
    return false;
  }

  const databases = await indexedDbFactory.databases();
  return databases.some((database) => database.name === name);
}

function deleteDatabase(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Could not delete legacy repo context storage.'));
    request.onblocked = () => resolve();
  });
}

async function migrateLegacyRepoContextDatabase(): Promise<void> {
  const legacyExists = await databaseExists(LEGACY_DB_NAME);
  if (!legacyExists) {
    return;
  }

  const [currentDatabase, legacyDatabase] = await Promise.all([
    openDatabase(DB_NAME),
    openDatabase(LEGACY_DB_NAME),
  ]);

  if (!currentDatabase || !legacyDatabase) {
    currentDatabase?.close();
    legacyDatabase?.close();
    return;
  }

  try {
    const [currentFiles, legacyFiles] = await Promise.all([
      getStoredValueFromDatabase(currentDatabase, FILES_KEY),
      getStoredValueFromDatabase(legacyDatabase, FILES_KEY),
    ]);

    if ((!Array.isArray(currentFiles) || currentFiles.length === 0) && legacyFiles !== undefined) {
      await setStoredValueInDatabase(currentDatabase, FILES_KEY, legacyFiles);
    }
  } finally {
    currentDatabase.close();
    legacyDatabase.close();
  }

  await deleteDatabase(LEGACY_DB_NAME).catch(() => undefined);
}

function ensureRepoContextMigration(): Promise<void> {
  if (!repoContextMigrationPromise) {
    repoContextMigrationPromise = migrateLegacyRepoContextDatabase().catch((error) => {
      repoContextMigrationPromise = null;
      throw error;
    });
  }

  return repoContextMigrationPromise;
}

async function openRepoContextDatabase(): Promise<IDBDatabase | null> {
  await ensureRepoContextMigration();
  return openDatabase(DB_NAME);
}

async function getStoredValue(key: string): Promise<unknown> {
  const database = await openRepoContextDatabase();
  if (!database) {
    return [];
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not read repo context files.'));

    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
    transaction.onabort = () => database.close();
  });
}

async function setStoredValue(key: string, value: unknown): Promise<void> {
  const database = await openRepoContextDatabase();
  if (!database) {
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const request = transaction.objectStore(STORE_NAME).put(value, key);

    request.onsuccess = () => undefined;
    request.onerror = () => reject(request.error ?? new Error('Could not persist repo context files.'));

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Could not persist repo context files.'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error('Could not persist repo context files.'));
    };
  });
}

function isStoredRepoContextFile(value: unknown): value is {
  id: string;
  name: string;
  path?: string;
  content: string;
  included?: boolean;
} {
  return typeof value === 'object' && value !== null
    && 'id' in value && typeof value.id === 'string'
    && 'name' in value && typeof value.name === 'string'
    && 'content' in value && typeof value.content === 'string';
}

export async function loadPersistedRepoContextFiles(): Promise<RepoContextFile[]> {
  const storedValue = await getStoredValue(FILES_KEY);

  if (!Array.isArray(storedValue)) {
    return [];
  }

  const files = storedValue
    .filter(isStoredRepoContextFile)
    .map((file) => createRepoContextFile(file));

  // Safety guard: if stored data exceeds limits it will hang the browser.
  // Discard it and clear storage so a page refresh fully recovers the user.
  const totalChars = files.reduce((sum, f) => sum + f.content.length, 0);
  if (files.length > MAX_UPLOAD_FILES || totalChars > MAX_UPLOAD_TOTAL_CHARS) {
    void setStoredValue(FILES_KEY, []);
    return [];
  }

  return files;
}

export async function savePersistedRepoContextFiles(files: RepoContextFile[]): Promise<void> {
  await setStoredValue(FILES_KEY, files);
}