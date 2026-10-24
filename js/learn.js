// Daten für den Bereich Leistung (Lernen).
//
// Schlüssel im Speicher:
//   lfield:<montag>:<feld>   Wochenziel {ziel, fertig_wenn, einheiten, schritte:[{text, done}], status}
//   lfokus:<montag>          Fokusfeld der Woche
//   lunit:<datum>:<id>       Lerneinheit {feld, dauer (Min, optional), notiz}
//   ltermin:<id>             Termin {titel, modul?, datum, feld, seit?}
// status: offen | erreicht | teilweise | nicht

import * as store from './store.js';
import { iso, fromIso, addDays, weekStart, uid } from './ui.js';

export const FIELDS = [
  { id: 'sap', name: 'SAP Customizing', short: 'SAP' },
  { id: 'payroll', name: 'Payroll', short: 'Payroll' },
  { id: 'uni', name: 'Uni', short: 'Uni' },
  { id: 'englisch', name: 'Englisch', short: 'Englisch' },
];
export const fieldName = (id) => (FIELDS.find((f) => f.id === id) || { name: id }).name;
export const fieldShort = (id) => (FIELDS.find((f) => f.id === id) || { short: id }).short;
export const FIELD_ICON = { sap: 'gear', payroll: 'calc', uni: 'gradcap', englisch: 'chat' };

// „SAP HCM Customizing“, „sap“, „Englisch“ … → Feld-ID
export function normField(s) {
  const a = String(s || '').toLowerCase();
  if (a.includes('sap') || a.includes('custom')) return 'sap';
  if (a.includes('payroll') || a.includes('lohn') || a.includes('abrechnung')) return 'payroll';
  if (a.includes('uni') || a.includes('studium') || a.includes('klausur')) return 'uni';
  if (a.includes('engl')) return 'englisch';
  return null;
}

export const STATUS = {
  offen: 'offen',
  erreicht: 'erreicht',
  teilweise: 'teilweise',
  nicht: 'nicht erreicht',
};

const mk = (monday) => iso(monday);

// ---------- Wochenziele ----------

export const goal = (monday, f) => store.get(`lfield:${mk(monday)}:${f}`, null);

export function setGoal(monday, f, data) {
  if (data) store.set(`lfield:${mk(monday)}:${f}`, { status: 'offen', schritte: [], einheiten: 0, ...data });
  else store.del(`lfield:${mk(monday)}:${f}`);
}

export function toggleStep(monday, f, i) {
  const g = goal(monday, f);
  if (!g) return;
  const schritte = g.schritte.map((s, j) => (j === i ? { ...s, done: !s.done } : s));
  store.set(`lfield:${mk(monday)}:${f}`, { ...g, schritte });
}

export function setStatus(monday, f, status) {
  const g = goal(monday, f);
  if (g) store.set(`lfield:${mk(monday)}:${f}`, { ...g, status });
}

export const fokus = (monday) => store.get(`lfokus:${mk(monday)}`, null);

export function setFokus(monday, f) {
  if (f) store.set(`lfokus:${mk(monday)}`, f);
  else store.del(`lfokus:${mk(monday)}`);
}

// ---------- Lerneinheiten ----------

export function allUnits() {
  return store.list('lunit:')
    .map(({ key, v }) => ({ key, date: key.split(':')[1], ...v }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key));
}

export function unitsOfWeek(monday, f = null) {
  const a = mk(monday);
  const b = iso(addDays(monday, 6));
  return allUnits().filter((u) => u.date >= a && u.date <= b && (!f || u.feld === f));
}

export function addUnit({ date = iso(), feld, dauer = null, notiz = '' }) {
  const key = `lunit:${date}:${uid()}`;
  store.set(key, { feld, ...(dauer ? { dauer } : {}), notiz });
  return key;
}

export function setNote(key, notiz) {
  const u = store.get(key);
  if (u) store.set(key, { ...u, notiz });
}

