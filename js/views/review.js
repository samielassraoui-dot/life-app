// Sonntags-Review: vier ruhige Schritte – Rückblick, Reflexion, neue Ziele, Abschluss.
import * as week from '../week.js';
import { AREAS } from '../areas.js';
import { goalEditor } from './goals.js';
import { exportBackup } from './settings.js';
import { h, icon, toast, addDays, fmtShort, isoWeek } from '../ui.js';

const STEPS = ['Rückblick', 'Reflexion', 'Neue Ziele', 'Abschluss'];
let monday = null;
let step = 1;

export function render(refresh) {
  const m = week.reviewMonday();
  if (!monday || +monday !== +m) {
    monday = m;
    step = week.review(m).step || 1;
  }
  const go = (s) => {
    step = s;
    week.saveReview(monday, { step: s });
    refresh();
    scrollTo(0, 0);
  };
  const views = [null, stepRueckblick, stepReflexion, stepZiele, stepAbschluss];
  return h('div.view.review-view',
    h('header.rv-head',
      h('a.backlink', { href: '#/heute' }, icon('back', 18), 'Übersicht'),
      h('p.eyebrow', `Sonntags-Review · KW ${isoWeek(monday)} · ${fmtShort(monday)}–${fmtShort(addDays(monday, 6))}`),
      h('h1', STEPS[step - 1]),
      h('div.steps', STEPS.map((s, i) => h(`span.stepdot${i + 1 === step ? '.on' : ''}${i + 1 < step ? '.past' : ''}`, { 'aria-label': s }))),
    ),
    views[step](go, refresh),
  );
}

function nav(go, back, next, nextLabel = 'Weiter') {
  return h('div.rv-nav',
    back ? h('button.btn.ghost', { onclick: () => go(back) }, 'Zurück') : h('span'),
    h('button.btn.primary', { onclick: next }, nextLabel),
  );
}

// ---------- 1. Rückblick ----------

function scale(value, onPick) {
  return h('div.scale',
    Array.from({ length: 10 }, (_, i) => i + 1).map((n) => h(`button.scale-btn${value === n ? '.on' : ''}`, { onclick: () => onPick(n), 'aria-label': `${n} von 10` }, n)),
  );
}

function stepRueckblick(go, refresh) {
  const rv = week.review(monday);
  return h('div.rv-body',
    h('p.muted.rv-intro', 'Schau in Ruhe auf deine Woche. Die Prozente kommen aus deinen Einträgen – deine Bewertung ist dein eigenes Gefühl dazu.'),
    AREAS.map((a) => {
      const sc = week.areaScore(a.id, monday);
      const rating = rv.ratings?.[a.id];
      const prev = addDays(monday, -7);
      const prevPct = week.areaScore(a.id, prev).pct;
      const prevRating = week.review(prev).ratings?.[a.id];
      const goals = week.goals(monday, a.id);
      const diff = sc.pct != null && prevPct != null ? sc.pct - prevPct : null;
      return h(`section.card.rv-area.a-${a.id}`,
        h('div.sec-title', h('span.sec-icon', icon(a.id, 18)), h('h2', a.name),
          sc.pct != null && h('span.rv-pct', `${sc.pct} %`)),
        (diff != null || prevRating) && h('p.rv-compare',
          diff != null && h(`span.delta${diff > 0 ? '.up' : diff < 0 ? '.down' : ''}`, diff === 0 ? '= wie Vorwoche' : `${diff > 0 ? '▲ +' : '▼ '}${diff} % zur Vorwoche`),
          prevRating && h('span', `Letzte Bewertung: ${prevRating}/10`)),
        goals.length > 0 && h('div.rv-goals',
          h('p.rv-q', 'Deine Wochenziele – erreicht?'),
          goals.map((g) => h(`button.check${g.done ? '.done' : ''}`, {
            onclick: () => {
              week.updateGoal(g, { done: !g.done });
              refresh();
            },
          }, h('span.box', icon('check', 18)), h('span.check-name', g.text)))),
        sc.parts.length
          ? h('div.parts', sc.parts.map((p) => h('div.part',
            h('span', p.label),
            h('span.muted', p.total ? `${p.done}/${p.total}` : '–'),
            h('div.bar', h('i', { style: { width: `${p.total ? (p.done / p.total) * 100 : 0}%` } })),
          )))
          : h('p.small.muted', 'Noch keine Daten für diesen Bereich – deine Einschätzung zählt.'),
        h('p.rv-q', 'Wie zufrieden bist du mit dieser Woche?'),
        scale(rating, (n) => {
          week.saveReview(monday, { ratings: { ...week.review(monday).ratings, [a.id]: n } });
          refresh();
        }),
      );
    }),
    nav(go, null, () => {
      const missing = AREAS.filter((a) => !week.review(monday).ratings?.[a.id]);
      if (missing.length && !confirm(`${missing.map((a) => a.tab).join(', ')} noch ohne Bewertung. Trotzdem weiter?`)) return;
      go(2);
    }),
  );
}

