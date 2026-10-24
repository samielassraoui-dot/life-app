// Wochensystem: Wochenziele, Sonntags-Review, Zielerreichung, Wochenexport.
//
// Schlüssel im Speicher:
//   goal:<montag>:<bereich>:<id>   {text, done, o}  – Wochenziel (o = Reihenfolge)
//   review:<montag>                {ratings:{bereich:1–10}, gut, schlecht, aendern, step, doneAt}

import * as store from './store.js';
import * as body from './body.js';
import * as mind from './mind.js';
import * as pp from './people.js';
import { AREAS, byId } from './areas.js';
import { iso, fromIso, addDays, weekStart, isoWeek, fmtShort, uid, WD_SHORT } from './ui.js';

// ---------- Wochenziele ----------

export function goals(monday, area) {
  return store.list(`goal:${iso(monday)}:${area}:`)
    .map(({ key, v }) => ({ key, ...v }))
    .sort((a, b) => (a.o || 0) - (b.o || 0));
}

export function addGoal(monday, area, text) {
  const list = goals(monday, area);
  store.set(`goal:${iso(monday)}:${area}:${uid()}`, { text, done: false, o: list.length ? list[list.length - 1].o + 1 : 0 });
}

export function updateGoal(g, patch) {
  store.set(g.key, { text: g.text, done: g.done, o: g.o, ...patch });
}

export function deleteGoal(g) {
  store.del(g.key);
}

export const MAX_GOALS = 3;

// ---------- Review ----------

export function review(monday) {
  return store.get(`review:${iso(monday)}`, { ratings: {} });
}

export function saveReview(monday, patch) {
  store.set(`review:${iso(monday)}`, { ...review(monday), ...patch });
}

export const isDone = (monday) => !!review(monday).doneAt;

function hasData(monday) {
  const m = iso(monday);
  const end = iso(addDays(monday, 7));
  return store.list('').some(({ key }) => {
    const d = key.split(':')[1];
    return d && d >= m && d < end;
  });
}

// Welche Woche wird gerade reviewt? Sonntags die laufende; sonst eine
// verpasste Vorwoche nachholen; ansonsten (vorzeitig) die laufende.
export function reviewMonday(now = new Date()) {
  const cur = weekStart(now);
  if (now.getDay() === 0) return cur;
  const prev = addDays(cur, -7);
  if (!isDone(prev) && hasData(prev)) return prev;
  return cur;
}

// ---------- Zielerreichung ----------

// Teile pro Bereich (aus den Tagesdaten) + Wochenziele. Jeder Teil zählt gleich viel.
// withGoals=false für die laufende Woche: Ziele werden erst im Review abgehakt.
export function areaScore(area, monday, { withGoals = true } = {}) {
  const PARTS = { koerper: body.weekParts, sinn: mind.weekParts, contact: pp.weekParts };
  const parts = PARTS[area] ? PARTS[area](monday) : [];
  const g = withGoals ? goals(monday, area) : [];
  if (g.length) parts.push({ label: 'Wochenziele', done: g.filter((x) => x.done).length, total: g.length });
  const used = parts.filter((p) => p.total > 0);
  const pct = used.length ? Math.round((used.reduce((s, p) => s + p.done / p.total, 0) / used.length) * 100) : null;
  return { pct, parts };
}

// Bewertungen der letzten Wochen für das Verlaufsdiagramm.
export function ratingHistory(weeks = 12) {
  const cur = weekStart();
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const m = addDays(cur, -7 * i);
    out.push({ monday: m, ratings: review(m).ratings || {} });
  }
  return out;
}

// ---------- Wochenexport ----------

const de = (v, d = 0) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const pctOf = (p) => (p.total ? ` (${Math.round((p.done / p.total) * 100)} %)` : '');

export function weekLabel(monday) {
  return `KW ${isoWeek(monday)} (${fmtShort(monday)}–${fmtShort(addDays(monday, 6))}${addDays(monday, 6).getFullYear()})`;
}

function goalLines(monday, area) {
  const g = goals(monday, area);
  if (!g.length) return [];
  return [`- Wochenziele: ${g.map((x) => `${x.done ? '✓' : '✗'} ${x.text}`).join(' · ')}`];
}

