/* Tiện ích dùng chung. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const root = document.documentElement;

export const store = {
  get(key, session = false) {
    try { return (session ? sessionStorage : localStorage).getItem(key); } catch { return null; }
  },
  set(key, value, session = false) {
    try { (session ? sessionStorage : localStorage).setItem(key, value); } catch { /* chế độ riêng tư */ }
  },
  remove(key, session = false) {
    try { (session ? sessionStorage : localStorage).removeItem(key); } catch { /* bỏ qua */ }
  },
};

export const isReduced = () => root.dataset.motion === 'reduced';
export const currentSky = () => root.dataset.sky || 'day';
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function emit(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}
export function on(name, fn) {
  document.addEventListener(name, (e) => fn(e.detail));
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c.nodeType ? c : document.createTextNode(c));
  return node;
}

export function svgUse(id, cls = 'icon') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

/* Ngày giờ — luôn theo múi giờ Việt Nam (UTC+7, không có giờ mùa hè). */
export const VN_TZ = 'Asia/Ho_Chi_Minh';
export const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

export function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
export function weekday(iso) {
  const p = parseDate(iso);
  return p ? WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()] : '';
}
export function formatDate(iso, { withWeekday = true } = {}) {
  const p = parseDate(iso);
  if (!p) return '';
  const date = `${String(p.d).padStart(2, '0')}.${String(p.m).padStart(2, '0')}.${p.y}`;
  return withWeekday ? `${weekday(iso)}, ${date}` : date;
}
export function todayInVN() {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parseDate(s);
}
export function daysUntil(iso) {
  const p = parseDate(iso);
  const t = todayInVN();
  if (!p || !t) return null;
  return Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(t.y, t.m - 1, t.d)) / 86400000);
}

export function fetchWithTimeout(url, opts = {}, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/* Tạm dừng khi phần tử ra khỏi màn hình. */
export function watchVisibility(node, fn, rootMargin = '0px') {
  if (!('IntersectionObserver' in window)) { fn(true); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => fn(e.isIntersecting)), { rootMargin });
  io.observe(node);
  return io;
}
