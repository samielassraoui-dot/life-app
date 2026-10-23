// Daten und Berechnungen für den Bereich Körper.
//
// Schlüssel im Speicher (je ein Eintrag, damit der Sync fein zusammenführen kann):
//   settings.body.targets   Tagesziele {kcal, protein, kh, fett}
//   meals:<datum>           geplante Mahlzeiten des Tages (aus dem Wochenplan)
//   meal:<datum>:<nr>       'ja' (gegessen) oder 'nein' (nicht gegessen)
//   extra:<datum>:<id>      spontan gegessen {zeit, name, kcal, protein, kh, fett}
//   training:<datum>        [{art, details}]
//   tdone:<datum>:<nr>      Training erledigt
//   routine:<id>            {name, zeit}
//   rdone:<datum>:<id>      Routine erledigt
//   weight:<datum>          Morgengewicht in kg

import * as store from './store.js';
import { iso, fromIso, addDays, weekStart, uid } from './ui.js';

export const DEFAULT_TARGETS = { kcal: 2900, protein: 150, kh: 380, fett: 85 };

export const MACROS = [
  { id: 'kcal', name: 'Kalorien', unit: 'kcal' },
  { id: 'protein', name: 'Protein', unit: 'g' },
  { id: 'kh', name: 'Kohlenhydrate', short: 'KH', unit: 'g' },
  { id: 'fett', name: 'Fett', unit: 'g' },
];

export function targets() {
  return { ...DEFAULT_TARGETS, ...store.get('settings.body.targets', {}) };
}

export function setTargets(t) {
  store.set('settings.body.targets', t);
}

// ---------- Mahlzeiten ----------

export function meals(date) {
  return store.get(`meals:${date}`, []);
}

export function mealStatus(date, i) {
  return store.get(`meal:${date}:${i}`, null);
}

export function setMealStatus(date, i, s) {
  if (s) store.set(`meal:${date}:${i}`, s);
  else store.del(`meal:${date}:${i}`);
}

export function extras(date) {
  return store.list(`extra:${date}:`)
    .map(({ key, v }) => ({ key, ...v }))
    .sort((a, b) => (a.zeit || '').localeCompare(b.zeit || ''));
}

export function addExtra(date, e) {
  store.set(`extra:${date}:${uid()}`, e);
}

export function deleteExtra(key) {
  store.del(key);
}

const zero = () => ({ kcal: 0, protein: 0, kh: 0, fett: 0 });

function add(sum, m) {
  for (const k of Object.keys(sum)) sum[k] += Number(m[k]) || 0;
}

// eaten: gegessen + spontan; planned: alle geplanten + spontan
export function totals(date) {
  const eaten = zero();
  const planned = zero();
  meals(date).forEach((m, i) => {
    add(planned, m);
    if (mealStatus(date, i) === 'ja') add(eaten, m);
  });
  for (const e of extras(date)) {
    add(eaten, e);
    add(planned, e);
  }
  return { eaten, planned };
}

// Nächste offene Mahlzeit des Tages (für Startseite).
export function nextMeal(date) {
  const list = meals(date);
  for (let i = 0; i < list.length; i++) if (!mealStatus(date, i)) return { ...list[i], i };
  return null;
}

// ---------- Training ----------

export const TRAINING_TYPES = [
  { id: 'studio', name: 'Studio' },
  { id: 'spinning', name: 'Spinning' },
  { id: 'sauna', name: 'Sauna' },
  { id: 'infrarot', name: 'Infrarot' },
  { id: 'ruhetag', name: 'Ruhetag' },
];

export function trainingName(art) {
  const t = TRAINING_TYPES.find((x) => x.id === normArt(art));
  return t ? t.name : art;
}

export function normArt(art) {
  const a = String(art || '').toLowerCase().trim();
  if (a.startsWith('studio') || a.includes('gym') || a.includes('kraft')) return 'studio';
  if (a.startsWith('spinning') || a.includes('rad') || a.includes('cycling')) return 'spinning';
  if (a.includes('infrarot')) return 'infrarot';
  if (a.includes('sauna')) return 'sauna';
  if (a.includes('ruhe') || a.includes('pause') || a.includes('rest')) return 'ruhetag';
  return a || 'studio';
}

export function training(date) {
  return store.get(`training:${date}`, []);
}

export function setTraining(date, list) {
  if (list.length) store.set(`training:${date}`, list);
  else store.del(`training:${date}`);
}

export function trainingDone(date, i) {
  return !!store.get(`tdone:${date}:${i}`);
}

export function toggleTraining(date, i) {
  if (trainingDone(date, i)) store.del(`tdone:${date}:${i}`);
  else store.set(`tdone:${date}:${i}`, true);
}

// ---------- Routinen ----------

