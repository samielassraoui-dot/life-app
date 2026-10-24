// Daten für den Bereich Contact.
//
// Schlüssel im Speicher:
//   person:<id>          {name, ring 1–4, rhythm (Tage, 0 = ohne), birthday 'MM-TT' oder 'JJJJ-MM-TT', notes}
//   clog:<id>:<datum>    Kontakt an diesem Tag (letzter Kontakt = neuestes Datum)
//   gemeldet:<id>        Haken „Ich habe mich gemeldet“
//   treffen:<id>         Haken „Treffen geplant“
//   ring:<1–4>           eigener Name des Rings

import * as store from './store.js';
import { iso, fromIso, addDays, uid } from './ui.js';

export const RING_DEFAULTS = { 1: 'Innerer Kreis', 2: 'Enge Freunde', 3: 'Freunde', 4: 'Bekannte & Netzwerk' };

export const RHYTHMS = [
  { days: 7, name: 'wöchentlich' },
  { days: 14, name: 'alle 2 Wochen' },
  { days: 30, name: 'monatlich' },
  { days: 90, name: 'alle 3 Monate' },
  { days: 0, name: 'ohne festen Rhythmus' },
];

export const rhythmName = (d) => (RHYTHMS.find((r) => r.days === d) || RHYTHMS[4]).name;

export const ringName = (n) => store.get(`ring:${n}`, RING_DEFAULTS[n]);
export const setRingName = (n, name) => store.set(`ring:${n}`, name || RING_DEFAULTS[n]);

// ---------- Personen ----------

export function people() {
  return store.list('person:')
    .map(({ key, v }) => ({ id: key.slice(7), ...v }))
    .sort((a, b) => (a.ring || 4) - (b.ring || 4) || a.name.localeCompare(b.name, 'de'));
}

export function person(id) {
  const v = store.get(`person:${id}`);
  return v ? { id, ...v } : null;
}

export function savePerson(id, data) {
  const pid = id || uid();
  store.set(`person:${pid}`, data);
  return pid;
}

export function deletePerson(id) {
  store.del(`person:${id}`);
  for (const { key } of store.list(`clog:${id}:`)) store.del(key);
  store.del(`gemeldet:${id}`);
  store.del(`treffen:${id}`);
}

export const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// ---------- Kontakte ----------

export function contactDates(id) {
  return store.list(`clog:${id}:`).map(({ key }) => key.split(':')[2]).sort();
}

// Letzter Kontakt bis einschließlich „bis“ (Standard: heute).
export function lastContact(id, until = iso()) {
  const d = contactDates(id).filter((x) => x <= until);
  return d.length ? d[d.length - 1] : null;
}

export function toggleContact(id, date = iso()) {
  const k = `clog:${id}:${date}`;
  if (store.get(k)) store.del(k);
  else store.set(k, true);
}

export const hadContactOn = (id, date) => !!store.get(`clog:${id}:${date}`);

export const flag = (kind, id) => !!store.get(`${kind}:${id}`);

export function toggleFlag(kind, id) {
  if (flag(kind, id)) store.del(`${kind}:${id}`);
  else store.set(`${kind}:${id}`, true);
}

const daysBetween = (a, b) => Math.round((fromIso(b) - fromIso(a)) / 86400000);

// Status gegenüber dem Rhythmus: ok / bald / faellig (+ Tage seit Kontakt)
export function status(p, at = iso()) {
  const last = lastContact(p.id, at);
  const since = last ? daysBetween(last, at) : null;
  if (!p.rhythm) return { state: 'frei', since, last };
  if (since == null) return { state: 'faellig', since, last, over: null };
  const left = p.rhythm - since;
  if (left < 0) return { state: 'faellig', since, last, over: -left };
  if (left <= 3) return { state: 'bald', since, last, left };
  return { state: 'ok', since, last, left };
}

export function sinceText(since) {
  if (since == null) return 'noch kein Kontakt eingetragen';
  if (since === 0) return 'heute';
  if (since === 1) return 'gestern';
  if (since < 14) return `vor ${since} Tagen`;
  if (since < 60) return `vor ${Math.round(since / 7)} Wochen`;
  return `vor ${Math.round(since / 30)} Monaten`;
}

// ---------- Geburtstage ----------

// Eingabe „14.3.“, „14.03.1995“ oder „1995-03-14“ → 'MM-TT' bzw. 'JJJJ-MM-TT'
export function parseBirthday(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  m = t.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{4})?$/);
  if (!m) return null;
  const dd = String(+m[1]).padStart(2, '0');
  const mm = String(+m[2]).padStart(2, '0');
  if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return null;
  return m[3] ? `${m[3]}-${mm}-${dd}` : `${mm}-${dd}`;
}

export function birthdayText(b) {
  if (!b) return '';
  const parts = b.split('-');
  const [mm, dd] = parts.length === 3 ? parts.slice(1) : parts;
  return `${+dd}.${+mm}.${parts.length === 3 ? parts[0] : ''}`;
}

// Nächster Geburtstag: {date, inDays, age|null}
export function nextBirthday(b, from = new Date()) {
  if (!b) return null;
  const parts = b.split('-');
  const year = parts.length === 3 ? +parts[0] : null;
  const [mm, dd] = (parts.length === 3 ? parts.slice(1) : parts).map(Number);
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let d = new Date(today.getFullYear(), mm - 1, dd);
  if (d < today) d = new Date(today.getFullYear() + 1, mm - 1, dd);
  return { date: d, inDays: Math.round((d - today) / 86400000), age: year ? d.getFullYear() - year : null };
}

export function upcomingBirthdays(days = 30) {
  return people()
    .map((p) => ({ p, b: nextBirthday(p.birthday) }))
    .filter((x) => x.b && x.b.inDays <= days)
    .sort((a, b) => a.b.inDays - b.b.inDays);
}

// ---------- Woche ----------

export function weekParts(monday) {
  const end = iso(addDays(monday, 6));
  const at = end < iso() ? end : iso();
  const withRhythm = people().filter((p) => p.rhythm);
  const inRhythm = withRhythm.filter((p) => ['ok', 'bald'].includes(status(p, at).state)).length;
  return withRhythm.length ? [{ label: 'Im Rhythmus', done: inRhythm, total: withRhythm.length }] : [];
}

export function weekContacts(monday) {
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(monday, i)));
  return people().flatMap((p) => days.filter((d) => hadContactOn(p.id, d)).map((d) => ({ p, d })));
}

export { iso };
