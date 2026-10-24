import * as store from '../store.js';
import * as sync from '../sync.js';
import { AREAS } from '../areas.js';
import * as body from '../body.js';
import * as week from '../week.js';
import * as pp from '../people.js';
import { sparkline } from '../chart.js';
import { h, icon, iso, weekDays, isoWeek, fmtLong, WD_SHORT, MONTHS, addDays, weekStart } from '../ui.js';

function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return 'Gute Nacht';
  if (hr < 11) return 'Guten Morgen';
  if (hr < 18) return 'Hallo';
  return 'Guten Abend';
}

function reviewCard(now = new Date()) {
  const m = week.reviewMonday(now);
  const rv = week.review(m);
  const due = addDays(weekStart(now), 6);
  due.setHours(20, 0, 0, 0);
  let title;
  let sub;
  let hot = false;
  if (rv.doneAt) {
    title = 'Review erledigt ✓';
    sub = 'Zusammenfassung und Export ansehen';
  } else if (+m < +weekStart(now)) {
    title = 'Review der letzten Woche nachholen';
    sub = 'Dauert nur ein paar Minuten';
    hot = true;
  } else if (now >= due || (now.getDay() === 0 && now.getHours() >= 18)) {
    title = 'Zeit für dein Wochen-Review';
    sub = rv.step ? 'Weitermachen, wo du warst' : 'Nimm dir 10 ruhige Minuten.';
    hot = true;
  } else {
    const days = Math.round((new Date(due.getFullYear(), due.getMonth(), due.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    title = 'Sonntags-Review';
    sub = days === 0 ? 'heute um 20:00' : days === 1 ? 'morgen um 20:00' : `in ${days} Tagen · Sonntag 20:00`;
  }
  return h(`a.card.review${hot ? '.due' : ''}`, { href: rv.doneAt ? '#/woche' : '#/review' },
    h('span.review-icon', icon('calendar', 22)),
    h('div', h('p.label', title), h('p.muted', sub)),
  );
}

let histWeeks = 4;
// Auf-/Zugeklappt merkt sich jedes Gerät selbst (reine Ansichtssache).
let histOpen = (() => {
  try {
    return localStorage.getItem('life4.histOpen') === '1';
  } catch {
    return false;
  }
})();

function historyCard(refresh) {
  const hist = week.ratingHistory(histWeeks);
  if (!hist.some((x) => Object.keys(x.ratings).length)) return null;
  const toggle = () => {
    histOpen = !histOpen;
    try {
      localStorage.setItem('life4.histOpen', histOpen ? '1' : '0');
    } catch { /* egal */ }
    refresh();
  };
  return h(`section.card.collapsible${histOpen ? '.open' : ''}`,
    h('button.sec-title.sec-toggle', { onclick: toggle, 'aria-expanded': histOpen },
      h('span.sec-icon', icon('chart', 18)), h('h2', 'Deine Wochen'), h('span.chev', icon('back', 18))),
    histOpen && [
      h('p.small.muted', `Deine Bewertung (1–10) der letzten ${histWeeks} Wochen. Antippen zeigt die Woche.`),
      AREAS.map((a) => {
        const vals = hist.map((x) => ({ label: `KW ${isoWeek(x.monday)}`, v: x.ratings[a.id] ?? null }));
        const last = [...vals].reverse().find((v) => v.v != null);
        const valEl = h('span.hist-val', last ? `${last.v}` : '–');
        const sub = h('span.small.muted', last ? last.label : '');
        return h(`div.hist-row.a-${a.id}`,
          h('span.hist-name', a.tab),
          sparkline(vals, {
            onPick: (p) => {
              valEl.textContent = p.v ?? '–';
              sub.textContent = p.label;
            },
          }),
          h('span.hist-right', valEl, sub),
        );
      }),
      h('div.buttons.split',
        h('button.btn.ghost', {
          onclick: () => {
            histWeeks = histWeeks === 4 ? 12 : 4;
            refresh();
          },
        }, histWeeks === 4 ? 'Übersicht 12 Wochen' : 'Nur 4 Wochen'),
        h('a.btn.ghost', { href: '#/woche' }, 'Alle Wochen'),
      ),
    ],
  );
}

// Wochenfortschritt pro Bereich aus den Tagesdaten (weitere Bereiche folgen in den nächsten Stufen)
const score = (id) => week.areaScore(id, weekStart(), { withGoals: false }).pct;

// „Als Nächstes“: nächste Mahlzeit und überfällige Routinen – gegen das Vergessen.
function nextUp(today) {
  const meal = body.nextMeal(today);
  const nowT = new Date().toTimeString().slice(0, 5);
  const open = body.routines().filter((r) => r.zeit && r.zeit <= nowT && !body.routineDone(today, r.id));
  const bdays = pp.upcomingBirthdays(1);
  if (!meal && !open.length && !bdays.length) return null;
  return h('section.card.next-up.a-koerper',
    h('div.sec-title', h('span.sec-icon', icon('bell', 18)), h('h2', 'Als Nächstes')),
    meal && h(`a.nu-row.catrow.cat-${body.category(meal)}`, { href: '#/koerper' },
      h('span.time', meal.zeit || '–'),
      h('span', h('b', meal.name), h('span.small.muted.block', `${body.catName(body.category(meal))} · ${Math.round(meal.kcal)} kcal · ${Math.round(meal.protein)} g Protein`)),
    ),
    open.length > 0 && h('a.nu-row', { href: '#/koerper' },
      h('span.time', open.length),
      h('span', h('b', open.length === 1 ? 'Routine offen' : 'Routinen offen'), h('span.small.muted.block', open.map((r) => r.name).join(', '))),
    ),
    bdays.map(({ p, b }) => h('a.nu-row.a-contact', { href: `#/contact/p-${p.id}` },
      h('span.time', icon('cake', 22)),
      h('span', h('b', `${p.name} hat ${b.inDays === 0 ? 'heute' : 'morgen'} Geburtstag`), h('span.small.muted.block', b.age ? `wird ${b.age}` : 'Vielleicht magst du gratulieren.')),
    )),
  );
}

export function render(refresh) {
  const now = new Date();
  const name = store.get('settings.name', '');
  const days = weekDays(now);
  const first = days[0];
  const last = days[6];
  const range = first.getMonth() === last.getMonth()
    ? `${first.getDate()}.–${last.getDate()}. ${MONTHS[last.getMonth()]}`
    : `${first.getDate()}. ${MONTHS[first.getMonth()]} – ${last.getDate()}. ${MONTHS[last.getMonth()]}`;
  const today = iso(now);

  return h('div.view',
    h('section.dash-hero',
      h('p.eyebrow', fmtLong(now)),
      h('h1', name ? `${greeting()}, ${name}` : greeting()),
      h('div.weekhead', h('b', `Woche ${isoWeek(now)}`), h('span', range)),
      h('div.weekstrip',
        days.map((d) => h(`div.wday${iso(d) === today ? '.today' : ''}${iso(d) < today ? '.past' : ''}`,
          h('span', WD_SHORT[d.getDay()]),
          h('b', d.getDate()),
        )),
      ),
    ),

    nextUp(today),

    h('div.areas',
      AREAS.map((a) => {
        const pct = score(a.id);
        return h(`a.card.area.a-${a.id}`, { href: `#/${a.id}` },
          h('div.area-top', h('span.area-icon', icon(a.id, 20)), h('span.area-name', a.tab)),
          pct == null
            ? h('p.small.muted', a.ready ? 'Noch keine Daten' : `ab Stufe ${a.stage}`)
            : h('p.area-pct', pct, h('small', '%'), h('span.small.muted.block', 'diese Woche')),
          h('div.bar', h('i', { style: { width: `${pct || 0}%` } })),
        );
      }),
    ),

    reviewCard(now),
    historyCard(refresh),

    !sync.getConfig() && h('a.card.hint', { href: '#/einstellungen' },
      h('span.review-icon', icon('sync', 22)),
      h('div',
        h('p.label', 'Sync einrichten'),
        h('p.muted', 'Damit iPhone und Mac dieselben Daten haben.'),
      ),
    ),
  );
}
