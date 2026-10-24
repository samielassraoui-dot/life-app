// Daten für den Bereich Contact.
//
// Schlüssel im Speicher:
//   person:<id>          {name, ring 0–4 (0 = Partner), art treffen|telefonat|date, prio hoch|normal|warte, rhythm (Tage, 0 = ohne), birthday 'MM-TT' oder 'JJJJ-MM-TT', notes}
//   clog:<id>:<datum>    Kontakt an diesem Tag (letzter Kontakt = neuestes Datum)
//   gemeldet:<id>        Haken „Ich habe mich gemeldet“
//   treffen:<id>         Haken „Treffen geplant“
//   ring:<1–4>           eigener Name des Rings

import * as store from './store.js';
import { iso, fromIso, addDays, uid } from './ui.js';

export const RING_DEFAULTS = { 0: 'Partner', 1: 'Innerer Kreis', 2: 'Enge Freunde', 3: 'Freunde', 4: 'Bekannte & Netzwerk' };
export const ringOf = (p) => p.ring ?? 4;

// Was zählt bei dieser Person als Kontakt? Bestimmt die Beschriftung der Knöpfe.
export const KINDS = {
  treffen: { name: 'Treffen', done: 'Getroffen', plan: 'Treffen geplant', past: 'Getroffen', icon: 'users' },
  telefonat: { name: 'Telefonat', done: 'Telefoniert', plan: 'Telefonat geplant', past: 'Telefoniert', icon: 'phone' },
  date: { name: 'Date Night', done: 'Date Night', plan: 'Date geplant', past: 'Date Night', icon: 'heart' },
};
export const kind = (p) => KINDS[p.art] || KINDS.treffen;

export const RHYTHMS = [
  { days: 7, name: 'wöchentlich' },
  { days: 14, name: 'alle 2 Wochen' },
  { days: 30, name: 'monatlich' },
  { days: 90, name: 'alle 3 Monate' },
  { days: 0, name: 'ohne festen Rhythmus' },
];

export function rhythmName(d) {
  const r = RHYTHMS.find((x) => x.days === d);
  return r ? r.name : `alle ${d} Tage`;
}

// Vorschlag beim Anlegen – pro Person jederzeit änderbar.
export const RING_RHYTHM = { 0: 7, 1: 7, 2: 14, 3: 30, 4: 90 };

export const PRIOS = [
  { id: 'hoch', name: 'Hoch', hint: 'immer in „Diese Woche“' },
  { id: 'normal', name: 'Normal', hint: 'erscheint, wenn fällig' },
  { id: 'warte', name: 'Warteliste', hint: 'taucht erst auf, wenn du hochstufst' },
];
export const prio = (p) => p.prio || 'normal';
export const prioName = (id) => (PRIOS.find((x) => x.id === id) || PRIOS[1]).name;

export const ringName = (n) => store.get(`ring:${n}`, RING_DEFAULTS[n]);
export const setRingName = (n, name) => store.set(`ring:${n}`, name || RING_DEFAULTS[n]);

// ---------- Personen ----------

export function people() {
  return store.list('person:')
    .map(({ key, v }) => ({ id: key.slice(7), ...v }))
    .sort((a, b) => ringOf(a) - ringOf(b) || a.name.localeCompare(b.name, 'de'));
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

// z. B. „Telefoniert vor 3 Tagen“ / „Noch kein Kontakt eingetragen“
export function lastText(p, since = status(p).since) {
  return since == null ? 'Noch kein Kontakt eingetragen' : `${kind(p).past} ${sinceText(since)}`;
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

// ---------- Wochenplan ----------

// Wer ist in dieser Woche „dran“? Hoch: immer. Normal: wenn bis Sonntag fällig
// (oder noch nie Kontakt). Warteliste: nie. Erledigt = Kontakt in dieser Woche.
export function weekPlan(monday) {
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(monday, i)));
  const before = iso(addDays(monday, -1));
  const sunday = days[6];
  const today = iso();
  const items = [];
  const extra = [];
  for (const p of people()) {
    const contactDay = days.find((d) => hadContactOn(p.id, d));
    const last = lastContact(p.id, before);
    const due = p.rhythm && last ? iso(addDays(fromIso(last), p.rhythm)) : null;
    const pr = prio(p);
    const planned = pr === 'hoch' || (pr === 'normal' && p.rhythm && (!last || due <= sunday));
    if (!planned) {
      if (contactDay) extra.push({ p, state: 'erledigt', day: contactDay });
      continue;
    }
    let state = 'dran';
    if (contactDay) state = 'erledigt';
    else if (p.rhythm && (!last || due < (today < sunday ? today : sunday))) state = 'ueberfaellig';
    items.push({ p, state, due, last, day: contactDay });
  }
  const order = { ueberfaellig: 0, dran: 1, erledigt: 2 };
  items.sort((a, b) => order[a.state] - order[b.state] || (a.due || '').localeCompare(b.due || '') || a.p.name.localeCompare(b.p.name, 'de'));
  return { items, extra, total: items.length, done: items.filter((x) => x.state === 'erledigt').length };
}

// ---------- Rückblick ----------

export function ringStats() {
  const all = people();
  return [0, 1, 2, 3, 4].filter((n) => n > 0 || all.some((p) => ringOf(p) === 0)).map((n) => {
    const list = all.filter((p) => ringOf(p) === n && p.rhythm);
    const ok = list.filter((p) => ['ok', 'bald'].includes(status(p).state)).length;
    return { n, ok, total: list.length };
  });
}

export function longestWithout(limit = 8) {
  return people()
    .map((p) => ({ p, since: status(p).since }))
    .sort((a, b) => (b.since ?? 1e9) - (a.since ?? 1e9))
    .slice(0, limit);
}

// Alle Kontakte (neueste zuerst) ab einem Datum.
export function contactLog(from) {
  const names = Object.fromEntries(people().map((p) => [p.id, p]));
  return store.list('clog:')
    .map(({ key }) => {
      const [, id, d] = key.split(':');
      return { p: names[id], d };
    })
    .filter((x) => x.p && x.d >= from)
    .sort((a, b) => b.d.localeCompare(a.d));
}

// ---------- Woche (Review, Export) ----------

export function weekParts(monday) {
  const plan = weekPlan(monday);
  return plan.total ? [{ label: 'Kontakte im Plan', done: plan.done, total: plan.total }] : [];
}

export function weekContacts(monday) {
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(monday, i)));
  return people().flatMap((p) => days.filter((d) => hadContactOn(p.id, d)).map((d) => ({ p, d })));
}

export { iso };
