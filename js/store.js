// Lokaler Datenspeicher: eine flache Schlüssel-Wert-Liste in IndexedDB (im Browser
// des Geräts). Jeder Eintrag trägt einen Zeitstempel t. Beim Synchronisieren gewinnt
// pro Schlüssel der neuere Eintrag – so kann man auf zwei Geräten eintragen, ohne
// dass Änderungen verloren gehen. Gelöschte Einträge bleiben als {d:1} markiert,
// damit die Löschung auch auf dem anderen Gerät ankommt.

const DB_NAME = 'life4';
const STORE = 'kv';

let db;
const mem = new Map();
const listeners = new Set();
let lastT = 0;

function now() {
  const t = Date.now();
  lastT = t > lastT ? t : lastT + 1;
  return lastT;
}

function req(r) {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function openDb() {
  const r = indexedDB.open(DB_NAME, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  return req(r);
}

function writeMany(entries) {
  const tx = db.transaction(STORE, 'readwrite');
  const os = tx.objectStore(STORE);
  for (const [k, rec] of entries) os.put(rec, k);
  return new Promise((res, rej) => {
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  }).catch((e) => console.error('Speichern fehlgeschlagen', e));
}

function emit(info) {
  for (const fn of listeners) fn(info);
}

export async function init() {
  db = await openDb();
  const os = db.transaction(STORE).objectStore(STORE);
  const [keys, vals] = await Promise.all([req(os.getAllKeys()), req(os.getAll())]);
  keys.forEach((k, i) => {
    mem.set(k, vals[i]);
    if (vals[i].t > lastT) lastT = vals[i].t;
  });
  // Bittet den Browser, die Daten nie automatisch zu löschen.
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}

export function get(key, fallback) {
  const r = mem.get(key);
  return r && !r.d ? r.v : fallback;
}

export function set(key, v) {
  const rec = { v, t: now() };
  mem.set(key, rec);
  writeMany([[key, rec]]);
  emit({ local: true });
}

// Startwert, der jede echte Änderung verliert (t = 1) – so tauchen gelöschte
// Standard-Einträge nicht wieder auf, wenn ein zweites Gerät sie neu anlegt.
export function setDefault(key, v) {
  if (mem.has(key)) return;
  const rec = { v, t: 1 };
  mem.set(key, rec);
  writeMany([[key, rec]]);
}

export function del(key) {
  const r = mem.get(key);
  if (!r || r.d) return;
  const rec = { d: 1, t: now() };
  mem.set(key, rec);
  writeMany([[key, rec]]);
  emit({ local: true });
}

// Alle Einträge, deren Schlüssel mit prefix beginnt, z. B. list('person:').
export function list(prefix) {
  const out = [];
  for (const [k, r] of mem) if (!r.d && k.startsWith(prefix)) out.push({ key: k, v: r.v });
  return out;
}

export function count() {
  let n = 0;
  for (const r of mem.values()) if (!r.d) n++;
  return n;
}

// Kompletter Stand inkl. Zeitstempel – für Sync und Backup.
export function snapshot() {
  return Object.fromEntries(mem);
}

// Fremden Stand (anderes Gerät oder Backup) einarbeiten. Neuere Einträge gewinnen.
export async function merge(remote) {
  const changed = [];
  for (const [k, r] of Object.entries(remote || {})) {
    if (!r || typeof r.t !== 'number') continue;
    const l = mem.get(k);
    if (!l || r.t > l.t) {
      mem.set(k, r);
      changed.push([k, r]);
      if (r.t > lastT) lastT = r.t;
    }
  }
  if (changed.length) {
    await writeMany(changed);
    emit({ local: false });
  }
  return changed.length;
}

export async function clearAll() {
  mem.clear();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).clear();
  await new Promise((res) => (tx.oncomplete = res));
  emit({ local: false });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
