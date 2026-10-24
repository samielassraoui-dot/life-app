// Bereich Körper: Tagesansicht, Wochenplan-Import, Ziele.
import * as body from '../body.js';
import * as ln from '../learn.js';
import { lineChart, weekChart } from '../chart.js';
import { h, icon, toast, iso, fromIso, addDays, weekStart, fmtLong, fmtShort, WD_SHORT, saveFile, isoWeek, sheet, swipeLeft } from '../ui.js';

let day = iso();
let dayIsToday = true;     // springt bei neuem Tag automatisch mit
let editRoutines = false;
let editTraining = false;
let showExtra = false;
let showTraining = false;
let chartMode = 'woche';
let pendingPlan = null;
let entering = null;       // zuletzt verschobener Eintrag – bekommt eine Einblend-Animation

const n = (v) => Math.round(v).toLocaleString('de-DE');
const kg = (v) => v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const liter = (v) => v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const parseNum = (s) => Number(String(s).replace(',', '.').trim()) || 0;
const nowTime = () => new Date().toTimeString().slice(0, 5);
const byTime = (a, b) => (a.zeit || '99').localeCompare(b.zeit || '99');

export function render(sub, refresh) {
  if (sub === 'import') return importView(refresh);
  if (sub === 'ziele') return goalsView(refresh);
  if (dayIsToday) day = iso();
  return dayView(refresh);
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
    for (const k of keys.slice(0, Math.max(0, keys.length - 80))) delete m[k];
    localStorage.setItem(OPEN_KEY, JSON.stringify(m));
  } catch { /* egal */ }
}

const isOpen = (id, auto) => openMap()[`${id}:${day}`] ?? auto;

// Auf-/Zuklappen ohne Neuzeichnen (Animation 200 ms über CSS)
function collapsible(id, auto, head, body, cls = '') {
  const open = isOpen(id, auto);
  const sec = h(`${cls}${open ? '.open' : ''}`, head, body);
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

// title darf Text oder ein Element sein; after = immer sichtbar unter der Kopfzeile
function kbox(id, ic, title, { info, pct, autoOpen, after }, ...content) {
  const head = h('button.kbox-head',
    h('span.sec-icon', icon(ic, 18)),
    h('span.kbox-title', typeof title === 'string' ? h('h2', title) : title, info && h('span.kbox-info', info)),
    h('span.kbox-chev', icon('back', 18)),
  );
  return collapsible(id, autoOpen, head, [
    pct != null && h('div.kbox-bar', h('i', { style: { width: `${Math.min(100, pct)}%` } })),
    after || null,
    h('div.kbox-body', h('div.kbox-inner', content)),
  ], 'section.card.kbox');
}

// Gruppe „Erledigt (n)“ innerhalb einer Box, standardmäßig zugeklappt
function doneGroup(id, rows) {
  if (!rows.length) return null;
  const head = h('button.dg-head', h('span', `Erledigt (${rows.length})`), h('span.kbox-chev', icon('back', 16)));
  return collapsible(`${id}-done`, false, head, h('div.kbox-body', h('div.kbox-inner.dg-inner', h('div.klist', rows))), 'div.dgroup');
}

// Status-Symbol links: offen (Kreis), erledigt (Haken), ausgelassen (Strich)
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

// ---------- Tagesansicht ----------

function dayView(refresh) {
  const view = h('div.view.a-koerper.kp-view',
    hero(refresh),
    waterBox(refresh),
    mealsBox(refresh),
    routinesBox(refresh),
    trainingBox(refresh),
    weightBox(refresh),
  );
  entering = null;
  return view;
}

function ring(eaten, goal) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = goal ? Math.min(1, eaten / goal) : 0;
  const left = goal - eaten;
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 128 128');
  s.setAttribute('class', 'ring');
  s.innerHTML = `<circle cx="64" cy="64" r="${r}" class="ring-track"/>`
    + `<circle cx="64" cy="64" r="${r}" class="ring-val" stroke-dasharray="${c * pct} ${c}" transform="rotate(-90 64 64)"/>`;
  return h('div.ring-wrap', s, h('div.ring-text',
    h('b', left >= 0 ? n(left) : `+${n(-left)}`),
    h('span.ring-unit', left >= 0 ? 'kcal übrig' : 'kcal drüber'),
    h('span.ring-sub', `${n(eaten)} von ${n(goal)}`),
  ));
}

