// Bereich Leistung – drei Reiter:
//   Diese Woche  Heute-Karte (was ist dran, Timer, Erledigt), Hinweise, Lernfelder
//   Termine      Abgaben & Prüfungen mit Countdown, Kalender-Export
//   Rückblick    Zielstatus der letzten Wochen, Lernjournal
// Dazu: Lernplan-Import und Wochen-Review.
// Ton: klar, fokussiert, motivierend.
import * as ln from '../learn.js';
import * as week from '../week.js';
import { h, icon, toast, iso, fromIso, addDays, weekStart, isoWeek, WD_SHORT, fmtShort, sheet, swipeLeft, saveFile } from '../ui.js';

const TABS = [
  { id: 'woche', name: 'Diese Woche' },
  { id: 'termine', name: 'Termine' },
  { id: 'rueckblick', name: 'Rückblick' },
];

let noteFor = null;        // gerade eingetragene Einheit → „Was habe ich gelernt?“
let noteWhere = 'hero';    // wo das Notizfeld erscheint: Heute-Karte oder Feldkarte
let heroField = null;      // per Pfeil gewähltes Feld (null = automatisch)
let journalField = 'alle';
let journalQuery = '';
let tick = null;
let pendingPlan = null;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const dayLabel = (d) => `${WD_SHORT[fromIso(d).getDay()]} ${fmtShort(fromIso(d))}`;

function ls(key, fallback = null) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch { /* egal */ }
}

export function render(sub, refresh) {
  // Abgelaufener Timer → Einheit automatisch eintragen
  const fin = ln.finishTimerIfDue();
  if (fin) {
    noteFor = fin.key;
    noteWhere = 'hero';
    setTimeout(() => toast(`${fin.min} Minuten ${ln.fieldName(fin.feld)} geschafft – Einheit eingetragen`), 50);
  }
  if (sub === 'review') return reviewView(refresh);
  if (sub === 'import') return importView();
  const tab = TABS.some((t) => t.id === sub) ? sub : ls('life4.leistungTab', 'woche');
  lsSet('life4.leistungTab', tab);
  const views = { woche: weekTab, termine: termineTab, rueckblick: reviewTab };
  return h('div.view.a-leistung.lview',
    h('div.segs.ctabs', TABS.map((t) => h(`a.seg${t.id === tab ? '.on' : ''}`, { href: `#/leistung/${t.id}` }, t.name))),
    views[tab](refresh),
  );
}

function secTitle(ic, text, right) {
  return h('div.sec-title', h('span.sec-icon', icon(ic, 18)), h('h2', text), right || null);
}

// ---------- Aufklappen (Zustand gemerkt) ----------

const OPEN_KEY = 'life4.leistungOpen';
function openMap() {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY)) || {};
  } catch {
    return {};
  }
}
function rememberOpen(id, val) {
  const m = openMap();
  m[id] = val;
  lsSet(OPEN_KEY, JSON.stringify(m));
}
function collapsible(id, auto, head, content, cls) {
  const open = openMap()[id] ?? auto;
  const sec = h(`${cls}${open ? '.open' : ''}`, head, content);
  head.setAttribute('aria-expanded', open);
  head.addEventListener('click', () => {
    const o = !sec.classList.contains('open');
    sec.classList.toggle('open', o);
    head.setAttribute('aria-expanded', o);
    rememberOpen(id, o);
  });
  return sec;
}

const fieldTag = (f) => h(`span.ftag.f-${f}`, ln.fieldShort(f));
const cdBadge = (datum) => h(`span.cd.u-${ln.urgency(datum)}`, ln.countdown(datum));
const fieldIcon = (f, size = 18) => h(`span.f-icon.f-${f}`, icon(ln.FIELD_ICON[f], size));

// Tippen = kurz, lange drücken = andere Aktion (z. B. Timer-Dauer wählen)
function pressable(btn, onTap, onLong) {
  let tm = null;
  let long = false;
  btn.addEventListener('pointerdown', () => {
    long = false;
    tm = setTimeout(() => {
      long = true;
      navigator.vibrate?.(10);
      onLong();
    }, 480);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => clearTimeout(tm));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!long) onTap();
  });
  return btn;
}

// ---------- Ziel festlegen / bearbeiten ----------

