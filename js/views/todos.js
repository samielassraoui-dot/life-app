// Bereich Todos: Kopfkarte, Schnelleingabe, Gruppen nach Fälligkeit, Bearbeiten-Sheet.
import * as td from '../todos.js';
import { h, icon, toast, iso, addDays, fmtShort, fromIso, sheet, swipeRow } from '../ui.js';

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];

let draft = { due: null, kat: 'privat', prio: 'normal' };
let entering = null;   // zuletzt verschobenes Todo – bekommt eine Einblend-Animation

// ---------- Aufklappen (Zustand gemerkt) ----------

const OPEN_KEY = 'life4.todosOpen';
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
export function collapsible(id, auto, head, content, cls) {
  const open = openMap()[id] ?? auto;
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

// ---------- Zeile ----------

const katTag = (k) => h(`span.tkat.k-${k}`, td.katName(k));

export function todoRow(t, refresh) {
  const today = iso();
  const late = !t.done && t.due && t.due < today;
  const circle = h(`button.st-ic.td-check${t.done ? '.done' : ''}`, { 'aria-label': t.done ? 'Wieder öffnen' : 'Erledigt' }, t.done ? icon('check', 16) : null);
  const inner = h(`div.td-row${t.done ? '.is-done' : ''}${entering === t.id ? '.enter-row' : ''}`,
    circle,
    h('div.td-main',
      h('div.td-title', t.prio === 'hoch' && !t.done && h('span.td-prio', { 'aria-label': 'Hohe Priorität' }), h('span', t.titel)),
      h('div.td-meta',
        katTag(t.kat),
        t.due && h(`span.td-due${late ? '.late' : ''}`, td.dueLabel(t.due)),
        t.wdh && h('span.td-rep', { 'aria-label': 'Wiederholt sich' }, icon('sync', 12)),
        t.notiz && h('span.td-note', icon('pen', 12)),
      ),
    ),
  );
  return swipeRow(inner, {
    onTap: (e) => {
      if (e.target.closest('.td-check')) {
        // Erledigt: Zeile blendet animiert aus, das Todo bleibt gespeichert, wird aber nicht mehr angezeigt
        const row = inner.closest('.sw2-row') || inner;
        row.classList.add('leave-down');
        setTimeout(() => {
          td.complete(t.id);
          refresh();
          toast('Erledigt', '', {
            label: 'Rückgängig',
            fn: () => {
              td.reopen(t.id);
              entering = t.id;
              refresh();
            },
          });
        }, 240);
        return;
      }
      editSheet(t, refresh);
    },
    left: t.done ? null : {
      label: 'Morgen',
      fn: () => {
        const before = t.due;
        td.toTomorrow(t.id);
        refresh();
        toast('Auf morgen verschoben', '', { label: 'Rückgängig', fn: () => { td.save(t.id, { ...td.get(t.id), due: before }); refresh(); } });
      },
    },
    right: {
      label: 'Löschen',
      fn: () => {
        const copy = td.get(t.id);
        td.remove(t.id);
        refresh();
        toast(`„${t.titel}“ gelöscht`, '', { label: 'Rückgängig', fn: () => { td.save(t.id, copy); refresh(); } });
      },
    },
  });
}

// ---------- Ansicht ----------

export function render(refresh) {
  const view = h('div.view.a-todos.td-view',
    hero(),
    quickAdd(refresh),
    groupsView(refresh),
  );
  entering = null;
  return view;
}

function hero() {
  const s = td.todayStats();
  const r = 30;
  const c = 2 * Math.PI * r;
  const pct = s.total ? s.done / s.total : 0;
  return h('section.td-hero',
    h('div.td-ring',
      h('span', { html: `<svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="${r}" class="t"/>${pct > 0 ? `<circle cx="36" cy="36" r="${r}" class="v" stroke-dasharray="${c * pct} ${c}" transform="rotate(-90 36 36)"/>` : ''}</svg>` }),
      h('div.td-ring-text', h('b', `${s.done}/${s.total}`), h('span', 'heute erledigt')),
    ),
    h('div.td-nums',
      h(`div.td-num${s.ueberfaellig ? '.alert' : ''}`, h('b', s.ueberfaellig), h('span', 'überfällig')),
      h('div.td-num', h('b', s.heute), h('span', 'heute')),
      h('div.td-num', h('b', s.woche), h('span', 'diese Woche')),
    ),
  );
}

function chip(label, on, onclick, extra) {
  return h(`button.chip.sm${on ? '.on' : ''}`, { onclick, type: 'button' }, label, extra || null);
}

function quickAdd(refresh) {
  const input = h('input.input.td-input', { 'aria-label': 'Neues Todo', placeholder: 'Neues Todo', enterkeyhint: 'done' });
  const opts = h('div.td-opts');
  const tomorrow = iso(addDays(new Date(), 1));
  const today = iso();

  const paint = () => {
    const custom = draft.due && draft.due !== today && draft.due !== tomorrow;
    const date = h('input.td-date', {
      type: 'date',
      value: custom ? draft.due : '',
      'aria-label': 'Datum',
      onchange: (e) => {
        draft.due = e.target.value || null;
        paint();
      },
    });
    opts.replaceChildren(
      h('div.chips.td-chips',
        chip('Heute', draft.due === today, () => { draft.due = draft.due === today ? null : today; paint(); }),
        chip('Morgen', draft.due === tomorrow, () => { draft.due = draft.due === tomorrow ? null : tomorrow; paint(); }),
        h(`label.chip.sm.td-datechip${custom ? '.on' : ''}`, custom ? fmtShort(fromIso(draft.due)) : 'Datum', date),
        h('span.td-sep'),
        chip('Hoch', draft.prio === 'hoch', () => { draft.prio = draft.prio === 'hoch' ? 'normal' : 'hoch'; paint(); }),
      ),
      h('div.chips.td-chips', td.KATS.map((k) => chip(k.name, draft.kat === k.id, () => { draft.kat = k.id; paint(); }))),
    );
  };
  paint();

  const addIt = () => {
    const titel = input.value.trim();
    if (!titel) return;
    td.add({ titel, ...draft });
    draft = { due: null, kat: 'privat', prio: 'normal' };
    refresh();
    setTimeout(() => document.querySelector('.td-input')?.focus(), 30);
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && addIt());
  input.addEventListener('focus', () => card.classList.add('focus'));

  const card = h('section.card.td-quick',
    h('div.td-addrow', input, h('button.td-add', { 'aria-label': 'Hinzufügen', onclick: addIt }, icon('plus', 22))),
    opts,
  );
  return card;
}

const GROUPS = [
  { id: 'ueberfaellig', name: 'Überfällig', ic: 'bell' },
  { id: 'heute', name: 'Heute', ic: 'sun' },
  { id: 'woche', name: 'Diese Woche', ic: 'calendar' },
  { id: 'spaeter', name: 'Später', ic: 'list' },
  { id: 'ohne', name: 'Ohne Datum', ic: 'pen' },
];

function groupsView(refresh) {
  const g = td.groups();
  const total = GROUPS.reduce((s, gr) => s + g[gr.id].length, 0);
  // Nur offene Todos; leere Gruppen werden komplett ausgeblendet
  if (!total) return h('p.muted.center.td-empty', 'Keine Todos');
  return [
    GROUPS.map((gr) => {
      const list = g[gr.id];
      if (!list.length) return null;
      const head = h('button.kbox-head',
        h('span.sec-icon', icon(gr.ic, 18)),
        h('span.kbox-title', h('h2', gr.name)),
        h('span.count', list.length),
        h('span.kbox-chev', icon('back', 18)),
      );
      return collapsible(`g-${gr.id}`, true, head,
        h('div.kbox-body', h('div.kbox-inner', h('div.td-list', list.map((t) => todoRow(t, refresh))))),
        `section.card.kbox.td-group.tg-${gr.id}`);
    }),
  ];
}

// ---------- Bearbeiten ----------

export function editSheet(t, refresh) {
  const today = iso();
  const tomorrow = iso(addDays(new Date(), 1));
  let { due, kat, prio } = t;
  let wdh = t.wdh ? { ...t.wdh } : null;
  const titel = h('input.input', { value: t.titel });
  const notiz = h('textarea.input', { rows: 3, value: t.notiz || '' });
  const dueBox = h('div.chips');
  const katBox = h('div.chips');
  const prioBox = h('div.segs');
  const wdhBox = h('div.segs.wrap');
  const wdhDetail = h('div');

  const paint = () => {
    const custom = due && due !== today && due !== tomorrow;
    dueBox.replaceChildren(
      chip('Heute', due === today, () => { due = today; paint(); }),
      chip('Morgen', due === tomorrow, () => { due = tomorrow; paint(); }),
      h(`label.chip.sm.td-datechip${custom ? '.on' : ''}`, custom ? fmtShort(fromIso(due)) : 'Datum',
        h('input.td-date', { type: 'date', value: due || '', 'aria-label': 'Datum', onchange: (e) => { due = e.target.value || null; paint(); } })),
      chip('Ohne', !due, () => { due = null; paint(); }),
    );
    katBox.replaceChildren(...td.KATS.map((k) => chip(k.name, kat === k.id, () => { kat = k.id; paint(); })));
    prioBox.replaceChildren(...[['normal', 'Normal'], ['hoch', 'Hoch']].map(([id, label]) => h(`button.seg${prio === id ? '.on' : ''}`, { type: 'button', onclick: () => { prio = id; paint(); } }, label)));
    wdhBox.replaceChildren(...td.WDH.map((w) => h(`button.seg${(wdh?.typ || null) === w.id ? '.on' : ''}`, {
      type: 'button',
      onclick: () => {
        const base = due ? fromIso(due) : new Date();
        wdh = w.id ? { typ: w.id, tag: w.id === 'woechentlich' ? base.getDay() : w.id === 'monatlich' ? base.getDate() : null } : null;
        paint();
      },
    }, w.name)));
    if (wdh?.typ === 'woechentlich') {
      wdhDetail.replaceChildren(h('div.chips', WD_ORDER.map((d) => chip(WD[d], Number(wdh.tag) === d, () => { wdh.tag = d; paint(); }))));
    } else if (wdh?.typ === 'monatlich') {
      wdhDetail.replaceChildren(h('div.daysrow', h('span.small.muted', 'Tag'),
        h('input.input.days', { inputmode: 'numeric', value: wdh.tag || 1, 'aria-label': 'Tag im Monat', oninput: (e) => { wdh.tag = Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)); } })));
    } else wdhDetail.replaceChildren();
  };
  paint();

  const sh = sheet('Todo',
    h('label.field', h('span', 'Titel'), titel),
    h('div.field', h('span', 'Fälligkeit'), dueBox),
    h('div.field', h('span', 'Kategorie'), katBox),
    h('div.field', h('span', 'Priorität'), prioBox),
    h('div.field', h('span', 'Wiederholung'), wdhBox, wdhDetail),
    h('label.field', h('span', 'Notiz'), notiz),
    h('div.sheet-btns',
      h('button.btn.ghost', {
        onclick: () => {
          const copy = td.get(t.id);
          td.remove(t.id);
          sh.close();
          refresh();
          toast(`„${t.titel}“ gelöscht`, '', { label: 'Rückgängig', fn: () => { td.save(t.id, copy); refresh(); } });
        },
      }, 'Löschen'),
      h('button.btn.primary', {
        onclick: () => {
          if (!titel.value.trim()) return toast('Titel fehlt', 'error');
          let d = due;
          if (wdh && !d) d = td.firstDue(wdh);
          td.save(t.id, { ...td.get(t.id), titel: titel.value.trim(), due: d, kat, prio, wdh, notiz: notiz.value.trim() });
          sh.close();
          refresh();
        },
      }, 'Speichern'),
    ),
  );
}

// ---------- Box für den Überblick ----------

export function todayBox(refresh) {
  const g = td.groups();
  const list = [...g.ueberfaellig, ...g.heute].sort(td.sortOpen).slice(0, 5);
  const n = g.ueberfaellig.length + g.heute.length;
  const head = h('button.kbox-head',
    h('span.sec-icon', icon('todos', 18)),
    h('span.kbox-title', h('h2', 'Todos heute')),
    h('span.count', n),
    h('span.kbox-chev', icon('back', 18)),
  );
  const box = collapsible('g-overview', true, head,
    h('div.kbox-body', h('div.kbox-inner',
      list.length ? h('div.td-list', list.map((t) => todoRow(t, refresh))) : h('p.muted', 'Keine Todos'),
      h('a.link.td-all', { href: '#/todos' }, 'Alle Todos'),
    )),
    'section.card.kbox.a-todos.td-overview');
  entering = null;
  return box;
}
