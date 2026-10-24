// Kleine Helfer für Oberfläche und Datum.

// h('div.card', {onclick}, kinder…) erzeugt ein DOM-Element.
export function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

const ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  koerper: '<path d="M6.5 7v10M17.5 7v10M3.5 10v4M20.5 10v4M6.5 12h11"/>',
  sinn: '<path d="M12 20c-4.5 0-8.5-3-8.5-7.5 3.5 0 6.5 2 8.5 5 2-3 5-5 8.5-5 0 4.5-4 7.5-8.5 7.5z"/><path d="M12 17.5c-2.2-3.2-2.2-8.3 0-12.5 2.2 4.2 2.2 9.3 0 12.5z"/>',
  leistung: '<path d="M3.5 5.5h5.5a3 3 0 013 3V19a2.5 2.5 0 00-2.5-2.5h-6z"/><path d="M20.5 5.5H15a3 3 0 00-3 3V19a2.5 2.5 0 012.5-2.5h6z"/>',
  contact: '<circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="12" r="5.8"/><circle cx="12" cy="12" r="9.3" stroke-dasharray="2.5 2.5"/>',
  sync: '<path d="M19.5 10A8 8 0 006 6.5L4 8.5"/><path d="M4 4.5v4h4"/><path d="M4.5 14A8 8 0 0018 17.5l2-2"/><path d="M20 19.5v-4h-4"/>',
  settings: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4.5 7h15M10 4h4M6.5 7l1 12.5h9l1-12.5"/>',
  meal: '<path d="M7 3.5v7.5M4.5 3.5V8a2.5 2.5 0 005 0V3.5M7 11v9.5"/><path d="M17.5 20.5V3.5c-2.2 0-3.5 2.6-3.5 6.5v3.5h3.5"/>',
  list: '<path d="M9.5 6.5h10M9.5 12h10M9.5 17.5h10"/><path d="M4 6.5l1.2 1.2L7 5.5M4 12l1.2 1.2L7 11M4 17.5l1.2 1.2L7 16.5"/>',
  scale: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 9.5a5.5 5.5 0 018 0M12 9.5l1.5-2"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2.2 2.2 0 004 0"/>',
  chart: '<path d="M4 19.5h16"/><path d="M5.5 15l4-4.5 3.5 3 5.5-6.5"/>',
  sparkle: '<path d="M12 3.5l1.8 4.9 4.7 1.6-4.7 1.6L12 16.5l-1.8-4.9L5.5 10l4.7-1.6z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1"/>',
  pen: '<path d="M4.5 19.5l1-4L16 5a2.1 2.1 0 013 3L8.5 18.5z"/><path d="M14 7l3 3"/>',
  heart: '<path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0112 7a4.2 4.2 0 017.5 2.5c0 5.6-7.5 10-7.5 10z"/>',
  cake: '<path d="M4.5 20.5h15v-7a2 2 0 00-2-2h-11a2 2 0 00-2 2z"/><path d="M4.5 15.5c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0"/><path d="M12 11.5V8.5M12 6.5c-.8-.8-.8-2 0-3 .8 1 .8 2.2 0 3z"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 006 6l1.5-2 4 1.5v3a2 2 0 01-2 2A16 16 0 014.5 5.5a2 2 0 012-2z"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0111 0"/><circle cx="16.5" cy="9.5" r="2.6"/><path d="M15.5 14.6a4.6 4.6 0 015 4.9"/>',
  chat: '<path d="M4.5 6.5a2 2 0 012-2h11a2 2 0 012 2v8a2 2 0 01-2 2H10l-4 3.5v-3.5h0a2 2 0 01-1.5-2z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8l1.6 2.3 2.7-.6.6 2.7 2.3 1.6-1.4 2.4 1.4 2.4-2.3 1.6-.6 2.7-2.7-.6L12 21.2l-1.6-2.3-2.7.6-.6-2.7-2.3-1.6 1.4-2.4-1.4-2.4 2.3-1.6.6-2.7 2.7.6z"/>',
  drop: '<path d="M12 3.5c3.2 4.1 6 7.4 6 10.6a6 6 0 01-12 0c0-3.2 2.8-6.5 6-10.6z"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>',
};

export function icon(name, size = 24) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
}

