// Bereich Körper – drei Reiter:
//   Heute      Kopfkarte, Trainings-Banner, Wasser, Mahlzeiten, Training, Routinen, Gewicht
//   Woche      Tagesübersicht, Meal Prep, Spontan-Einträge
//   Rückblick  Gewicht, Umfänge, Fotos, Konsistenz
// Dazu: Wochenplan-Import und Ziele.
import * as body from '../body.js';
import * as photos from '../photos.js';
import { lineChart } from '../chart.js';
import { h, icon, toast, iso, fromIso, addDays, weekStart, fmtLong, fmtShort, WD_SHORT, saveFile, isoWeek, sheet, swipeLeft } from '../ui.js';

const TABS = [
  { id: 'heute', name: 'Heute' },
  { id: 'woche', name: 'Woche' },
  { id: 'rueckblick', name: 'Rückblick' },
];

let day = iso();
let dayIsToday = true;     // springt bei neuem Tag automatisch mit
let editRoutines = false;
let editTraining = false;
let showExtra = false;
let showTraining = false;
let weekOffset = 0;        // Reiter Woche: 0 = diese Woche
let rangeWeeks = 8;        // Reiter Rückblick: Gewichtschart
let pendingPlan = null;
let entering = null;       // zuletzt verschobener Eintrag – bekommt eine Einblend-Animation
let lastBanner = null;     // für die Wechsel-Animation des Trainings-Banners

const n = (v) => Math.round(v).toLocaleString('de-DE');
const kg = (v) => v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const liter = (v) => v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const parseNum = (s) => Number(String(s).replace(',', '.').trim()) || 0;
const nowTime = () => new Date().toTimeString().slice(0, 5);
const byTime = (a, b) => (a.zeit || '99').localeCompare(b.zeit || '99');

export function render(sub, refresh) {
  if (sub === 'import') return importView();
  if (sub === 'ziele') return goalsView();
  if (dayIsToday) day = iso();
  const tab = TABS.some((t) => t.id === sub) ? sub : 'heute';
  const views = { heute: todayTab, woche: weekTab, rueckblick: reviewTab };
  const view = h('div.view.a-koerper.kp-view',
    h('div.segs.ctabs', TABS.map((t) => h(`a.seg${t.id === tab ? '.on' : ''}`, { href: `#/koerper/${t.id}` }, t.name))),
    views[tab](refresh),
  );
  entering = null;
  return view;
}

function back() {
  return h('a.backlink', { href: '#/koerper' }, icon('back', 18), 'Körper');
}

function secTitle(ic, text, right) {
  return h('div.sec-title', h('span.sec-icon', icon(ic, 18)), h('h2', text), right || null);
}

// ---------- Aufklappbare Boxen ----------
// Standard: offen, solange es offene Einträge gibt. Manuell gewählter Zustand wird
// pro Box und Tag gemerkt (nur auf diesem Gerät).

const OPEN_KEY = 'life4.koerperOpen';

function openMap() {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY)) || {};
  } catch {
    return {};
  }
}

function rememberOpen(id, val) {
  try {
    const m = openMap();
    m[`${id}:${day}`] = val;
    const keys = Object.keys(m);
    for (const k of keys.slice(0, Math.max(0, keys.length - 120))) delete m[k];
    localStorage.setItem(OPEN_KEY, JSON.stringify(m));
  } catch { /* egal */ }
}

const isOpen = (id, auto) => openMap()[`${id}:${day}`] ?? auto;

// Auf-/Zuklappen ohne Neuzeichnen (Animation 200 ms über CSS)
function collapsible(id, auto, head, content, cls = '') {
  const open = isOpen(id, auto);
  const sec = h(`${cls}${open ? '.open' : ''}`, head, content);
  head.setAttribute('aria-expanded', open);
  head.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const o = !sec.classList.contains('open');
    sec.classList.toggle('open', o);
    head.setAttribute('aria-expanded', o);
    rememberOpen(id, o);
  });
  return sec;
}

// title darf Text oder ein Element sein
function kbox(id, ic, title, { info, pct, autoOpen }, ...content) {
  const head = h('button.kbox-head',
    h('span.sec-icon', icon(ic, 18)),
    h('span.kbox-title', typeof title === 'string' ? h('h2', title) : title, info && h('span.kbox-info', info)),
    h('span.kbox-chev', icon('back', 18)),
  );
  return collapsible(id, autoOpen, head, [
    pct != null && h('div.kbox-bar', h('i', { style: { width: `${Math.min(100, pct)}%` } })),
    h('div.kbox-body', h('div.kbox-inner', content)),
  ], 'section.card.kbox');
}

// Gruppe „Erledigt (n)“ innerhalb einer Box, standardmäßig zugeklappt
function doneGroup(id, rows) {
  if (!rows.length) return null;
  const head = h('button.dg-head', h('span', `Erledigt (${rows.length})`), h('span.kbox-chev', icon('back', 16)));
  return collapsible(`${id}-done`, false, head, h('div.kbox-body', h('div.kbox-inner.dg-inner', h('div.klist', rows))), 'div.dgroup');
}

// Status-Symbol links: offen (Kreis), erledigt (Haken), ausgelassen (Kreuz)
const stIcon = (st) => h(`span.st-ic${st ? `.${st}` : ''}`, st === 'done' ? icon('check', 16) : st === 'skip' ? icon('close', 14) : null);

// Eintrag verschieben: kurz ausblenden (≈ 250 ms), dann Zustand ändern und neu zeichnen.
function move(rowEl, key, change, refresh, down = true) {
  const el = rowEl.closest('.swl-row') || rowEl;
  el.classList.add(down ? 'leave-down' : 'leave-up');
  entering = key;
  setTimeout(() => {
    change();
    refresh();
  }, 240);
}

const enterCls = (key) => (entering === key ? '.enter-row' : '');