function goalSheet(monday, f, refresh) {
  const g = ln.goal(monday, f) || {};
  const ziel = h('input.input', { value: g.ziel || '' });
  const fertig = h('input.input', { value: g.fertig_wenn || '' });
  const einheiten = h('input.input.days', { inputmode: 'numeric', value: g.einheiten || 3 });
  const schritte = h('textarea.input', { rows: 4, value: (g.schritte || []).map((s) => s.text).join('\n') });
  const err = h('p.error');
  const sh = sheet(`${ln.fieldName(f)} · KW ${isoWeek(monday)}`,
    h('label.field', h('span', 'Ziel'), ziel),
    h('label.field', h('span', 'Fertig, wenn …'), fertig),
    h('div.daysrow', h('span.small.muted', 'Einheiten pro Woche'), einheiten),
    h('label.field', h('span', 'Teilschritte'), schritte),
    err,
    h('div.sheet-btns',
      g.ziel && h('button.btn.ghost', {
        onclick: () => {
          if (!confirm(`Ziel für ${ln.fieldName(f)} in dieser Woche löschen?`)) return;
          ln.setGoal(monday, f, null);
          sh.close();
          refresh();
        },
      }, 'Löschen'),
      h('button.btn.ghost', { onclick: () => sh.close() }, 'Abbrechen'),
      h('button.btn.primary', {
        onclick: () => {
          if (!ziel.value.trim()) return (err.textContent = 'Bitte ein Ziel eintragen.');
          if (!fertig.value.trim()) return (err.textContent = '„Fertig, wenn …“ ist Pflicht – woran erkennst du, dass es geschafft ist?');
          const old = g.schritte || [];
          ln.setGoal(monday, f, {
            ...g,
            ziel: ziel.value.trim(),
            fertig_wenn: fertig.value.trim(),
            einheiten: Math.max(0, parseInt(einheiten.value, 10) || 0),
            schritte: schritte.value.split('\n').map((t) => t.trim()).filter(Boolean)
              .map((text) => ({ text, done: !!old.find((s) => s.text === text)?.done })),
          });
          sh.close();
          toast('Ziel gespeichert');
          refresh();
        },
      }, 'Speichern'),
    ),
  );
  setTimeout(() => !g.ziel && ziel.focus(), 250);
}

// ---------- Timer-Dauer wählen ----------

function timerSheet(f, refresh) {
  let min = ln.timerMinutes();
  const custom = h('input.input.days', { inputmode: 'numeric', value: min, 'aria-label': 'Minuten' });
  const chips = h('div.chips');
  const paint = () => chips.replaceChildren(...[15, 25, 30, 45, 60, 90].map((m) => h(`button.chip${m === min ? '.on' : ''}`, {
    onclick: () => {
      min = m;
      custom.value = m;
      paint();
    },
  }, `${m} Min`)));
  paint();
  custom.addEventListener('input', () => {
    min = parseInt(custom.value, 10) || 0;
    paint();
  });
  const sh = sheet(`Fokus-Timer · ${ln.fieldName(f)}`,
    chips,
    h('div.daysrow', h('span.small.muted', 'Eigene Dauer (Minuten)'), custom),
    h('div.sheet-btns',
      h('button.btn.ghost', { onclick: () => sh.close() }, 'Abbrechen'),
      h('button.btn.primary', {
        onclick: () => {
          if (min < 1 || min > 240) return toast('Bitte 1 bis 240 Minuten wählen', 'error');
          ln.setTimerMinutes(min);
          ln.startTimer(f, min);
          sh.close();
          refresh();
        },
      }, 'Starten'),
    ),
  );
}

// ---------- Reiter 1: Diese Woche ----------

function weekTab(refresh) {
  const mon = weekStart();
  const fk = ln.fokus(mon);
  const withGoal = ln.FIELDS.filter((f) => ln.goal(mon, f.id));
  const without = ln.FIELDS.filter((f) => !ln.goal(mon, f.id));
  withGoal.sort((a, b) => (b.id === fk) - (a.id === fk));

  return [
    hero(mon, refresh),
    fokusBanner(mon, refresh),
    reviewBanner(mon),
    withGoal.map((f) => fieldCard(mon, f.id, f.id === fk, refresh)),
    without.length > 0 && h('div.lf-empties', without.map((f) => h(`button.card.lf-empty.f-${f.id}`, { onclick: () => goalSheet(mon, f.id, refresh) },
      fieldIcon(f.id),
      h('span', h('b', ln.fieldName(f.id)), h('span.muted', ' · Ziel setzen')),
      h('span.lf-plus', icon('plus', 18)),
    ))),
    h('div.lf-foot',
      h('a.link', { href: '#/leistung/import' }, icon('upload', 16), 'Lernplan importieren'),
      h('a.link', { href: '#/leistung/review' }, icon('calendar', 16), 'Wochen-Review'),
    ),
  ];
}