let toastTimer;
// action (optional): {label, fn} – z. B. „Rückgängig“
export function toast(msg, kind = '', action = null) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.replaceChildren(h('span', msg));
  if (action) {
    el.append(h('button.toast-btn', {
      onclick: () => {
        el.className = kind;
        action.fn();
      },
    }, action.label));
  }
  el.className = `show ${kind}${action ? ' has-action' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = kind), kind === 'error' || action ? 5000 : 2400);
}

// ---------- Datum ----------
// Alle Tage werden als 'JJJJ-MM-TT' in lokaler Zeit gespeichert.

export function iso(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Wochen beginnen am Montag.
export function weekStart(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(x, -((x.getDay() + 6) % 7));
}

export function weekDays(d = new Date()) {
  const s = weekStart(d);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

export function isoWeek(d = new Date()) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x - y0) / 86400000 + 1) / 7);
}

// Tage einer Woche bis heute (vergangene Wochen: alle 7) als 'JJJJ-MM-TT'.
export function pastDays(monday) {
  const today = iso();
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = iso(addDays(monday, i));
    if (d > today) break;
    out.push(d);
  }
  return out;
}

export const WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function fmtLong(d) {
  return `${WD_LONG[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

export function fmtShort(d) {
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

export function ago(ts) {
  if (!ts) return 'noch nie';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `vor ${hr} Std.`;
  const days = Math.round(hr / 24);
  return days === 1 ? 'gestern' : `vor ${days} Tagen`;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Datei speichern: iPhone → Teilen-Menü, Mac → Download.
export async function saveFile(blob, name, type) {
  const f = new File([blob], name, { type });
  try {
    if (navigator.canShare?.({ files: [f] }) && /iPhone|iPad|Android/.test(navigator.userAgent)) {
      await navigator.share({ files: [f], title: name });
    } else {
      const a = h('a', { href: URL.createObjectURL(blob), download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    return true;
  } catch (e) {
    if (e.name !== 'AbortError') toast('Speichern fehlgeschlagen', 'error');
    return false;
  }
}

// Bottom-Sheet: sheet(titel, inhalt) → { close }
export function sheet(title, ...content) {
  const close = () => {
    wrap.classList.remove('show');
    setTimeout(() => wrap.remove(), 220);
  };
  const wrap = h('div.sheet-wrap', { onclick: (e) => e.target === wrap && close() },
    h('div.sheet', { role: 'dialog', 'aria-label': title },
      h('div.sheet-grip'),
      h('h2.sheet-title', title),
      content,
    ),
  );
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  return { close };
}

// Zeile mit Tippen und Wischen nach links (z. B. „auslassen“).
// row enthält .swl-bg (Hintergrund mit Beschriftung) und inner (die eigentliche Zeile).
export function swipeLeft(inner, { label, onTap, onSwipe }) {
  const row = h('div.swl-row', h('div.swl-bg', h('span', label)), inner);
  let x0 = null;
  let y0 = 0;
  let dx = 0;
  let active = false;
  let pid = null;
  let swallow = false;
  inner.classList.add('swl-inner');
  inner.addEventListener('pointerdown', (e) => {
    x0 = e.clientX;
    y0 = e.clientY;
    dx = 0;
    active = false;
    pid = e.pointerId;
  });
  inner.addEventListener('pointermove', (e) => {
    if (x0 == null) return;
    const mx = e.clientX - x0;
    const my = e.clientY - y0;
    if (!active) {
      if (mx < -12 && -mx > Math.abs(my) * 1.5) {
        active = true;
        row.classList.add('swiping');
        inner.setPointerCapture(pid);
      } else if (Math.abs(my) > 12 || mx > 12) {
        x0 = null;
        return;
      } else return;
    }
    dx = Math.min(0, Math.max(mx, -160));
    inner.style.transform = `translateX(${dx}px)`;
    row.classList.toggle('armed', dx < -80);
  });
  const end = () => {
    if (x0 == null) return;
    const swiped = active && dx < -80;
    if (active) swallow = true;
    x0 = null;
    active = false;
    inner.style.transition = 'transform .2s ease';
    inner.style.transform = '';
    setTimeout(() => {
      inner.style.transition = '';
      row.classList.remove('swiping');
    }, 210);
    row.classList.remove('armed');
    if (swiped) onSwipe();
  };
  inner.addEventListener('pointerup', end);
  inner.addEventListener('pointercancel', end);
  inner.addEventListener('click', (e) => {
    if (swallow) {
      swallow = false;
      return;
    }
    if (e.target.closest('button, a, input')) return;
    onTap?.();
  });
  return row;
}