// Einzeilig: Haken · Uhrzeit · Name ……… [Tags]
function doneLine(key, st, time, name, tags) {
  return h(`div.cline${st === 'skip' ? '.skipped' : ''}${enterCls(key)}`,
    stIcon(st === 'skip' ? 'skip' : 'done'),
    h('span.cl-time', time || '–'),
    h('span.cl-name', name),
    h('span.cl-tags', tags),
  );
}

const warnIcon = (m) => body.kcalMismatch(m) && h('span.kwarn', { title: 'kcal passen nicht zu den Makros', 'aria-label': 'kcal passen nicht zu den Makros' }, icon('warn', 15));

// ---------- Menü (Zahnrad in der Kopfzeile) ----------

export function openMenu(refresh) {
  const item = (ic, title, fn) => h('button.menu-item', { onclick: fn },
    h('span.sec-icon', icon(ic, 18)), h('span', h('b', title)), h('span.chev-r', icon('back', 16)));
  const sh = sheet('Körper',
    h('div.menu',
      item('upload', 'Wochenplan importieren', () => { sh.close(); location.hash = '#/koerper/import'; }),
      item('bell', 'Erinnerungen in Kalender', () => { sh.close(); calendarExport(); }),
      item('settings', 'Ziele anpassen', () => { sh.close(); location.hash = '#/koerper/ziele'; }),
      item('list', 'Routinen bearbeiten', () => {
        sh.close();
        editRoutines = true;
        rememberOpen('routinen', true);
        if (!/^#\/koerper(\/heute)?$/.test(location.hash)) location.hash = '#/koerper/heute';
        else refresh();
      }),
    ),
  );
}

// ---------- Reiter Heute ----------

function todayTab(refresh) {
  return [
    hero(refresh),
    trainingBanner(),
    waterBox(),
    mealsBox(refresh),
    trainingBox(refresh),
    routinesBox(refresh),
    weightBox(refresh),
  ];
}

function ring(eaten, goal) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = goal ? Math.min(1, eaten / goal) : 0;
  const left = goal - eaten;
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 128 128');
  s.setAttribute('class', 'ring');
  // Bei 0 % kein Fortschrittspunkt
  s.innerHTML = `<circle cx="64" cy="64" r="${r}" class="ring-track"/>`
    + (pct > 0 ? `<circle cx="64" cy="64" r="${r}" class="ring-val" stroke-dasharray="${c * pct} ${c}" transform="rotate(-90 64 64)"/>` : '');
  return h('div.ring-wrap', s, h('div.ring-text',
    h('b', left >= 0 ? n(left) : `+${n(-left)}`),
    h('span.ring-unit', left >= 0 ? 'kcal übrig' : 'kcal drüber'),
    h('span.ring-sub', `${n(eaten)} von ${n(goal)}`),
  ));
}

function hero(refresh) {
  const today = iso();
  const go = (delta) => {
    day = iso(addDays(fromIso(day), delta));
    dayIsToday = day === today;
    showExtra = false;
    showTraining = false;
    refresh();
  };
  const label = day === today ? 'Heute' : day === iso(addDays(new Date(), 1)) ? 'Morgen' : day === iso(addDays(new Date(), -1)) ? 'Gestern' : WD_SHORT[fromIso(day).getDay()];
  const t = body.targets();
  const { eaten } = body.totals(day);
  const order = ['protein', 'kh', 'fett'];

  return h('section.kp-hero',
    h('div.daynav',
      h('button.navbtn', { onclick: () => go(-1), 'aria-label': 'Vorheriger Tag' }, icon('back', 20)),
      h('button.daylabel', {
        onclick: () => {
          day = today;
          dayIsToday = true;
          refresh();
        },
      }, h('b', label), h('span', fmtLong(fromIso(day)))),
      h('button.navbtn.flip', { onclick: () => go(1), 'aria-label': 'Nächster Tag' }, icon('back', 20)),
    ),
    h('div.kp-sum',
      ring(eaten.kcal, t.kcal),
      h('div.kp-macros',
        order.map((id) => {
          const m = body.MACROS.find((x) => x.id === id);
          return h(`div.kp-macro${id === 'protein' ? '.main' : ''}`,
            h('div.row.between', h('span', m.name), h('span', h('b', n(eaten[id])), ` / ${n(t[id])} g`)),
            h('div.hbar', h('i', { style: { width: `${Math.min(100, t[id] ? (eaten[id] / t[id]) * 100 : 0)}%` } })),
          );
        }),
      ),
    ),
  );
}

// ---------- Trainings-Banner (reine Anzeige) ----------

function bannerText() {
  const list = body.training(day);
  const active = list.map((t, i) => ({ t, i })).filter((u) => !body.isRest(u.t));
  const word = day === iso() ? 'HEUTE' : WD_SHORT[fromIso(day).getDay()].toUpperCase();
  if (!list.length) return { text: `${word}: KEIN PLAN`, phase: 'today' };
  if (!active.length) return { text: `${word}: RUHETAG`, phase: 'today' };
  if (active.every((u) => body.trainingState(day, u.i))) {
    const next = body.training(iso(addDays(fromIso(day), 1)));
    const mu = body.mainUnit(next);
    const text = !next.length ? 'MORGEN: KEIN PLAN' : mu ? `MORGEN: ${body.unitName(mu)}` : 'MORGEN: RUHETAG';
    return { text, phase: 'tomorrow' };
  }
  return { text: `TRAINING: ${body.unitName(body.mainUnit(list))}`, phase: 'today' };
}

function trainingBanner() {
  const b = bannerText();
  const swap = lastBanner && lastBanner.day === day && lastBanner.text !== b.text;
  lastBanner = { day, text: b.text };
  return h(`div.tbanner${b.phase === 'tomorrow' ? '.tomorrow' : ''}${swap ? '.swap' : ''}`, h('span', b.text));
}

// ---------- Wasser ----------

function glassSvg() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 32 40');
  s.innerHTML = '<defs><clipPath id="glassClip"><path d="M5 4h22l-2.6 31a2.5 2.5 0 01-2.5 2.3H10.1a2.5 2.5 0 01-2.5-2.3z"/></clipPath></defs>'
    + '<g clip-path="url(#glassClip)"><rect class="wfill" x="0" y="0" width="32" height="40"/></g>'
    + '<path class="wglass" d="M5 4h22l-2.6 31a2.5 2.5 0 01-2.5 2.3H10.1a2.5 2.5 0 01-2.5-2.3z"/>';
  return s;
}