const DEFAULT_ROUTINES = [
  { id: 'skin-morgens', name: 'Skin Care morgens', zeit: '07:30' },
  { id: 'vitamine', name: 'Vitamine', zeit: '08:00' },
  { id: 'kreatin', name: 'Kreatin', zeit: '08:00' },
  { id: 'proteinshake', name: 'Proteinshake', zeit: '16:00' },
  { id: 'wasser', name: 'Wasser: 3 Liter geschafft', zeit: '21:00' },
  { id: 'skin-abends', name: 'Skin Care abends', zeit: '22:00' },
];

export function seedDefaults() {
  for (const r of DEFAULT_ROUTINES) store.setDefault(`routine:${r.id}`, { name: r.name, zeit: r.zeit });
}

export function routines() {
  return store.list('routine:')
    .map(({ key, v }) => ({ id: key.slice(8), ...v }))
    .sort((a, b) => (a.zeit || '99').localeCompare(b.zeit || '99') || a.name.localeCompare(b.name));
}

export function saveRoutine(id, r) {
  store.set(`routine:${id || uid()}`, r);
}

export function deleteRoutine(id) {
  store.del(`routine:${id}`);
}

export function routineDone(date, id) {
  return !!store.get(`rdone:${date}:${id}`);
}

export function toggleRoutine(date, id) {
  if (routineDone(date, id)) store.del(`rdone:${date}:${id}`);
  else store.set(`rdone:${date}:${id}`, true);
}

// ---------- Gewicht ----------

export function weight(date) {
  return store.get(`weight:${date}`, null);
}

export function setWeight(date, kg) {
  if (kg) store.set(`weight:${date}`, kg);
  else store.del(`weight:${date}`);
}

