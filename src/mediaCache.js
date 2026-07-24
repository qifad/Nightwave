const DATABASE_NAME = 'nightwave-media-cache';
const STORE_NAME = 'decoded-media';
let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) { resolve(null); return; }
    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(() => null);
  return databasePromise;
}

export async function getDecodedMedia(key) {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

export async function putDecodedMedia(entry) {
  const database = await openDatabase();
  if (!database) return false;
  return new Promise((resolve) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ ...entry, updatedAt: Date.now() });
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}
