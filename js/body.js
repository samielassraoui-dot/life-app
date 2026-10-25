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
//   rskip:<datum>:<id>      Routine ausgelassen
//   tskip:<datum>:<nr>      Training ausgelassen
//   weight:<datum>          Morgengewicht in kg
//   water:<datum>           getrunkene Menge in ml
//   settings.body.water     {goal: Liter, glass: Liter}
//   measure:<datum>         Umfänge in cm {taille, brust, arme}
//   shop:<montag>           Einkaufsliste aus dem Essensplan {items:[{key, artikel, menge, einheit, kategorie}], dishes:[{name, portionen, zutaten}]}
//   shopx:<montag>:<key>    Artikel der Einkaufsliste abgehakt
//   shopm:<montag>:<id>     eigener Artikel {artikel, menge, einheit, kategorie, done}

import * as store from './store.js';
import { iso, fromIso, addDays, weekStart, uid, pastDays } from './ui.js';

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

// ---------- Kategorien ----------

export const CATEGORIES = [
  { id: 'fruehstueck', name: 'Frühstück' },
  { id: 'mittag', name: 'Mittagessen' },
  { id: 'snack', name: 'Snack' },
  { id: 'training', name: 'Vor dem Training' },
  { id: 'abend', name: 'Abendessen' },
];
export const catName = (id) => (CATEGORIES.find((c) => c.id === id) || { name: 'Snack' }).name;

function normCat(k) {
  const a = String(k || '').toLowerCase();
  if (!a) return '';
  if (a.includes('früh') || a.includes('frueh') || a.includes('breakfast')) return 'fruehstueck';
  if (a.includes('mittag') || a.includes('lunch')) return 'mittag';
  if (a.includes('abend') || a.includes('dinner')) return 'abend';
  if (a.includes('training') || a.includes('workout') || a.startsWith('pre')) return 'training';
  return 'snack';
}

// Kategorie einer Mahlzeit – fehlt sie im Plan, wird sie aus der Uhrzeit geschätzt.
export function category(m) {
  if (m.kategorie) return m.kategorie;
  const t = m.zeit || '';
  if (!t) return 'snack';
  if (t < '10:30') return 'fruehstueck';
  if (t >= '11:30' && t < '14:30') return 'mittag';
  if (t >= '18:00') return 'abend';
  return 'snack';
}

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

