// Bereich Leistung – drei Reiter:
//   Diese Woche  Lernfelder mit Ziel, Fertig-Kriterium, Teilschritten, „Heute gelernt“, Fokus-Timer
//   Termine      Abgaben & Prüfungen mit Countdown
//   Rückblick    Zielstatus der letzten Wochen, Lernjournal
// Ton: klar, fokussiert, motivierend.
import * as ln from '../learn.js';
import * as week from '../week.js';
import { h, icon, toast, iso, fromIso, addDays, weekStart, isoWeek, WD_SHORT, fmtShort, sheet, swipeLeft } from '../ui.js';

const TABS = [
  { id: 'woche', name: 'Diese Woche' },
  { id: 'termine', name: 'Termine' },
  { id: 'rueckblick', name: 'Rückblick' },
];

let noteFor = null;        // gerade eingetragene Einheit → „Was habe ich gelernt?“
let journalField = 'alle';
let journalQuery = '';
let tick = null;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const dayLabel = (d) => `${WD_SHORT[fromIso(d).getDay()]} ${fmtShort(fromIso(d))}`;

function lastTab() {
  try {
    return localStorage.getItem('life4.leistungTab') || 'woche';
  } catch {
    return 'woche';
  }
}

export function render(sub, refresh) {
  // Abgelaufener Timer → Einheit automatisch eintragen
  const fin = ln.finishTimerIfDue();
  if (fin) {
    noteFor = fin.key;
    setTimeout(() => toast(`${fin.min} Minuten ${ln.fieldName(fin.feld)} geschafft – Einheit eingetragen`), 50);
  }
  if (sub === 'review') return reviewView(refresh);
  const tab = TABS.some((t) => t.id === sub) ? sub : lastTab();
  try {
    localStorage.setItem('life4.leistungTab', tab);
  } catch { /* egal */ }
  const views = { woche: weekTab, termine: termineTab, rueckblick: reviewTab };
  return h('div.view.a-leistung.contact-view',
    h('div.segs.ctabs', TABS.map((t) => h(`a.seg${t.id === tab ? '.on' : ''}`, { href: `#/leistung/${t.id}` }, t.name))),
    views[tab](refresh),
  );
}

function secTitle(ic, text, right) {
  return h('div.sec-title', h('span.sec-icon', icon(ic, 18)), h('h2', text), right || null);
}

// ---------- Aufklappen (wie bei Körper, Zustand pro Woche gemerkt) ----------

const OPEN_KEY = 'life4.leistungOpen';
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
    m[id] = val;
    localStorage.setItem(OPEN_KEY, JSON.stringify(m));
  } catch { /* egal */ }
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

const fieldTag = (f) => h(`span.ftag.f-${f}`, ln.FIELDS.find((x) => x.id === f)?.short || f);
const cdBadge = (datum) => h(`span.cd.u-${ln.urgency(datum)}`, ln.countdown(datum));

// ---------- Ziel festlegen / bearbeiten ----------

