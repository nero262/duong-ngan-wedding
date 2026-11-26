/*
 * Một vòng lặp requestAnimationFrame dùng chung.
 * - Tự dừng khi không có cảnh nào cần vẽ hoặc tab bị ẩn.
 * - Đo thời gian khung hình; nếu máy chậm thì hạ chất lượng hiệu ứng.
 */
const tickers = new Set();
let raf = 0;
let last = 0;
let samples = [];

const coarse = matchMedia('(pointer: coarse)').matches;
const small = Math.min(screen.width, screen.height) < 768;
let base = coarse || small ? 0.6 : 1;
if ((navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)) base *= 0.75;

export const quality = {
  level: base,
  dpr() { return Math.min(window.devicePixelRatio || 1, this.level >= 0.75 ? 2 : 1.5, this.level < 0.45 ? 1 : 2); },
};

function frame(now) {
  raf = 0;
  const dt = last ? Math.min(now - last, 100) : 16.7;
  last = now;
  samples.push(dt);
  if (samples.length >= 90) {
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    samples = [];
    if (avg > 24 && quality.level > 0.3) quality.level = Math.max(0.3, quality.level * 0.7);
  }
  for (const fn of tickers) fn(now, dt);
  if (tickers.size && !document.hidden) raf = requestAnimationFrame(frame);
}

function kick() {
  if (!raf && tickers.size && !document.hidden) {
    last = 0;
    raf = requestAnimationFrame(frame);
  }
}

export function addTicker(fn) { tickers.add(fn); kick(); }
export function removeTicker(fn) { tickers.delete(fn); }

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; samples = []; }
  else kick();
});
