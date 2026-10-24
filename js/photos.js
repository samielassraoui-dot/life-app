// Fortschrittsfotos – nur auf diesem Gerät (eigene IndexedDB, kein Sync, kein Backup).
// Bilder werden beim Speichern auf max. 1280 px verkleinert.

const DB = 'life4-photos';
const STORE = 'photos';
let dbp = null;

function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const res = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(res?.result ?? res);
    t.onerror = () => reject(t.error);
  });
}

async function shrink(file, max = 1280) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r(b || file), 'image/jpeg', 0.82));
}

export async function addPhoto(file, date) {
  const blob = await shrink(file);
  const id = `${date}-${Date.now().toString(36)}`;
  await tx('readwrite', (s) => s.put({ id, date, blob }));
  return id;
}

export async function listPhotos() {
  try {
    const all = await tx('readonly', (s) => s.getAll());
    return (all || []).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  } catch {
    return [];
  }
}

export const deletePhoto = (id) => tx('readwrite', (s) => s.delete(id));
