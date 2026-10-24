// Daten für den Bereich Contact.
//
// Schlüssel im Speicher:
//   person:<id>          {name, ring 0–4 (0 = Partner), art (Standardkontakt), prio hoch|normal|warte,
//                         rhythm (Tage, 0 = ohne), birthday 'MM-TT' oder 'JJJJ-MM-TT', notes}
//   clog:<id>:<datum>    Kontakt an diesem Tag: {art, note} (ältere Einträge: true)
//   cplan:<id>           geplanter Kontakt {date, time?, art, note}
//   ring:<0–4>           eigener Name des Rings

import * as store from './store.js';
import { iso, fromIso, addDays, uid } from './ui.js';

export const RING_DEFAULTS = { 0: 'Partner', 1: 'Innerer Kreis', 2: 'Enge Freunde', 3: 'Freunde', 4: 'Bekannte & Netzwerk' };
export const ringOf = (p) => p.ring ?? 4;

// Kontaktarten. Ältere Werte (treffen, telefonat) werden übersetzt.
export const KINDS = {
  telefoniert: { name: 'Telefoniert', icon: 'phone' },
  getroffen: { name: 'Getroffen', icon: 'users' },
  geschrieben: { name: 'Geschrieben', icon: 'chat' },
  date: { name: 'Date Night', icon: 'heart' },
};
const LEGACY = { treffen: 'getroffen', telefonat: 'telefoniert' };
export const normKind = (a) => (KINDS[a] ? a : LEGACY[a] || 'getroffen');
// Standardkontakt einer Person (für „Wischen nach rechts“)
export const defaultKind = (p) => normKind(p.art || (ringOf(p) === 0 ? 'date' : 'getroffen'));
export const kindName = (a) => KINDS[normKind(a)].name;
// Für Geplantes: „Treffen“ statt „Getroffen“
const PLAN_NAMES = { telefoniert: 'Telefonat', getroffen: 'Treffen', geschrieben: 'Nachricht', date: 'Date Night' };
export const planName = (a) => PLAN_NAMES[normKind(a)];

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
export const rhythmShort = (d) => (d ? (d === 7 ? 'wöchentlich' : `alle ${d} Tage`) : 'ohne Rhythmus');

// Vorschlag beim Anlegen – pro Person jederzeit änderbar.
export const RING_RHYTHM = { 0: 7, 1: 7, 2: 14, 3: 30, 4: 90 };

export const PRIOS = [
  { id: 'hoch', name: 'Hoch', hint: 'erscheint jede Woche unter „Fällig“, bis ihr Kontakt hattet' },
  { id: 'normal', name: 'Normal', hint: 'erscheint, wenn der Kontakt fällig wird' },
  { id: 'warte', name: 'Warteliste', hint: 'taucht in „Diese Woche“ nicht auf' },
];
export const prio = (p) => p.prio || 'normal';

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
  store.del(`cplan:${id}`);
}

export const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// ---------- Kontakte ----------

// Alle Kontakte einer Person, älteste zuerst: [{date, art, note}]
// Ältere Einträge (ohne Kontaktart) zählen als Standardkontakt der Person.
const entryKind = (v, p) => (v?.art ? normKind(v.art) : p ? defaultKind(p) : 'getroffen');