export const deleteUnit = (key) => store.del(key);

// ---------- Termine ----------

export function termine() {
  return store.list('ltermin:')
    .map(({ key, v }) => ({ id: key.slice(8), ...v }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

export function saveTermin(id, data) {
  const key = `ltermin:${id || uid()}`;
  store.set(key, { seit: iso(), ...data });
  return key.slice(8);
}

export const terminTitle = (t) => [t.titel, t.modul].filter(Boolean).join(' ');

// Lerneinheiten des Feldes seit dem Eintragen des Termins
export function unitsSince(feld, date) {
  return allUnits().filter((u) => u.feld === feld && u.date >= date).length;
}

// Termine als Kalender-Datei (ganztägig, Erinnerung 7 Tage und 1 Tag vorher um 9 Uhr)
export function termineIcs(list) {
  const esc = (t) => String(t).replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//4 Bereiche//Life App//DE', 'CALSCALE:GREGORIAN'];
  for (const t of list) {
    const title = terminTitle(t);
    const d = t.datum.replace(/-/g, '');
    const next = iso(addDays(fromIso(t.datum), 1)).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:termin-${t.id}@life4`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(`Lernfeld: ${fieldName(t.feld)}`)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'TRIGGER:-P6DT15H', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'TRIGGER:-PT15H', 'END:VALARM',
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export const deleteTermin = (id) => store.del(`ltermin:${id}`);

export const daysUntil = (date) => Math.round((fromIso(date) - fromIso(iso())) / 86400000);

export function countdown(date) {
  const d = daysUntil(date);
  if (d < 0) return `vor ${-d} ${d === -1 ? 'Tag' : 'Tagen'}`;
  if (d === 0) return 'heute';
  if (d === 1) return 'morgen';
  return `in ${d} Tagen`;
}

// grau > 30 Tage, gelb < 14, rot < 7, dazwischen ruhig
export function urgency(date) {
  const d = daysUntil(date);
  if (d < 0) return 'past';
  if (d < 7) return 'red';
  if (d < 14) return 'yellow';
  if (d > 30) return 'grey';
  return 'calm';
}

export function nextTermin(f) {
  const today = iso();
  return termine().find((t) => t.datum >= today && (!f || t.feld === f)) || null;
}

// ---------- Woche ----------

// Einheiten und Teilschritte – Grundlage für die automatische Zielerreichung.
export function weekParts(monday) {
  let planned = 0;
  let done = 0;
  let steps = 0;
  let stepsDone = 0;
  for (const f of FIELDS) {
    const g = goal(monday, f.id);
    const n = unitsOfWeek(monday, f.id).length;
    if (g?.einheiten) {
      planned += g.einheiten;
      done += Math.min(n, g.einheiten);
    }
    for (const s of g?.schritte || []) {
      steps++;
      if (s.done) stepsDone++;
    }
  }
  const parts = [];
  if (planned) parts.push({ label: 'Lerneinheiten', done, total: planned });
  if (steps) parts.push({ label: 'Teilschritte', done: stepsDone, total: steps });
  return parts;
}

// Ist das Wochenziel erfüllt? (Einheiten geschafft und alle Teilschritte abgehakt)
export function fulfilled(monday, f) {
  const g = goal(monday, f);
  if (!g) return true;
  return unitsOfWeek(monday, f).length >= (g.einheiten || 0) && g.schritte.every((s) => s.done);
}

// Reihenfolge für „Heute dran“: Fokusfeld, solange sein Ziel offen ist –
// sonst das Feld mit dem größten Rückstand gemessen an der verstrichenen Woche.
export function todayOrder(monday, now = new Date()) {
  const elapsed = (Math.floor((now - monday) / 86400000) + 1) / 7;
  const fk = fokus(monday);
  const open = FIELDS.filter((f) => goal(monday, f.id) && !fulfilled(monday, f.id))
    .map((f) => {
      const g = goal(monday, f.id);
      const lag = (g.einheiten || 0) * Math.min(1, elapsed) - unitsOfWeek(monday, f.id).length;
      return { id: f.id, lag: f.id === fk ? Infinity : lag };
    })
    .sort((a, b) => b.lag - a.lag);
  return open.map((x) => x.id);
}

// Erste Woche, in der es überhaupt Lernziele gab
export function firstGoalWeek() {
  const keys = store.list('lfield:').map(({ key }) => key.split(':')[1]).sort();
  return keys.length ? fromIso(keys[0]) : null;
}

// Vorschlag für den Status beim Review
export function suggestStatus(monday, f) {
  const g = goal(monday, f);
  if (!g) return null;
  const n = unitsOfWeek(monday, f).length;
  const stepsOk = !g.schritte.length || g.schritte.every((s) => s.done);
  if (n >= (g.einheiten || 0) && stepsOk) return 'erreicht';
  if (n > 0 || g.schritte.some((s) => s.done)) return 'teilweise';
  return 'nicht';
}

// Statusreihe der letzten Wochen (älteste zuerst)
export function statusHistory(f, weeks = 8) {
  const cur = weekStart();
  const first = firstGoalWeek();
  if (!first) return [];
  weeks = Math.min(weeks, Math.round((cur - weekStart(first)) / (7 * 86400000)) + 1);
  return Array.from({ length: Math.max(0, weeks) }, (_, i) => {
    const m = addDays(cur, -7 * (weeks - 1 - i));
    const g = goal(m, f);
    return { monday: m, status: g ? g.status : null, ziel: g?.ziel };
  });
}

// ---------- Fokus-Timer ----------
// Läuft über Zeitstempel – überlebt Neuladen und Hintergrund. Nach Ablauf wird
// beim nächsten Blick in die App automatisch eine Einheit eingetragen.

const TIMER_KEY = 'life4.timer';
const TIMER_MIN_KEY = 'life4.timerMin';

// Zuletzt gewählte Dauer (Standard 25 Minuten)
export function timerMinutes() {
  try {
    return Number(localStorage.getItem(TIMER_MIN_KEY)) || 25;
  } catch {
    return 25;
  }
}

export function setTimerMinutes(min) {
  try {
    localStorage.setItem(TIMER_MIN_KEY, String(min));
  } catch { /* egal */ }
}

// Laufenden Timer verlängern (oder kürzen)
export function extendTimer(delta) {
  const t = timer();
  if (!t) return;
  const min = Math.max(1, t.min + delta);
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify({ ...t, min }));
  } catch { /* egal */ }
}

export function timer() {
  try {
    return JSON.parse(localStorage.getItem(TIMER_KEY)) || null;
  } catch {
    return null;
  }
}

export function startTimer(feld, min) {
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify({ feld, min, start: Date.now() }));
  } catch { /* egal */ }
}

export function stopTimer() {
  try {
    localStorage.removeItem(TIMER_KEY);
  } catch { /* egal */ }
}

// Ist der Timer abgelaufen? Dann Einheit eintragen und deren Schlüssel zurückgeben.
export function finishTimerIfDue() {
  const t = timer();
  if (!t || Date.now() < t.start + t.min * 60000) return null;
  stopTimer();
  return { key: addUnit({ date: iso(new Date(t.start)), feld: t.feld, dauer: t.min }), feld: t.feld, min: t.min };
}

// ---------- Import ----------

export function isLernplan(text) {
  return /"typ"\s*:\s*"lernplan"/i.test(text);
}

export function parseLernplan(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  let j;
  try {
    j = JSON.parse(text.slice(s, e + 1).replace(/[“”„]/g, '"'));
  } catch {
    throw new Error('Der Lernplan ist nicht vollständig oder fehlerhaft. Bitte den Code-Block nochmal komplett kopieren.');
  }
  let monday;
  if (/^\d{4}-\d{2}-\d{2}$/.test(j.woche_ab || '')) monday = weekStart(fromIso(j.woche_ab));
  else {
    const now = new Date();
    monday = now.getDay() === 0 ? addDays(weekStart(now), 7) : weekStart(now);
  }
  const felder = {};
  for (const [k, v] of Object.entries(j.felder || {})) {
    const f = normField(k);
    if (!f || !v) continue;
    if (!String(v.fertig_wenn || '').trim()) throw new Error(`Bei „${fieldName(f)}“ fehlt „fertig_wenn“ – das ist Pflicht.`);
    felder[f] = {
      ziel: String(v.ziel || '').trim(),
      fertig_wenn: String(v.fertig_wenn).trim(),
      einheiten: Math.max(0, Math.round(Number(v.einheiten_pro_woche ?? v.einheiten ?? 0))) || 0,
      schritte: (v.schritte || []).map((x) => ({ text: String(typeof x === 'string' ? x : x.text || ''), done: false })).filter((x) => x.text),
      status: 'offen',
    };
  }
  const termine = (j.termine || [])
    .map((t) => ({ titel: String(t.titel || '').trim(), ...(t.modul ? { modul: String(t.modul).trim() } : {}), datum: String(t.datum || ''), feld: normField(t.feld) || 'uni' }))
    .filter((t) => t.titel && /^\d{4}-\d{2}-\d{2}$/.test(t.datum));
  if (!Object.keys(felder).length && !termine.length) throw new Error('Der Lernplan enthält keine Felder und keine Termine.');
  return { typ: 'lernplan', monday, felder, fokus: normField(j.fokus), termine };
}

export function applyLernplan(plan) {
  for (const [f, g] of Object.entries(plan.felder)) setGoal(plan.monday, f, g);
  if (plan.fokus) setFokus(plan.monday, plan.fokus);
  const known = termine();
  for (const t of plan.termine) {
    if (!known.some((k) => k.titel === t.titel && k.datum === t.datum)) saveTermin(null, t);
  }
}

export const TEMPLATE_LERNPLAN = `Bitte gib mir meinen Lernplan für die kommende Woche zusätzlich als JSON-Code-Block, damit ich ihn in meine App importieren kann.

Regeln:
- "typ" ist immer "lernplan", "woche_ab" ist der Montag der Woche (JJJJ-MM-TT).
- Felder: "sap" (SAP Customizing), "payroll", "uni", "englisch". Nicht jedes Feld muss vorkommen.
- Pro Feld: "ziel" (ein Satz), "fertig_wenn" (Pflicht: woran ich erkenne, dass es geschafft ist), "einheiten_pro_woche" (Zahl), "schritte" (kurze Liste).
- "fokus" ist optional: das wichtigste Feld der Woche.
- "termine" ist optional: Abgaben, Prüfungen, Lernziele mit "titel", "modul" (optional), "datum" (JJJJ-MM-TT), "feld".
- Keine Kommentare im Code-Block.

\`\`\`json
{
  "typ": "lernplan",
  "woche_ab": "2026-10-26",
  "fokus": "uni",
  "felder": {
    "sap": {
      "ziel": "Zeitwirtschaft-Customizing verstehen",
      "fertig_wenn": "Ich kann die Schritte für eine neue Zeitart erklären",
      "einheiten_pro_woche": 2,
      "schritte": ["Tabellen V_T554S ansehen", "Testfall im Sandbox-System"]
    },
    "uni": {
      "ziel": "Kapitel 4 für die Klausur wiederholen",
      "fertig_wenn": "Alle Übungsaufgaben zu Kapitel 4 gelöst",
      "einheiten_pro_woche": 4,
      "schritte": ["Skript lesen", "Übungsblatt 4", "Karteikarten"]
    }
  },
  "termine": [
    { "titel": "Klausur", "modul": "Personalwirtschaft", "datum": "2026-11-12", "feld": "uni" }
  ]
}
\`\`\``;
