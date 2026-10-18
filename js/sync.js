// Synchronisation zwischen Geräten über ein privates GitHub-Repository.
// Ablauf: verschlüsselte Datei holen → entschlüsseln → mit lokalen Daten mischen
// → falls dieses Gerät Neues hat: alles verschlüsseln und wieder hochladen.
// Verschlüsselt wird mit AES-GCM, der Schlüssel entsteht aus deinem Sync-Passwort.
// GitHub sieht nur unlesbaren Datensalat.

import * as store from './store.js';

const CFG_KEY = 'life4.sync';       // Zugangsdaten – bleiben auf diesem Gerät
const LAST_KEY = 'life4.lastSync';
const FILE = 'life-app-sync.json';

const enc = new TextEncoder();
const dec = new TextDecoder();
const listeners = new Set();
let running = null;
let lastError = null;

export function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY)) || null;
  } catch {
    return null;
  }
}

export function saveConfig(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

export function clearConfig() {
  localStorage.removeItem(CFG_KEY);
  localStorage.removeItem(LAST_KEY);
  emit();
}

export function lastSync() {
  const v = Number(localStorage.getItem(LAST_KEY));
  return v || null;
}

export function status() {
  return { running: !!running, error: lastError, last: lastSync(), configured: !!getConfig() };
}

export function onStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(status());
}

export function sync() {
  if (!running) {
    running = doSync()
      .then((r) => {
        lastError = null;
        return r;
      })
      .catch((e) => {
        lastError = e.message;
        throw e;
      })
      .finally(() => {
        running = null;
        emit();
      });
    emit();
  }
  return running;
}

async function doSync(retry = true) {
  const cfg = getConfig();
  if (!cfg) throw new Error('Sync ist noch nicht eingerichtet (Einstellungen).');
  if (!navigator.onLine) throw new Error('Kein Internet – später nochmal versuchen.');

  const remote = await download(cfg);
  const remoteData = remote.text ? await decrypt(remote.text, cfg.pass) : {};
  const pulled = await store.merge(remoteData);

  const local = store.snapshot();
  const needsUpload = Object.entries(local).some(([k, r]) => !remoteData[k] || remoteData[k].t < r.t);
  if (needsUpload) {
    const ok = await upload(cfg, await encrypt(local, cfg.pass), remote.sha);
    // Das andere Gerät war genau gleichzeitig schneller → einfach nochmal.
    if (!ok) {
      if (retry) return doSync(false);
      throw new Error('Gleichzeitige Änderung – bitte nochmal synchronisieren.');
    }
  }
  localStorage.setItem(LAST_KEY, String(Date.now()));
  return { pulled, pushed: needsUpload };
}

// Prüft Zugangsdaten, bevor sie gespeichert werden.
export async function testConfig(cfg) {
  const r = await api(cfg, `https://api.github.com/repos/${cfg.repo}`);
  if (r.status === 401) throw new Error('Der Token ist ungültig oder abgelaufen.');
  if (r.status === 404) throw new Error('Repository nicht gefunden – Name prüfen (Benutzername/Repository) und ob der Token Zugriff darauf hat.');
  if (!r.ok) throw new Error(`GitHub meldet Fehler ${r.status}.`);
  const repo = await r.json();
  if (!repo.private) throw new Error('Das Repository ist öffentlich. Bitte auf „Private“ stellen – sicher ist sicher.');
  if (repo.permissions && !repo.permissions.push) throw new Error('Der Token darf nicht schreiben. Bei „Contents“ bitte „Read and write“ wählen.');
  // Passwort gegen vorhandene Daten prüfen (falls das andere Gerät schon synchronisiert hat).
  const remote = await download(cfg);
  if (remote.text) await decrypt(remote.text, cfg.pass);
  return { hasData: !!remote.text };
}

// ---------- GitHub ----------

function api(cfg, url, opts = {}) {
  return fetch(url, {
    ...opts,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: opts.accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  }).catch(() => {
    throw new Error('GitHub nicht erreichbar – Internetverbindung prüfen.');
  });
}

const fileUrl = (cfg) => `https://api.github.com/repos/${cfg.repo}/contents/${FILE}`;

async function download(cfg) {
  const r = await api(cfg, fileUrl(cfg));
  if (r.status === 404) return { sha: null, text: null };
  if (r.status === 401) throw new Error('Der Sync-Token ist ungültig oder abgelaufen.');
  if (!r.ok) throw new Error(`Download fehlgeschlagen (Fehler ${r.status}).`);
  const j = await r.json();
  let text;
  if (j.content) {
    text = dec.decode(fromB64(j.content));
  } else {
    // Dateien über 1 MB liefert GitHub nur „roh“ aus.
    const raw = await api(cfg, fileUrl(cfg), { accept: 'application/vnd.github.raw+json' });
    if (!raw.ok) throw new Error(`Download fehlgeschlagen (Fehler ${raw.status}).`);
    text = await raw.text();
  }
  return { sha: j.sha, text };
}

async function upload(cfg, text, sha) {
  const body = { message: `Sync ${new Date().toISOString()}`, content: toB64(enc.encode(text)) };
  if (sha) body.sha = sha;
  const r = await api(cfg, fileUrl(cfg), { method: 'PUT', body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) return false;
  if (r.status === 401) throw new Error('Der Sync-Token ist ungültig oder abgelaufen.');
  if (r.status === 403 || r.status === 404) throw new Error('Der Token darf nicht schreiben. Bei „Contents“ bitte „Read and write“ wählen.');
  if (!r.ok) throw new Error(`Upload fehlgeschlagen (Fehler ${r.status}).`);
  return true;
}

// ---------- Verschlüsselung ----------

async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

async function encrypt(data, pass) {
  let bytes = enc.encode(JSON.stringify(data));
  const z = typeof CompressionStream !== 'undefined';
  if (z) bytes = await pipe(bytes, new CompressionStream('gzip'));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  return JSON.stringify({ format: 'life4-sync', v: 1, z, salt: toB64(salt), iv: toB64(iv), data: toB64(ct) });
}

async function decrypt(text, pass) {
  let f;
  try {
    f = JSON.parse(text);
  } catch {
    throw new Error('Die Sync-Datei ist beschädigt.');
  }
  if (f.format !== 'life4-sync') throw new Error('Die Sync-Datei hat ein unbekanntes Format.');
  const key = await deriveKey(pass, fromB64(f.salt));
  let bytes;
  try {
    bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(f.iv) }, key, fromB64(f.data)));
  } catch {
    throw new Error('Sync-Passwort falsch – es muss auf beiden Geräten gleich sein.');
  }
  if (f.z) bytes = await pipe(bytes, new DecompressionStream('gzip'));
  return JSON.parse(dec.decode(bytes));
}

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b64) {
  const s = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
