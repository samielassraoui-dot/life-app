// Daten für den Bereich Reflexion & Sinn.
//
// Schlüssel im Speicher:
//   meditation:<datum>        true = meditiert
//   affirmation:<id>          {text}
//   affday:<datum>            id der Affirmation, falls heute eine andere gewählt wurde
//   affread:<datum>           true = gelesen
//   jq:<id>                   Journal-Frage {text, o}
//   journal:<datum>:<frage>   Antwort (Text)
//   mood:<datum>              Stimmung 1–5
//   energy:<datum>            Energie 1–5

import * as store from './store.js';
import { iso, fromIso, addDays, uid, pastDays } from './ui.js';

// ---------- Meditation ----------

export const meditated = (date) => !!store.get(`meditation:${date}`);

export function toggleMeditation(date) {
  if (meditated(date)) store.del(`meditation:${date}`);
  else store.set(`meditation:${date}`, true);
}

// ---------- Affirmationen ----------

const DEFAULT_AFFIRMATIONS = [
  ['genug', 'Ich bin genug, so wie ich bin.'],
  ['vertrauen', 'Ich vertraue mir und meinem Weg.'],
  ['zeit', 'Ich darf mir Zeit lassen. Ruhe ist auch Fortschritt.'],
  ['schritte', 'Jeder kleine Schritt zählt.'],
  ['respekt', 'Ich behandle mich mit demselben Respekt, den ich anderen schenke.'],
  ['wachsen', 'Ich wachse an dem, was mich herausfordert.'],
  ['klar', 'Ich bin ruhig, klar und bei mir.'],
  ['wert', 'Mein Wert hängt nicht von Leistung ab.'],
];

const DEFAULT_QUESTIONS = [
  ['dankbar', 'Wofür bin ich heute dankbar?'],
  ['stolz', 'Worauf bin ich heute stolz?'],
  ['beschaeftigt', 'Was beschäftigt mich?'],
];

export function seedDefaults() {
  for (const [id, text] of DEFAULT_AFFIRMATIONS) store.setDefault(`affirmation:${id}`, { text });
  DEFAULT_QUESTIONS.forEach(([id, text], o) => store.setDefault(`jq:${id}`, { text, o }));
}

// Nach „Alle Daten löschen“: Standard-Affirmationen und -Fragen frisch anlegen
export function restoreDefaults() {
  for (const [id, text] of DEFAULT_AFFIRMATIONS) store.set(`affirmation:${id}`, { text });
  DEFAULT_QUESTIONS.forEach(([id, text], o) => store.set(`jq:${id}`, { text, o }));
}

export function affirmations() {
  return store.list('affirmation:')
    .map(({ key, v }) => ({ id: key.slice(12), ...v }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function addAffirmation(text) {
  store.set(`affirmation:${uid()}`, { text });
}

export function deleteAffirmation(id) {
  store.del(`affirmation:${id}`);
}

// Affirmation des Tages: fest pro Datum (wechselt täglich der Reihe nach),
// außer man hat für heute bewusst eine andere gewählt.
export function affirmationOf(date) {
  const list = affirmations();
  if (!list.length) return null;
  const chosen = store.get(`affday:${date}`);
  const hit = chosen && list.find((a) => a.id === chosen);
  if (hit) return hit;
  const dayNr = Math.floor(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86400000);
  return list[dayNr % list.length];
}

export function nextAffirmation(date) {
  const list = affirmations();
  if (list.length < 2) return;
  const cur = affirmationOf(date);
  const i = list.findIndex((a) => a.id === cur.id);
  store.set(`affday:${date}`, list[(i + 1) % list.length].id);
}

export const affirmationRead = (date) => !!store.get(`affread:${date}`);

export function toggleAffirmationRead(date) {
  if (affirmationRead(date)) store.del(`affread:${date}`);
  else store.set(`affread:${date}`, true);
}

// ---------- Journal ----------

export function questions() {
  return store.list('jq:')
    .map(({ key, v }) => ({ id: key.slice(3), ...v }))
    .sort((a, b) => (a.o || 0) - (b.o || 0));
}

export function addQuestion(text) {
  const list = questions();
  store.set(`jq:${uid()}`, { text, o: list.length ? (list[list.length - 1].o || 0) + 1 : 0 });
}

export function deleteQuestion(id) {
  store.del(`jq:${id}`);
}

export const answer = (date, qid) => store.get(`journal:${date}:${qid}`, '');

export function setAnswer(date, qid, text) {
  if (text) store.set(`journal:${date}:${qid}`, text);
  else store.del(`journal:${date}:${qid}`);
}

export const journaled = (date) => store.list(`journal:${date}:`).length > 0;

// ---------- Stimmung & Energie ----------

export const mood = (date) => store.get(`mood:${date}`, null);
export const energy = (date) => store.get(`energy:${date}`, null);

export function setMood(date, v) {
  if (v) store.set(`mood:${date}`, v);
  else store.del(`mood:${date}`);
}

export function setEnergy(date, v) {
  if (v) store.set(`energy:${date}`, v);
  else store.del(`energy:${date}`);
}

function avg(vals) {
  const v = vals.filter((x) => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

// ---------- Woche ----------

// Erledigt / Tage – Grundlage für die automatische Zielerreichung.
export function weekParts(monday) {
  const days = pastDays(monday);
  const count = (fn) => ({ done: days.filter(fn).length, total: days.length });
  return [
    { label: 'Meditation', ...count(meditated) },
    { label: 'Affirmation', ...count(affirmationRead) },
    { label: 'Journal', ...count(journaled) },
    { label: 'Stimmung', ...count((d) => mood(d) != null || energy(d) != null) },
  ];
}

export function weekSummary(monday) {
  const all = Array.from({ length: 7 }, (_, i) => iso(addDays(monday, i)));
  return {
    parts: weekParts(monday),
    mood: avg(all.map(mood)),
    energy: avg(all.map(energy)),
    moodPrev: avg(all.map((d) => mood(iso(addDays(fromIso(d), -7))))),
    energyPrev: avg(all.map((d) => energy(iso(addDays(fromIso(d), -7))))),
  };
}