function openMenu(refresh) {
  const item = (ic, title, sub, fn) => h('button.menu-item', { onclick: fn },
    h('span.sec-icon', icon(ic, 18)), h('span', h('b', title), h('span.small.muted.block', sub)), h('span.chev-r', icon('back', 16)));
  const sh = sheet('Körper',
    h('div.menu',
      item('upload', 'Wochenplan importieren', 'Essens- oder Trainingsplan aus Claude einfügen', () => { sh.close(); location.hash = '#/koerper/import'; }),
      item('bell', 'Erinnerungen in Kalender', 'Mahlzeiten der Woche als Kalenderdatei', () => { sh.close(); calendarExport(); }),
      item('settings', 'Ziele anpassen', 'Kalorien, Makros und Wasser', () => { sh.close(); location.hash = '#/koerper/ziele'; }),
      item('list', 'Routinen bearbeiten', 'Hinzufügen, löschen, Uhrzeiten', () => { sh.close(); editRoutines = true; rememberOpen('routinen', true); refresh(); }),
    ),
  );
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
  const planKcal = body.meals(day).reduce((s, m) => s + (m.kcal || 0), 0);
  const extraKcal = body.extras(day).reduce((s, e) => s + (e.kcal || 0), 0);
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
      h('button.navbtn.gear', { onclick: () => openMenu(refresh), 'aria-label': 'Einstellungen Körper' }, icon('gear', 21)),
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
    (planKcal > 0 || extraKcal > 0) && h('p.kp-plan', h('span', `Plan ${n(planKcal)} kcal`), h('span.plus', '+'), h('span', `Spontan ${n(extraKcal)} kcal`)),
  );
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