export function contacts(id) {
  const p = person(id);
  return store.list(`clog:${id}:`)
    .map(({ key, v }) => ({ date: key.split(':')[2], art: entryKind(v, p), note: v?.note || '' }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const contactDates = (id) => contacts(id).map((c) => c.date);

// Letzter Kontakt bis einschließlich „bis“ (Standard: heute).
export function lastContact(id, until = iso()) {
  const d = contactDates(id).filter((x) => x <= until);
  return d.length ? d[d.length - 1] : null;
}

export const hadContactOn = (id, date) => !!store.get(`clog:${id}:${date}`);

// Kontakt eintragen. Ein geplanter Kontakt bis zu diesem Datum gilt damit als erledigt.
export function logContact(id, { date = iso(), art, note = '' } = {}) {
  store.set(`clog:${id}:${date}`, { art: normKind(art), note });
  const pl = plan(id);
  if (pl && pl.date <= date) store.del(`cplan:${id}`);
}

export const removeContact = (id, date) => store.del(`clog:${id}:${date}`);

export const plan = (id) => store.get(`cplan:${id}`, null);
export const setPlan = (id, data) => store.set(`cplan:${id}`, { ...data, art: normKind(data.art) });
export const clearPlan = (id) => store.del(`cplan:${id}`);

const daysBetween = (a, b) => Math.round((fromIso(b) - fromIso(a)) / 86400000);

// ---------- Status (zentral) ----------
//
// im_rhythmus  – alles gut (grün)
// bald_faellig – ab 80 % des Intervalls (gelb)
// ueberfaellig – Intervall überschritten oder noch nie Kontakt (rot)
// geplant      – zukünftiger Kontakt geplant; zählt nicht als überfällig (blau)
export const STATES = {
  im_rhythmus: 'Im Rhythmus',
  bald_faellig: 'Bald fällig',
  ueberfaellig: 'Überfällig',
  geplant: 'Geplant',
};

export function status(p, at = iso()) {
  const last = lastContact(p.id, at);
  const since = last ? daysBetween(last, at) : null;
  const pl = plan(p.id);
  const base = { since, last, plan: pl && pl.date >= at ? pl : null };
  if (base.plan) return { ...base, state: 'geplant' };
  if (!p.rhythm) return { ...base, state: 'im_rhythmus' };
  if (since == null || since > p.rhythm) return { ...base, state: 'ueberfaellig' };
  if (since >= p.rhythm * 0.8) return { ...base, state: 'bald_faellig' };
  return { ...base, state: 'im_rhythmus' };
}

// „vor 3 Tagen · alle 14 Tage“
export function lineText(p, s = status(p)) {
  const when = s.since == null ? 'noch kein Kontakt' : sinceText(s.since);
  return `${when} · ${rhythmShort(p.rhythm)}`;
}

export function sinceText(since) {
  if (since == null) return 'noch kein Kontakt';
  if (since === 0) return 'heute';
  if (since === 1) return 'gestern';
  return `vor ${since} Tagen`;
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

// ---------- Diese Woche ----------

// Fällig: überfällig oder bald fällig (Prio „Hoch“: immer, solange diese Woche kein Kontakt war).
// Geplant: zukünftiger Kontakt geplant. Erledigt: Kontakt in dieser Woche. Warteliste: nie fällig.
export function thisWeek(monday) {
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(monday, i)));
  const due = [];
  const planned = [];
  const done = [];
  for (const p of people()) {
    const s = status(p);
    const day = [...days].reverse().find((d) => hadContactOn(p.id, d));
    if (day) done.push({ p, s, day });
    if (s.state === 'geplant') planned.push({ p, s });
    else if (prio(p) !== 'warte' && !day && (s.state === 'ueberfaellig' || s.state === 'bald_faellig' || prio(p) === 'hoch')) due.push({ p, s });
  }
  const rank = { ueberfaellig: 0, bald_faellig: 1, im_rhythmus: 2 };
  due.sort((a, b) => rank[a.s.state] - rank[b.s.state] || (b.s.since ?? 1e9) - (a.s.since ?? 1e9));
  planned.sort((a, b) => a.s.plan.date.localeCompare(b.s.plan.date));
  done.sort((a, b) => b.day.localeCompare(a.day));
  return { due, planned, done };
}

// Für Rückblick und Wochenauswertung: Wer war in einer (vergangenen) Woche „dran“
// und wer davon hatte Kontakt? Berechnet aus dem Stand zu Wochenbeginn.
export function weekPlan(monday) {
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(monday, i)));
  const before = iso(addDays(monday, -1));
  const sunday = days[6];
  let total = 0;
  let done = 0;
  for (const p of people()) {
    if (prio(p) === 'warte') continue;
    const last = lastContact(p.id, before);
    const due = p.rhythm && last ? iso(addDays(fromIso(last), p.rhythm)) : null;
    const contact = days.some((d) => hadContactOn(p.id, d));
    const inPlan = prio(p) === 'hoch' || (p.rhythm && (!last || due <= sunday));
    if (!inPlan) continue;
    total++;
    if (contact) done++;
  }
  return { total, done };
}

