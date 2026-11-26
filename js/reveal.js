/*
 * Tấm thiệp và nội dung hiện lên theo đúng nhịp cuộn (không phải bật một lần rồi tự chạy):
 *  - Tấm thiệp: từ dưới khung hình nhô lên, hơi ngả ra sau rồi dựng thẳng — xong đúng lúc máy quay tới trạm.
 *  - Từng dòng bên trong: hiện dần lần lượt khi chạm tới khoảng 90% chiều cao màn hình.
 *  - Ảnh: mở dần như kéo rèm.
 * Cuộn ngược thì mọi thứ lùi lại đúng đường cũ. Có giảm chấn nhẹ để con lăn chuột từng nấc vẫn mượt.
 * Chế độ giảm chuyển động: hiện ngay, không di chuyển.
 */
import { $$, isReduced, clamp, on } from './util.js';
import { addTicker, removeTicker } from './loop.js';

const ITEMS = [
  '.invite__card > :not(.families)', '.families > *',
  '.section__head > *',
  '.event > *', '.events__list > .event__pending',
  '.story__cover', '.story__open',
  '.form > .field', '.form > .btn', '.formcard > .done',
  '.wishes > *',
  '.thanks__content > *',
].join(',');

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const TAU = 120; // ms — độ “trễ” của giảm chấn

const list = [];
const known = new WeakSet();
let H = innerHeight || 812;
let running = false;
let first = true;

function docTop(el) {
  let y = 0;
  for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
  return y;
}

function collect() {
  for (const el of $$('.sheet')) if (!known.has(el)) { known.add(el); list.push({ el, kind: 'sheet', s: -1 }); }
  for (const el of $$(ITEMS)) {
    if (known.has(el)) continue;
    known.add(el);
    list.push({ el, kind: el.classList.contains('story__cover') ? 'media' : 'item', sheet: el.closest('.sheet, .thanks__content'), s: -1 });
  }
}

function measure() {
  H = innerHeight || 812;
  for (const it of list) {
    it.hidden = !it.el.isConnected || it.el.offsetParent === null;
    if (it.hidden) it.top = 0;
    else if (it.sheet) {
      // Trong tấm thiệp (đã thu cho vừa màn hình, có thể cuộn bên trong): các dòng hiện dần theo lúc tấm thiệp lên,
      // dòng dưới trễ hơn nửa nhịp — xong hết khi thiệp tới điểm dừng, kể cả dòng sát đáy màn hình.
      let o = 0;
      for (let n = it.el; n && n !== it.sheet; n = n.offsetParent) o += n.offsetTop;
      const z = parseFloat(it.sheet.style.getPropertyValue('--z')) || 1;
      it.top = docTop(it.sheet) + 0.5 * Math.min(o * z, it.sheet.offsetHeight);
    } else it.top = docTop(it.el);
  }
}

function target(it, y) {
  if (it.hidden) return 1;
  const vt = it.top - y;
  if (it.kind === 'sheet') return clamp((H - vt) / (H * 0.42), 0, 1);
  if (it.sheet) return clamp((H * 1.1 - vt) / (H * 0.2), 0, 1);
  return clamp((H * 0.94 - vt) / (H * 0.2), 0, 1);
}

function paint(it) {
  const st = it.el.style;
  const s = it.s;
  if (s >= 0.996) { st.opacity = ''; st.transform = ''; st.clipPath = ''; st.willChange = ''; return; }
  const e = easeOut(s);
  if (it.kind === 'sheet') {
    const lift = Math.min(150, H * 0.18);
    st.opacity = Math.min(1, s * 1.7).toFixed(3);
    st.transform = `perspective(1400px) translate3d(0,${((1 - e) * lift).toFixed(1)}px,0) rotateX(${((1 - e) * 10).toFixed(2)}deg) scale(${(0.95 + 0.05 * e).toFixed(4)})`;
  } else if (it.kind === 'media') {
    const c = 1 - e;
    st.opacity = Math.min(1, s * 2).toFixed(3);
    st.clipPath = `inset(${(c * 16).toFixed(2)}% ${(c * 7).toFixed(2)}% 0% ${(c * 7).toFixed(2)}% round 8px)`;
  } else {
    st.opacity = e.toFixed(3);
    st.transform = `translate3d(0,${((1 - e) * 26).toFixed(1)}px,0)`;
  }
  st.willChange = s > 0 ? 'opacity, transform' : '';
}

function clearAll() {
  for (const it of list) { it.s = 1; paint(it); }
}

function tick(now, dt) {
  if (isReduced()) { clearAll(); running = false; removeTicker(tick); return; }
  const y = scrollY;
  const k = 1 - Math.exp(-dt / TAU);
  let busy = false;
  for (const it of list) {
    const p = target(it, y);
    let s = it.s;
    if (first) s = p; // lần đầu: đặt ngay, không chạy hiệu ứng cho phần đang hiển thị
    else {
      if (s < 0) s = 0; // nội dung mới thêm vào (lời chúc, sự kiện) cũng hiện dần
      s += (p - s) * k;
      if (Math.abs(p - s) < 0.002) s = p; else busy = true;
    }
    if (s !== it.s) { it.s = s; paint(it); }
  }
  first = false;
  if (!busy) { running = false; removeTicker(tick); }
}

function start() {
  if (running) return;
  running = true;
  addTicker(tick);
}

export function refreshReveal() {
  collect();
  measure();
  start();
}

export function initReveal() {
  collect();
  measure();
  start();
  addEventListener('scroll', start, { passive: true });
  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { measure(); start(); }, 120); });
  new ResizeObserver(refreshReveal).observe(document.querySelector('main'));
  document.fonts?.ready.then(() => { measure(); start(); });
  on('dn:motion', () => { measure(); start(); });
}