// Plausibilität: weichen die kcal mehr als 15 % von P*4 + KH*4 + F*9 ab?
// Ohne Makroangaben wird nicht geprüft.
export function kcalMismatch(m) {
  const p = Number(m.protein) || 0;
  const k = Number(m.kh) || 0;
  const f = Number(m.fett) || 0;
  const kcal = Number(m.kcal) || 0;
  if (!p && !k && !f) return false;
  const calc = p * 4 + k * 4 + f * 9;
  if (!kcal) return calc > 0;
  return Math.abs(kcal - calc) / kcal > 0.15;
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

// Bekannte Arten bekommen eine feste ID; alles andere (z. B. „Schwimmen“) bleibt wie geschrieben.
export function normArt(art) {
  const raw = String(art || '').trim();
  const a = raw.toLowerCase();
  if (a.startsWith('studio') || a === 'gym' || a.startsWith('kraft')) return 'studio';
  if (a.startsWith('spinning') || a.startsWith('indoor cycling')) return 'spinning';
  if (a.includes('infrarot')) return 'infrarot';
  if (a.startsWith('sauna')) return 'sauna';
  if (a.startsWith('ruhe') || a === 'pause' || a === 'rest') return 'ruhetag';
  return raw || 'studio';
}

export function trainingName(art) {
  const id = normArt(art);
  const t = TRAINING_TYPES.find((x) => x.id === id);
  return t ? t.name : id.charAt(0).toUpperCase() + id.slice(1);
}

// Auswahl für „Training hinzufügen“: Standardarten + eigene, die schon mal vorkamen.
export function trainingChoices() {
  const custom = new Set();
  for (const { v } of store.list('training:')) {
    for (const t of v || []) {
      const id = normArt(t.art);
      if (!TRAINING_TYPES.some((x) => x.id === id)) custom.add(trainingName(id));
    }
  }
  return [...TRAINING_TYPES.map((t) => ({ id: t.id, name: t.name })), ...[...custom].slice(0, 8).map((n) => ({ id: n, name: n }))];
}

// Anzeigename einer Einheit: Titel (z. B. „Oberkörper A“), sonst die Art.
export const unitName = (t) => t.titel || trainingName(t.art);
export const isRest = (t) => normArt(t.art) === 'ruhetag';

// Wichtigste Einheit des Tages: Studio, sonst die erste (ohne Ruhetag).
export function mainUnit(list) {
  const active = list.filter((t) => !isRest(t));
  return active.find((t) => normArt(t.art) === 'studio') || active[0] || null;
}

export function training(date) {
  return store.get(`training:${date}`, []);
}

export function setTraining(date, list) {
  if (list.length) store.set(`training:${date}`, list);
  else store.del(`training:${date}`);
}

export function addTraining(date, t) {
  setTraining(date, [...training(date), t]);
}

// Entfernt eine Einheit und verschiebt die Erledigt-Haken der folgenden mit.
export function removeTraining(date, i) {
  const list = training(date);
  const states = list.map((_, j) => trainingState(date, j));
  list.splice(i, 1);
  states.splice(i, 1);
  for (let j = 0; j <= list.length; j++) setTrainingState(date, j, states[j] || null);
  setTraining(date, list);
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
  { id: 'skin-abends', name: 'Skin Care abends', zeit: '22:00' },
];

export function seedDefaults() {
  for (const r of DEFAULT_ROUTINES) store.setDefault(`routine:${r.id}`, { name: r.name, zeit: r.zeit });
  // Die frühere Routine „Wasser“ wird durch die Wasser-Box ersetzt.
  if (store.get('routine:wasser')) store.del('routine:wasser');
}

// ---------- Wasser ----------

export const WATER_DEFAULTS = { goal: 3.0, glass: 0.5 };
export const GLASS_SIZES = [0.25, 0.5, 1.0];

export function waterSettings() {
  return { ...WATER_DEFAULTS, ...store.get('settings.body.water', {}) };
}

export function setWaterSettings(w) {
  store.set('settings.body.water', w);
}

export const water = (date) => store.get(`water:${date}`, 0); // ml

export function setWater(date, ml) {
  if (ml > 0) store.set(`water:${date}`, Math.round(ml));
  else store.del(`water:${date}`);
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

// Zustand eines Eintrags: 'done' | 'skip' | null – setzt das jeweils andere zurück.
export function routineState(date, id) {
  if (store.get(`rdone:${date}:${id}`)) return 'done';
  if (store.get(`rskip:${date}:${id}`)) return 'skip';
  return null;
}

export function setRoutineState(date, id, st) {
  if (st === 'done') store.set(`rdone:${date}:${id}`, true);
  else store.del(`rdone:${date}:${id}`);
  if (st === 'skip') store.set(`rskip:${date}:${id}`, true);
  else store.del(`rskip:${date}:${id}`);
}

export function trainingState(date, i) {
  if (store.get(`tdone:${date}:${i}`)) return 'done';
  if (store.get(`tskip:${date}:${i}`)) return 'skip';
  return null;
}

export function setTrainingState(date, i, st) {
  if (st === 'done') store.set(`tdone:${date}:${i}`, true);
  else store.del(`tdone:${date}:${i}`);
  if (st === 'skip') store.set(`tskip:${date}:${i}`, true);
  else store.del(`tskip:${date}:${i}`);
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

// ---------- Umfänge ----------

export const MEASURES = [
  { id: 'taille', name: 'Taille' },
  { id: 'brust', name: 'Brust' },
  { id: 'arme', name: 'Arme' },
];

export function measures() {
  return store.list('measure:')
    .map(({ key, v }) => ({ date: key.slice(8), ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function setMeasure(date, data) {
  const clean = {};
  for (const m of MEASURES) if (data[m.id] > 0) clean[m.id] = data[m.id];
  if (Object.keys(clean).length) store.set(`measure:${date}`, clean);
  else store.del(`measure:${date}`);
}

// ---------- Fortschritt ----------

// Erledigt / geplant pro Bestandteil – Grundlage für die automatische Zielerreichung.
export function weekParts(monday) {
  const m = { label: 'Mahlzeiten', done: 0, total: 0 };
  const r = { label: 'Routinen', done: 0, total: 0 };
  const t = { label: 'Training', done: 0, total: 0 };
  const w = { label: 'Wasser', done: 0, total: 0 };
  const rs = routines();
  const goalMl = waterSettings().goal * 1000;
  for (const d of pastDays(monday)) {
    w.total++;
    if (water(d) >= goalMl) w.done++;
    meals(d).forEach((_, i) => {
      m.total++;
      if (mealStatus(d, i) === 'ja') m.done++;
    });
    for (const x of rs) {
      r.total++;
      if (routineDone(d, x.id)) r.done++;
    }
    training(d).forEach((x, i) => {
      if (normArt(x.art) === 'ruhetag') return;
      t.total++;
      if (trainingDone(d, i)) t.done++;
    });
  }
  return [m, r, t, w];
}

// Konsistenz einer Woche für den Rückblick (nur vergangene Tage inkl. heute).
export function consistency(monday) {
  const goalMl = waterSettings().goal * 1000;
  const days = pastDays(monday);
  let mDone = 0;
  let mTotal = 0;
  let tDone = 0;
  let tTotal = 0;
  let wDays = 0;
  let any = false;
  for (const d of days) {
    meals(d).forEach((_, i) => {
      mTotal++;
      if (mealStatus(d, i) === 'ja') mDone++;
    });
    training(d).forEach((x, i) => {
      if (isRest(x)) return;
      tTotal++;
      if (trainingState(d, i) === 'done') tDone++;
    });
    const w = water(d);
    if (w >= goalMl) wDays++;
    if (w || weight(d) || extras(d).length) any = true;
  }
  return { days: days.length, mDone, mTotal, tDone, tTotal, wDays, hasData: any || mTotal > 0 || tTotal > 0 };
}

// Wochenbilanz: Plan gegen Ist bis einschließlich heute.
// Tag im Ziel: kcal innerhalb ±10 % des Tagesziels und Protein mindestens 90 %.
// Abgeschlossene Tage zählen immer, heute nur, wenn das Ziel schon erreicht ist.
export function weekBalance(monday) {
  const t = targets();
  const today = iso();
  const plan = { kcal: 0, protein: 0 };
  const ist = { kcal: 0, protein: 0 };
  let skipped = 0;
  let inGoal = 0;
  let goalDays = 0;
  const spontan = [];
  for (const d of pastDays(monday)) {
    const { eaten, planned } = totals(d);
    plan.kcal += planned.kcal;
    plan.protein += planned.protein;
    ist.kcal += eaten.kcal;
    ist.protein += eaten.protein;
    meals(d).forEach((_, i) => { if (mealStatus(d, i) === 'nein') skipped++; });
    for (const e of extras(d)) spontan.push({ ...e, date: d });
    const ok = Math.abs(eaten.kcal - t.kcal) <= t.kcal * 0.1 && eaten.protein >= t.protein * 0.9;
    if (d < today || ok) goalDays++;
    if (ok) inGoal++;
  }
  return {
    plan,
    ist,
    skipped,
    inGoal,
    goalDays,
    spontan,
    spontanKcal: spontan.reduce((s, e) => s + (Number(e.kcal) || 0), 0),
  };
}

// Zahlen für den Wochenexport.
export function weekSummary(monday) {
  const days = pastDays(monday);
  let skipped = 0;
  let foodDays = 0;
  const sum = { kcal: 0, protein: 0 };
  const extrasList = [];
  const trainings = [];
  const weightsList = [];
  for (const d of days) {
    const list = meals(d);
    list.forEach((_, i) => { if (mealStatus(d, i) === 'nein') skipped++; });
    const ex = extras(d);
    if (list.length || ex.length) {
      const { eaten } = totals(d);
      sum.kcal += eaten.kcal;
      sum.protein += eaten.protein;
      foodDays++;
    }
    for (const e of ex) extrasList.push(`${e.name} (${e.kcal} kcal)`);
    training(d).forEach((t, i) => {
      if (normArt(t.art) === 'ruhetag') return;
      trainings.push({ name: unitName(t) + (t.details ? ` (${t.details})` : ''), done: trainingDone(d, i), day: d });
    });
  }
  for (let i = 0; i < 7; i++) {
    const d = iso(addDays(monday, i));
    const w = weight(d);
    if (w) weightsList.push({ date: d, v: w });
  }
  const wd = days.map(water).filter((x) => x > 0);
  return {
    parts: weekParts(monday),
    waterAvg: wd.length ? wd.reduce((a, b) => a + b, 0) / wd.length / 1000 : null,
    skipped,
    avgKcal: foodDays ? sum.kcal / foodDays : null,
    avgProtein: foodDays ? sum.protein / foodDays : null,
    extras: extrasList,
    trainings,
    weights: weightsList,
    weightAvg: weekAvg(monday),
    weightPrev: weekAvg(addDays(monday, -7)),
  };
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
    name: String(m.name || m.gericht || 'Mahlzeit'),
    kategorie: normCat(m.kategorie || m.mahlzeit || m.typ),
    menge: String(m.menge || ''),
    kcal: num(m.kcal ?? m.kalorien),
    protein: num(m.protein ?? m.eiweiss),
    kh: num(m.kh ?? m.kohlenhydrate ?? m.carbs),
    fett: num(m.fett ?? m.fat),
    ...(Array.isArray(m.zutaten) && m.zutaten.length ? { zutaten: m.zutaten.map(normIngredient).filter(Boolean) } : {}),
  };
}

// ---------- Einkaufsliste ----------

export const SHOP_CATS = [
  { id: 'obst', name: 'Obst & Gemüse' },
  { id: 'fleisch', name: 'Fleisch & Fisch' },
  { id: 'milch', name: 'Milchprodukte & Eier' },
  { id: 'trocken', name: 'Trockenware' },
  { id: 'brot', name: 'Brot & Backwaren' },
  { id: 'vorrat', name: 'Vorrat' },
  { id: 'getraenke', name: 'Getränke' },
  { id: 'sonstiges', name: 'Sonstiges' },
];
export const SHOP_UNITS = ['g', 'ml', 'Stück'];

export function normShopCat(k) {
  const a = String(k || '').toLowerCase();
  if (/obst|gemüse|gemuese|salat|frucht|früchte/.test(a)) return 'obst';
  if (/fleisch|fisch|geflügel|wurst/.test(a)) return 'fleisch';
  if (/milch|eier|ei\b|käse|kaese|joghurt|quark/.test(a)) return 'milch';
  if (/trocken|reis|nudel|pasta|hafer|getreide|hülsen/.test(a)) return 'trocken';
  if (/brot|back/.test(a)) return 'brot';
  if (/vorrat|gewürz|öl|konserve|soße|sauce/.test(a)) return 'vorrat';
  if (/getränk|getraenk|drink/.test(a)) return 'getraenke';
  return 'sonstiges';
}

function normUnit(u) {
  const a = String(u || '').toLowerCase().trim();
  if (a === 'ml' || a === 'l' || a.startsWith('liter')) return 'ml';
  if (a.startsWith('st') || a === 'x' || a === 'pcs') return 'Stück';
  return 'g';
}

function normIngredient(z) {
  if (!z) return null;
  const artikel = String(z.artikel || z.name || '').trim();
  if (!artikel) return null;
  let menge = Number(String(z.menge ?? '').replace(',', '.')) || 0;
  const raw = String(z.einheit || '').toLowerCase().trim();
  if (raw === 'kg' || raw === 'l') menge *= 1000;
  return { artikel, menge, einheit: normUnit(raw), kategorie: normShopCat(z.kategorie) };
}

export const shopKey = (artikel, einheit) => `${artikel.toLowerCase().replace(/[:\s]+/g, ' ').trim()}|${einheit}`;

// Aus dem Essensplan: Portionen pro Gericht = Anzahl der Tage, an denen es vorkommt.
export function buildShop(plan) {
  const items = new Map();
  const dishes = new Map();
  for (const meals of plan.days) {
    if (!meals) continue;
    for (const m of meals) {
      if (!m.zutaten?.length) continue;
      const dish = dishes.get(m.name) || { name: m.name, portionen: 0, zutaten: new Map() };
      dish.portionen++;
      for (const z of m.zutaten) {
        const key = shopKey(z.artikel, z.einheit);
        const it = items.get(key) || { key, artikel: z.artikel, einheit: z.einheit, kategorie: z.kategorie, menge: 0 };
        it.menge += z.menge;
        items.set(key, it);
        const dz = dish.zutaten.get(key) || { key, artikel: z.artikel, einheit: z.einheit, menge: 0 };
        dz.menge += z.menge;
        dish.zutaten.set(key, dz);
      }
      dishes.set(m.name, dish);
    }
  }
  return {
    items: [...items.values()],
    dishes: [...dishes.values()].map((d) => ({ ...d, zutaten: [...d.zutaten.values()] })),
  };
}

export const shop = (monday) => store.get(`shop:${iso(monday)}`, null);
export const shopChecked = (monday, key) => !!store.get(`shopx:${iso(monday)}:${key}`);

export function setShopChecked(monday, key, on) {
  if (on) store.set(`shopx:${iso(monday)}:${key}`, true);
  else store.del(`shopx:${iso(monday)}:${key}`);
}

export function manualItems(monday) {
  return store.list(`shopm:${iso(monday)}:`).map(({ key, v }) => ({ id: key.split(':')[2], ...v }));
}

export function saveManual(monday, id, data) {
  store.set(`shopm:${iso(monday)}:${id || uid()}`, data);
}

export const deleteManual = (monday, id) => store.del(`shopm:${iso(monday)}:${id}`);

// Neuer Import: Liste ersetzen, Haken zurücksetzen, abgehakte eigene Artikel entfernen
function replaceShop(plan) {
  const m = iso(plan.monday);
  store.set(`shop:${m}`, buildShop(plan));
  for (const { key } of store.list(`shopx:${m}:`)) store.del(key);
  for (const it of manualItems(plan.monday)) if (it.done) deleteManual(plan.monday, it.id);
}

// Anzeige: g/ml auf 10 gerundet, ab 1.000 als kg/L mit einer Nachkommastelle; Stück aufgerundet
export function fmtAmount(menge, einheit) {
  if (!menge) return '';
  if (einheit === 'Stück') return `${Math.ceil(menge - 1e-9)} Stück`;
  const r = Math.round(menge / 10) * 10 || Math.round(menge);
  if (r >= 1000) return `${(r / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${einheit === 'ml' ? 'L' : 'kg'}`;
  return `${r.toLocaleString('de-DE')} ${einheit}`;
}

function normTraining(v) {
  const list = Array.isArray(v) ? v : [v];
  return list.filter(Boolean).map((t) => (typeof t === 'string'
    ? { art: normArt(t), details: '' }
    : {
      art: normArt(t.art || t.typ || t.name),
      details: String(t.details || t.inhalt || t.beschreibung || ''),
      ...(t.titel || t.title ? { titel: String(t.titel || t.title) } : {}),
      ...(t.zeit ? { zeit: String(t.zeit).slice(0, 5) } : {}),
    }));
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
  const typText = String(j.typ || '').toLowerCase();
  const mondayOf = () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(j.woche_ab || '')) return weekStart(fromIso(j.woche_ab));
    const now = new Date();
    return now.getDay() === 0 ? addDays(weekStart(now), 7) : weekStart(now);
  };
  const tage = j.tage || j.days;
  if (!tage || typeof tage !== 'object') throw new Error('Im Plan fehlt der Abschnitt "tage".');

  const firstVal = Object.values(tage)[0];
  const looksTraining = typText.includes('train')
    || (!typText && firstVal && !Array.isArray(firstVal) && typeof firstVal === 'object')
    || (!typText && Array.isArray(firstVal) && firstVal[0] && 'art' in firstVal[0]);
  const typ = looksTraining ? 'training' : 'essen';

  const monday = mondayOf();

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
  if (plan.typ === 'essen') replaceShop(plan);
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
- Pro Mahlzeit: zeit (HH:MM), kategorie, name, menge, kcal, protein, kh, fett (Gramm, ganze Zahlen).
- "kategorie" ist genau eins von: Frühstück, Mittagessen, Snack, Vor dem Training, Abendessen.
- Shakes und Snacks auch als eigene Mahlzeit.
- Pro Mahlzeit zusätzlich "zutaten" für die Einkaufsliste: Liste aus { "artikel", "menge" (Zahl, pro Portion), "einheit" ("g", "ml" oder "Stück"), "kategorie" }.
- "kategorie" der Zutat ist genau eins von: Obst & Gemüse, Fleisch & Fisch, Milchprodukte & Eier, Trockenware, Brot & Backwaren, Vorrat, Getränke, Sonstiges.
- Gleiche Artikel immer gleich schreiben (z. B. immer "Hähnchenbrust").
- Keine Kommentare im Code-Block.

\`\`\`json
{
  "typ": "essensplan",
  "woche_ab": "2026-10-26",
  "tage": {
    "Mo-Mi": [
      { "zeit": "07:30", "kategorie": "Frühstück", "name": "Overnight Oats mit Whey", "menge": "1 Box (400 g)", "kcal": 620, "protein": 42, "kh": 78, "fett": 14 },
      { "zeit": "12:30", "kategorie": "Mittagessen", "name": "Hähnchen, Reis, Brokkoli", "menge": "1 Box (550 g)", "kcal": 780, "protein": 55, "kh": 95, "fett": 18,
        "zutaten": [
          { "artikel": "Hähnchenbrust", "menge": 200, "einheit": "g", "kategorie": "Fleisch & Fisch" },
          { "artikel": "Basmatireis", "menge": 100, "einheit": "g", "kategorie": "Trockenware" },
          { "artikel": "Brokkoli", "menge": 150, "einheit": "g", "kategorie": "Obst & Gemüse" }
        ] }
    ],
    "Do-So": [
      { "zeit": "07:30", "kategorie": "Frühstück", "name": "Rührei mit Vollkornbrot", "menge": "4 Eier, 2 Scheiben", "kcal": 590, "protein": 36, "kh": 45, "fett": 28 }
    ]
  }
}
\`\`\``;

export const TEMPLATE_TRAINING = `Bitte gib mir meinen Trainingsplan für die kommende Woche zusätzlich als JSON-Code-Block, damit ich ihn in meine App importieren kann.

Regeln:
- "woche_ab" ist der Montag der Woche im Format JJJJ-MM-TT.
- Tage: "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So" (zusammenfassen erlaubt, z. B. "Sa,So").
- "art": Studio, Spinning, Sauna, Infrarot oder Ruhetag – andere Trainings einfach mit ihrem Namen (z. B. Schwimmen, Laufen, Boxen).
- "titel" ist optional: der Name der Einheit bzw. des Splits (z. B. "Push", "Oberkörper A").
- "zeit" (HH:MM) ist optional.
- "details" ist eine kurze Beschreibung (z. B. Muskelgruppen, Dauer).
- Mehrere Einheiten an einem Tag als Liste.
- Keine Kommentare im Code-Block.

\`\`\`json
{
  "typ": "trainingsplan",
  "woche_ab": "2026-10-26",
  "tage": {
    "Mo": [ { "art": "Studio", "titel": "Oberkörper A", "details": "Bankdrücken, Rudern, Schulterdrücken" }, { "art": "Sauna", "details": "2 Gänge" } ],
    "Di": [ { "art": "Spinning", "details": "45 Min", "zeit": "18:00" } ],
    "Do": [ { "art": "Schwimmen", "details": "30 Min locker" } ],
    "Mi": [ { "art": "Ruhetag", "details": "" } ]
  }
}
\`\`\``;

// ---------- Kalender-Export (Erinnerungen für Mahlzeiten) ----------

// Erstellt eine .ics-Datei mit allen geplanten Mahlzeiten (und Trainings mit Uhrzeit)
// einer Woche – jeweils mit Erinnerung zur Startzeit.
export function weekIcs(monday) {
  const esc = (t) => String(t).replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sami\'s World//DE', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Essen & Training'];
  let count = 0;
  const event = (uid, date, zeit, mins, title, desc) => {
    const [hh, mm] = zeit.split(':').map(Number);
    const start = new Date(fromIso(date).setHours(hh, mm, 0, 0));
    const end = new Date(start.getTime() + mins * 60000);
    const f = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
    lines.push('BEGIN:VEVENT', `UID:${uid}@life4`, `DTSTAMP:${stamp}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
      `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(desc)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
    count++;
  };
  for (let i = 0; i < 7; i++) {
    const d = iso(addDays(monday, i));
    meals(d).forEach((m, j) => {
      if (!/^\d{2}:\d{2}$/.test(m.zeit)) return;
      event(`meal-${d}-${j}`, d, m.zeit, 20, `${catName(category(m))}: ${m.name}`,
        [m.menge, `${m.kcal} kcal · ${m.protein} g Protein`].filter(Boolean).join('\n'));
    });
    training(d).forEach((t, j) => {
      if (!t.zeit || normArt(t.art) === 'ruhetag') return;
      event(`training-${d}-${j}`, d, t.zeit, 60, `Training: ${trainingName(t.art)}`, t.details || '');
    });
  }
  lines.push('END:VCALENDAR');
  return { text: lines.join('\r\n'), count };
}