function waterBox() {
  const ws = body.waterSettings();
  const glassMl = Math.round(ws.glass * 1000);
  const goalMl = Math.round(ws.goal * 1000);
  const goalGlasses = Math.ceil(goalMl / glassMl);
  let ml = body.water(day);

  const info = h('span.kbox-info');
  const bar = h('i');
  const grid = h('div.glasses');
  const plus = h('button.glass.plus', { 'aria-label': 'Ein Glas mehr' }, icon('plus', 20));

  const paint = () => {
    const filled = Math.round(ml / glassMl);
    const count = Math.max(goalGlasses, filled);
    while (grid.children.length < count) {
      const i = grid.children.length;
      const g = h('button.glass', { 'aria-label': `Glas ${i + 1}` }, glassSvg());
      g.addEventListener('click', () => tap(i));
      grid.append(g);
    }
    while (grid.children.length > count) grid.lastChild.remove();
    [...grid.children].forEach((g, i) => {
      g.classList.toggle('full', i < filled);
      g.classList.toggle('extra', i >= goalGlasses);
    });
    grid.append(plus);
    const reached = ml >= goalMl;
    info.replaceChildren(`${liter(ml / 1000)} / ${liter(ws.goal)} L`, reached ? h('span.wreached', icon('check', 14)) : '');
    bar.style.width = `${Math.min(100, (ml / goalMl) * 100)}%`;
    sec.classList.toggle('reached', reached);
  };
  // Immer von links nach rechts: das zuletzt gefüllte Glas leert, jedes andere füllt das nächste.
  const tap = (i) => {
    const filled = Math.round(ml / glassMl);
    ml = i === filled - 1 ? ml - glassMl : ml + glassMl;
    body.setWater(day, ml);
    paint();
  };
  plus.addEventListener('click', () => {
    ml += glassMl;
    body.setWater(day, ml);
    paint();
  });

  const head = h('button.kbox-head',
    h('span.sec-icon', icon('drop', 18)),
    h('span.kbox-title', h('h2', 'Wasser'), info),
    h('span.kbox-chev', icon('back', 18)),
  );
  const sec = collapsible('wasser', ml < goalMl, head, [
    h('div.kbox-bar.water-bar', bar),
    h('div.kbox-body', h('div.kbox-inner', grid)),
  ], 'section.card.kbox.water');
  paint();
  return sec;
}

// ---------- Mahlzeiten ----------

// Uhrzeit aus dem Text erkennen: „Döner um 13 Uhr“, „Riegel 15:30“
function detectTime(text) {
  const m = text.match(/(?:\bum\s*)?\b([01]?\d|2[0-3])(?:[:.]([0-5]\d))?\s*uhr\b/i) || text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (!m) return null;
  return {
    time: `${String(m[1]).padStart(2, '0')}:${m[2] || '00'}`,
    rest: text.replace(m[0], '').replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim(),
  };
}

const catTag = (cat) => h(`span.cat.cat-${cat}`, cat === 'spontan' ? 'Spontan' : body.catName(cat));

const importBtn = () => h('a.btn.soft.full', { href: '#/koerper/import' }, icon('upload', 18), 'Wochenplan importieren');

function mealsBox(refresh) {
  const today = iso();
  const planned = body.meals(day).map((m, i) => ({ kind: 'plan', key: `m${i}`, i, m, zeit: m.zeit || '', st: body.mealStatus(day, i) }));
  const extras = body.extras(day).map((e) => ({ kind: 'extra', key: e.key, e, zeit: e.zeit || '' }));
  const done = planned.filter((x) => x.st === 'ja').length;
  const open = planned.filter((x) => !x.st).sort(byTime);
  const resolved = [...planned.filter((x) => x.st), ...extras].sort(byTime);
  const next = day === today ? open[0] : null;
  const info = !planned.length
    ? `Kein Plan${extras.length ? ` · ${extras.length} spontan` : ''}`
    : `${done}/${planned.length}${open.length ? ` · nächste: ${open[0].m.name} ${open[0].zeit}` : ''}`;

  const openRows = open.map((x) => {
    const { m, i, key } = x;
    const cat = body.category(m);
    const card = h(`div.mi.cat-${cat}${next === x ? '.next' : ''}${enterCls(key)}`,
      stIcon(null),
      h('div.mi-main',
        h('div.mi-top', catTag(cat), h('span.mi-name', m.name), warnIcon(m), h('span.mi-time', m.zeit || '')),
        h('div.mi-sub',
          m.menge && h('span.mi-menge', m.menge),
          h('span.mi-macros', h('b.mi-kcal', `${n(m.kcal)} kcal`), h('span.mchip', `P ${n(m.protein)}`), h('span.mchip', `KH ${n(m.kh)}`), h('span.mchip', `F ${n(m.fett)}`)),
        ),
      ),
    );
    return swipeLeft(card, {
      label: 'Auslassen',
      onTap: () => move(card, key, () => body.setMealStatus(day, i, 'ja'), refresh),
      onSwipe: () => move(card, key, () => body.setMealStatus(day, i, 'nein'), refresh),
    });
  });

  const doneRows = resolved.map((x) => {
    if (x.kind === 'extra') {
      const e = x.e;
      const line = doneLine(x.key, 'done', e.zeit, e.name, [warnIcon(e), catTag('spontan')]);
      return swipeLeft(line, {
        label: 'Löschen',
        onSwipe: () => {
          body.deleteExtra(e.key);
          refresh();
          toast(`„${e.name}“ entfernt`, '', { label: 'Rückgängig', fn: () => { const { key, ...data } = e; body.addExtra(day, data); refresh(); } });
        },
      });
    }
    const { m, i, st, key } = x;
    const cat = body.category(m);
    const line = doneLine(key, st === 'ja' ? 'done' : 'skip', m.zeit, m.name, [warnIcon(m), st === 'nein' && h('span.badge-skip', 'ausgelassen'), catTag(cat)]);
    return swipeLeft(line, {
      label: st === 'ja' ? 'Auslassen' : 'Offen',
      onTap: () => move(line, key, () => body.setMealStatus(day, i, null), refresh, false),
      onSwipe: () => (st === 'ja' ? (body.setMealStatus(day, i, 'nein'), refresh()) : move(line, key, () => body.setMealStatus(day, i, null), refresh, false)),
    });
  });

  return kbox('mahlzeiten', 'meal', 'Mahlzeiten', { info, pct: planned.length ? (done / planned.length) * 100 : null, autoOpen: open.length > 0 || !planned.length },
    !planned.length && importBtn(),
    open.length > 0 && h('div.klist', openRows),
    doneGroup('mahlzeiten', doneRows),
    showExtra ? extraForm(refresh) : h('button.btn.soft.full', { onclick: () => { showExtra = true; refresh(); } }, icon('plus', 18), 'Spontan gegessen'),
  );
}