// ---------- Rückblick ----------

export function ringStats() {
  const all = people();
  return [0, 1, 2, 3, 4].filter((n) => n > 0 || all.some((p) => ringOf(p) === 0)).map((n) => {
    const list = all.filter((p) => ringOf(p) === n && p.rhythm);
    const ok = list.filter((p) => status(p).state !== 'ueberfaellig').length;
    return { n, ok, total: list.length };
  });
}

// „Melde dich mal wieder“: nur wer laut eigenem Rhythmus überfällig ist (auch Warteliste),
// am stärksten überfällig zuerst. Geplante Kontakte zählen nicht.
export function reachOut() {
  return people()
    .filter((p) => p.rhythm)
    .map((p) => ({ p, s: status(p) }))
    .filter((x) => x.s.state === 'ueberfaellig')
    .map((x) => ({ ...x, ratio: x.s.since == null ? 1e9 : x.s.since / x.p.rhythm }))
    .sort((a, b) => b.ratio - a.ratio || a.p.name.localeCompare(b.p.name, 'de'));
}

// Alle Kontakte (neueste zuerst) ab einem Datum: [{p, date, art, note}]
export function contactLog(from = '0000') {
  const names = Object.fromEntries(people().map((p) => [p.id, p]));
  return store.list('clog:')
    .map(({ key, v }) => {
      const [, id, date] = key.split(':');
      return { p: names[id], date, art: entryKind(v, names[id]), note: v?.note || '' };
    })
    .filter((x) => x.p && x.date >= from)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function firstContactDate() {
  const log = contactLog();
  return log.length ? log[log.length - 1].date : null;
}

// ---------- Woche (Review, Export) ----------

export function weekParts(monday) {
  const wp = weekPlan(monday);
  return wp.total ? [{ label: 'Kontakte im Plan', done: wp.done, total: wp.total }] : [];
}

export function weekContacts(monday) {
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(monday, i)));
  return people().flatMap((p) => days.filter((d) => hadContactOn(p.id, d)).map((d) => ({ p, d })));
}

export { iso };

// ---------- Kalender (Apple Kalender & Co.) ----------

// Erstellt eine .ics-Datei aus geplanten Kontakten: [{p, plan}]
// Mit Uhrzeit: 1 Stunde, Erinnerung 30 Min vorher. Ohne: ganztägig, Erinnerung um 9 Uhr.
export function plansIcs(items) {
  const esc = (t) => String(t).replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//4 Bereiche//Life App//DE', 'CALSCALE:GREGORIAN'];
  for (const { p, plan: pl } of items) {
    const title = `${planName(pl.art)} mit ${p.name}`;
    const d = pl.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:plan-${p.id}-${pl.date}@life4`, `DTSTAMP:${stamp}`);
    if (pl.time) {
      const [hh, mm] = pl.time.split(':').map(Number);
      const end = new Date(fromIso(pl.date).setHours(hh + 1, mm));
      lines.push(`DTSTART:${d}T${p2(hh)}${p2(mm)}00`,
        `DTEND:${end.getFullYear()}${p2(end.getMonth() + 1)}${p2(end.getDate())}T${p2(end.getHours())}${p2(end.getMinutes())}00`);
    } else {
      const next = iso(addDays(fromIso(pl.date), 1)).replace(/-/g, '');
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`);
    }
    lines.push(`SUMMARY:${esc(title)}`);
    if (pl.note) lines.push(`DESCRIPTION:${esc(pl.note)}`);
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, `TRIGGER:${pl.time ? '-PT30M' : 'PT9H'}`, 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
