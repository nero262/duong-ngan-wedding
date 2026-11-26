/*
 * Lăn / vuốt / bấm phím một lần là sang trọn phần sau: trang trượt tới đúng điểm dừng kế tiếp (màn hình đầu → từng tấm thiệp → lời cảm ơn).
 * Không bao giờ dừng lưng chừng: trang chỉ đứng ở các điểm dừng. Thiệp dài hơn màn hình một chút (≤ TRIM): một điểm dừng ở đáy thiệp
 * (phần khuất dưới thanh công cụ chỉ là lề trên + nhãn nhỏ). Dài hơn nữa (điện thoại rất thấp): thêm điểm dừng cách nhau gần một màn hình
 * (chừa vài dòng cũ để không mất mạch đọc) tới đáy thiệp.
 * Không can thiệp khi: đang gõ trong biểu mẫu (bàn phím ảo), xem ảnh lớn, cảnh mở thiệp, phóng to bằng Ctrl / hai ngón, cuộn ngang, kéo thanh cuộn.
 */
import { root, isReduced, clamp } from './util.js';
import { addTicker, removeTicker } from './loop.js';

const LOCK = 650;  // ms — bỏ qua phần đuôi quán tính của cùng một cú lăn bàn rê
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const SWIPE = 24;  // px — vuốt ngắn hơn thì coi như chạm nhầm
const KEEP = 150;  // px — thiệp dài: mỗi bước cuộn một màn hình trừ thanh công cụ và vài dòng cũ
const TRIM = 64;   // px — thiệp lố ít hơn mức này: chỉ dừng ở đáy thiệp, không bắt vuốt thêm một bước ngắn

export function initPager(stage) {
  let busyUntil = 0, lastWheel = 0, anim = null;
  // trượt tự tính (0,5–0,9 s) thay cho cuộn mượt của trình duyệt — quãng dài trình duyệt chạy tới 1,5 s, thấy ì
  const step = (now) => {
    const t = Math.min(1, (now - anim.t0) / anim.dur);
    scrollTo({ top: anim.from + (anim.to - anim.from) * ease(t), behavior: 'instant' });
    if (t >= 1) { removeTicker(step); anim = null; }
  };

  const off = (t) => root.classList.contains('intro-pending') || document.querySelector('dialog[open]')
    || document.activeElement?.matches?.('input, textarea, select, [contenteditable]') || t?.closest?.('textarea, select, dialog');
  // mọi điểm dừng (px, tăng dần): đầu trang, mỗi thiệp một điểm; thiệp dài thêm từng màn hình từ b tới đáy thiệp (e)
  const stops = () => {
    const max = document.documentElement.scrollHeight - innerHeight, page = innerHeight - KEEP;
    const ys = [0];
    for (const { b, e } of stage.anchors) {
      if (e - b > TRIM) for (let y = b; y < e; y += page) ys.push(y);
      ys.push(e);
    }
    return [...new Set(ys.map((y) => Math.round(Math.min(y, max))))].sort((p, q) => p - q);
  };
  // dir = 1 xuống / -1 lên → điểm dừng kế tiếp tính từ `from`, hoặc null nếu đã ở đầu / cuối
  const target = (dir, from = scrollY) => {
    const S = stops();
    return (dir > 0 ? S.find((s) => s > from + 2) : S.filter((s) => s < from - 2).pop()) ?? null;
  };
  const go = (y) => {
    const now = performance.now();
    if (isReduced()) { busyUntil = now + LOCK; scrollTo({ top: y, behavior: 'instant' }); return; }
    if (!anim) addTicker(step);
    anim = { from: scrollY, to: y, t0: now, dur: clamp(420 + Math.abs(y - scrollY) * 0.18, 500, 900) };
    busyUntil = now + anim.dur + 250;
  };

  addEventListener('wheel', (ev) => {
    if (ev.ctrlKey || Math.abs(ev.deltaX) > Math.abs(ev.deltaY) || !ev.deltaY || off(ev.target)) return;
    const now = performance.now(), cont = now - lastWheel < 160;
    lastWheel = now;
    ev.preventDefault(); // không để trình duyệt cuộn dở dang — trang chỉ đứng ở điểm dừng
    if (now < busyUntil) { if (cont) busyUntil = Math.max(busyUntil, now + 160); return; }
    const y = target(Math.sign(ev.deltaY));
    if (y !== null) go(y);
  }, { passive: false });

  // Vuốt: chặn cuộn ngay từ lần di ngón đầu tiên (iOS chỉ cho chặn ở lần đầu — chặn muộn thì trình duyệt đã cuộn theo đà tay,
  // trang trôi lưng chừng và giật khi hai chuyển động chồng nhau); nhấc tay mới trượt tới điểm dừng.
  let t0 = null;
  addEventListener('touchstart', (ev) => {
    t0 = ev.touches.length === 1 && !off(ev.target) ? ev.touches[0].clientY : null;
  }, { passive: true });
  addEventListener('touchmove', (ev) => {
    if (t0 === null) return;
    if (ev.touches.length > 1) { t0 = null; return; } // hai ngón: phóng to
    if (ev.cancelable) ev.preventDefault();
  }, { passive: false });
  addEventListener('touchend', (ev) => {
    const start = t0;
    t0 = null;
    if (start === null) return;
    const dy = start - ev.changedTouches[0].clientY;
    if (Math.abs(dy) < SWIPE) return;
    // vuốt tiếp khi đang trượt: tính từ đích đang tới → vuốt hai lần là sang hai phần
    const y = target(Math.sign(dy), anim ? anim.to : scrollY);
    if (y !== null) go(y);
  });

  const KEYS = { PageDown: 1, PageUp: -1, ArrowDown: 1, ArrowUp: -1, ' ': 1 };
  addEventListener('keydown', (ev) => {
    let dir = KEYS[ev.key];
    if (!dir || ev.altKey || ev.ctrlKey || ev.metaKey || off(ev.target) || ev.target.closest?.('button, a, [role=menu], .skymenu')) return;
    if (ev.key === ' ' && ev.shiftKey) dir = -1;
    ev.preventDefault();
    if (performance.now() < busyUntil) return;
    const y = target(dir);
    if (y !== null) go(y);
  });
}
