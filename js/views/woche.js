// Wochenansicht: jede Woche ansehen – Zielerreichung, Bewertung, Ziele, Reflexion, Export.
import * as week from '../week.js';
import { AREAS } from '../areas.js';
import { goalEditor } from './goals.js';
import { h, icon, toast, addDays, weekStart, isoWeek, fmtShort } from '../ui.js';

let monday = weekStart();
let editing = null; // Bereich, dessen Ziele gerade bearbeitet werden

export function render(refresh) {
  const cur = weekStart();
  const go = (n) => {
    monday = addDays(monday, 7 * n);
    editing = null;
    refresh();
  };
  const rv = week.review(monday);
  const isCur = +monday === +cur;
  const canReview = +monday === +week.reviewMonday();

  return h('div.view',
    h('a.backlink', { href: '#/heute' }, icon('back', 18), 'Übersicht'),
    h('div.weeknav',
      h('button.navbtn2', { onclick: () => go(-1), 'aria-label': 'Vorherige Woche' }, icon('back', 20)),
      h('div.center',
        h('h1', `KW ${isoWeek(monday)}`),
        h('p.muted', `${fmtShort(monday)}–${fmtShort(addDays(monday, 6))}${isCur ? ' · diese Woche' : ''}`),
      ),
      h('button.navbtn2.flip', { onclick: () => go(1), 'aria-label': 'Nächste Woche', disabled: +monday > +cur }, icon('back', 20)),
    ),

    canReview && h('a.card.review', { href: '#/review' },
      h('span.review-icon', icon('calendar', 22)),
      h('div', h('p.label', rv.doneAt ? 'Review ansehen' : rv.step ? 'Review fortsetzen' : 'Review starten'), h('p.muted', 'Schritt für Schritt, ca. 10 Minuten')),
    ),

    AREAS.map((a) => {
      const sc = week.areaScore(a.id, monday);
      const rating = rv.ratings?.[a.id];
      const goals = week.goals(monday, a.id);
      return h(`section.card.a-${a.id}`,
        h('div.sec-title', h('span.sec-icon', icon(a.id, 18)), h('h2', a.name),
          rating && h('span.count', `${rating}/10`)),
        h('div.wk-score',
          h('b', sc.pct != null ? `${sc.pct} %` : '–'),
          h('span.small.muted', sc.parts.map((p) => `${p.label} ${p.done}/${p.total}`).join(' · ') || 'Noch keine Daten'),
        ),
        h('div.bar', h('i', { style: { width: `${sc.pct || 0}%` } })),
        editing === a.id
          ? [goalEditor(monday, a.id, refresh), h('button.link', { onclick: () => { editing = null; refresh(); } }, 'Fertig')]
          : [
            goals.map((g) => h(`button.check${g.done ? '.done' : ''}`, {
              onclick: () => {
                week.updateGoal(g, { done: !g.done });
                refresh();
              },
            }, h('span.box', icon('check', 18)), h('span.check-name', g.text))),
            h('button.link', { onclick: () => { editing = a.id; refresh(); } }, goals.length ? 'Ziele bearbeiten' : '+ Wochenziel festlegen'),
          ],
      );
    }),

    (rv.gut || rv.schlecht || rv.aendern) && h('section.card',
      h('div.sec-title', h('span.sec-icon', icon('sinn', 18)), h('h2', 'Reflexion')),
      rv.gut && h('div.refl', h('span.small.muted', 'Was lief gut'), h('p', rv.gut)),
      rv.schlecht && h('div.refl', h('span.small.muted', 'Was lief nicht so gut'), h('p', rv.schlecht)),
      rv.aendern && h('div.refl', h('span.small.muted', 'Was ich ändere'), h('p', rv.aendern)),
    ),

    h('section.card',
      h('div.sec-title', h('span.sec-icon', icon('upload', 18)), h('h2', 'Wochenexport')),
      h('p.muted', 'Zusammenfassung als Text für deine Claude-Projekte.'),
      h('div.buttons',
        h('button.btn.primary', { onclick: () => copy(week.exportText(monday)) }, 'Alles kopieren'),
        h('button.btn.ghost', { onclick: () => copy(week.exportText(monday, 'koerper')) }, 'Nur Körper'),
      ),
      h('details.preview-text', h('summary', 'Vorschau'), h('pre', week.exportText(monday))),
    ),
  );
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Kopiert – jetzt in Claude einfügen');
  } catch {
    toast('Kopieren hat nicht geklappt', 'error');
  }
}
