// Wochensystem: Wochenziele, Sonntags-Review, Zielerreichung, Wochenexport.
//
// Schlüssel im Speicher:
//   goal:<montag>:<bereich>:<id>   {text, done, o}  – Wochenziel (o = Reihenfolge)
//   review:<montag>                {ratings:{bereich:1–10}, gut, schlecht, aendern, step, doneAt}

import * as store from './store.js';
import * as body from './body.js';
import * as mind from './mind.js';
import * as pp from './people.js';
import * as ln from './learn.js';
import { AREAS, byId } from './areas.js';
import { iso, fromIso, addDays, weekStart, isoWeek, fmtShort, uid, WD_SHORT, pastDays } from './ui.js';

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
  const PARTS = { koerper: body.weekParts, sinn: mind.weekParts, contact: pp.weekParts, leistung: ln.weekParts };
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
  // Routinen nur, wenn überhaupt welche abgehakt wurden – sonst wirkt 0 % wie ein Problem
  if (r.total && r.done) lines.push(`- Routinen: ${r.done}/${r.total}${pctOf(r)}`);
  if (tr.total) lines.push(`- Training: ${tr.done}/${tr.total} erledigt – ${s.trainings.map((x) => `${WD_SHORT[fromIso(x.day).getDay()]} ${x.name}${x.done ? ' ✓' : ' ✗'}`).join(', ')}`);
  if (s.waterAvg) lines.push(`- Wasser: Ø ${de(s.waterAvg, 1)} L pro Tag (Ziel ${de(body.waterSettings().goal, 1)} L)`);
  if (s.weightAvg) {
    const diff = s.weightPrev ? s.weightAvg - s.weightPrev : null;
    lines.push(`- Gewicht: Ø ${de(s.weightAvg, 1)} kg${diff != null ? ` (Vorwoche ${de(s.weightPrev, 1)} kg, ${diff >= 0 ? '+' : '–'}${de(Math.abs(diff), 1)})` : ''} · ${s.weights.map((w) => `${WD_SHORT[fromIso(w.date).getDay()]} ${de(w.v, 1)}`).join(', ')}`);
  }
  return lines;
}

// ---------- Körper im Detail (für die Ernährungsberatung in Claude) ----------

const MARK = { ja: '✓', nein: '✗' };
const macroText = (m) => `${de(m.kcal || 0)} kcal · P ${de(m.protein || 0)} · KH ${de(m.kh || 0)} · F ${de(m.fett || 0)}`;

function targetLine() {
  const t = body.targets();
  return `${de(t.kcal)} kcal · ${de(t.protein)} g Protein · ${de(t.kh)} g Kohlenhydrate · ${de(t.fett)} g Fett · ${de(body.waterSettings().goal, 1)} L Wasser`;
}

function trainingText(d, withState) {
  const list = body.training(d);
  if (!list.length) return null;
  return list.map((t, i) => {
    if (body.isRest(t)) return 'Ruhetag';
    const st = body.trainingState(d, i);
    const name = `${body.unitName(t)}${t.titel ? ` (${body.trainingName(t.art)})` : ''}${t.details ? ` – ${t.details}` : ''}`;
    return withState ? `${name} ${st === 'done' ? '✓' : st === 'skip' ? '✗' : '?'}` : name;
  }).join(', ');
}