function extraForm(refresh) {
  const name = h('input.input');
  const zeit = h('input.input', { type: 'time', value: day === iso() ? nowTime() : '' });
  let zeitTouched = false;
  zeit.addEventListener('input', () => { zeitTouched = true; });
  // Uhrzeit im Text erkennen und übernehmen
  name.addEventListener('input', () => {
    const d = detectTime(name.value);
    if (d && !zeitTouched) zeit.value = d.time;
  });
  const fields = body.MACROS.map((m) => ({ m, el: h('input.input', { inputmode: 'numeric' }) }));
  setTimeout(() => name.focus(), 60);
  return h('div.form',
    h('label.field', h('span', 'Name'), name),
    h('div.grid4', fields.map(({ m, el }) => h('label.field', h('span', m.id === 'kcal' ? 'kcal' : m.short || m.name), el))),
    h('label.field', h('span', 'Uhrzeit'), zeit),
    h('div.buttons',
      h('button.btn.primary', {
        onclick: () => {
          const d = detectTime(name.value);
          const text = (d ? d.rest : name.value).trim();
          if (!text) return toast('Name fehlt', 'error');
          const e = { zeit: zeit.value || (d && d.time) || (day === iso() ? nowTime() : '12:00'), name: text };
          for (const { m, el } of fields) e[m.id] = Math.round(parseNum(el.value));
          body.addExtra(day, e);
          showExtra = false;
          toast(`Eingetragen um ${e.zeit} Uhr`);
          refresh();
        },
      }, 'Speichern'),
      h('button.btn.ghost', { onclick: () => { showExtra = false; refresh(); } }, 'Abbrechen'),
    ),
  );
}

// ---------- Training ----------

function trainingBox(refresh) {
  const list = body.training(day);
  const units = list.map((t, i) => ({ t, i, key: `t${i}`, zeit: t.zeit || '', rest: body.isRest(t), st: body.trainingState(day, i) }));
  const active = units.filter((u) => !u.rest);
  const done = active.filter((u) => u.st === 'done').length;
  const open = active.filter((u) => !u.st).sort(byTime);
  const resolved = active.filter((u) => u.st).sort(byTime);
  const info = !units.length ? 'Kein Plan'
    : !active.length ? 'Ruhetag'
      : `${done}/${active.length}${open.length ? ` · nächste: ${body.unitName(open[0].t)}${open[0].zeit ? ` ${open[0].zeit}` : ''}` : ''}`;

  const delBtn = (u) => editTraining && h('button.pill.del.small', {
    'aria-label': 'Entfernen',
    onclick: () => {
      if (!confirm(`${body.unitName(u.t)} entfernen?`)) return;
      body.removeTraining(day, u.i);
      refresh();
    },
  }, icon('close', 16));

  const rest = units.filter((u) => u.rest).map((u) => h('div.rest', h('div', h('b', 'Ruhetag'), u.t.details && h('span.small.muted.block', u.t.details)), delBtn(u)));

  const openRows = open.map((u) => {
    const { t, i, key } = u;
    const nameEl = h('span.ri-name', h('b', body.unitName(t)),
      t.titel && h('span.tag.art', body.trainingName(t.art)),
      t.spontan && h('span.tag', 'spontan'),
      t.details && h('span.small.muted.block', t.details));
    if (editTraining) return h('div.ri', stIcon(null), nameEl, delBtn(u));
    const row = h(`div.ri${open[0] === u && day === iso() ? '.next' : ''}${enterCls(key)}`, stIcon(null), nameEl, h('span.ri-time', t.zeit || ''));
    return swipeLeft(row, {
      label: 'Auslassen',
      onTap: () => move(row, key, () => body.setTrainingState(day, i, 'done'), refresh),
      onSwipe: () => move(row, key, () => body.setTrainingState(day, i, 'skip'), refresh),
    });
  });
  const doneRows = resolved.map((u) => {
    const { t, i, key, st } = u;
    if (editTraining) return h('div.cline', stIcon(st), h('span.cl-name', body.unitName(t)), delBtn(u));
    const line = doneLine(key, st, t.zeit, body.unitName(t), st === 'skip' && h('span.badge-skip', 'ausgelassen'));
    return swipeLeft(line, {
      label: st === 'done' ? 'Auslassen' : 'Offen',
      onTap: () => move(line, key, () => body.setTrainingState(day, i, null), refresh, false),
      onSwipe: () => (st === 'done' ? (body.setTrainingState(day, i, 'skip'), refresh()) : move(line, key, () => body.setTrainingState(day, i, null), refresh, false)),
    });
  });

  let adder;
  if (showTraining) {
    const custom = h('input.input');
    const details = h('input.input');
    const add = (art) => {
      body.addTraining(day, { art: body.normArt(art), details: details.value.trim(), spontan: true });
      showTraining = false;
      toast(`${body.trainingName(art)} hinzugefügt`);
      refresh();
    };
    adder = h('div.form',
      h('div.chips', body.trainingChoices().map((c) => h('button.chip', { onclick: () => add(c.id) }, c.name))),
      h('label.field', h('span', 'Andere Art'), h('div.editrow.add2',
        custom,
        h('button.pill.add', { 'aria-label': 'Hinzufügen', onclick: () => custom.value.trim() && add(custom.value.trim()) }, icon('plus', 20)),
      )),
      h('label.field', h('span', 'Details'), details),
      h('button.btn.ghost', { onclick: () => { showTraining = false; refresh(); } }, 'Abbrechen'),
    );
  } else {
    adder = h('button.btn.soft.full', { onclick: () => { showTraining = true; refresh(); } }, icon('plus', 18), 'Training hinzufügen');
  }

  return kbox('training', 'koerper', 'Training', { info, pct: active.length ? ((active.length - open.length) / active.length) * 100 : null, autoOpen: open.length > 0 || !units.length },
    !units.length && importBtn(),
    rest,
    open.length > 0 && h('div.klist', openRows),
    doneGroup('training', doneRows),
    adder,
    units.length > 0 && h('button.link', { onclick: () => { editTraining = !editTraining; refresh(); } }, editTraining ? 'Fertig' : 'Bearbeiten'),
  );
}

