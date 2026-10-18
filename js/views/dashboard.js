import * as store from '../store.js';
import * as sync from '../sync.js';
import { AREAS } from '../areas.js';
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
    h('header.hero',
      h('p.eyebrow', fmtLong(now)),
      h('h1', name ? `${greeting()}, ${name}` : greeting()),
    ),

    h('section.card.week',
      h('div.row.between',
        h('div', h('p.label', `Woche ${isoWeek(now)}`), h('p.muted', range)),
      ),
      h('div.weekstrip',
        days.map((d) => h(`div.wday${iso(d) === today ? '.today' : ''}${iso(d) < today ? '.past' : ''}`,
          h('span', WD_SHORT[d.getDay()]),
          h('b', d.getDate()),
        )),
      ),
    ),

    h('div.areas',
      AREAS.map((a) => h(`a.card.area.a-${a.id}`, { href: `#/${a.id}` },
        h('div.area-top', h('span.area-icon', icon(a.id, 20)), h('span.area-name', a.tab)),
        h('div.bar', h('i', { style: { width: '0%' } })),
        h('p.small.muted', `Fortschritt ab Stufe ${a.stage}`),
      )),
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