function waterBox(refresh) {
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
    info.replaceChildren(`${liter(ml / 1000)} / ${liter(ws.goal)} L`, reached ? h('span.wreached', icon('check', 14), 'Ziel erreicht') : '');
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
    h('div.kbox-body', h('div.kbox-inner',
      grid,
      h('p.small.muted', `Ein Glas = ${liter(ws.glass)} L · Antippen füllt das nächste Glas, das letzte volle Glas antippen leert es wieder.`),
    )),
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

function mealsBox(refresh) {
  const today = iso();
  const planned = body.meals(day).map((m, i) => ({ kind: 'plan', key: `m${i}`, i, m, zeit: m.zeit || '', st: body.mealStatus(day, i) }));
  const extras = body.extras(day).map((e) => ({ kind: 'extra', key: e.key, e, zeit: e.zeit || '' }));
  const done = planned.filter((x) => x.st === 'ja').length;
  const open = planned.filter((x) => !x.st).sort(byTime);
  const resolved = [...planned.filter((x) => x.st), ...extras].sort(byTime);
  const next = day === today ? open[0] : null;
  const info = !planned.length
    ? (extras.length ? `${extras.length} spontan` : 'noch kein Plan')
    : `${done}/${planned.length}${open.length ? ` · nächste: ${open[0].m.name} ${open[0].zeit}` : ' · alles erledigt'}`;

  const openRows = open.map((x) => {
    const { m, i, key } = x;
    const cat = body.category(m);
    const card = h(`div.mi.cat-${cat}${next === x ? '.next' : ''}${enterCls(key)}`,
      stIcon(null),
      h('div.mi-main',
        h('div.mi-top', catTag(cat), h('span.mi-name', m.name), h('span.mi-time', m.zeit || '')),
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
      const line = doneLine(x.key, 'done', e.zeit, e.name, [h('span.cl-kcal', `${n(e.kcal)} kcal`), catTag('spontan')]);
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
    const line = doneLine(key, st === 'ja' ? 'done' : 'skip', m.zeit, m.name, [st === 'nein' && h('span.badge-skip', 'ausgelassen'), catTag(cat)]);
    return swipeLeft(line, {
      label: st === 'ja' ? 'Auslassen' : 'Offen',
      onTap: () => move(line, key, () => body.setMealStatus(day, i, null), refresh, false),
      onSwipe: () => (st === 'ja' ? (body.setMealStatus(day, i, 'nein'), refresh()) : move(line, key, () => body.setMealStatus(day, i, null), refresh, false)),
    });
  });

  return kbox('mahlzeiten', 'meal', 'Mahlzeiten', { info, pct: planned.length ? (done / planned.length) * 100 : null, autoOpen: open.length > 0 || !planned.length },
    !planned.length && h('p.muted', 'Für diesen Tag ist noch kein Essensplan da. Importiere ihn über das Zahnrad oben rechts.'),
    open.length > 0 && h('p.small.muted.khint', 'Antippen = gegessen · nach links wischen = auslassen'),
    h('div.klist', openRows),
    doneGroup('mahlzeiten', doneRows),
    showExtra ? extraForm(refresh) : h('button.btn.soft.full', { onclick: () => { showExtra = true; refresh(); } }, icon('plus', 18), 'Spontan gegessen'),
  );
}

function extraForm(refresh) {
  const name = h('input.input', { placeholder: 'Was hast du gegessen? z. B. Döner um 13 Uhr' });
  const zeit = h('input.input', { type: 'time', value: day === iso() ? nowTime() : '' });
  let zeitTouched = false;
  zeit.addEventListener('input', () => { zeitTouched = true; });
  // Uhrzeit im Text erkennen und übernehmen
  name.addEventListener('input', () => {
    const d = detectTime(name.value);
    if (d && !zeitTouched) zeit.value = d.time;
  });
  const fields = body.MACROS.map((m) => ({ m, el: h('input.input', { inputmode: 'numeric', placeholder: m.unit }) }));
  return h('div.form',
    h('p.small.muted', 'Schätzen reicht völlig. Die Uhrzeit wird automatisch gesetzt – oder aus dem Text erkannt.'),
    name,
    h('div.grid4', fields.map(({ m, el }) => h('label.field', h('span', m.short || m.name), el))),
    h('label.field', h('span', 'Uhrzeit'), zeit),
    h('div.buttons',
      h('button.btn.primary', {
        onclick: () => {
          const d = detectTime(name.value);
          const text = (d ? d.rest : name.value).trim();
          if (!text) return toast('Bitte kurz eintragen, was es war.');
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

// ---------- Routinen ----------

function routinesBox(refresh) {
  const list = body.routines();
  const states = list.map((r) => ({ r, key: `r-${r.id}`, zeit: r.zeit || '', st: body.routineState(day, r.id) }));
  const done = states.filter((x) => x.st === 'done').length;
  const open = states.filter((x) => !x.st).sort(byTime);
  const resolved = states.filter((x) => x.st).sort(byTime);
  const next = day === iso() ? open[0] : null;
  const info = !list.length ? 'keine Routinen' : `${done}/${list.length}${open.length ? ` · nächste: ${open[0].r.name} ${open[0].zeit}` : ' · alles erledigt'}`;

  if (editRoutines) {
    const nameIn = h('input.input', { placeholder: 'Neue Routine, z. B. Omega 3' });
    const timeIn = h('input.input.time', { type: 'time', value: '08:00' });
    return kbox('routinen', 'list', 'Routinen', { info: 'bearbeiten', autoOpen: true },
      list.map((r) => h('div.editrow',
        h('input.input.time', { type: 'time', value: r.zeit || '', onchange: (e) => body.saveRoutine(r.id, { name: r.name, zeit: e.target.value }) }),
        h('input.input', { value: r.name, onchange: (e) => e.target.value.trim() && body.saveRoutine(r.id, { name: e.target.value.trim(), zeit: r.zeit }) }),
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

  return kbox('routinen', 'list', 'Routinen', { info, pct: list.length ? (done / list.length) * 100 : null, autoOpen: open.length > 0 },
    !list.length && h('p.muted', 'Noch keine Routinen.'),
    h('div.klist', openRows),
    doneGroup('routinen', doneRows),
    h('button.link', { onclick: () => { editRoutines = true; refresh(); } }, 'Routinen bearbeiten'),
  );
}

// ---------- Training ----------

// Kopfzeile: heutiger Split – sind alle Einheiten erledigt, der nächste Tag laut Plan.
function trainingHeadline(units) {
  const active = units.filter((u) => !u.rest);
  const allResolved = active.length > 0 && active.every((u) => u.st);
  const restToday = units.length > 0 && !active.length;
  const nextDay = iso(addDays(fromIso(day), 1));
  const after = () => {
    for (let k = 2; k <= 7; k++) {
      const d = iso(addDays(fromIso(day), k));
      const mu = body.mainUnit(body.training(d));
      if (mu) return `${WD_SHORT[fromIso(d).getDay()]}, ${body.unitName(mu)}`;
    }
    return null;
  };
  const tomorrowText = () => {
    const tl = body.training(nextDay);
    if (!tl.length) return { label: 'Morgen: noch kein Plan', missing: true };
    const mu = body.mainUnit(tl);
    if (mu) return { label: `Morgen: ${body.unitName(mu)}`, details: mu.details };
    const nx = after();
    return { label: 'Morgen: Ruhetag', sub: nx ? `Nächstes Training: ${nx}` : null };
  };

  if (allResolved || !units.length) {
    const t = tomorrowText();
    return { ...t, tomorrow: true };
  }
  if (restToday) {
    const t = tomorrowText();
    return { label: 'Heute: Ruhetag', sub: t.missing ? null : t.label, missing: t.missing };
  }
  const mu = body.mainUnit(units.map((u) => u.t));
  return { label: `Heute: ${body.unitName(mu)}`, details: mu.details };
}

function trainingBox(refresh) {
  const list = body.training(day);
  const units = list.map((t, i) => ({ t, i, key: `t${i}`, zeit: t.zeit || '', rest: body.isRest(t), st: body.trainingState(day, i) }));
  const active = units.filter((u) => !u.rest);
  const done = active.filter((u) => u.st === 'done').length;
  const open = active.filter((u) => !u.st).sort(byTime);
  const resolved = active.filter((u) => u.st).sort(byTime);
  const hl = trainingHeadline(units);
  const info = [hl.details || hl.sub, active.length > 1 && `${done}/${active.length} erledigt`].filter(Boolean).join(' · ');

  const delBtn = (u) => editTraining && h('button.pill.del.small', {
    'aria-label': 'Entfernen',
    onclick: () => {
      if (!confirm(`${body.unitName(u.t)} entfernen?`)) return;
      body.removeTraining(day, u.i);
      refresh();
    },
  }, icon('close', 16));

  const rest = units.filter((u) => u.rest).map((u) => h('div.rest', h('div', h('b', 'Ruhetag'), h('span.small.muted.block', u.t.details || 'Erholung gehört zum Muskelaufbau dazu.')), delBtn(u)));

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
    const line = doneLine(key, st, t.zeit, `${body.unitName(t)}${t.details ? ` · ${t.details}` : ''}`, st === 'skip' && h('span.badge-skip', 'ausgelassen'));
    return swipeLeft(line, {
      label: st === 'done' ? 'Auslassen' : 'Offen',
      onTap: () => move(line, key, () => body.setTrainingState(day, i, null), refresh, false),
      onSwipe: () => (st === 'done' ? (body.setTrainingState(day, i, 'skip'), refresh()) : move(line, key, () => body.setTrainingState(day, i, null), refresh, false)),
    });
  });

  let adder;
  if (showTraining) {
    const custom = h('input.input', { placeholder: 'Andere Art, z. B. Schwimmen' });
    const details = h('input.input', { placeholder: 'Details (optional), z. B. 30 Min' });
    const add = (art) => {
      body.addTraining(day, { art: body.normArt(art), details: details.value.trim(), spontan: true });
      showTraining = false;
      toast(`${body.trainingName(art)} hinzugefügt`);
      refresh();
    };
    adder = h('div.form',
      h('p.small.muted', 'Antippen fügt das Training direkt hinzu.'),
      details,
      h('div.chips', body.trainingChoices().map((c) => h('button.chip', { onclick: () => add(c.id) }, c.name))),
      h('div.editrow.add2',
        custom,
        h('button.pill.add', { 'aria-label': 'Hinzufügen', onclick: () => custom.value.trim() && add(custom.value.trim()) }, icon('plus', 20)),
      ),
      h('button.btn.ghost', { onclick: () => { showTraining = false; refresh(); } }, 'Abbrechen'),
    );
  } else {
    adder = h('button.btn.soft.full', { onclick: () => { showTraining = true; refresh(); } }, icon('plus', 18), 'Training hinzufügen');
  }

  return kbox('training', 'koerper', h(`h2.tr-head${hl.tomorrow ? '.tomorrow' : ''}`, hl.label), {
    info,
    pct: active.length ? (done / active.length) * 100 : null,
    autoOpen: open.length > 0,
    after: hl.missing && h('a.import-hint', { href: '#/koerper/import' }, icon('upload', 16), 'Neuen Wochenplan importieren'),
  },
  !units.length && h('p.muted', 'Für diesen Tag ist nichts geplant.'),
  rest,
  h('div.klist', openRows),
  doneGroup('training', doneRows),
  adder,
  units.length > 0 && h('button.link', { onclick: () => { editTraining = !editTraining; refresh(); } }, editTraining ? 'Fertig' : 'Bearbeiten'),
  );
}

// ---------- Gewicht ----------

function weightBox(refresh) {
  const w = body.weight(day);
  const monday = weekStart(fromIso(day));
  const thisWeek = body.weekAvg(monday);
  const lastWeek = body.weekAvg(addDays(monday, -7));
  const diff = thisWeek && lastWeek ? thisWeek - lastWeek : null;
  const logged = Array.from({ length: 7 }, (_, i) => body.weight(iso(addDays(monday, i)))).filter(Boolean).length;
  const info = `${w ? `${kg(w)} kg` : 'noch nicht eingetragen'}${thisWeek ? ` · Ø ${kg(thisWeek)}` : ''}`;
  const input = h('input.input.weight', {
    inputmode: 'decimal',
    placeholder: '70,0',
    value: w ? kg(w) : '',
    onchange: (e) => {
      const v = parseNum(e.target.value);
      if (e.target.value && (v < 30 || v > 250)) return toast('Das Gewicht sieht ungewöhnlich aus – bitte prüfen.', 'error');
      body.setWeight(day, v ? Math.round(v * 10) / 10 : null);
      toast(v ? 'Gewicht gespeichert' : 'Gewicht entfernt');
      refresh();
    },
  });
  const seg = (id, label) => h(`button.seg${chartMode === id ? '.on' : ''}`, { onclick: () => { chartMode = id; refresh(); } }, label);

  return kbox('gewicht', 'scale', 'Morgengewicht', { info, pct: (logged / 7) * 100, autoOpen: !w },
    h('div.weightrow',
      h('div.weightin', input, h('span.muted', 'kg')),
      h('div.stat',
        h('span.small.muted', `Schnitt KW ${isoWeek(monday)}`),
        h('b', thisWeek ? `${kg(thisWeek)} kg` : '–'),
        diff != null && h(`span.small.delta${diff >= 0 ? '.up' : '.down'}`, `${diff >= 0 ? '▲ +' : '▼ –'}${kg(Math.abs(diff))} kg zur Vorwoche`),
      ),
    ),
    h('div.segs', seg('woche', `Woche ${fmtShort(monday)}–${fmtShort(addDays(monday, 6))}`), seg('verlauf', '8 Wochen')),
    chartMode === 'woche'
      ? weekChart(body.weights(), monday, { refValue: lastWeek })
      : lineChart(body.weights(), { weeks: 8 }),
  );
}

// ---------- Kalender-Export ----------

async function calendarExport() {
  // Sonntags meint man meist schon die kommende Woche.
  const base = fromIso(day);
  const monday = base.getDay() === 0 && dayIsToday ? addDays(weekStart(base), 7) : weekStart(base);
  const { text, count } = body.weekIcs(monday);
  if (!count) return toast('Für diese Woche gibt es noch keine Mahlzeiten mit Uhrzeit.', 'error');
  if (!confirm(`${count} Erinnerungen für die Woche ${fmtShort(monday)}–${fmtShort(addDays(monday, 6))} als Kalender-Datei erstellen?`)) return;
  await saveFile(new Blob([text], { type: 'text/calendar' }), `essen-kw${isoWeek(monday)}.ics`, 'text/calendar');
}

// ---------- Import ----------

function importView(refresh) {
  const area = h('textarea.input.paste', { placeholder: 'Plan aus dem Claude-Chat hier einfügen …', rows: 6 });
  const msg = h('p.error');
  const preview = h('div');

  function check() {
    msg.textContent = '';
    try {
      pendingPlan = ln.isLernplan(area.value) ? ln.parseLernplan(area.value) : body.parsePlan(area.value);
    } catch (e) {
      pendingPlan = null;
      msg.textContent = e.message;
      preview.replaceChildren();
      return;
    }
    preview.replaceChildren(pendingPlan.typ === 'lernplan' ? lernplanPreview(pendingPlan) : planPreview(pendingPlan));
  }

  return h('div.view.a-koerper',
    back(),
    h('header.hero', h('h1', 'Wochenplan importieren')),
    h('section.card',
      h('p.muted', 'Kopiere den Code-Block aus deinem Claude-Chat und füge ihn hier ein. Essens- und Trainingsplan einzeln nacheinander. (Lernpläne importierst du unter Leistung.)'),
      area,
      msg,
      h('div.buttons',
        h('button.btn.ghost', {
          onclick: async () => {
            try {
              area.value = await navigator.clipboard.readText();
              check();
            } catch {
              toast('Bitte lange ins Feld tippen und „Einsetzen“ wählen.');
            }
          },
        }, 'Aus Zwischenablage'),
        h('button.btn.primary', { onclick: check }, 'Prüfen'),
      ),
    ),
    preview,
    h('section.card',
      h('p.label', 'Vorlage für deinen Claude-Chat'),
      h('p.muted', 'Lege diesen Text in deinem Körper-Projekt als Anweisung ab. Dann kommt der Plan jeden Sonntag direkt im passenden Format.'),
      h('div.buttons',
        h('button.btn.ghost', { onclick: () => copy(body.TEMPLATE_MEALS) }, 'Vorlage Essensplan kopieren'),
        h('button.btn.ghost', { onclick: () => copy(body.TEMPLATE_TRAINING) }, 'Vorlage Trainingsplan kopieren'),
      ),
    ),
  );
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Kopiert – jetzt im Claude-Chat einfügen');
  } catch {
    toast('Kopieren hat nicht geklappt', 'error');
  }
}

function lernplanPreview(plan) {
  const end = addDays(plan.monday, 6);
  const replaces = Object.keys(plan.felder).some((f) => ln.goal(plan.monday, f));
  return h('section.card',
    h('p.label', `Lernplan · ${fmtShort(plan.monday)}–${fmtShort(end)}`),
    h('div.preview',
      ln.FIELDS.map((f) => {
        const g = plan.felder[f.id];
        return h('div.prow', h('b', f.short), h('span.muted', g ? `${g.ziel} · ${g.einheiten} Einheiten${g.schritte.length ? ` · ${g.schritte.length} Schritte` : ''}${plan.fokus === f.id ? ' · Fokus' : ''}` : 'nicht im Plan – bleibt wie es ist'));
      }),
      plan.termine.map((t) => h('div.prow', h('b', fmtShort(fromIso(t.datum))), h('span.muted', `${t.titel} (${ln.fieldName(t.feld)})`))),
    ),
    replaces && h('p.small.muted', 'Für einige Felder gibt es schon ein Ziel – es wird ersetzt.'),
    h('div.buttons',
      h('button.btn.primary', {
        onclick: () => {
          ln.applyLernplan(plan);
          pendingPlan = null;
          toast('Lernplan übernommen');
          location.hash = '#/leistung/woche';
        },
      }, 'Übernehmen'),
    ),
  );
}

function planPreview(plan) {
  const isMeals = plan.typ === 'essen';
  const end = addDays(plan.monday, 6);
  const existing = plan.days.some((items, i) => {
    if (items === undefined) return false;
    const d = iso(addDays(plan.monday, i));
    return isMeals ? body.meals(d).length : body.training(d).length;
  });
  return h('section.card',
    h('p.label', `${isMeals ? 'Essensplan' : 'Trainingsplan'} · ${fmtShort(plan.monday)}–${fmtShort(end)}`),
    h('div.preview',
      plan.days.map((items, i) => {
        const d = addDays(plan.monday, i);
        let text;
        if (items === undefined) text = 'nicht im Plan – bleibt wie es ist';
        else if (isMeals) {
          const k = items.reduce((s, m) => s + m.kcal, 0);
          const p = items.reduce((s, m) => s + m.protein, 0);
          text = `${items.length} Mahlzeiten · ${n(k)} kcal · ${n(p)} g Protein`;
        } else text = items.map((t) => body.trainingName(t.art) + (t.details ? ` (${t.details})` : '')).join(', ') || '–';
        return h('div.prow', h('b', `${WD_SHORT[d.getDay()]} ${fmtShort(d)}`), h('span.muted', text));
      }),
    ),
    existing && h('p.small.muted', 'Für einige Tage gibt es schon einen Plan – er wird ersetzt.'),
    h('div.buttons',
      h('button.btn.primary', {
        onclick: () => {
          body.applyPlan(plan);
          pendingPlan = null;
          toast(`${isMeals ? 'Essensplan' : 'Trainingsplan'} übernommen`);
          day = iso();
          dayIsToday = true;
          location.hash = '#/koerper';
        },
      }, 'Übernehmen'),
    ),
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
    h('header.hero', h('h1', 'Deine Tagesziele')),
    h('section.card',
      h('p.muted', 'Startwerte für Muskelaufbau bei rund 70 kg. Passe sie an, sobald du Werte aus deinem Körper-Projekt hast.'),
      h('div.grid2', inputs.map(({ m, el }) => h('label.field', h('span', `${m.name} (${m.unit})`), el))),
    ),
    h('section.card',
      secTitle('drop', 'Wasser'),
      h('label.field', h('span', 'Tagesziel (Liter)'), waterGoal),
      h('div.field', h('span', 'Glasgröße'), glassBox),
    ),
    h('div.buttons',
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
    ),
  );
}