// ---------- Routinen ----------

function routinesBox(refresh) {
  const list = body.routines();
  const states = list.map((r) => ({ r, key: `r-${r.id}`, zeit: r.zeit || '', st: body.routineState(day, r.id) }));
  const done = states.filter((x) => x.st === 'done').length;
  const open = states.filter((x) => !x.st).sort(byTime);
  const resolved = states.filter((x) => x.st).sort(byTime);
  const next = day === iso() ? open[0] : null;
  const info = !list.length ? 'Keine Routinen' : `${done}/${list.length}${open.length ? ` · nächste: ${open[0].r.name} ${open[0].zeit}` : ''}`;

  if (editRoutines) {
    const nameIn = h('input.input', { placeholder: 'Name', 'aria-label': 'Name' });
    const timeIn = h('input.input.time', { type: 'time', value: '08:00', 'aria-label': 'Uhrzeit' });
    return kbox('routinen', 'list', 'Routinen', { info, autoOpen: true },
      list.map((r) => h('div.editrow',
        h('input.input.time', { type: 'time', value: r.zeit || '', 'aria-label': 'Uhrzeit', onchange: (e) => body.saveRoutine(r.id, { name: r.name, zeit: e.target.value }) }),
        h('input.input', { value: r.name, 'aria-label': 'Name', onchange: (e) => e.target.value.trim() && body.saveRoutine(r.id, { name: e.target.value.trim(), zeit: r.zeit }) }),
        h('button.pill.del', {
          'aria-label': 'Löschen',
          onclick: () => {
            if (!confirm(`Routine „${r.name}“ löschen?`)) return;
            body.deleteRoutine(r.id);
            refresh();
          },
        }, icon('trash', 18)),
      )),
      h('div.editrow.add',
        timeIn,
        nameIn,
        h('button.pill.add', {
          'aria-label': 'Hinzufügen',
          onclick: () => {
            if (!nameIn.value.trim()) return;
            body.saveRoutine(null, { name: nameIn.value.trim(), zeit: timeIn.value });
            refresh();
          },
        }, icon('plus', 20)),
      ),
      h('button.btn.primary.full', { onclick: () => { editRoutines = false; refresh(); } }, 'Fertig'),
    );
  }

  const openRows = open.map((x) => {
    const { r, key } = x;
    const late = day === iso() && r.zeit && r.zeit < nowTime();
    const row = h(`div.ri${next === x ? '.next' : ''}${late ? '.late' : ''}${enterCls(key)}`, stIcon(null), h('span.ri-name', r.name), h('span.ri-time', r.zeit || ''));
    return swipeLeft(row, {
      label: 'Auslassen',
      onTap: () => move(row, key, () => body.setRoutineState(day, r.id, 'done'), refresh),
      onSwipe: () => move(row, key, () => body.setRoutineState(day, r.id, 'skip'), refresh),
    });
  });
  const doneRows = resolved.map(({ r, key, st }) => {
    const line = doneLine(key, st, r.zeit, r.name, st === 'skip' && h('span.badge-skip', 'ausgelassen'));
    return swipeLeft(line, {
      label: st === 'done' ? 'Auslassen' : 'Offen',
      onTap: () => move(line, key, () => body.setRoutineState(day, r.id, null), refresh, false),
      onSwipe: () => (st === 'done' ? (body.setRoutineState(day, r.id, 'skip'), refresh()) : move(line, key, () => body.setRoutineState(day, r.id, null), refresh, false)),
    });
  });

  return kbox('routinen', 'list', 'Routinen', { info, pct: list.length ? ((list.length - open.length) / list.length) * 100 : null, autoOpen: open.length > 0 },
    open.length > 0 && h('div.klist', openRows),
    doneGroup('routinen', doneRows),
  );
}

// ---------- Gewicht (kompakt) ----------

function weightBox(refresh) {
  const w = body.weight(day);
  const monday = weekStart(fromIso(day));
  const thisWeek = body.weekAvg(monday);
  const lastWeek = body.weekAvg(addDays(monday, -7));
  const diff = thisWeek && lastWeek ? thisWeek - lastWeek : null;
  const info = `${w ? `${kg(w)} kg` : '–'}${thisWeek ? ` · Ø ${kg(thisWeek)}` : ''}`;
  const input = h('input.input.weight', {
    inputmode: 'decimal',
    'aria-label': 'Gewicht in kg',
    value: w ? kg(w) : '',
    onchange: (e) => {
      const v = parseNum(e.target.value);
      if (e.target.value && (v < 30 || v > 250)) return toast('Gewicht prüfen', 'error');
      body.setWeight(day, v ? Math.round(v * 10) / 10 : null);
      toast(v ? 'Gewicht gespeichert' : 'Gewicht entfernt');
      refresh();
    },
  });

  return kbox('gewicht', 'scale', 'Morgengewicht', { info, autoOpen: !w },
    h('div.weightrow',
      h('div.weightin', input, h('span.muted', 'kg')),
      h('div.stat',
        h('span.small.muted', `Ø KW ${isoWeek(monday)}`),
        h('b', thisWeek ? `${kg(thisWeek)} kg` : '–'),
        diff != null && h(`span.small.delta${diff >= 0 ? '.up' : '.down'}`, `${diff >= 0 ? '+' : '–'}${kg(Math.abs(diff))} kg`),
      ),
    ),
  );
}

