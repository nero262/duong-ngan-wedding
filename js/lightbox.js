/* Trình xem ảnh toàn màn hình: chạm để mở, vuốt ngang để chuyển, vuốt xuống / Esc / nút × để đóng.
   Ảnh luôn hiện trọn (object-fit: contain), kể cả trang đôi 2:1 trên điện thoại dựng đứng.
   Trình duyệt chọn cỡ ảnh theo đúng khung đang hiện (srcset + sizes); ảnh mờ 24 px hiện ngay trong lúc tải. */
import { $ } from './util.js';
import { play, PRESET, DUR } from './anim.js';

const dialog = $('#lightbox');
const img = $('.lightbox__img', dialog);
const caption = $('.lightbox__caption', dialog);
const count = $('.lightbox__count', dialog);
const prevBtn = $('.lightbox__prev', dialog);
const nextBtn = $('.lightbox__next', dialog);
let items = [];
let index = 0;
let returnFocus = null;

// cỡ tải = bề rộng thật của ảnh trong khung (contain: chạm bề rộng hoặc chiều cao khung, tuỳ tỉ lệ)
function load(item) {
  const im = new Image();
  const w = img.clientWidth;
  im.decoding = 'async';
  im.sizes = w && item.w ? `${Math.ceil(Math.min(w, img.clientHeight * item.w / item.h))}px` : '100vw';
  if (item.srcset) im.srcset = item.srcset;
  im.src = item.src;
  return im;
}

function show(i, dir = 0) {
  index = (i + items.length) % items.length;
  const item = items[index];
  const next = load(item);
  const ready = next.complete && next.naturalWidth;
  img.alt = item.alt || '';
  img.classList.toggle('is-loading', !ready && !!item.lqip);
  img.src = ready ? next.currentSrc || next.src : item.lqip || next.src;
  caption.textContent = item.caption || '';
  caption.hidden = !item.caption;
  count.textContent = `${index + 1} / ${items.length}`;
  if (dir) play(img, PRESET.slide(dir), { duration: DUR.s, easing: 'ease-out', reduced: 'fade' });
  if (!ready) {
    const swap = () => { if (items[index] !== item) return; img.src = next.currentSrc || next.src; img.classList.remove('is-loading'); };
    (next.decode ? next.decode() : Promise.resolve()).then(swap, swap);
  }
  if (items.length > 1) load(items[(index + 1) % items.length]); // tải trước ảnh kế tiếp
  prevBtn.hidden = nextBtn.hidden = items.length < 2;
}

export function openLightbox(list, i = 0) {
  items = list;
  returnFocus = document.activeElement || document.body;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  document.documentElement.style.overflow = 'hidden';
  show(i); // sau khi mở: đo được khung ảnh để chọn cỡ
  $('.lightbox__close', dialog).focus();
}

function cleanup() {
  if (!returnFocus) return;
  document.documentElement.style.overflow = '';
  const target = returnFocus;
  returnFocus = null;
  target.focus?.({ preventScroll: true });
}

function close() {
  if (dialog.open && typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
  cleanup();
}

dialog.addEventListener('close', cleanup);
dialog.addEventListener('cancel', () => setTimeout(cleanup, 0));
$('.lightbox__close', dialog).addEventListener('click', close);
prevBtn.addEventListener('click', () => show(index - 1, -1));
nextBtn.addEventListener('click', () => show(index + 1, 1));
dialog.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') show(index - 1, -1);
  if (e.key === 'ArrowRight') show(index + 1, 1);
});
let swiped = 0;
dialog.addEventListener('click', (e) => {
  if (Date.now() - swiped < 400) return;
  if (e.target === dialog || e.target.classList.contains('lightbox__inner')) close();
});

let start = null;
dialog.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  start = { x: e.clientX, y: e.clientY, t: Date.now() };
});
dialog.addEventListener('pointerup', (e) => {
  if (!start) return;
  const dx = e.clientX - start.x;
  const dy = e.clientY - start.y;
  start = null;
  if (Math.abs(dx) > 30 || Math.abs(dy) > 30) swiped = Date.now();
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) show(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) close();
});
dialog.addEventListener('pointercancel', () => { start = null; });
