import * as store from '../store.js';
import * as sync from '../sync.js';
import { AREAS } from '../areas.js';
import * as body from '../body.js';
import { h, icon, iso, weekDays, isoWeek, fmtLong, WD_SHORT, MONTHS, addDays, weekStart } from '../ui.js';

function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return 'Gute Nacht';
  if (hr < 11) return 'Guten Morgen';
  if (hr < 18) return 'Hallo';
  return 'Guten Abend';
}

function reviewText(now = new Date()) {
  const due = addDays(weekStart(now), 6);
  due.setHours(20, 0, 0, 0);
  if (now >= due) return { title: 'Zeit für dein Wochen-Review', sub: 'Nimm dir 10 ruhige Minuten.', now: true };
  const days = Math.round((new Date(due.getFullYear(), due.getMonth(), due.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const when = days === 0 ? 'heute um 20:00' : days === 1 ? 'morgen um 20:00' : `in ${days} Tagen · Sonntag 20:00`;
  return { title: 'Sonntags-Review', sub: when, now: false };
}

// Wochenfortschritt pro Bereich (weitere Bereiche folgen in den nächsten Stufen)
const SCORES = { koerper: () => body.weekScore() };

// „Als Nächstes“: nächste Mahlzeit und überfällige Routinen – gegen das Vergessen.
function nextUp(today) {
  const meal = body.nextMeal(today);
  const nowT = new Date().toTimeString().slice(0, 5);
  const open = body.routines().filter((r) => r.zeit && r.zeit <= nowT && !body.routineDone(today, r.id));
  if (!meal && !open.length) return null;
  return h('a.card.next-up.a-koerper', { href: '#/koerper' },
    h('div.sec-title', h('span.sec-icon', icon('bell', 18)), h('h2', 'Als Nächstes')),
    meal && h(`div.nu-row.catrow.cat-${body.category(meal)}`,
      h('span.time', meal.zeit || '–'),
      h('span', h('b', meal.name), h('span.small.muted.block', `${body.catName(body.category(meal))} · ${Math.round(meal.kcal)} kcal · ${Math.round(meal.protein)} g Protein`)),
    ),
    open.length > 0 && h('div.nu-row',
      h('span.time', open.length),
      h('span', h('b', open.length === 1 ? 'Routine offen' : 'Routinen offen'), h('span.small.muted.block', open.map((r) => r.name).join(', '))),
    ),
  );
}

export function render() {
  const now = new Date();
  const name = store.get('settings.name', '');
  const days = weekDays(now);
  const first = days[0];
  const last = days[6];
  const range = first.getMonth() === last.getMonth()
    ? `${first.getDate()}.–${last.getDate()}. ${MONTHS[last.getMonth()]}`
    : `${first.getDate()}. ${MONTHS[first.getMonth()]} – ${last.getDate()}. ${MONTHS[last.getMonth()]}`;
  const review = reviewText(now);
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
        const pct = SCORES[a.id] ? SCORES[a.id]() : null;
        return h(`a.card.area.a-${a.id}`, { href: `#/${a.id}` },
          h('div.area-top', h('span.area-icon', icon(a.id, 20)), h('span.area-name', a.tab)),
          pct == null
            ? h('p.small.muted', `ab Stufe ${a.stage}`)
            : h('p.area-pct', pct, h('small', '% diese Woche')),
          h('div.bar', h('i', { style: { width: `${pct || 0}%` } })),
        );
      }),
    ),

    h(`section.card.review${review.now ? '.due' : ''}`,
      h('span.review-icon', icon('calendar', 22)),
      h('div', h('p.label', review.title), h('p.muted', review.sub)),
    ),

    !sync.getConfig() && h('a.card.hint', { href: '#/einstellungen' },
      h('span.review-icon', icon('sync', 22)),
      h('div',
        h('p.label', 'Sync einrichten'),
        h('p.muted', 'Damit iPhone und Mac dieselben Daten haben.'),
      ),
    ),
  );
}