// Kleiner Wochenring rechts oben in der Heute-Karte
function miniRing(mon) {
  let planned = 0;
  let done = 0;
  for (const f of ln.FIELDS) {
    const g = ln.goal(mon, f.id);
    if (!g?.einheiten) continue;
    planned += g.einheiten;
    done += Math.min(g.einheiten, ln.unitsOfWeek(mon, f.id).length);
  }
  const r = 15;
  const c = 2 * Math.PI * r;
  const pct = planned ? done / planned : 0;
  return h('div.lh-ring',
    h('span', { html: `<svg viewBox="0 0 38 38"><circle cx="19" cy="19" r="${r}" class="t"/>${pct > 0 ? `<circle cx="19" cy="19" r="${r}" class="v" stroke-dasharray="${c * pct} ${c}" transform="rotate(-90 19 19)"/>` : ''}</svg>` }),
    h('span.lh-ring-text', h('b', planned ? `${done}/${planned}` : '–'), h('span', 'Einheiten')),
  );
}

function hero(mon, refresh) {
  const t = ln.timer();
  const order = ln.todayOrder(mon);
  const withGoal = ln.FIELDS.map((f) => f.id).filter((id) => ln.goal(mon, id));
  const list = [...order, ...withGoal.filter((id) => !order.includes(id))];
  if (heroField && !list.includes(heroField)) heroField = null;
  const allDone = withGoal.length > 0 && order.length === 0;
  const cur = heroField || (allDone ? null : list[0]);

  const top = (label) => h('div.lh-top', h('p.lh-eyebrow', label), miniRing(mon));
  const nav = (content) => {
    if (list.length < 2 && !(allDone && list.length)) return h('div.lh-main', content);
    const idx = cur ? list.indexOf(cur) : -1;
    const go = (d) => {
      heroField = list[(idx + d + list.length) % list.length];
      if (idx === -1) heroField = d > 0 ? list[0] : list[list.length - 1];
      if (!allDone && heroField === list[0]) heroField = null; // zurück bei der automatischen Wahl
      refresh();
    };
    return h('div.lh-main.nav',
      h('button.navbtn', { onclick: () => go(-1), 'aria-label': 'Vorheriges Feld' }, icon('back', 20)),
      h('div.lh-center', content),
      h('button.navbtn.flip', { onclick: () => go(1), 'aria-label': 'Nächstes Feld' }, icon('back', 20)),
    );
  };

  // Timer läuft
  if (t) {
    const left = h('b.lh-timer');
    const bar = h('i');
    const paint = () => {
      const tt = ln.timer();
      if (!tt) return clearInterval(tick);
      const ms = Math.max(0, tt.start + tt.min * 60000 - Date.now());
      left.textContent = `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
      bar.style.width = `${100 - (ms / (tt.min * 60000)) * 100}%`;
      if (ms <= 0) {
        clearInterval(tick);
        refresh();
      }
    };
    clearInterval(tick);
    tick = setInterval(() => (document.contains(left) ? paint() : clearInterval(tick)), 1000);
    paint();
    return h('section.l-hero.timer',
      top(`Fokus-Timer · ${t.min} Min`),
      h('div.lh-main', h('div.lh-center', h('p.lh-field', fieldIcon(t.feld, 20), ln.fieldName(t.feld)), left)),
      h('div.hbar', bar),
      h('div.lh-btns',
        h('button.lh-btn.soft', { onclick: () => { ln.extendTimer(5); refresh(); } }, '+5 Min'),
        h('button.lh-btn.soft', {
          onclick: () => {
            if (!confirm('Timer abbrechen? Es wird keine Einheit eingetragen.')) return;
            ln.stopTimer();
            clearInterval(tick);
            refresh();
          },
        }, 'Abbrechen'),
      ),
    );
  }

  // Notiz nach „Erledigt“
  if (noteFor && noteWhere === 'hero') {
    const u = ln.allUnits().find((x) => x.key === noteFor);
    if (u) {
      const input = h('input.input', { placeholder: 'Was habe ich gelernt?', enterkeyhint: 'done' });
      const save = () => {
        if (input.value.trim()) ln.setNote(noteFor, input.value.trim());
        noteFor = null;
        refresh();
      };
      input.addEventListener('keydown', (e) => e.key === 'Enter' && save());
      setTimeout(() => input.focus(), 60);
      return h('section.l-hero',
        top('Einheit eingetragen'),
        h('p.lh-field', fieldIcon(u.feld, 20), ln.fieldName(u.feld)),
        input,
        h('div.lh-btns',
          h('button.lh-btn', { onclick: save }, 'Speichern'),
          h('button.lh-btn.soft', { onclick: () => { noteFor = null; refresh(); } }, 'Überspringen'),
        ),
      );
    }
    noteFor = null;
  }

  // Noch keine Ziele
  if (!withGoal.length) {
    return h('section.l-hero',
      top(`KW ${isoWeek(mon)}`),
      h('p.lh-title', 'Noch keine Wochenziele'),
      h('div.lh-btns',
        h('a.lh-btn', { href: '#/leistung/import' }, icon('upload', 18), 'Lernplan importieren'),
      ),
    );
  }

  // Alles erfüllt
  if (!cur) {
    return h('section.l-hero.done',
      top(`KW ${isoWeek(mon)}`),
      nav([
        h('span.lh-check', icon('check', 28)),
        h('p.lh-title', 'Woche geschafft'),
        h('p.lh-sub', 'Alle Wochenziele erfüllt'),
      ]),
    );
  }

  const g = ln.goal(mon, cur);
  const step = g.schritte.find((s) => !s.done);
  const n = ln.unitsOfWeek(mon, cur).length;
  const isDone = ln.fulfilled(mon, cur);
  const min = ln.timerMinutes();
  const timerBtn = pressable(
    h('button.lh-btn.soft.press', { 'aria-label': `Fokus-Timer ${min} Minuten` }, icon('play', 16), `${min} Min`),
    () => {
      ln.startTimer(cur, min);
      refresh();
    },
    () => timerSheet(cur, refresh),
  );

  return h(`section.l-hero${isDone ? '.done' : ''}`,
    top(heroField && heroField !== order[0] ? 'Gewählt' : 'Heute dran'),
    nav([
      h('p.lh-field.big', fieldIcon(cur, 22), ln.fieldName(cur)),
      h('p.lh-sub', isDone ? 'Wochenziel erfüllt' : step ? h('span', 'Nächster Schritt: ', h('b', step.text)) : h('span', 'Ziel: ', h('b', g.ziel))),
      h('p.lh-count', `${n}/${g.einheiten || 0} Einheiten diese Woche`),
    ]),
    h('div.lh-btns',
      timerBtn,
      h('button.lh-btn', {
        onclick: () => {
          noteFor = ln.addUnit({ feld: cur });
          noteWhere = 'hero';
          toast(`Stark – ${ln.fieldName(cur)} erledigt`);
          refresh();
        },
      }, icon('check', 18), 'Erledigt'),
    ),
  );
}

function fokusBanner(mon, refresh) {
  const fk = ln.fokus(mon);
  const hidden = JSON.parse(ls('life4.fokusHintOff', '[]'));
  const t = ln.termine().find((x) => {
    const d = ln.daysUntil(x.datum);
    return d >= 0 && d <= 14 && x.feld !== fk && !hidden.includes(`${x.id}:${iso(mon)}`);
  });
  if (!t) return null;
  return h('section.card.banner.warn',
    h('p', h('b', `${ln.terminTitle(t)} ${ln.countdown(t.datum)}:`), ` ${ln.fieldName(t.feld)} als Fokusfeld setzen?`),
    h('div.banner-btns',
      h('button.btn.primary.sm', {
        onclick: () => {
          ln.setFokus(mon, t.feld);
          toast(`${ln.fieldName(t.feld)} ist diese Woche dein Fokus`);
          refresh();
        },
      }, 'Als Fokus setzen'),
      h('button.link', {
        onclick: () => {
          lsSet('life4.fokusHintOff', JSON.stringify([...hidden, `${t.id}:${iso(mon)}`]));
          refresh();
        },
      }, 'Nicht jetzt'),
    ),
  );
}

function reviewBanner(mon) {
  const day = new Date().getDay();
  if (day !== 6 && day !== 0) return null;
  const next = addDays(mon, 7);
  if (ln.FIELDS.some((f) => ln.goal(next, f.id))) return null;
  return h('a.card.banner.plan', { href: '#/leistung/review' },
    h('span.sec-icon', icon('calendar', 18)),
    h('span', h('b', `Wochenziele für KW ${isoWeek(next)} setzen`), h('span.small.muted.block', 'Altes Ziel bewerten, neues festlegen')),
    h('span.lf-plus.flip', icon('back', 18)),
  );
}

function fieldCard(mon, f, isFokus, refresh) {
  const g = ln.goal(mon, f);
  const units = ln.unitsOfWeek(mon, f);
  const nt = ln.nextTermin(f);
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(mon, i)));
  const today = iso();

  const head = h('button.kbox-head',
    fieldIcon(f),
    h('span.kbox-title',
      h('span.lf-name', h('h2', ln.fieldName(f)), isFokus && h('span.fk-badge', 'Fokus')),
      h('span.kbox-info', g.ziel),
      h('span.lf-meta',
        h('span', `${units.length}/${g.einheiten || 0} Einheiten`),
        nt && h(`span.tchip.u-${ln.urgency(nt.datum)}`, `${ln.terminTitle(nt)} · ${ln.countdown(nt.datum)}`),
      ),
    ),
    h('span.kbox-chev', icon('back', 18)),
  );

  const noteBox = noteFor && noteWhere === 'card' && units.find((u) => u.key === noteFor) && (() => {
    const input = h('input.input', { placeholder: 'Was habe ich gelernt?', enterkeyhint: 'done' });
    const save = () => {
      if (input.value.trim()) ln.setNote(noteFor, input.value.trim());
      noteFor = null;
      refresh();
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && save());
    setTimeout(() => input.focus(), 60);
    return h('div.form.note-form',
      input,
      h('div.buttons', h('button.btn.primary', { onclick: save }, 'Speichern'), h('button.btn.ghost', { onclick: () => { noteFor = null; refresh(); } }, 'Überspringen')),
    );
  })();

  const content = [
    h('div.lf-goal.done-crit', h('span.small.muted', 'Fertig, wenn …'), h('p', g.fertig_wenn)),
    g.schritte.length > 0 && h('div.steps', g.schritte.map((s, i) => h(`button.check${s.done ? '.done' : ''}`, {
      onclick: () => {
        ln.toggleStep(mon, f, i);
        refresh();
      },
    }, h('span.box', icon('check', 16)), h('span.check-name', s.text)))),
    h('div.wdots', days.map((d) => h(`span.wdot${units.some((u) => u.date === d) ? '.on' : ''}${d === today ? '.today' : ''}`, h('i'), WD_SHORT[fromIso(d).getDay()]))),
    noteBox,
    h('div.lf-links',
      h('button.link', {
        onclick: () => {
          noteFor = ln.addUnit({ feld: f });
          noteWhere = 'card';
          rememberOpen(`f-${f}`, true);
          toast(`${ln.fieldName(f)}: Einheit eingetragen`);
          refresh();
        },
      }, '+ Einheit'),
      h('button.link', { onclick: () => goalSheet(mon, f, refresh) }, 'Ziel bearbeiten'),
      h('button.link', {
        onclick: () => {
          ln.setFokus(mon, isFokus ? null : f);
          refresh();
        },
      }, isFokus ? 'Kein Fokus' : 'Als Fokus'),
    ),
  ];

  return collapsible(`f-${f}`, false, head, [
    h('div.kbox-bar', h('i', { style: { width: `${g.einheiten ? Math.min(100, (units.length / g.einheiten) * 100) : 0}%` } })),
    h('div.kbox-body', h('div.kbox-inner', content)),
  ], `section.card.kbox.lfield.f-${f}${isFokus ? '.fokus' : ''}`);
}

// ---------- Reiter 2: Termine ----------

async function exportIcs(list) {
  if (!list.length) return toast('Keine anstehenden Termine', 'error');
  const name = list.length === 1 ? `termin-${list[0].datum}.ics` : 'lerntermine.ics';
  await saveFile(new Blob([ln.termineIcs(list)], { type: 'text/calendar' }), name, 'text/calendar');
}

function terminSheet(refresh, t = null) {
  let feld = t?.feld || 'uni';
  const titel = h('input.input', { value: t?.titel || '' });
  const modul = h('input.input', { value: t?.modul || '' });
  const datum = h('input.input', { type: 'date', value: t?.datum || iso(addDays(new Date(), 14)) });
  const box = h('div.chips');
  const paint = () => box.replaceChildren(...ln.FIELDS.map((f) => h(`button.chip${feld === f.id ? '.on' : ''}`, { onclick: () => { feld = f.id; paint(); } }, f.short)));
  paint();
  const err = h('p.error');
  const sh = sheet(t ? 'Termin bearbeiten' : 'Neuer Termin',
    h('label.field', h('span', 'Titel'), titel),
    h('label.field', h('span', 'Modul'), modul),
    h('label.field', h('span', 'Datum'), datum),
    h('div.field', h('span', 'Lernfeld'), box),
    err,
    t && h('button.btn.ghost.full', { onclick: () => exportIcs([t]) }, icon('calendar', 18), 'In Apple Kalender eintragen'),
    h('div.sheet-btns',
      h('button.btn.ghost', { onclick: () => sh.close() }, 'Abbrechen'),
      h('button.btn.primary', {
        onclick: () => {
          if (!titel.value.trim() || !datum.value) return (err.textContent = 'Bitte Titel und Datum eintragen.');
          const data = { ...(t ? { seit: t.seit } : {}), titel: titel.value.trim(), datum: datum.value, feld };
          if (!data.seit) delete data.seit;
          if (modul.value.trim()) data.modul = modul.value.trim();
          const id = ln.saveTermin(t?.id, data);
          sh.close();
          refresh();
          toast('Termin gespeichert', '', { label: 'In Kalender', fn: () => exportIcs([{ id, ...data }]) });
        },
      }, 'Speichern'),
    ),
  );
}

function termineTab(refresh) {
  const all = ln.termine();
  const today = iso();
  const upcoming = all.filter((t) => t.datum >= today);
  const past = all.filter((t) => t.datum < today).reverse();

  const row = (t) => {
    const since = t.seit || iso(weekStart());
    const n = ln.unitsSince(t.feld, since);
    return swipeLeft(
      h(`div.trow.u-${ln.urgency(t.datum)}`,
        h('div.tr-date', h('b', fromIso(t.datum).getDate()), h('span', MONTHS_SHORT[fromIso(t.datum).getMonth()])),
        h('div.tr-main',
          h('b', ln.terminTitle(t)),
          h('span.small.muted.block', fieldTag(t.feld), ` ${dayLabel(t.datum)}`),
          t.datum >= today && h('span.small.muted.block.tr-units', `Lerneinheiten ${ln.fieldShort(t.feld)} seit ${fmtShort(fromIso(since))}: `, h('b', n)),
        ),
        cdBadge(t.datum),
      ),
      {
        label: 'Löschen',
        onTap: () => terminSheet(refresh, t),
        onSwipe: () => {
          ln.deleteTermin(t.id);
          refresh();
          toast(`„${ln.terminTitle(t)}“ gelöscht`, '', { label: 'Rückgängig', fn: () => { const { id, ...d } = t; ln.saveTermin(id, d); refresh(); } });
        },
      },
    );
  };

  return [
    fokusBanner(weekStart(), refresh),
    h('section.card',
      secTitle('calendar', 'Anstehend', h('button.link', { onclick: () => terminSheet(refresh) }, '+ Termin')),
      upcoming.length ? h('div.klist', upcoming.map(row)) : h('p.muted', 'Keine Termine'),
      upcoming.length > 0 && h('button.btn.ghost.full', { onclick: () => exportIcs(upcoming) }, icon('calendar', 18), 'Alle in Apple Kalender eintragen'),
    ),
    past.length > 0 && collapsible('past', false,
      h('button.kbox-head', h('span.sec-icon', icon('list', 18)), h('span.kbox-title', h('h2', `Vergangen (${past.length})`)), h('span.kbox-chev', icon('back', 18))),
      h('div.kbox-body', h('div.kbox-inner', h('div.klist', past.map(row)))),
      'section.card.kbox'),
  ];
}

// ---------- Reiter 3: Rückblick ----------

function reviewTab() {
  const units = ln.allUnits();
  const notes = units.filter((u) => u.notiz);
  const journalList = h('div.journal');
  const paintJournal = () => {
    const q = journalQuery.trim().toLowerCase();
    const list = notes.filter((u) => (journalField === 'alle' || u.feld === journalField) && (!q || u.notiz.toLowerCase().includes(q)));
    if (!notes.length) {
      journalList.replaceChildren(h('p.muted', 'Keine Einträge'));
      return;
    }
    journalList.replaceChildren(...(list.length
      ? list.map((u) => h('div.tl-item',
        h('span.tl-dot.lf-dot', icon('pen', 13)),
        h('div.tl-body',
          h('div.tl-top', fieldTag(u.feld), h('span.small.muted', `${dayLabel(u.date)}${u.dauer ? ` · ${u.dauer} Min` : ''}`)),
          h('p.tl-note', u.notiz),
        ),
      ))
      : [h('p.muted', 'Keine Einträge')]));
  };
  paintJournal();
  const search = notes.length > 0 && h('input.input', {
    type: 'search',
    placeholder: 'Suchen',
    value: journalQuery,
    oninput: (e) => {
      journalQuery = e.target.value;
      paintJournal();
    },
  });
  const chips = h('div.chips.jchips');
  const paintChips = () => chips.replaceChildren(...[{ id: 'alle', short: 'Alle' }, ...ln.FIELDS].map((f) => h(`button.chip${journalField === f.id ? '.on' : ''}`, {
    onclick: () => {
      journalField = f.id;
      paintChips();
      paintJournal();
    },
  }, f.short)));
  paintChips();

  const hist = ln.FIELDS.map((f) => ({ f, list: ln.statusHistory(f.id) }));
  const weeks = hist[0].list;

  return [
    h('section.card',
      secTitle('chart', 'Wochenziele'),
      weeks.length
        ? [
          h('p.small.muted', weeks.length === 1 ? `Seit KW ${isoWeek(weeks[0].monday)}` : `KW ${isoWeek(weeks[0].monday)} bis KW ${isoWeek(weeks[weeks.length - 1].monday)}`),
          hist.map(({ f, list }) => h('div.srow',
            h('span.sr-name', f.short),
            h('div.sr-dots', list.map((x) => h(`span.sdot2.st-${x.status || 'none'}`, { title: `KW ${isoWeek(x.monday)}: ${x.ziel ? `${x.ziel} – ${ln.STATUS[x.status]}` : 'kein Ziel'}` }))),
          )),
          h('div.slegend', h('span', h('span.sdot2.st-erreicht'), 'erreicht'), h('span', h('span.sdot2.st-teilweise'), 'teilweise'), h('span', h('span.sdot2.st-nicht'), 'nicht erreicht'), h('span', h('span.sdot2.st-offen'), 'läuft')),
        ]
        : h('p.muted', 'Keine Daten'),
    ),
    h('section.card',
      secTitle('pen', 'Lernjournal', notes.length > 0 && h('span.count', notes.length)),
      search,
      notes.length > 0 && chips,
      journalList,
    ),
  ];
}

// ---------- Lernplan importieren ----------

function importView() {
  const area = h('textarea.input.paste', { rows: 6, 'aria-label': 'Lernplan' });
  const msg = h('p.error');
  const preview = h('div');

  function check() {
    msg.textContent = '';
    preview.replaceChildren();
    pendingPlan = null;
    if (!ln.isLernplan(area.value)) {
      msg.textContent = area.value.trim()
        ? 'Kein Lernplan erkannt.'
        : 'Kein Lernplan eingefügt.';
      return;
    }
    try {
      pendingPlan = ln.parseLernplan(area.value);
    } catch (e) {
      msg.textContent = e.message;
      return;
    }
    preview.replaceChildren(lernplanPreview(pendingPlan));
  }

  return h('div.view.a-leistung.lview',
    h('a.backlink', { href: '#/leistung/woche' }, icon('back', 18), 'Leistung'),
    h('header.hero', h('h1', 'Lernplan importieren')),
    h('section.card',
      h('label.field', h('span', 'Lernplan'), area),
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
      h('p.label', 'Vorlage'),
      h('button.btn.ghost.full', {
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(ln.TEMPLATE_LERNPLAN);
            toast('Kopiert – jetzt im Claude-Chat einfügen');
          } catch {
            toast('Kopieren hat nicht geklappt', 'error');
          }
        },
      }, 'Vorlage Lernplan kopieren'),
    ),
  );
}

function lernplanPreview(plan) {
  const end = addDays(plan.monday, 6);
  const replaces = Object.keys(plan.felder).some((f) => ln.goal(plan.monday, f));
  return h('section.card',
    h('p.label', `Lernplan · KW ${isoWeek(plan.monday)} · ${fmtShort(plan.monday)}–${fmtShort(end)}`),
    h('div.preview',
      ln.FIELDS.map((f) => {
        const g = plan.felder[f.id];
        return h('div.prow', h('b', f.short), h('span.muted', g ? `${g.ziel} · ${g.einheiten} Einheiten${g.schritte.length ? ` · ${g.schritte.length} Schritte` : ''}${plan.fokus === f.id ? ' · Fokus' : ''}` : 'nicht im Plan – bleibt wie es ist'));
      }),
      plan.termine.map((t) => h('div.prow', h('b', fmtShort(fromIso(t.datum))), h('span.muted', `${ln.terminTitle(t)} (${ln.fieldName(t.feld)})`))),
    ),
    replaces && h('p.small.muted', 'Ersetzt vorhandene Ziele.'),
    h('button.btn.primary.full', {
      onclick: () => {
        ln.applyLernplan(plan);
        pendingPlan = null;
        toast('Lernplan übernommen');
        location.hash = '#/leistung/woche';
      },
    }, 'Übernehmen'),
  );
}

// ---------- Wochen-Review Leistung ----------

function reviewView(refresh) {
  const mon = week.reviewMonday();
  const next = addDays(mon, 7);
  const decisions = {};
  let fk = ln.fokus(next) || ln.fokus(mon);

  const cards = ln.FIELDS.map((f) => {
    const old = ln.goal(mon, f.id);
    const existing = ln.goal(next, f.id);
    const d = decisions[f.id] = {
      rating: old?.status && old.status !== 'offen' ? old.status : ln.suggestStatus(mon, f.id),
      mode: existing ? 'new' : old ? 'keep' : 'drop',
    };
    const ziel = h('input.input', { value: existing?.ziel || '' });
    const fertig = h('input.input', { value: existing?.fertig_wenn || '' });
    const einheiten = h('input.input.days', { inputmode: 'numeric', value: existing?.einheiten ?? old?.einheiten ?? 3 });
    const schritte = h('textarea.input', { rows: 3, value: (existing?.schritte || []).map((s) => s.text).join('\n') });
    d.read = () => ({ ziel: ziel.value.trim(), fertig_wenn: fertig.value.trim(), einheiten: Math.max(0, parseInt(einheiten.value, 10) || 0), schritte: schritte.value.split('\n').map((t) => t.trim()).filter(Boolean).map((text) => ({ text, done: false })) });
    const form = h('div.form.rv-form', h('label.field', h('span', 'Ziel'), ziel), h('label.field', h('span', 'Fertig, wenn …'), fertig), h('div.daysrow', h('span.small.muted', 'Einheiten pro Woche'), einheiten), h('label.field', h('span', 'Teilschritte'), schritte));
    const ratingBox = h('div.segs');
    const modeBox = h('div.segs');
    const paint = () => {
      ratingBox.replaceChildren(...['erreicht', 'teilweise', 'nicht'].map((s) => h(`button.seg.rs-${s}${d.rating === s ? '.on' : ''}`, { onclick: () => { d.rating = s; paint(); } }, ln.STATUS[s])));
      modeBox.replaceChildren(...[old && ['keep', 'Übernehmen'], ['new', 'Neues Ziel'], ['drop', 'Streichen']].filter(Boolean)
        .map(([m, label]) => h(`button.seg${d.mode === m ? '.on' : ''}`, { onclick: () => { d.mode = m; paint(); } }, label)));
      form.hidden = d.mode !== 'new';
    };
    paint();
    const units = ln.unitsOfWeek(mon, f.id).length;
    return h(`section.card.rv-field${f.id === fk ? '.fokus' : ''}`,
      secTitle('leistung', f.name),
      old
        ? [
          h('div.lf-goal', h('span.small.muted', `Ziel KW ${isoWeek(mon)}`), h('p', old.ziel)),
          h('p.small.muted', `Fertig, wenn: ${old.fertig_wenn} · ${units}/${old.einheiten || 0} Einheiten ${old.schritte.length ? ` · ${old.schritte.filter((s) => s.done).length}/${old.schritte.length} Schritte` : ''}`),
          h('p.rv-q', 'Wie lief es?'),
          ratingBox,
        ]
        : h('p.small.muted', `Kein Ziel in KW ${isoWeek(mon)} · ${units} ${units === 1 ? 'Einheit' : 'Einheiten'}`),
      h('p.rv-q', `Ziel für KW ${isoWeek(next)}`),
      modeBox,
      form,
    );
  });

  const fkBox = h('div.chips');
  const paintFk = () => fkBox.replaceChildren(...[...ln.FIELDS.map((f) => [f.id, f.short]), [null, 'Kein Fokus']].map(([id, label]) => h(`button.chip${fk === id ? '.on' : ''}`, { onclick: () => { fk = id; paintFk(); } }, label)));
  paintFk();
  const err = h('p.error');

  return h('div.view.a-leistung.lview',
    h('a.backlink', { href: '#/leistung/woche' }, icon('back', 18), 'Leistung'),
    h('header.hero', h('p.eyebrow', `Wochen-Review · KW ${isoWeek(mon)} → KW ${isoWeek(next)}`), h('h1', 'Lernziele')),
    cards,
    h('section.card', secTitle('sparkle', `Fokusfeld KW ${isoWeek(next)}`), fkBox),
    err,
    h('button.btn.primary.full', {
      onclick: () => {
        for (const f of ln.FIELDS) {
          const d = decisions[f.id];
          if (d.mode === 'new') {
            const v = d.read();
            if (!v.ziel || !v.fertig_wenn) {
              err.textContent = `${f.name}: Bitte Ziel und „Fertig, wenn …“ ausfüllen – oder „Streichen“ wählen.`;
              return;
            }
          }
        }
        for (const f of ln.FIELDS) {
          const d = decisions[f.id];
          const old = ln.goal(mon, f.id);
          if (old && d.rating) ln.setStatus(mon, f.id, d.rating);
          if (d.mode === 'keep' && old) ln.setGoal(next, f.id, { ziel: old.ziel, fertig_wenn: old.fertig_wenn, einheiten: old.einheiten, schritte: old.schritte.filter((s) => !s.done).map((s) => ({ text: s.text, done: false })) });
          else if (d.mode === 'new') ln.setGoal(next, f.id, d.read());
          else ln.setGoal(next, f.id, null);
        }
        ln.setFokus(next, fk);
        toast('Lernziele gespeichert');
        location.hash = '#/leistung/woche';
      },
    }, 'Speichern'),
  );
}
