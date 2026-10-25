import * as store from '../store.js';
import * as sync from '../sync.js';
import { h, icon, toast, ago, iso, saveFile } from '../ui.js';
import { VERSION } from '../version.js';
import * as body from '../body.js';
import * as mind from '../mind.js';
import * as photos from '../photos.js';

export function render(refresh) {
  return h('div.view',
    h('header.hero', h('p.eyebrow', 'Einstellungen'), h('h1', 'Du & deine Daten')),
    profile(),
    syncSection(refresh),
    backupSection(refresh),
    storageSection(refresh),
    h('p.small.muted.center', `Version ${VERSION}`),
  );
}

function profile() {
  return h('section.card',
    h('p.label', 'Name'),
    h('input.input', {
      value: store.get('settings.name', ''),
      autocomplete: 'given-name',
      onchange: (e) => {
        store.set('settings.name', e.target.value.trim());
        toast('Gespeichert');
      },
    }),
  );
}

// ---------- Sync ----------

function syncSection(refresh) {
  const cfg = sync.getConfig();
  const st = sync.status();
  if (cfg) {
    return h('section.card',
      h('div.row', h('span.chip-icon', icon('lock', 18)), h('p.label', 'Sync ist eingerichtet')),
      h('p.muted', `Tresor: ${cfg.repo}`),
      h('p.muted', `Zuletzt synchronisiert: ${ago(st.last)}`),
      st.error && h('p.error', st.error),
      h('div.buttons',
        h('button.btn.primary', {
          onclick: async (e) => {
            e.target.disabled = true;
            try {
              const r = await sync.sync();
              toast(r.pulled ? `Synchronisiert – ${r.pulled} Änderungen übernommen` : 'Synchronisiert');
            } catch (err) {
              toast(err.message, 'error');
            }
            refresh();
          },
        }, 'Jetzt synchronisieren'),
        h('button.btn.ghost', {
          onclick: () => {
            if (!confirm('Sync auf diesem Gerät ausschalten? Deine Daten bleiben erhalten.')) return;
            sync.clearConfig();
            refresh();
          },
        }, 'Sync ausschalten'),
      ),
    );
  }

  const repo = h('input.input', { autocapitalize: 'off', autocorrect: 'off', spellcheck: false });
  const token = h('input.input', { type: 'password', autocapitalize: 'off', autocomplete: 'off' });
  const pass = h('input.input', { type: 'password', autocomplete: 'new-password' });
  const msg = h('p.error');

  return h('section.card',
    h('div.row', h('span.chip-icon', icon('sync', 18)), h('p.label', 'Sync zwischen iPhone und Mac')),
    h('label.field', h('span', 'Repository'), repo),
    h('label.field', h('span', 'Zugangs-Token'), token),
    h('label.field', h('span', 'Sync-Passwort'), pass),
    msg,
    h('div.buttons',
      h('button.btn.primary', {
        onclick: async (e) => {
          const cfg = {
            repo: repo.value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, ''),
            token: token.value.trim(),
            pass: pass.value,
          };
          msg.textContent = '';
          if (!/^[\w.-]+\/[\w.-]+$/.test(cfg.repo)) return (msg.textContent = 'Repository bitte als benutzername/repository-name eingeben.');
          if (!cfg.token) return (msg.textContent = 'Bitte den Token einfügen.');
          if (cfg.pass.length < 8) return (msg.textContent = 'Das Passwort braucht mindestens 8 Zeichen.');
          e.target.disabled = true;
          e.target.textContent = 'Prüfe …';
          try {
            await sync.testConfig(cfg);
            sync.saveConfig(cfg);
            const r = await sync.sync();
            toast(r.pulled ? `Verbunden – ${r.pulled} Einträge vom anderen Gerät geladen` : 'Verbunden und synchronisiert');
            refresh();
          } catch (err) {
            msg.textContent = err.message;
            e.target.disabled = false;
            e.target.textContent = 'Verbinden';
          }
        },
      }, 'Verbinden'),
    ),
  );
}

// ---------- Backup ----------

function backupSection(refresh) {
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: importBackup });

  async function importBackup(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (j.format !== 'life4-backup' || !j.data) throw new Error();
      const n = await store.merge(j.data);
      toast(n ? `Backup geladen – ${n} Einträge übernommen` : 'Backup geladen – alles war schon aktuell');
      refresh();
    } catch {
      toast('Das ist keine gültige Backup-Datei dieser App.', 'error');
    }
  }

  return h('section.card',
    h('div.row', h('span.chip-icon', icon('download', 18)), h('p.label', 'Backup')),
    h('p.small.muted', `Letztes Backup: ${ago(Number(localStorage.getItem('life4.lastBackup')) || null)}`),
    h('div.buttons',
      h('button.btn.primary', { onclick: () => exportBackup().then(refresh) }, icon('download', 18), 'Backup speichern'),
      h('button.btn.ghost', { onclick: () => file.click() }, icon('upload', 18), 'Backup laden'),
    ),
    file,
  );
}

export async function exportBackup() {
  const data = { format: 'life4-backup', v: 1, created: new Date().toISOString(), data: store.snapshot() };
  const name = `life-app-backup-${iso()}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  if (await saveFile(blob, name, 'application/json')) {
    localStorage.setItem('life4.lastBackup', String(Date.now()));
    toast('Backup erstellt');
  }
}

// ---------- Speicher ----------

function storageSection(refresh) {
  const info = h('p.small.muted', `${store.count()} ${store.count() === 1 ? "Eintrag" : "Einträge"} auf diesem Gerät gespeichert.`);
  navigator.storage?.persisted?.().then((p) => {
    if (p) info.append(' Vor automatischem Löschen geschützt.');
  });
  return h('section.card',
    h('p.label', 'Speicher'),
    info,
    h('div.buttons',
      h('button.btn.ghost', {
        onclick: async () => {
          toast('Lade neueste Version …');
          // Nur App-Dateien neu laden – deine Daten bleiben unberührt.
          const keys = await caches.keys().catch(() => []);
          await Promise.all(keys.map((k) => caches.delete(k)));
          const reg = await navigator.serviceWorker?.getRegistration().catch(() => null);
          await reg?.update().catch(() => {});
          location.reload();
        },
      }, 'App aktualisieren'),
      h('button.btn.danger', {
        onclick: async () => {
          if (!confirm('Wirklich ALLE Einträge löschen – auf allen Geräten und im Sync?')) return;
          if (!confirm('Sicher? Ohne Backup sind sie danach weg.')) return;
          // Löschmarkierungen statt nur lokal leeren: sonst holt der Sync alles wieder zurück.
          // Einstellungen (Name, Ziele, Wasser) bleiben, Standard-Routinen/-Affirmationen/-Fragen werden neu angelegt.
          await store.deleteAll(['settings.']);
          body.restoreDefaults();
          mind.restoreDefaults();
          await photos.clearPhotos().catch(() => {});
          try {
            localStorage.removeItem('life4.timer');
          } catch { /* egal */ }
          if (sync.getConfig()) {
            toast('Gelöscht – Sync läuft …');
            try {
              await sync.sync();
              toast('Alle Daten gelöscht – auch im Sync');
            } catch (e) {
              toast(`Gelöscht. Sync: ${e.message}`, 'error');
            }
          } else toast('Alle Daten gelöscht');
          refresh();
        },
      }, 'Alle Daten löschen'),
    ),
  );
}
