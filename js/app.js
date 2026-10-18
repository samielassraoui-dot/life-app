// Einstieg: Navigation, Kopfzeile, Tab-Leiste, automatische Synchronisation.
import * as store from './store.js';
import * as sync from './sync.js';
import { AREAS } from './areas.js';
import { h, icon, toast } from './ui.js';
import * as dashboard from './views/dashboard.js';
import * as area from './views/area.js';
import * as settings from './views/settings.js';

const TABS = [{ id: 'heute', tab: 'Heute', icon: 'home' }, ...AREAS.map((a) => ({ id: a.id, tab: a.tab, icon: a.id }))];

let main, tabbar, syncBtn;

function route() {
  return location.hash.replace(/^#\/?/, '').split('/')[0] || 'heute';
}

function render() {
  const r = route();
  let view;
  if (r === 'einstellungen') view = settings.render(render);
  else if (AREAS.some((a) => a.id === r)) view = area.render(r);
  else view = dashboard.render();
  main.replaceChildren(view);
  document.body.dataset.area = r;
  for (const a of tabbar.querySelectorAll('a')) a.classList.toggle('active', a.dataset.id === r);
}

function shell() {
  syncBtn = h('button.iconbtn', { 'aria-label': 'Jetzt synchronisieren', onclick: manualSync }, icon('sync', 22));
  const top = h('header.topbar',
    h('a.brand', { href: '#/heute' }, h('span.logo'), '4 Bereiche'),
    h('div.row', syncBtn, h('a.iconbtn', { href: '#/einstellungen', 'aria-label': 'Einstellungen' }, icon('settings', 22))),
  );
  main = h('main', { id: 'main' });
  tabbar = h('nav.tabbar',
    TABS.map((t) => h(`a.tab.t-${t.id}`, { href: `#/${t.id}`, 'data-id': t.id }, icon(t.icon, 24), h('span', t.tab))),
  );
  document.getElementById('app').replaceChildren(top, main, tabbar);
}

function paintSync(st = sync.status()) {
  syncBtn.classList.toggle('spinning', st.running);
  syncBtn.classList.toggle('err', !!st.error);
  syncBtn.classList.toggle('off', !st.configured);
}

async function manualSync() {
  if (!sync.getConfig()) {
    location.hash = '#/einstellungen';
    toast('Richte zuerst den Sync ein.');
    return;
  }
  try {
    const r = await sync.sync();
    toast(r.pulled ? `Synchronisiert – ${r.pulled} Änderungen übernommen` : 'Alles synchronisiert');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// Leise im Hintergrund synchronisieren – Fehler zeigt nur der Sync-Knopf (roter Punkt).
function autoSync() {
  if (sync.getConfig() && navigator.onLine) sync.sync().catch(() => {});
}

let debounce;
async function start() {
  try {
    await store.init();
  } catch (e) {
    document.getElementById('app').textContent = 'Der Speicher dieses Browsers ist nicht verfügbar (privater Modus?).';
    return;
  }
  shell();
  render();
  paintSync();
  addEventListener('hashchange', () => {
    render();
    scrollTo(0, 0);
  });
  sync.onStatus(paintSync);
  // Daten vom anderen Gerät angekommen → neu zeichnen (außer man tippt gerade).
  store.subscribe(({ local }) => {
    if (local) {
      clearTimeout(debounce);
      debounce = setTimeout(autoSync, 20000);
    } else if (!main.contains(document.activeElement) || document.activeElement === document.body) {
      render();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - (sync.lastSync() || 0) > 60000) autoSync();
    render(); // z. B. neuer Tag seit dem letzten Öffnen
  });
  autoSync();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