function goalSheet(monday, f, refresh, preset = null) {
  const g = preset || ln.goal(monday, f) || {};
  const ziel = h('input.input', { value: g.ziel || '', placeholder: 'z. B. Kapitel 4 wiederholen' });
  const fertig = h('input.input', { value: g.fertig_wenn || '', placeholder: 'z. B. Alle Übungsaufgaben gelöst' });
  const einheiten = h('input.input.days', { inputmode: 'numeric', value: g.einheiten || 3 });
  const schritte = h('textarea.input', { rows: 4, placeholder: 'Ein Schritt pro Zeile', value: (g.schritte || []).map((s) => s.text).join('\n') });
  const err = h('p.error');
  const sh = sheet(`${ln.fieldName(f)} · KW ${isoWeek(monday)}`,
    h('label.field', h('span', 'Ziel'), ziel),
    h('label.field', h('span', 'Fertig, wenn … (Pflicht)'), fertig),
    h('div.daysrow', h('span.small.muted', 'Einheiten pro Woche'), einheiten),
    h('label.field', h('span', 'Teilschritte (optional)'), schritte),
    err,
    h('div.sheet-btns',
      h('button.btn.ghost', { onclick: () => sh.close() }, 'Abbrechen'),
      h('button.btn.primary', {
        onclick: () => {
          if (!ziel.value.trim()) return (err.textContent = 'Bitte ein Ziel eintragen.');
          if (!fertig.value.trim()) return (err.textContent = '„Fertig, wenn …“ ist Pflicht – woran erkennst du, dass es geschafft ist?');
          const old = (ln.goal(monday, f)?.schritte || []);
          ln.setGoal(monday, f, {
            ...(ln.goal(monday, f) || {}),
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
}

// ---------- Fokus-Timer ----------

function timerCard(refresh) {
  const t = ln.timer();
  if (!t) return null;
  const left = h('b.tm-left');
  const bar = h('i');
  const paint = () => {
    const ms = Math.max(0, t.start + t.min * 60000 - Date.now());
    left.textContent = `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
    bar.style.width = `${100 - (ms / (t.min * 60000)) * 100}%`;
    if (ms <= 0) {
      clearInterval(tick);
      refresh();
    }
  };
  clearInterval(tick);
  tick = setInterval(() => (document.contains(left) ? paint() : clearInterval(tick)), 1000);
  const card = h('section.card.timer-card',
    h('div.row.between',
      h('div', h('p.small.muted', `Fokus-Timer · ${ln.fieldName(t.feld)} · ${t.min} Min`), left),
      h('button.btn.ghost.sm', {
        onclick: () => {
          if (!confirm('Timer abbrechen? Es wird keine Einheit eingetragen.')) return;
          ln.stopTimer();
          clearInterval(tick);
          refresh();
        },
      }, 'Abbrechen'),
    ),
    h('div.bar.big', bar),
    h('p.small.muted', 'Nach Ablauf wird automatisch eine Einheit eingetragen – auch wenn die App zwischendurch geschlossen war.'),
  );
  paint();
  return card;
}

// ---------- Reiter 1: Diese Woche ----------

function weekTab(refresh) {
  const mon = weekStart();
  const fk = ln.fokus(mon);
  const fields = [...ln.FIELDS].sort((a, b) => (b.id === fk) - (a.id === fk));
  const stats = ln.FIELDS.map((f) => {
    const g = ln.goal(mon, f.id);
    return { f, planned: g?.einheiten || 0, done: ln.unitsOfWeek(mon, f.id).length };
  });
  const planned = stats.reduce((s, x) => s + x.planned, 0);
  const done = stats.reduce((s, x) => s + Math.min(x.done, x.planned || x.done), 0);
  const pct = planned ? Math.round((Math.min(done, planned) / planned) * 100) : 0;
  const r = 30;
  const c = 2 * Math.PI * r;

  return [
    timerCard(refresh),
    h('section.card.week-head.lhead',
      h('div.wh-ring', h('span', { html: `<svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="${r}" class="t"/><circle cx="36" cy="36" r="${r}" class="v" stroke-dasharray="${(c * pct) / 100} ${c}" transform="rotate(-90 36 36)"/></svg>` }), h('b', planned ? `${Math.min(done, planned)}/${planned}` : '–')),
      h('div.wh-text',
        h('p.small.muted', `KW ${isoWeek(mon)} · ${fmtShort(mon)}–${fmtShort(addDays(mon, 6))}`),
        h('h2', planned ? `${Math.min(done, planned)} von ${planned} Einheiten` : 'Noch keine Wochenziele'),
        h('div.minibars', stats.map(({ f, planned: p, done: d }) => h(`div.mb${f.id === fk ? '.fk' : ''}`,
          h('span.mb-name', f.short),
          h('div.mb-track', h('i', { style: { width: `${p ? Math.min(100, (d / p) * 100) : 0}%` } })),
          h('span.mb-val', p ? `${d}/${p}` : d ? `${d}` : '–'),
        ))),
      ),
    ),
    fields.map((f) => fieldCard(mon, f.id, f.id === fk, refresh)),
    h('a.link.center.limport', { href: '#/koerper/import' }, 'Lernplan importieren'),
    h('a.card.review.lreview', { href: '#/leistung/review' },
      h('span.review-icon', icon('calendar', 22)),
      h('div', h('p.label', 'Wochen-Review Leistung'), h('p.muted', 'Ziele bewerten, übernehmen oder neu setzen')),
    ),
  ];
}

function fieldCard(mon, f, isFokus, refresh) {
  const g = ln.goal(mon, f);
  const units = ln.unitsOfWeek(mon, f);
  const nt = ln.nextTermin(f);
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(mon, i)));
  const today = iso();
  const doneToday = units.some((u) => u.date === today);

  const head = h('button.kbox-head',
    h('span.sec-icon', icon(isFokus ? 'sparkle' : 'leistung', 18)),
    h('span.kbox-title',
      h('span.lf-name', h('h2', ln.fieldName(f)), isFokus && h('span.fk-badge', 'Fokus')),
      h('span.kbox-info', g?.ziel || 'Noch kein Ziel für diese Woche'),
      h('span.lf-meta',
        h('span', `${units.length}/${g?.einheiten || 0} Einheiten`),
        nt && h('span.lf-termin', '· ', nt.titel, ' ', cdBadge(nt.datum)),
      ),
    ),
    h('span.kbox-chev', icon('back', 18)),
  );

  const noteBox = noteFor && units.find((u) => u.key === noteFor) && (() => {
    const ta = h('input.input', { placeholder: 'Was habe ich gelernt? (ein Satz)', enterkeyhint: 'done' });
    const save = () => {
      if (ta.value.trim()) ln.setNote(noteFor, ta.value.trim());
      noteFor = null;
      refresh();
    };
    ta.addEventListener('keydown', (e) => e.key === 'Enter' && save());
    setTimeout(() => ta.focus(), 60);
    return h('div.form.note-form',
      ta,
      h('div.buttons', h('button.btn.primary', { onclick: save }, 'Speichern'), h('button.btn.ghost', { onclick: () => { noteFor = null; refresh(); } }, 'Überspringen')),
    );
  })();

  const content = [
    !g && [
      h('p.muted', 'Lege fest, was du diese Woche erreichen willst – und woran du erkennst, dass es fertig ist.'),
      h('button.btn.primary.full', { onclick: () => goalSheet(mon, f, refresh) }, 'Ziel festlegen'),
    ],
    g && [
      h('div.lf-goal', h('span.small.muted', 'Ziel'), h('p', g.ziel)),
      h('div.lf-goal.done-crit', h('span.small.muted', 'Fertig, wenn …'), h('p', g.fertig_wenn)),
      g.schritte.length > 0 && h('div.steps', g.schritte.map((s, i) => h(`button.check${s.done ? '.done' : ''}`, {
        onclick: () => {
          ln.toggleStep(mon, f, i);
          refresh();
        },
      }, h('span.box', icon('check', 16)), h('span.check-name', s.text)))),
    ],
    h('div.wdots', days.map((d) => h(`span.wdot${units.some((u) => u.date === d) ? '.on' : ''}${d === today ? '.today' : ''}`, h('i'), WD_SHORT[fromIso(d).getDay()]))),
    noteBox,
    !noteBox && h('div.lf-actions',
      h(`button.btn.${doneToday ? 'ghost' : 'primary'}`, {
        onclick: () => {
          noteFor = ln.addUnit({ feld: f });
          rememberOpen(`f-${f}`, true);
          toast(`Stark – ${ln.fieldName(f)} heute gelernt`);
          refresh();
        },
      }, icon('check', 18), doneToday ? 'Noch eine' : 'Heute gelernt'),
      h('button.btn.ghost.sm.tm', { onclick: () => { ln.startTimer(f, 25); refresh(); }, disabled: !!ln.timer() }, icon('bell', 16), '25'),
      h('button.btn.ghost.sm.tm', { onclick: () => { ln.startTimer(f, 45); refresh(); }, disabled: !!ln.timer() }, icon('bell', 16), '45'),
    ),
    h('div.lf-links',
      g && h('button.link', { onclick: () => goalSheet(mon, f, refresh) }, 'Ziel bearbeiten'),
      h('button.link', {
        onclick: () => {
          ln.setFokus(mon, isFokus ? null : f);
          refresh();
        },
      }, isFokus ? 'Fokus entfernen' : 'Als Fokus setzen'),
    ),
  ];

  return collapsible(`f-${f}`, isFokus, head, [
    h('div.kbox-bar', h('i', { style: { width: `${g?.einheiten ? Math.min(100, (units.length / g.einheiten) * 100) : 0}%` } })),
    h('div.kbox-body', h('div.kbox-inner', content)),
  ], `section.card.kbox.lfield${isFokus ? '.fokus' : ''}`);
}

// ---------- Reiter 2: Termine ----------

function terminSheet(refresh, t = null) {
  let feld = t?.feld || 'uni';
  const titel = h('input.input', { value: t?.titel || '', placeholder: 'z. B. Klausur Personalwirtschaft' });
  const datum = h('input.input', { type: 'date', value: t?.datum || iso(addDays(new Date(), 14)) });
  const box = h('div.segs.wrap');
  const paint = () => box.replaceChildren(...ln.FIELDS.map((f) => h(`button.seg${feld === f.id ? '.on' : ''}`, { onclick: () => { feld = f.id; paint(); } }, f.short)));
  paint();
  const err = h('p.error');
  const sh = sheet(t ? 'Termin bearbeiten' : 'Neuer Termin',
    h('label.field', h('span', 'Titel'), titel),
    h('label.field', h('span', 'Datum'), datum),
    h('div.field', h('span', 'Lernfeld'), box),
    err,
    h('div.sheet-btns',
      h('button.btn.ghost', { onclick: () => sh.close() }, 'Abbrechen'),
      h('button.btn.primary', {
        onclick: () => {
          if (!titel.value.trim() || !datum.value) return (err.textContent = 'Bitte Titel und Datum eintragen.');
          ln.saveTermin(t?.id, { titel: titel.value.trim(), datum: datum.value, feld });
          sh.close();
          toast('Termin gespeichert');
          refresh();
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
  const mon = weekStart();
  const fk = ln.fokus(mon);
  const soon = upcoming.find((t) => ln.daysUntil(t.datum) < 14 && t.feld !== fk);

  const row = (t) => swipeLeft(
    h(`div.trow.u-${ln.urgency(t.datum)}`,
      h('div.tr-date', h('b', fromIso(t.datum).getDate()), h('span', MONTHS_SHORT[fromIso(t.datum).getMonth()])),
      h('div.tr-main', h('b', t.titel), h('span.small.muted.block', fieldTag(t.feld), ` ${dayLabel(t.datum)}`)),
      cdBadge(t.datum),
    ),
    {
      label: 'Löschen',
      onTap: () => terminSheet(refresh, t),
      onSwipe: () => {
        ln.deleteTermin(t.id);
        refresh();
        toast(`„${t.titel}“ gelöscht`, '', { label: 'Rückgängig', fn: () => { const { id, ...d } = t; ln.saveTermin(id, d); refresh(); } });
      },
    },
  );

  return [
    soon && h('section.card.fokus-hint',
      h('p', h('b', `${soon.titel} ${ln.countdown(soon.datum)}.`), ` ${ln.fieldName(soon.feld)} als Fokusfeld setzen?`),
      h('button.btn.primary.sm', { onclick: () => { ln.setFokus(mon, soon.feld); toast(`${ln.fieldName(soon.feld)} ist diese Woche dein Fokus`); refresh(); } }, 'Als Fokus setzen'),
    ),
    h('section.card',
      secTitle('calendar', 'Anstehend', h('button.link', { onclick: () => terminSheet(refresh) }, '+ Termin')),
      upcoming.length ? h('div.klist', upcoming.map(row)) : h('p.muted', 'Keine anstehenden Termine. Trag Abgaben und Prüfungen ein – oder importiere sie mit dem Lernplan.'),
      upcoming.length > 0 && h('p.small.muted', 'Antippen = bearbeiten · nach links wischen = löschen'),
    ),
    past.length > 0 && collapsible('past', false,
      h('button.kbox-head', h('span.sec-icon', icon('list', 18)), h('span.kbox-title', h('h2', `Vergangen (${past.length})`)), h('span.kbox-chev', icon('back', 18))),
      h('div.kbox-body', h('div.kbox-inner', h('div.klist', past.map(row)))),
      'section.card.kbox'),
  ];
}

// ---------- Reiter 3: Rückblick ----------

function reviewTab(refresh) {
  const units = ln.allUnits();
  const journalList = h('div.journal');
  const paintJournal = () => {
    const q = journalQuery.trim().toLowerCase();
    const list = units.filter((u) => u.notiz && (journalField === 'alle' || u.feld === journalField) && (!q || u.notiz.toLowerCase().includes(q)));
    journalList.replaceChildren(...(list.length
      ? list.map((u) => h('div.tl-item',
        h('span.tl-dot.lf-dot', icon('pen', 13)),
        h('div.tl-body',
          h('div.tl-top', fieldTag(u.feld), h('span.small.muted', `${dayLabel(u.date)}${u.dauer ? ` · ${u.dauer} Min` : ''}`)),
          h('p.tl-note', u.notiz),
        ),
      ))
      : [h('p.muted', q || journalField !== 'alle' ? 'Keine passenden Einträge.' : 'Noch keine Notizen. Nach „Heute gelernt“ kannst du einen Satz festhalten.')]));
  };
  paintJournal();
  const search = h('input.input', {
    type: 'search',
    placeholder: 'Suchen …',
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

  return [
    h('section.card',
      secTitle('chart', 'Wochenziele'),
      h('p.small.muted', 'Status deiner Ziele der letzten 8 Wochen.'),
      ln.FIELDS.map((f) => h('div.srow',
        h('span.sr-name', f.short),
        h('div.sr-dots', ln.statusHistory(f.id).map((x) => h(`span.sdot2.st-${x.status || 'none'}`, { title: `KW ${isoWeek(x.monday)}: ${x.ziel ? `${x.ziel} – ${ln.STATUS[x.status]}` : 'kein Ziel'}` }))),
      )),
      h('div.slegend', h('span', h('span.sdot2.st-erreicht'), 'erreicht'), h('span', h('span.sdot2.st-teilweise'), 'teilweise'), h('span', h('span.sdot2.st-nicht'), 'nicht erreicht'), h('span', h('span.sdot2.st-offen'), 'offen')),
    ),
    h('section.card',
      secTitle('pen', 'Lernjournal', h('span.count', units.filter((u) => u.notiz).length)),
      search,
      chips,
      journalList,
    ),
  ];
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
    const ziel = h('input.input', { value: existing?.ziel || '', placeholder: 'Neues Ziel' });
    const fertig = h('input.input', { value: existing?.fertig_wenn || '', placeholder: 'Fertig, wenn … (Pflicht)' });
    const einheiten = h('input.input.days', { inputmode: 'numeric', value: existing?.einheiten ?? old?.einheiten ?? 3 });
    const schritte = h('textarea.input', { rows: 3, placeholder: 'Teilschritte, einer pro Zeile (optional)', value: (existing?.schritte || []).map((s) => s.text).join('\n') });
    d.read = () => ({ ziel: ziel.value.trim(), fertig_wenn: fertig.value.trim(), einheiten: Math.max(0, parseInt(einheiten.value, 10) || 0), schritte: schritte.value.split('\n').map((t) => t.trim()).filter(Boolean).map((text) => ({ text, done: false })) });
    const form = h('div.form.rv-form', ziel, fertig, h('div.daysrow', h('span.small.muted', 'Einheiten pro Woche'), einheiten), schritte);
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

  return h('div.view.a-leistung.contact-view',
    h('a.backlink', { href: '#/leistung/woche' }, icon('back', 18), 'Leistung'),
    h('header.hero', h('p.eyebrow', `Wochen-Review · KW ${isoWeek(mon)} → KW ${isoWeek(next)}`), h('h1', 'Lernziele')),
    h('p.muted.rv-intro', 'Bewerte kurz jedes Ziel und entscheide: übernehmen, neu setzen oder streichen. Jedes neue Ziel braucht ein klares „Fertig, wenn …“.'),
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
