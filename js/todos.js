// Daten für den Bereich Todos.
//
// Schlüssel im Speicher:
//   todo:<id>   {titel, due (JJJJ-MM-TT | null), kat, prio ('hoch' | 'normal'), notiz,
//                wdh ({typ: 'taeglich' | 'woechentlich' | 'monatlich', tag} | null),
//                done (JJJJ-MM-TT | null), next (ID der Folge-Instanz), created}

import * as store from './store.js';
import { iso, fromIso, addDays, weekStart, uid } from './ui.js';

export const KATS = [
  { id: 'arbeit', name: 'Arbeit' },
  { id: 'uni', name: 'Uni' },
  { id: 'privat', name: 'Privat' },
  { id: 'koerper', name: 'Körper' },
  { id: 'sinn', name: 'Sinn' },
  { id: 'leistung', name: 'Leistung' },
  { id: 'contact', name: 'Contact' },
];
export const katName = (id) => (KATS.find((k) => k.id === id) || { name: 'Privat' }).name;

export const WDH = [
  { id: null, name: 'Nie' },
  { id: 'taeglich', name: 'Täglich' },
  { id: 'woechentlich', name: 'Wöchentlich' },
  { id: 'monatlich', name: 'Monatlich' },
];

export function all() {
  return store.list('todo:').map(({ key, v }) => ({ id: key.slice(5), ...v }));
}

export const get = (id) => {
  const v = store.get(`todo:${id}`);
  return v ? { id, ...v } : null;
};

export function save(id, data) {
  const key = id || uid();
  const { id: _drop, ...rest } = data;
  store.set(`todo:${key}`, rest);
  return key;
}

export function add({ titel, due = null, kat = 'privat', prio = 'normal', notiz = '', wdh = null }) {
  return save(null, { titel, due, kat, prio, notiz, wdh, done: null, created: Date.now() });
}

export const remove = (id) => store.del(`todo:${id}`);

// Nächster Termin einer Wiederholung nach dem Datum `from`
export function nextDue(wdh, from) {
  const base = fromIso(from);
  if (wdh.typ === 'taeglich') return iso(addDays(base, 1));
  if (wdh.typ === 'woechentlich') {
    const wd = Number(wdh.tag ?? base.getDay());
    let d = addDays(base, 1);
    while (d.getDay() !== wd) d = addDays(d, 1);
    return iso(d);
  }
  // monatlich: gewünschter Tag im Folgemonat (bei kurzen Monaten der letzte Tag)
  const tag = Number(wdh.tag || base.getDate());
  const y = base.getFullYear();
  const m = base.getMonth() + 1;
  const last = new Date(y, m + 1, 0).getDate();
  return iso(new Date(y, m, Math.min(tag, last)));
}

// Erster Termin einer neuen Wiederholung ab heute (heute zählt mit)
export function firstDue(wdh, today = iso()) {
  return nextDue(wdh, iso(addDays(fromIso(today), -1)));
}

// Erledigen – bei Wiederholung wird die nächste Instanz angelegt
export function complete(id) {
  const t = get(id);
  if (!t || t.done) return;
  let next = null;
  if (t.wdh) {
    const from = t.due && t.due > iso() ? t.due : iso();
    next = add({ titel: t.titel, due: nextDue(t.wdh, from), kat: t.kat, prio: t.prio, notiz: t.notiz, wdh: t.wdh });
  }
  save(id, { ...t, done: iso(), doneAt: Date.now(), next });
}

// Rückgängig – die automatisch angelegte Folge-Instanz verschwindet wieder, solange sie offen ist
export function reopen(id) {
  const t = get(id);
  if (!t) return;
  if (t.next) {
    const n = get(t.next);
    if (n && !n.done) remove(t.next);
  }
  save(id, { ...t, done: null, doneAt: null, next: null });
}

export function toTomorrow(id) {
  const t = get(id);
  if (t) save(id, { ...t, due: iso(addDays(new Date(), 1)) });
}

// ---------- Gruppen ----------

const PRIO = { hoch: 0, normal: 1 };
export const sortOpen = (a, b) => (PRIO[a.prio] ?? 1) - (PRIO[b.prio] ?? 1)
  || (a.due || '9999').localeCompare(b.due || '9999')
  || (a.created || 0) - (b.created || 0);

export function groups(now = new Date()) {
  const today = iso(now);
  const sunday = iso(addDays(weekStart(now), 6));
  const limit = iso(addDays(now, -13));
  const g = { ueberfaellig: [], heute: [], woche: [], spaeter: [], ohne: [], erledigt: [] };
  for (const t of all()) {
    if (t.done) {
      if (t.done >= limit) g.erledigt.push(t);
    } else if (!t.due) g.ohne.push(t);
    else if (t.due < today) g.ueberfaellig.push(t);
    else if (t.due === today) g.heute.push(t);
    else if (t.due <= sunday) g.woche.push(t);
    else g.spaeter.push(t);
  }
  for (const k of Object.keys(g)) if (k !== 'erledigt') g[k].sort(sortOpen);
  g.erledigt.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  return g;
}

// Kopfzahlen: heute erledigt / heute fällig (inkl. überfällig)
export function todayStats(now = new Date()) {
  const today = iso(now);
  const g = groups(now);
  const doneToday = all().filter((t) => t.done === today).length;
  return {
    done: doneToday,
    total: doneToday + g.ueberfaellig.length + g.heute.length,
    ueberfaellig: g.ueberfaellig.length,
    heute: g.heute.length,
    woche: g.woche.length,
  };
}

export function dueLabel(due, now = new Date()) {
  if (!due) return '';
  const today = iso(now);
  const diff = Math.round((fromIso(due) - fromIso(today)) / 86400000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  if (diff < 0) return `seit ${-diff} Tagen`;
  const d = fromIso(due);
  const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()];
  return diff < 7 ? `${wd}` : `${wd} ${d.getDate()}.${d.getMonth() + 1}.`;
}
