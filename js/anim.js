/*
 * Hiệu ứng chuyển động cho giao diện — bọc mỏng Web Animations API, không thư viện ngoài.
 * (Cú máy, phong cảnh, nhân vật dùng vòng lặp riêng trong loop.js / stage.js — xem .claude/skills/web-animation/SKILL.md.)
 *
 *  - Chỉ animate transform / opacity (clip-path khi thật cần): chạy trên GPU, không đẩy bố cục.
 *  - Phần tử “đi vào” từ trạng thái ẩn tới trạng thái tự nhiên của nó trong CSS, nên tắt hiệu ứng thì nội dung vẫn hiện đúng.
 *  - Tôn trọng chế độ giảm chuyển động của trang (nút “Giảm chuyển động” hoặc prefers-reduced-motion — util.isReduced):
 *      reduced: 'skip' (mặc định) bỏ qua · 'fade' chỉ mờ dần ngắn, không dịch chuyển · 'run' chạy như thường (chuyển cảnh chỉ đổi độ mờ).
 *  - play() trả về Promise luôn kết thúc (bị huỷ cũng coi như xong) để xếp chuỗi; group() gom animation để huỷ một lần.
 */
import { isReduced } from './util.js';

/* Cùng nhịp với biến CSS --ease / --ease-out trong main.css */
export const EASE = { out: 'cubic-bezier(.22,.8,.24,1)', inOut: 'cubic-bezier(.65,0,.35,1)', swift: 'cubic-bezier(.33,0,.15,1)' };
export const DUR = { s: 280, m: 600, l: 1000 };

/* Mẫu khung hình hay dùng (trạng thái đầu → trạng thái tự nhiên) */
export const PRESET = {
  fade: () => [{ opacity: 0 }, { opacity: 1 }],
  rise: (d = 12) => [{ opacity: 0, transform: `translateY(${d}px)` }, { opacity: 1, transform: 'none' }],
  slide: (dir = 1, d = 24) => [{ opacity: 0, transform: `translateX(${dir * d}px)` }, { opacity: 1, transform: 'none' }],
  pop: () => [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }],
};

/* Tạo Animation (hoặc null nếu bỏ qua). fill mặc định 'backwards': trong lúc chờ delay, phần tử giữ khung đầu — không nháy. */
function run(el, keyframes, { reduced = 'skip', ...opts } = {}) {
  if (!el?.animate) return null;
  let kf = keyframes;
  let o = { duration: DUR.m, easing: EASE.out, fill: 'backwards', ...opts };
  if (isReduced()) {
    if (reduced === 'skip') return null;
    if (reduced === 'fade') {
      kf = kf.map(({ opacity = 1, offset }) => (offset == null ? { opacity } : { opacity, offset }));
      o = { ...o, duration: Math.min(o.duration, 200), delay: 0 };
    }
  }
  return el.animate(kf, o);
}

const settle = (a) => (a ? a.finished.then(() => {}, () => {}) : Promise.resolve());

export function play(el, keyframes, opts) {
  return settle(run(el, keyframes, opts));
}

/* Lần lượt từng phần tử, cách nhau step ms. keyframes có thể là hàm (i) => khung hình. */
export function stagger(els, keyframes, { step = 70, delay = 0, ...opts } = {}) {
  return Promise.all([...els].map((el, i) =>
    play(el, typeof keyframes === 'function' ? keyframes(i) : keyframes, { ...opts, delay: delay + i * step })));
}

/* Một nhóm animation dùng chung tuỳ chọn mặc định; cancel() huỷ tất cả (ví dụ khi khách bấm “Bỏ qua”).
   run() trả về chính đối tượng Animation (hoặc null) để chờ .finished / huỷ riêng. */
export function group(defaults = {}) {
  const list = [];
  return {
    run(el, keyframes, opts) {
      const a = run(el, keyframes, { ...defaults, ...opts });
      if (a) list.push(a);
      return a;
    },
    cancel() { list.splice(0).forEach((a) => a.cancel()); },
  };
}
