// Platzhalter-Seite pro Bereich – wird in den nächsten Stufen gefüllt.
import { byId } from '../areas.js';
import { h, icon } from '../ui.js';

export function render(id) {
  const a = byId[id];
  return h(`div.view.a-${a.id}`,
    h('header.area-hero',
      h('span.area-icon.big', icon(a.id, 28)),
      h('h1', a.name),
      h('p', a.goal),
    ),
    h('section.card',
      h('p.label', `Kommt in Stufe ${a.stage}`),
      h('ul.coming', a.coming.map((c) => h('li', c))),
    ),
  );
}
