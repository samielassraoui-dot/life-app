// Einstieg: Navigation, Kopfzeile, Tab-Leiste, automatische Synchronisation.
import * as store from './store.js';
import * as sync from './sync.js';
import { AREAS } from './areas.js';
import { h, icon, toast } from './ui.js';
import * as dashboard from './views/dashboard.js';
import * as area from './views/area.js';
import * as settings from './views/settings.js';
import * as koerper from './views/koerper.js';
import * as review from './views/review.js';
import * as woche from './views/woche.js';
import * as sinn from './views/sinn.js';
import * as contact from './views/contact.js';
import * as leistung from './views/leistung.js';
import * as todos from './views/todos.js';
import * as mind from './mind.js';
import { seedDefaults } from './body.js';

const TABS = [{ id: 'heute', tab: 'Überblick', icon: 'home' }, ...AREAS.map((a) => ({ id: a.id, tab: a.tab, icon: a.id })), { id: 'todos', tab: 'Todos', icon: 'todos' }];

let main, tabbar, syncBtn, gearBtn;

// Logo: Weltkugel aus dem Farbring der Bereiche (Hintergrund per CSS), Längen-/Breitengrade und ein „S“
const LOGO_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><g fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.1">'
  + '<ellipse cx="16" cy="16" rx="7" ry="15"/><path d="M1 16h30M3.2 8.5h25.6M3.2 23.5h25.6"/></g>'
  + '<text x="16" y="22" text-anchor="middle" font-size="18" font-weight="900" fill="#fff" font-family="-apple-system, system-ui, sans-serif" stroke="rgba(0,0,0,.18)" stroke-width=".6" paint-order="stroke">S</text></svg>';

function route() {
  const [r, sub] = location.hash.replace(/^#\/?/, '').split('/');
  return { r: r || 'heute', sub: sub || '' };
}

let lastRoute = '';
function render() {
  const { r, sub } = route();
  let view;
  if (r === 'einstellungen') view = settings.render(render);
  else if (r === 'koerper') view = koerper.render(sub, render);
  else if (r === 'sinn') view = sinn.render(render);
  else if (r === 'contact') view = contact.render(sub, render);
  else if (r === 'leistung') view = leistung.render(sub, render);
  else if (r === 'todos') view = todos.render(render);
  else if (r === 'review') view = review.render(render);
  else if (r === 'woche') view = woche.render(render);
  else if (AREAS.some((a) => a.id === r)) view = area.render(r);
  else view = dashboard.render(render);
  // Einblenden nur beim Seitenwechsel, nicht bei jedem Abhaken
  if (`${r}/${sub}` !== lastRoute) view.classList.add('enter');
  lastRoute = `${r}/${sub}`;
  main.replaceChildren(view);
  document.body.dataset.area = r;
  gearBtn.hidden = r !== 'koerper' || ['import', 'ziele'].includes(sub);
  for (const a of tabbar.querySelectorAll('a')) a.classList.toggle('active', a.dataset.id === r || (a.dataset.id === 'heute' && ['review', 'woche'].includes(r)));
}

function shell() {
  syncBtn = h('button.iconbtn', { 'aria-label': 'Jetzt synchronisieren', onclick: manualSync }, icon('sync', 22));
  // Zahnrad für Körper (Import, Kalender, Ziele, Routinen) – nur im Bereich Körper sichtbar
  gearBtn = h('button.iconbtn.areagear', { 'aria-label': 'Einstellungen Körper', hidden: true, onclick: () => koerper.openMenu(render) }, icon('gear', 22));
  const top = h('header.topbar',
    h('a.brand', { href: '#/heute' }, h('span.logo', { html: LOGO_SVG }), "Sami's World"),
    h('div.row', gearBtn, syncBtn, h('a.iconbtn', { href: '#/einstellungen', 'aria-label': 'Einstellungen' }, icon('settings', 22))),
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
  seedDefaults();
  mind.seedDefaults();
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

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    // Neue Version installiert → einmal neu laden, damit sie sofort sichtbar ist.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});
  }
}

start();
