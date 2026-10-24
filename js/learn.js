// Daten für den Bereich Leistung (Lernen).
//
// Schlüssel im Speicher:
//   lfield:<montag>:<feld>   Wochenziel {ziel, fertig_wenn, einheiten, schritte:[{text, done}], status}
//   lfokus:<montag>          Fokusfeld der Woche
//   lunit:<datum>:<id>       Lerneinheit {feld, dauer (Min, optional), notiz}
//   ltermin:<id>             Termin {titel, datum, feld}
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
  store.set(`ltermin:${id || uid()}`, data);
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
  return Array.from({ length: weeks }, (_, i) => {
    const m = addDays(cur, -7 * (weeks - 1 - i));
    const g = goal(m, f);
    return { monday: m, status: g ? g.status : null, ziel: g?.ziel };
  });
}

// ---------- Fokus-Timer ----------
// Läuft über Zeitstempel – überlebt Neuladen und Hintergrund. Nach Ablauf wird
// beim nächsten Blick in die App automatisch eine Einheit eingetragen.

const TIMER_KEY = 'life4.timer';

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
    .map((t) => ({ titel: String(t.titel || '').trim(), datum: String(t.datum || ''), feld: normField(t.feld) || 'uni' }))
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
- "termine" ist optional: Abgaben, Prüfungen, Lernziele mit "titel", "datum" (JJJJ-MM-TT), "feld".
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
    { "titel": "Klausur Personalwirtschaft", "datum": "2026-11-12", "feld": "uni" }
  ]
}
\`\`\``;