function koerperDetails(monday) {
  const out = ['KÖRPER – DETAILS', `- Tagesziele: ${targetLine()}`, '- Zeichen: ✓ gegessen/erledigt · ✗ ausgelassen · ? nicht abgehakt'];
  for (const d of pastDays(monday)) {
    const meals = body.meals(d);
    const ex = body.extras(d);
    const tr = trainingText(d, true);
    const w = body.weight(d);
    const water = body.water(d);
    if (!meals.length && !ex.length && !tr && !w && !water) continue;
    const { eaten } = body.totals(d);
    const plan = meals.reduce((s, m) => ({ kcal: s.kcal + (m.kcal || 0), protein: s.protein + (m.protein || 0), kh: s.kh + (m.kh || 0), fett: s.fett + (m.fett || 0) }), { kcal: 0, protein: 0, kh: 0, fett: 0 });
    const head = [`${WD_SHORT[fromIso(d).getDay()]} ${fmtShort(fromIso(d))}`];
    if (meals.length || ex.length) {
      head.push(`gegessen ${de(eaten.kcal)}${meals.length ? ` / Plan ${de(plan.kcal)}` : ''} kcal`,
        `P ${de(eaten.protein)}${meals.length ? `/${de(plan.protein)}` : ''}`,
        `KH ${de(eaten.kh)}${meals.length ? `/${de(plan.kh)}` : ''}`,
        `F ${de(eaten.fett)}${meals.length ? `/${de(plan.fett)}` : ''}`);
    }
    if (water) head.push(`Wasser ${de(water / 1000, 1)} L`);
    if (w) head.push(`Gewicht ${de(w, 1)} kg`);
    head.push(`Training: ${tr || 'kein Plan'}`);
    out.push(`- ${head.join(' · ')}`);
    const rows = [
      ...meals.map((m, i) => ({ zeit: m.zeit || '', text: `${MARK[body.mealStatus(d, i)] || '?'} ${m.zeit || '–'} ${m.name} (${body.catName(body.category(m))}) ${macroText(m)}` })),
      ...ex.map((e) => ({ zeit: e.zeit || '', text: `+ ${e.zeit || '–'} ${e.name} (spontan) ${macroText(e)}` })),
    ].sort((a, b) => a.zeit.localeCompare(b.zeit));
    for (const r of rows) out.push(`  ${r.text}`);
  }
  const avg = body.weekAvg(monday);
  const prev = body.weekAvg(addDays(monday, -7));
  if (avg) out.push(`- Gewichtstrend: Ø ${de(avg, 1)} kg${prev ? ` · Vorwoche Ø ${de(prev, 1)} kg · Veränderung ${avg - prev >= 0 ? '+' : '–'}${de(Math.abs(avg - prev), 1)} kg` : ' · Vorwoche ohne Werte'}`);

  // Nächste Woche: Trainingsplan und (falls schon importiert) Essensplan
  const next = addDays(monday, 7);
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(next, i)));
  out.push('', `NÄCHSTE WOCHE ${weekLabel(next)}`);
  const tl = days.map((d) => ({ d, t: trainingText(d, false) })).filter((x) => x.t);
  out.push(tl.length
    ? `- Trainingsplan: ${tl.map((x) => `${WD_SHORT[fromIso(x.d).getDay()]} ${x.t}`).join(' | ')}`
    : '- Trainingsplan: nicht in der App');
  const ml = days.map((d) => ({ d, m: body.meals(d) })).filter((x) => x.m.length);
  out.push(ml.length
    ? `- Essensplan: ${ml.map((x) => `${WD_SHORT[fromIso(x.d).getDay()]} ${de(x.m.reduce((s, m) => s + (m.kcal || 0), 0))} kcal / ${de(x.m.reduce((s, m) => s + (m.protein || 0), 0))} P`).join(' | ')}`
    : '- Essensplan: noch keiner');
  return out;
}

// Anweisung für das Claude-Projekt „Körper“: Rolle, Antwortaufbau und Importformat
export function coachInstruction() {
  return `Du bist mein Ernährungsberater für Muskelaufbau (Lean Bulk). Antworte auf Deutsch, klar und konkret.

Über mich (bitte ergänzen):
- Größe: … cm · Alter: … Jahre
- Ziel: Muskelaufbau von 70 auf 80–85 kg, definiert bis Sommer 2027
- Meal Prep: am Sonntag, unter der Woche … Minuten zum Kochen
- Mag ich nicht / Unverträglichkeiten: …
- Budget pro Woche: … €

Meine Tagesziele (aus der App): ${targetLine()}

Meinen Trainingsplan und meine Trainings kennst du aus der Hevy App – nutze sie für die Trainingstage und die Analyse. Steht im Rückblick unter „Nächste Woche“ ein Trainingsplan, gleiche ihn damit ab.

Wenn ich einen Wochenrückblick aus „Sami's World“ einfüge, antworte in dieser Reihenfolge:
1. Kurzanalyse (höchstens 6 Sätze): Kalorien und Protein gegenüber Ziel, Muster bei ausgelassenen Mahlzeiten (welche, wann, vermuteter Grund), Essen rund ums Training, Gewichtstrend. Richtwert: +0,25 bis 0,5 kg pro Woche – liegt der Trend daneben, schlage eine Anpassung der Tagesziele mit Begründung vor.
2. Drei Prioritäten für nächste Woche – konkret und umsetzbar.
3. Anpassungen: welche Mahlzeiten ersetzt, vereinfacht oder verschoben werden (z. B. häufig ausgelassene Mahlzeiten durch schnelle oder flüssige Kalorien), Timing vor und nach dem Training.
4. Essensplan für die nächste Woche: passend zum Trainingsplan (an Trainingstagen mehr Kohlenhydrate rund ums Training), Tagesziele möglichst genau treffen (±5 %), Meal-Prep-freundlich mit Gerichten, die sich über mehrere Tage wiederholen. Erst kurz als Tabelle (Tag, Mahlzeiten, kcal, Protein), dann als JSON-Code-Block im Format unten – mit "zutaten" pro Mahlzeit, damit meine Einkaufsliste automatisch entsteht.
5. Wasser und Routinen nur erwähnen, wenn auffällig.

Zeichen im Rückblick: ✓ gegessen/erledigt · ✗ ausgelassen · ? nicht abgehakt (unklar, ob gegessen – frag nach, wenn es wichtig ist) · + spontan gegessen.

Format für den Essensplan:

${body.TEMPLATE_MEALS}`;
}