// ---------- Reiter Woche ----------

function weekTab(refresh) {
  const monday = addDays(weekStart(), 7 * weekOffset);
  const today = iso();
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(monday, i)));

  const nav = h('div.wnav',
    h('button.navbtn.soft', { onclick: () => { weekOffset--; refresh(); }, 'aria-label': 'Vorherige Woche' }, icon('back', 18)),
    h('div.wnav-label', h('b', `KW ${isoWeek(monday)}`), h('span', `${fmtShort(monday)}–${fmtShort(addDays(monday, 6))}`)),
    h('button.navbtn.soft.flip', { onclick: () => { weekOffset++; refresh(); }, 'aria-label': 'Nächste Woche' }, icon('back', 18)),
  );

  const dayRows = days.map((d) => {
    const ms = body.meals(d);
    const ex = body.extras(d);
    const tl = body.training(d);
    const { planned } = body.totals(d);
    const mu = body.mainUnit(tl);
    const tTitle = mu ? body.unitName(mu) : tl.length ? 'Ruhetag' : '';
    const has = ms.length || ex.length || tl.length;
    const head = h('button.wd-head',
      h('span.wd-day', `${WD_SHORT[fromIso(d).getDay()]} ${fmtShort(fromIso(d))}`),
      h('span.wd-sum', has
        ? [ms.length || ex.length ? `${n(planned.kcal)} kcal · ${n(planned.protein)} P` : null, tTitle].filter(Boolean).join(' · ')
        : 'Kein Plan'),
      has ? h('span.kbox-chev', icon('back', 16)) : h('span'),
    );
    const content = h('div.kbox-body', h('div.kbox-inner.wd-inner',
      [...ms].sort(byTime).map((m) => h('div.wd-line', h('span.cl-time', m.zeit || '–'), h('span.cl-name', m.name), h('span.wd-k', `${n(m.kcal)} kcal`), catTag(body.category(m)))),
      ex.map((e) => h('div.wd-line', h('span.cl-time', e.zeit || '–'), h('span.cl-name', e.name), h('span.wd-k', `${n(e.kcal)} kcal`), catTag('spontan'))),
      tl.map((t) => h('div.wd-line.tr', h('span.cl-time', t.zeit || '–'), h('span.cl-name', h('b', body.isRest(t) ? 'Ruhetag' : body.unitName(t)), t.details && h('span.small.muted.block', t.details)))),
    ));
    const row = h(`div.kday${d === today ? '.today' : ''}${has ? '' : '.empty'}`, head, has ? content : null);
    if (has) {
      head.addEventListener('click', () => row.classList.toggle('open'));
    }
    return row;
  });

  // Meal Prep
  const rs = body.recipes(monday);
  const recipeCards = rs.map((r) => {
    const head = h('button.wd-head.rc-head',
      h('span.rc-name', h('b', r.name), h('span.small.muted.block', [r.prep_tag && `Prep ${r.prep_tag}`, r.portionen && `${r.portionen} Portionen`, r.haltbarkeit && `${r.haltbarkeit} Tage haltbar`].filter(Boolean).join(' · '))),
      h('span.kbox-chev', icon('back', 16)),
    );
    const row = h('div.kday.recipe', head, h('div.kbox-body', h('div.kbox-inner.wd-inner',
      r.zutaten.map((z) => h('div.wd-line', h('span.cl-name', z.name), h('span.wd-k', z.gramm ? `${n(z.gramm)} g` : ''))),
    )));
    head.addEventListener('click', () => row.classList.toggle('open'));
    return row;
  });

  // Spontan-Einträge
  const spont = days.flatMap((d) => body.extras(d).map((e) => ({ ...e, d })));
  const sum = spont.reduce((s, e) => ({ kcal: s.kcal + (e.kcal || 0), protein: s.protein + (e.protein || 0) }), { kcal: 0, protein: 0 });

  return [
    nav,
    h('section.card', secTitle('calendar', 'Tage'), h('div.kdays', dayRows)),
    h('section.card',
      secTitle('meal', 'Meal Prep'),
      rs.length ? h('div.kdays', recipeCards) : [h('p.muted', 'Keine Rezepte'), h('a.btn.soft.full', { href: '#/koerper/import' }, icon('upload', 18), 'Rezepte importieren')],
    ),
    h('section.card',
      secTitle('plus', 'Spontan', spont.length > 0 && h('span.count', spont.length)),
      spont.length
        ? [
          h('div.klist', spont.map((e) => h('div.wd-line',
            h('span.cl-time', WD_SHORT[fromIso(e.d).getDay()]),
            h('span.cl-name', e.name, warnIcon(e)),
            h('span.wd-k', `${n(e.kcal || 0)} kcal · ${n(e.protein || 0)} P`),
          ))),
          h('div.wd-total', h('span', 'Summe'), h('b', `${n(sum.kcal)} kcal · ${n(sum.protein)} g Protein`)),
        ]
        : h('p.muted', 'Keine Einträge'),
    ),
  ];
}

// ---------- Reiter Rückblick ----------

function reviewTab(refresh) {
  const seg = (w) => h(`button.seg${rangeWeeks === w ? '.on' : ''}`, { onclick: () => { rangeWeeks = w; refresh(); } }, `${w} Wochen`);
  return [
    h('section.card',
      secTitle('scale', 'Gewicht'),
      h('div.segs', seg(4), seg(8), seg(26)),
      lineChart(body.weights(), { weeks: rangeWeeks, dataWeeksOnly: true }),
    ),
    measuresCard(refresh),
    photosCard(),
    consistencyCard(),
  ];
}

