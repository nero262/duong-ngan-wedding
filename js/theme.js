/*
 * Sắc trời (Tự động / Sáng / Trầm / Tối) và chế độ giảm chuyển động.
 * Đổi chế độ chỉ đổi biến màu → bố cục, vị trí cuộn và nội dung biểu mẫu giữ nguyên.
 */
import { $, $$, root, store, emit } from './util.js';

const THEME_COLOR = { day: '#0E1828', dusk: '#0E1828', night: '#0E1828' }; // giao diện tối ở cả ba sắc trời (theo ảnh mẫu)
const LABEL = { day: 'Sáng', dusk: 'Trầm', night: 'Tối' };

export function autoSky(d = new Date()) {
  const h = d.getHours();
  return h >= 6 && h < 16 ? 'day' : h >= 16 && h < 19 ? 'dusk' : 'night';
}

export function initTheme() {
  let pref = store.get('dn.sky') || 'auto';
  const meta = $('meta[name="theme-color"]');
  const button = $('#sky-button');
  const panel = $('#sky-panel');
  const icon = $('[data-sky-icon]');
  const autoNote = $('[data-sky-auto-note]');

  function apply(sky) {
    if (root.dataset.sky !== sky) {
      root.dataset.sky = sky;
      emit('dn:sky', sky);
    }
    meta.content = THEME_COLOR[sky];
    icon.setAttribute('href', `#i-${pref === 'auto' ? 'auto' : sky}`);
    button.querySelector('.tool__label').textContent = `Sắc trời: ${pref === 'auto' ? 'Tự động' : LABEL[sky]}`;
    button.setAttribute('aria-label', `Đổi sắc trời — đang dùng ${pref === 'auto' ? `Tự động (${LABEL[sky]})` : LABEL[sky]}`);
    autoNote.textContent = `Theo giờ của bạn · đang ${LABEL[autoSky()]}`;
    $$('input[name="sky"]', panel).forEach((r) => { r.checked = r.value === pref; });
  }

  apply(pref === 'auto' ? autoSky() : pref);
  setInterval(() => { if (pref === 'auto') apply(autoSky()); }, 60_000);

  const close = (focusButton = false) => {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focusButton) button.focus();
  };
  button.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) panel.querySelector('input:checked')?.focus();
  });
  panel.addEventListener('change', (e) => {
    pref = e.target.value;
    if (pref === 'auto') store.remove('dn.sky'); else store.set('dn.sky', pref);
    apply(pref === 'auto' ? autoSky() : pref);
  });
  panel.addEventListener('click', (e) => {
    // chạm vào một lựa chọn (không phải điều hướng bằng phím) thì đóng bảng
    if (e.target.closest('.skyopt') && e.detail > 0) setTimeout(() => close(), 220);
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(true); }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !e.target.closest('.skymenu')) close();
  });

  /* Giảm chuyển động */
  const motionBtn = $('#motion-button');
  const motionIcon = $('[data-motion-icon]');
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const syncMotion = () => {
    const reduced = root.dataset.motion === 'reduced';
    motionBtn.setAttribute('aria-pressed', String(reduced));
    motionIcon.setAttribute('href', reduced ? '#i-still' : '#i-motion');
    motionBtn.querySelector('.tool__label').textContent = reduced ? 'Đang giảm chuyển động' : 'Giảm chuyển động';
  };
  const setMotion = (reduced, remember) => {
    root.dataset.motion = reduced ? 'reduced' : 'full';
    if (remember) store.set('dn.motion', reduced ? 'reduced' : 'full');
    syncMotion();
    emit('dn:motion', reduced);
  };
  motionBtn.addEventListener('click', () => setMotion(root.dataset.motion !== 'reduced', true));
  mq.addEventListener?.('change', () => { if (!store.get('dn.motion')) setMotion(mq.matches, false); });
  syncMotion();
}