function koerperLines(monday) {
  const s = body.weekSummary(monday);
  const t = body.targets();
  const [m, r, tr] = s.parts;
  const lines = [];
  if (m.total) lines.push(`- Mahlzeiten: ${m.done}/${m.total} gegessen${pctOf(m)}${s.skipped ? `, ${s.skipped} ausgelassen` : ''}`);
  if (s.avgKcal != null) lines.push(`- Ø gegessen pro Tag: ${de(s.avgKcal)} kcal / ${de(s.avgProtein)} g Protein (Ziel ${de(t.kcal)} kcal / ${de(t.protein)} g)`);
  if (s.extras.length) lines.push(`- Spontan gegessen: ${s.extras.join(', ')}`);
  if (r.total) lines.push(`- Routinen: ${r.done}/${r.total}${pctOf(r)}`);
  if (tr.total) lines.push(`- Training: ${tr.done}/${tr.total} erledigt – ${s.trainings.map((x) => `${WD_SHORT[fromIso(x.day).getDay()]} ${x.name}${x.done ? ' ✓' : ' ✗'}`).join(', ')}`);
  if (s.weightAvg) {
    const diff = s.weightPrev ? s.weightAvg - s.weightPrev : null;
    lines.push(`- Gewicht: Ø ${de(s.weightAvg, 1)} kg${diff != null ? ` (Vorwoche ${de(s.weightPrev, 1)} kg, ${diff >= 0 ? '+' : '–'}${de(Math.abs(diff), 1)})` : ''} · ${s.weights.map((w) => `${WD_SHORT[fromIso(w.date).getDay()]} ${de(w.v, 1)}`).join(', ')}`);
  }
  return lines;
}

function sinnLines(monday) {
  const s = mind.weekSummary(monday);
  const lines = [`- ${s.parts.map((p) => `${p.label} ${p.done}/${p.total}`).join(' · ')}`];
  const cmp = (cur, prev) => (cur != null && prev != null ? ` (Vorwoche ${de(prev, 1)})` : '');
  if (s.mood != null) lines.push(`- Ø Stimmung ${de(s.mood, 1)}/5${cmp(s.mood, s.moodPrev)}`);
  if (s.energy != null) lines.push(`- Ø Energie ${de(s.energy, 1)}/5${cmp(s.energy, s.energyPrev)}`);
  return lines;
}

function contactLines(monday) {
  const lines = [];
  const seen = pp.weekContacts(monday);
  if (seen.length) lines.push(`- Kontakte: ${seen.map((x) => `${x.p.name} (${WD_SHORT[fromIso(x.d).getDay()]})`).join(', ')}`);
  const parts = pp.weekParts(monday);
  if (parts.length) lines.push(`- Im Rhythmus: ${parts[0].done}/${parts[0].total}`);
  const all = pp.people();
  const due = all.filter((p) => pp.status(p).state === 'faellig').map((p) => p.name);
  if (due.length) lines.push(`- Schon eine Weile her: ${due.join(', ')}`);
  const gem = all.filter((p) => pp.flag('gemeldet', p.id)).map((p) => p.name);
  if (gem.length) lines.push(`- Gemeldet bei: ${gem.join(', ')}`);
  const tr = all.filter((p) => pp.flag('treffen', p.id)).map((p) => p.name);
  if (tr.length) lines.push(`- Treffen geplant mit: ${tr.join(', ')}`);
  const bd = pp.upcomingBirthdays(14).map(({ p, b }) => `${p.name} (${fmtShort(b.date)})`);
  if (bd.length) lines.push(`- Geburtstage in den nächsten 2 Wochen: ${bd.join(', ')}`);
  return lines;
}

// only: Bereichs-ID für einen Teil-Export (z. B. nur Körper fürs Body-Projekt)
export function exportText(monday, only = null) {
  const rv = review(monday);
  const next = addDays(monday, 7);
  const out = [`Wochenrückblick ${weekLabel(monday)}`, ''];
  for (const a of AREAS) {
    if (only && a.id !== only) continue;
    const sc = areaScore(a.id, monday);
    const rating = rv.ratings?.[a.id];
    out.push(`${a.name.toUpperCase()}${sc.pct != null ? ` – Zielerreichung ${sc.pct} %` : ''}${rating ? ` · Bewertung ${rating}/10` : ''}`);
    if (a.id === 'koerper') out.push(...koerperLines(monday));
    if (a.id === 'sinn') out.push(...sinnLines(monday));
    if (a.id === 'contact') out.push(...contactLines(monday));
    out.push(...goalLines(monday, a.id));
    out.push('');
  }
  if (!only && (rv.gut || rv.schlecht || rv.aendern)) {
    out.push('REFLEXION');
    if (rv.gut) out.push(`- Was lief gut: ${rv.gut}`);
    if (rv.schlecht) out.push(`- Was lief nicht so gut: ${rv.schlecht}`);
    if (rv.aendern) out.push(`- Was ich ändere: ${rv.aendern}`);
    out.push('');
  }
  const nextLines = AREAS.filter((a) => !only || a.id === only)
    .map((a) => ({ a, g: goals(next, a.id) }))
    .filter((x) => x.g.length)
    .map((x) => `- ${x.a.name}: ${x.g.map((g) => g.text).join(' · ')}`);
  if (nextLines.length) out.push(`ZIELE ${weekLabel(next)}`, ...nextLines);
  return out.join('\n').trim();
}

export { byId };