export function weights() {
  return store.list('weight:')
    .map(({ key, v }) => ({ date: key.slice(7), v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function weekAvg(monday) {
  const vals = [];
  for (let i = 0; i < 7; i++) {
    const w = weight(iso(addDays(monday, i)));
    if (w) vals.push(w);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// ---------- Fortschritt ----------

// Erledigt / geplant an einem Tag: Mahlzeiten, Routinen, Training (ohne Ruhetag).
export function dayScore(date) {
  let done = 0;
  let total = 0;
  meals(date).forEach((m, i) => {
    total++;
    if (mealStatus(date, i) === 'ja') done++;
  });
  for (const r of routines()) {
    total++;
    if (routineDone(date, r.id)) done++;
  }
  training(date).forEach((t, i) => {
    if (normArt(t.art) === 'ruhetag') return;
    total++;
    if (trainingDone(date, i)) done++;
  });
  return { done, total };
}

// Woche von Montag bis heute (bzw. Sonntag bei vergangenen Wochen), in Prozent.
export function weekScore(ref = new Date()) {
  const mon = weekStart(ref);
  const today = iso();
  let done = 0;
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = iso(addDays(mon, i));
    if (d > today) break;
    const s = dayScore(d);
    done += s.done;
    total += s.total;
  }
  return total ? Math.round((done / total) * 100) : 0;
}

// ---------- Wochenplan-Import ----------

const DAYS = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];

// "Mo", "Mo-Mi", "Do,Sa", "Montag", "alle" → [0, 1, 2, …]
function dayIndexes(key) {
  const k = String(key).toLowerCase().replace(/\s/g, '');
  if (['alle', 'täglich', 'taeglich', 'jedentag', 'mo-so'].includes(k)) return [0, 1, 2, 3, 4, 5, 6];
  const out = [];
  for (const part of k.split(/[,+&]|und/)) {
    const [a, b] = part.split(/[-–]|bis/).map((s) => DAYS.indexOf(s.slice(0, 2)));
    if (a < 0) continue;
    if (b === undefined || b < 0) out.push(a);
    else for (let i = a; i <= b; i++) out.push(i);
  }
  return out;
}

const num = (v) => Math.round(Number(String(v ?? '').replace(',', '.').replace(/[^\d.]/g, '')) || 0);

function normMeal(m) {
  return {
    zeit: String(m.zeit || m.uhrzeit || '').slice(0, 5),
    name: String(m.name || m.gericht || m.mahlzeit || 'Mahlzeit'),
    menge: String(m.menge || ''),
    kcal: num(m.kcal ?? m.kalorien),
    protein: num(m.protein ?? m.eiweiss),
    kh: num(m.kh ?? m.kohlenhydrate ?? m.carbs),
    fett: num(m.fett ?? m.fat),
  };
}

function normTraining(v) {
  const list = Array.isArray(v) ? v : [v];
  return list.filter(Boolean).map((t) => (typeof t === 'string'
    ? { art: normArt(t), details: '' }
    : { art: normArt(t.art || t.typ || t.name), details: String(t.details || t.inhalt || t.beschreibung || '') }));
}

// Liest den eingefügten Text (darf drumherum Text oder ```json enthalten).
export function parsePlan(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e < s) throw new Error('Kein Plan gefunden. Bitte den ganzen Code-Block einfügen.');
  let j;
  try {
    j = JSON.parse(text.slice(s, e + 1).replace(/[“”„]/g, '"'));
  } catch {
    throw new Error('Der Plan ist nicht vollständig oder fehlerhaft. Bitte den Code-Block nochmal komplett kopieren.');
  }
  const tage = j.tage || j.days;
  if (!tage || typeof tage !== 'object') throw new Error('Im Plan fehlt der Abschnitt "tage".');

  const typText = String(j.typ || '').toLowerCase();
  const firstVal = Object.values(tage)[0];
  const looksTraining = typText.includes('train')
    || (!typText && firstVal && !Array.isArray(firstVal) && typeof firstVal === 'object')
    || (!typText && Array.isArray(firstVal) && firstVal[0] && 'art' in firstVal[0]);
  const typ = looksTraining ? 'training' : 'essen';

  let monday;
  if (/^\d{4}-\d{2}-\d{2}$/.test(j.woche_ab || '')) monday = weekStart(fromIso(j.woche_ab));
  else {
    const now = new Date();
    monday = now.getDay() === 0 ? addDays(weekStart(now), 7) : weekStart(now);
  }

  const days = new Array(7).fill(undefined);
  for (const [key, val] of Object.entries(tage)) {
    const idx = dayIndexes(key);
    if (!idx.length) throw new Error(`Unbekannter Tag „${key}“. Erlaubt: Mo, Di, Mi, Do, Fr, Sa, So (auch Mo-Mi).`);
    const items = typ === 'essen'
      ? (Array.isArray(val) ? val : [val]).filter(Boolean).map(normMeal).sort((a, b) => a.zeit.localeCompare(b.zeit))
      : normTraining(val);
    for (const i of idx) days[i] = items;
  }
  if (days.every((d) => d === undefined)) throw new Error('Der Plan enthält keine Tage.');
  return { typ, monday, days };
}

export function applyPlan(plan) {
  plan.days.forEach((items, i) => {
    if (items === undefined) return;
    const d = iso(addDays(plan.monday, i));
    if (plan.typ === 'essen') store.set(`meals:${d}`, items);
    else setTraining(d, items);
  });
}

// ---------- Vorlagen für den Claude-Chat ----------

export const TEMPLATE_MEALS = `Bitte gib mir meinen Essensplan für die kommende Woche zusätzlich als JSON-Code-Block, damit ich ihn in meine App importieren kann.

Regeln:
- "woche_ab" ist der Montag der Woche im Format JJJJ-MM-TT.
- Tage: "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So". Tage mit gleichem Meal Prep darfst du zusammenfassen, z. B. "Mo-Mi" oder "Do,Sa".
- Pro Mahlzeit: zeit (HH:MM), name, menge, kcal, protein, kh, fett (Gramm, ganze Zahlen).
- Shakes und Snacks auch als eigene Mahlzeit.
- Keine Kommentare im Code-Block.

\`\`\`json
{
  "typ": "essensplan",
  "woche_ab": "2026-10-26",
  "tage": {
    "Mo-Mi": [
      { "zeit": "07:30", "name": "Overnight Oats mit Whey", "menge": "1 Box (400 g)", "kcal": 620, "protein": 42, "kh": 78, "fett": 14 },
      { "zeit": "12:30", "name": "Hähnchen, Reis, Brokkoli", "menge": "1 Box (550 g)", "kcal": 780, "protein": 55, "kh": 95, "fett": 18 }
    ],
    "Do-So": [
      { "zeit": "07:30", "name": "Rührei mit Vollkornbrot", "menge": "4 Eier, 2 Scheiben", "kcal": 590, "protein": 36, "kh": 45, "fett": 28 }
    ]
  }
}
\`\`\``;

export const TEMPLATE_TRAINING = `Bitte gib mir meinen Trainingsplan für die kommende Woche zusätzlich als JSON-Code-Block, damit ich ihn in meine App importieren kann.

Regeln:
- "woche_ab" ist der Montag der Woche im Format JJJJ-MM-TT.
- Tage: "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So" (zusammenfassen erlaubt, z. B. "Sa,So").
- "art" ist genau eins von: Studio, Spinning, Sauna, Infrarot, Ruhetag.
- "details" ist eine kurze Beschreibung (z. B. Muskelgruppen, Dauer).
- Mehrere Einheiten an einem Tag als Liste.
- Keine Kommentare im Code-Block.

\`\`\`json
{
  "typ": "trainingsplan",
  "woche_ab": "2026-10-26",
  "tage": {
    "Mo": [ { "art": "Studio", "details": "Push: Brust, Schultern, Trizeps" }, { "art": "Sauna", "details": "2 Gänge" } ],
    "Di": [ { "art": "Spinning", "details": "45 Min" } ],
    "Mi": [ { "art": "Ruhetag", "details": "" } ]
  }
}
\`\`\``;