function sinnLines(monday) {
  const s = mind.weekSummary(monday);
  const lines = [`- ${s.parts.map((p) => `${p.label} ${p.done}/${p.total}`).join(' · ')}`];
  const cmp = (cur, prev) => (cur != null && prev != null ? ` (Vorwoche ${de(prev, 1)})` : '');
  if (s.mood != null) lines.push(`- Ø Stimmung ${de(s.mood, 1)}/5${cmp(s.mood, s.moodPrev)}`);
  if (s.energy != null) lines.push(`- Ø Energie ${de(s.energy, 1)}/5${cmp(s.energy, s.energyPrev)}`);
  return lines;
}

function leistungLines(monday) {
  const lines = [];
  const fk = ln.fokus(monday);
  for (const f of ln.FIELDS) {
    const g = ln.goal(monday, f.id);
    const units = ln.unitsOfWeek(monday, f.id);
    if (!g && !units.length) continue;
    const parts = [`${units.length}${g?.einheiten ? `/${g.einheiten}` : ''} ${g?.einheiten || units.length !== 1 ? 'Einheiten' : 'Einheit'}`];
    if (g?.schritte.length) parts.push(`${g.schritte.filter((s) => s.done).length}/${g.schritte.length} Schritte`);
    if (g && g.status !== 'offen') parts.push(ln.STATUS[g.status]);
    lines.push(`- ${f.name}${fk === f.id ? ' (Fokus)' : ''}: ${g ? `${g.ziel} – fertig, wenn ${g.fertig_wenn} · ` : ''}${parts.join(' · ')}`);
    const notes = units.filter((u) => u.notiz).map((u) => u.notiz);
    if (notes.length) lines.push(`  Gelernt: ${notes.join(' | ')}`);
  }
  const soon = ln.termine().filter((t) => ln.daysUntil(t.datum) >= 0 && ln.daysUntil(t.datum) <= 30);
  if (soon.length) lines.push(`- Termine: ${soon.map((t) => `${t.titel} (${fmtShort(fromIso(t.datum))}, ${ln.countdown(t.datum)})`).join(', ')}`);
  return lines;
}

function contactLines(monday) {
  const lines = [];
  const end = iso(addDays(monday, 6));
  const seen = pp.contactLog(iso(monday)).filter((x) => x.date <= end).reverse();
  if (seen.length) lines.push(`- Kontakte: ${seen.map((x) => `${x.p.name} (${pp.kindName(x.art)}, ${WD_SHORT[fromIso(x.date).getDay()]})`).join(', ')}`);
  const wp = pp.weekPlan(monday);
  if (wp.total) lines.push(`- Wochenplan: ${wp.done}/${wp.total} erledigt`);
  const all = pp.people().map((p) => ({ p, s: pp.status(p) }));
  const over = all.filter((x) => x.s.state === 'ueberfaellig' && pp.prio(x.p) !== 'warte').map((x) => x.p.name);
  if (over.length) lines.push(`- Überfällig: ${over.join(', ')}`);
  const planned = all.filter((x) => x.s.state === 'geplant').map((x) => `${x.p.name} (${pp.kindName(x.s.plan.art)} ${fmtShort(fromIso(x.s.plan.date))})`);
  if (planned.length) lines.push(`- Geplant: ${planned.join(', ')}`);
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
    if (a.id === 'koerper') out.push(...koerperLines(monday), '', ...koerperDetails(monday));
    if (a.id === 'sinn') out.push(...sinnLines(monday));
    if (a.id === 'contact') out.push(...contactLines(monday));
    if (a.id === 'leistung') out.push(...leistungLines(monday));
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