function measuresCard(refresh) {
  const list = body.measures();
  const today = iso();
  const cur = list.find((m) => m.date === today) || {};
  const date = h('input.input', { type: 'date', value: today, max: today });
  const fields = body.MEASURES.map((m) => ({ m, el: h('input.input', { inputmode: 'decimal', value: cur[m.id] ? kg(cur[m.id]) : '' }) }));
  date.addEventListener('change', () => {
    const e = list.find((x) => x.date === date.value) || {};
    for (const { m, el } of fields) el.value = e[m.id] ? kg(e[m.id]) : '';
  });
  const fmtCm = (v) => (v ? kg(v) : '–');

  return h('section.card',
    secTitle('chart', 'Umfänge'),
    h('label.field', h('span', 'Datum'), date),
    h('div.grid3', fields.map(({ m, el }) => h('label.field', h('span', `${m.name} (cm)`), el))),
    h('button.btn.primary.full', {
      onclick: () => {
        const data = {};
        for (const { m, el } of fields) data[m.id] = Math.round(parseNum(el.value) * 10) / 10;
        body.setMeasure(date.value || today, data);
        toast('Umfänge gespeichert');
        refresh();
      },
    }, 'Speichern'),
    list.length > 0 && h('div.mtable',
      h('div.mrow.mhead', h('span', 'Datum'), body.MEASURES.map((m) => h('span', m.name))),
      [...list].reverse().slice(0, 8).map((e) => swipeLeft(h('div.mrow', h('span', fmtShort(fromIso(e.date))), body.MEASURES.map((m) => h('span', fmtCm(e[m.id])))), {
        label: 'Löschen',
        onSwipe: () => {
          const { date: d, ...data } = e;
          body.setMeasure(d, {});
          refresh();
          toast('Eintrag gelöscht', '', { label: 'Rückgängig', fn: () => { body.setMeasure(d, data); refresh(); } });
        },
      })),
      list.length > 1 && h('div.mrow.mdiff', h('span', 'Δ'), body.MEASURES.map((m) => {
        const a = list.find((x) => x[m.id])?.[m.id];
        const b = [...list].reverse().find((x) => x[m.id])?.[m.id];
        const dlt = a && b ? b - a : null;
        return h('span', dlt == null ? '–' : `${dlt > 0 ? '+' : dlt < 0 ? '–' : '±'}${kg(Math.abs(dlt))}`);
      })),
    ),
  );
}

function photosCard() {
  const grid = h('div.pgrid');
  const date = h('input.input', { type: 'date', value: iso(), max: iso() });
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const urls = [];
  const paint = async () => {
    const list = await photos.listPhotos();
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    grid.replaceChildren(...(list.length ? list.map((p) => {
      const url = URL.createObjectURL(p.blob);
      urls.push(url);
      return h('button.pthumb', { onclick: () => openPhoto(p, url, paint) }, h('img', { src: url, alt: `Foto ${fmtShort(fromIso(p.date))}` }), h('span', fmtShort(fromIso(p.date))));
    }) : [h('p.muted', 'Keine Fotos')]));
  };
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      await photos.addPhoto(f, date.value || iso());
      toast('Foto gespeichert');
    } catch {
      toast('Foto konnte nicht gespeichert werden', 'error');
    }
    file.value = '';
    paint();
  });
  paint();
  return h('section.card',
    secTitle('lock', 'Fotos'),
    h('div.prow2', h('label.field', h('span', 'Datum'), date), h('button.btn.soft', { onclick: () => file.click() }, icon('plus', 18), 'Foto')),
    file,
    grid,
  );
}

function openPhoto(p, url, repaint) {
  const sh = sheet(fmtLong(fromIso(p.date)),
    h('img.pfull', { src: url, alt: '' }),
    h('div.sheet-btns',
      h('button.btn.ghost', {
        onclick: async () => {
          if (!confirm('Foto löschen?')) return;
          await photos.deletePhoto(p.id);
          sh.close();
          repaint();
        },
      }, 'Löschen'),
      h('button.btn.primary', { onclick: () => sh.close() }, 'Schließen'),
    ),
  );
}

function consistencyCard() {
  const cur = weekStart();
  const rows = [];
  for (let k = 0; k < 12 && rows.length < 8; k++) {
    const m = addDays(cur, -7 * k);
    const c = body.consistency(m);
    if (c.hasData) rows.push({ m, c });
  }
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '–');
  return h('section.card',
    secTitle('check', 'Konsistenz'),
    rows.length
      ? h('div.ctable',
        h('div.crow.chead', h('span', 'KW'), h('span', 'Mahlzeiten'), h('span', 'Training'), h('span', 'Wasser')),
        rows.map(({ m, c }) => h(`div.crow${m.getTime() === cur.getTime() ? '.now' : ''}`,
          h('span', isoWeek(m)),
          h('span', h('b', pct(c.mDone, c.mTotal))),
          h('span', c.tTotal ? `${c.tDone}/${c.tTotal}` : '–'),
          h('span', `${c.wDays}/${c.days}`),
        )),
      )
      : h('p.muted', 'Keine Daten'),
  );
}

// ---------- Kalender-Export ----------

async function calendarExport() {
  // Sonntags meint man meist schon die kommende Woche.
  const base = fromIso(day);
  const monday = base.getDay() === 0 && dayIsToday ? addDays(weekStart(base), 7) : weekStart(base);
  const { text, count } = body.weekIcs(monday);
  if (!count) return toast('Keine Mahlzeiten mit Uhrzeit', 'error');
  if (!confirm(`${count} Erinnerungen für ${fmtShort(monday)}–${fmtShort(addDays(monday, 6))} als Kalender-Datei erstellen?`)) return;
  await saveFile(new Blob([text], { type: 'text/calendar' }), `essen-kw${isoWeek(monday)}.ics`, 'text/calendar');
}

// ---------- Import ----------