// ---------- 2. Reflexion ----------

const QUESTIONS = [
  { id: 'gut', q: 'Was lief gut?', ph: 'Worauf bist du diese Woche stolz?' },
  { id: 'schlecht', q: 'Was lief nicht so gut?', ph: 'Ohne Urteil – einfach festhalten.' },
  { id: 'aendern', q: 'Was änderst du nächste Woche?', ph: 'Eine kleine Sache reicht.' },
];

function stepReflexion(go) {
  const rv = week.review(monday);
  const fields = QUESTIONS.map((x) => ({ x, el: h('textarea.input.rv-text', { rows: 3, placeholder: x.ph, value: rv[x.id] || '' }) }));
  const save = () => week.saveReview(monday, Object.fromEntries(fields.map(({ x, el }) => [x.id, el.value.trim()])));
  for (const { el } of fields) el.addEventListener('change', save);
  return h('div.rv-body',
    h('p.muted.rv-intro', 'Ein, zwei Sätze genügen. Alles ist freiwillig.'),
    fields.map(({ x, el }) => h('section.card', h('label.field', h('span.rv-q', x.q), el))),
    nav(go, 1, () => {
      save();
      go(3);
    }),
  );
}

// ---------- 3. Neue Ziele ----------

function stepZiele(go, refresh) {
  const next = addDays(monday, 7);
  return h('div.rv-body',
    h('p.muted.rv-intro', `Ein bis drei Ziele pro Bereich für KW ${isoWeek(next)}. Klein und konkret ist besser als groß und vage.`),
    AREAS.map((a) => {
      const open = week.goals(monday, a.id).filter((g) => !g.done).map((g) => g.text);
      return h(`section.card.a-${a.id}`,
        h('div.sec-title', h('span.sec-icon', icon(a.id, 18)), h('h2', a.name)),
        goalEditor(next, a.id, refresh, open),
      );
    }),
    nav(go, 2, () => {
      week.saveReview(monday, { doneAt: Date.now() });
      go(4);
    }, 'Review abschließen'),
  );
}

// ---------- 4. Abschluss ----------

async function copy(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} kopiert – jetzt in Claude einfügen`);
  } catch {
    toast('Kopieren hat nicht geklappt', 'error');
  }
}

function stepAbschluss(go) {
  const rv = week.review(monday);
  const vals = AREAS.map((a) => rv.ratings?.[a.id]).filter(Boolean);
  const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  return h('div.rv-body',
    h('section.card.rv-done',
      h('span.rv-done-icon', icon('check', 30)),
      h('h2', 'Schön, dass du dir die Zeit genommen hast.'),
      h('p.muted', avg ? `Deine Woche im Schnitt: ${avg.toLocaleString('de-DE', { maximumFractionDigits: 1 })} von 10.` : 'Deine Woche ist abgeschlossen.'),
      h('div.rv-ratings', AREAS.map((a) => h(`div.rv-rating.a-${a.id}`, h('b', rv.ratings?.[a.id] || '–'), h('span', a.tab)))),
    ),
    h('section.card',
      h('div.sec-title', h('span.sec-icon', icon('upload', 18)), h('h2', 'Wochenexport')),
      h('p.muted', 'Als Text kopieren und in deine Claude-Projekte einfügen.'),
      h('div.buttons',
        h('button.btn.primary', { onclick: () => copy(week.exportText(monday), 'Wochenrückblick') }, 'Alles kopieren'),
        h('button.btn.ghost', { onclick: () => copy(week.exportText(monday, 'koerper'), 'Körper-Rückblick') }, 'Nur Körper'),
      ),
    ),
    h('section.card',
      h('div.sec-title', h('span.sec-icon', icon('download', 18)), h('h2', 'Backup')),
      h('p.muted', 'Ein guter Moment für dein wöchentliches Backup.'),
      h('div.buttons', h('button.btn.ghost', { onclick: () => exportBackup() }, 'Backup speichern')),
    ),
    h('div.rv-nav',
      h('button.btn.ghost', { onclick: () => go(3) }, 'Ziele ändern'),
      h('a.btn.primary', { href: '#/heute' }, 'Fertig'),
    ),
  );
}