function importView() {
  const area = h('textarea.input.paste', { rows: 6, 'aria-label': 'Plan' });
  const msg = h('p.error');
  const preview = h('div');

  function check() {
    msg.textContent = '';
    preview.replaceChildren();
    pendingPlan = null;
    if (/"typ"\s*:\s*"lernplan"/i.test(area.value)) {
      msg.textContent = 'Lernpläne unter Leistung importieren.';
      return;
    }
    try {
      pendingPlan = body.parsePlan(area.value);
    } catch (e) {
      msg.textContent = e.message;
      return;
    }
    preview.replaceChildren(planPreview(pendingPlan));
  }

  return h('div.view.a-koerper',
    back(),
    h('header.hero', h('h1', 'Wochenplan importieren')),
    h('section.card',
      h('label.field', h('span', 'Plan'), area),
      msg,
      h('div.buttons',
        h('button.btn.ghost', {
          onclick: async () => {
            try {
              area.value = await navigator.clipboard.readText();
              check();
            } catch {
              toast('Einfügen nicht möglich', 'error');
            }
          },
        }, 'Aus Zwischenablage'),
        h('button.btn.primary', { onclick: check }, 'Prüfen'),
      ),
    ),
    preview,
    h('section.card',
      h('p.label', 'Vorlagen'),
      h('div.buttons',
        h('button.btn.ghost', { onclick: () => copy(body.TEMPLATE_MEALS) }, 'Essensplan'),
        h('button.btn.ghost', { onclick: () => copy(body.TEMPLATE_TRAINING) }, 'Trainingsplan'),
        h('button.btn.ghost', { onclick: () => copy(body.TEMPLATE_RECIPES) }, 'Rezepte'),
      ),
    ),
  );
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Kopiert');
  } catch {
    toast('Kopieren hat nicht geklappt', 'error');
  }
}

function planPreview(plan) {
  const end = addDays(plan.monday, 6);
  const range = `KW ${isoWeek(plan.monday)} · ${fmtShort(plan.monday)}–${fmtShort(end)}`;
  const done = (label, target) => {
    body.applyPlan(plan);
    pendingPlan = null;
    toast(`${label} übernommen`);
    day = iso();
    dayIsToday = true;
    location.hash = target;
  };

  if (plan.typ === 'rezepte') {
    const replaces = body.recipes(plan.monday).length > 0;
    return h('section.card',
      h('p.label', `Rezepte · ${range}`),
      h('div.preview', plan.rezepte.map((r) => h('div.prow', h('b', r.prep_tag || '–'), h('span.muted', `${r.name} · ${r.portionen || '?'} Portionen · ${r.zutaten.length} Zutaten`)))),
      replaces && h('p.small.muted', 'Ersetzt die Rezepte dieser Woche.'),
      h('button.btn.primary.full', { onclick: () => { weekOffset = Math.round((plan.monday - weekStart()) / (7 * 86400000)); done('Rezepte', '#/koerper/woche'); } }, 'Übernehmen'),
    );
  }

  const isMeals = plan.typ === 'essen';
  const existing = plan.days.some((items, i) => {
    if (items === undefined) return false;
    const d = iso(addDays(plan.monday, i));
    return isMeals ? body.meals(d).length : body.training(d).length;
  });
  return h('section.card',
    h('p.label', `${isMeals ? 'Essensplan' : 'Trainingsplan'} · ${range}`),
    h('div.preview',
      plan.days.map((items, i) => {
        const d = addDays(plan.monday, i);
        let text;
        if (items === undefined) text = '–';
        else if (isMeals) {
          const k = items.reduce((s, m) => s + m.kcal, 0);
          const p = items.reduce((s, m) => s + m.protein, 0);
          text = `${items.length} Mahlzeiten · ${n(k)} kcal · ${n(p)} g Protein`;
        } else text = items.map((t) => body.unitName(t) + (t.details ? ` (${t.details})` : '')).join(', ') || '–';
        return h('div.prow', h('b', `${WD_SHORT[d.getDay()]} ${fmtShort(d)}`), h('span.muted', text));
      }),
    ),
    existing && h('p.small.muted', 'Ersetzt vorhandene Tage.'),
    h('button.btn.primary.full', { onclick: () => done(isMeals ? 'Essensplan' : 'Trainingsplan', '#/koerper/heute') }, 'Übernehmen'),
  );
}

// ---------- Ziele ----------

function goalsView() {
  const t = body.targets();
  const ws = body.waterSettings();
  let glass = ws.glass;
  const inputs = body.MACROS.map((m) => ({ m, el: h('input.input', { inputmode: 'numeric', value: t[m.id] }) }));
  const waterGoal = h('input.input', { inputmode: 'decimal', value: liter(ws.goal) });
  const glassBox = h('div.segs');
  const paintGlass = () => glassBox.replaceChildren(...body.GLASS_SIZES.map((g) => h(`button.seg${glass === g ? '.on' : ''}`, { onclick: () => { glass = g; paintGlass(); } }, `${liter(g)} L`)));
  paintGlass();
  return h('div.view.a-koerper',
    back(),
    h('header.hero', h('h1', 'Ziele')),
    h('section.card',
      secTitle('meal', 'Ernährung'),
      h('div.grid2', inputs.map(({ m, el }) => h('label.field', h('span', `${m.name} (${m.unit})`), el))),
    ),
    h('section.card',
      secTitle('drop', 'Wasser'),
      h('label.field', h('span', 'Tagesziel (Liter)'), waterGoal),
      h('div.field', h('span', 'Glasgröße'), glassBox),
    ),
    h('button.btn.primary.full', {
      onclick: () => {
        const next = {};
        for (const { m, el } of inputs) next[m.id] = Math.round(parseNum(el.value)) || body.DEFAULT_TARGETS[m.id];
        body.setTargets(next);
        const g = parseNum(waterGoal.value);
        body.setWaterSettings({ goal: g > 0 && g <= 10 ? Math.round(g * 100) / 100 : body.WATER_DEFAULTS.goal, glass });
        toast('Ziele gespeichert');
        location.hash = '#/koerper';
      },
    }, 'Speichern'),
  );
}
