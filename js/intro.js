/*
 * Cảnh 0 — tấm thiệp khép.
 * Dấu sáp nhấc lên, ruy băng tuột xuống → nắp thiệp mở chậm quanh gáy trái, bóng đổ lên trang trong đổi theo góc mở
 * → trang trong (vòm cửa nhìn ra chính cảnh mở đầu của trang, theo sắc trời hiện tại) phóng to phủ kín màn hình rồi tan vào cảnh thật.
 * Luôn có nút “Bỏ qua”. Chỉ hiện ở lần mở đầu tiên.
 */
import { $, root, store, isReduced, currentSky } from './util.js';
import { plateSrc } from './scene.js';
import { EASE, group, play } from './anim.js';
const supports3D = window.CSS && CSS.supports('transform-style', 'preserve-3d');

/* Trang trong của thiệp: vòm cửa, trong vòm là ảnh mở đầu (cùng ảnh với cảnh thật phía sau) */
function innerArt() {
  const aw = 124, ah = 172, ax = 100 - aw / 2, top = 40, thr = top + ah, R = aw / 2, vbH = 280;
  const archD = `M${ax} ${thr}V${top + R}a${R} ${R} 0 0 1 ${aw} 0V${thr}Z`;
  return `<svg class="card__art" viewBox="0 0 200 ${vbH}" aria-hidden="true" focusable="false">
  <defs><clipPath id="cardArch"><path d="${archD}"/></clipPath></defs>
  <rect class="card__wall" width="200" height="${vbH}"/>
  <path class="card__arch" d="${archD}"/>
  <image href="${plateSrc(currentSky(), 0)}" x="${ax}" y="${top}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cardArch)"/>
  <path class="card__frame" d="M${ax - 5} ${thr}V${top + R}a${R + 5} ${R + 5} 0 0 1 ${aw + 10} 0V${thr}" fill="none"/>
  <path class="card__floor" d="M${ax - 30} ${thr}h${aw + 60}" fill="none"/>
</svg>`;
}

export function initIntro() {
  const intro = $('#intro');
  if (!root.classList.contains('intro-pending')) return { replay };

  window.scrollTo(0, 0);
  const openBtn = $('[data-intro-open]', intro);
  const skipBtn = $('[data-intro-skip]', intro);
  // mọi animation của cảnh mở thiệp nằm trong một nhóm để “Bỏ qua” huỷ được một lần; chuyển cảnh mờ vẫn chạy khi giảm chuyển động
  const anims = group({ fill: 'forwards', easing: EASE.inOut, reduced: 'run' });
  let state = 'idle';

  const parts = {
    body: $('.ic__body', intro), cover: $('.ic__cover', intro), coverOut: $('.ic__face--out', intro), page: $('.ic__page', intro),
    shade: $('.ic__shade', intro), ribbon: $('.ic__ribbon', intro), seal: $('.ic__seal', intro),
    shadow: $('.ic__shadow', intro), bg: $('.intro__bg', intro), texts: [$('.intro__eyebrow', intro), $('.intro__guest', intro)],
  };
  parts.page.insertAdjacentHTML('afterbegin', innerArt());

  const A = (el, keyframes, opts) => (el ? anims.run(el, keyframes, opts) : null);

  requestAnimationFrame(() => openBtn.focus({ preventScroll: true }));
  openBtn.addEventListener('click', play);
  skipBtn.addEventListener('click', skip);
  intro.addEventListener('keydown', (e) => { if (e.key === 'Escape') skip(); });

  async function play() {
    if (state !== 'idle') return;
    state = 'playing';
    intro.classList.add('is-playing');
    openBtn.setAttribute('aria-hidden', 'true');
    openBtn.tabIndex = -1;
    skipBtn.focus({ preventScroll: true });
    try {
      if (isReduced() || !supports3D) await playSimple();
      else await playFull();
    } catch { /* hoạt họa bị huỷ do “Bỏ qua” */ }
    if (state === 'playing') finish();
  }

  async function playSimple() {
    A(openBtn, [{ opacity: 1 }, { opacity: 0 }], { duration: 250 });
    A(parts.seal, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    A(parts.ribbon, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    await A(parts.cover, [{ opacity: 1 }, { opacity: 0 }], { duration: 500, delay: 150 }).finished;
    await A(intro, [{ opacity: 1 }, { opacity: 0 }], { duration: 500 }).finished;
  }

  async function playFull() {
    const { body, cover, page, seal, ribbon } = parts;
    A(openBtn, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px)' }], { duration: 380 });
    parts.texts.forEach((t) => A(t, [{ opacity: 1 }, { opacity: 0 }], { duration: 500 }));
    A(body, [{ transform: 'rotateX(8deg)' }, { transform: 'rotateX(0deg) translateY(4%)' }], { duration: 1400 });
    // dấu sáp nhấc lên, ruy băng tuột xuống
    A(seal, [
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: 'translate(-50%,-62%) scale(1.08)', opacity: 1, offset: 0.4 },
      { transform: 'translate(-50%,-90%) scale(.9)', opacity: 0 },
    ], { duration: 620, delay: 120 });
    A(ribbon, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(38%) scaleY(.6)', opacity: 0 }], { duration: 620, delay: 300 });
    // nắp mở chậm; bóng đổ lên trang trong đậm nhất khi nắp dựng gần thẳng, mặt ngoài tối dần khi quay khỏi nguồn sáng
    const OPEN = { duration: 1750, delay: 700, easing: 'cubic-bezier(.45,0,.2,1)' };
    A(cover, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-172deg)' }], OPEN);
    A(parts.coverOut, [{ filter: 'brightness(1)' }, { filter: 'brightness(.84)', offset: 0.5 }, { filter: 'brightness(.8)' }], OPEN);
    A(parts.shade, [{ opacity: 0 }, { opacity: 0.42, offset: 0.38 }, { opacity: 0.16, offset: 0.7 }, { opacity: 0 }], OPEN);
    await A(parts.shadow, [
      { transform: 'none', opacity: 1 },
      { transform: 'translateX(-18%) scaleX(1.35)', opacity: 0.8, offset: 0.5 },
      { transform: 'translateX(-46%) scaleX(1.9)', opacity: 0.55 },
    ], OPEN).finished;

    // Trang trong phóng to: vòm cửa (trong là ảnh mở đầu) phủ kín màn hình, rồi tan vào chính cảnh đó phía sau.
    const arch = $('.card__arch', page).getBoundingClientRect();
    const pr = page.getBoundingClientRect();
    const s = Math.max(innerWidth / arch.width, innerHeight / arch.height) * 1.08;
    const dx = innerWidth / 2 - (arch.left + arch.width / 2);
    const dy = innerHeight / 2 - (arch.top + arch.height / 2);
    page.style.transformOrigin = `${arch.left + arch.width / 2 - pr.left}px ${arch.top + arch.height / 2 - pr.top}px`;
    page.style.zIndex = '8';
    const zoom = A(page, [{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${s})` }], { duration: 1200 });
    for (const el of [cover, parts.shadow]) A(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 500 });
    A(parts.bg, [{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay: 500 });
    await zoom.finished;
    await A(page, [
      { opacity: 1, transform: `translate(${dx}px, ${dy}px) scale(${s})` },
      { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(${s * 1.04})` },
    ], { duration: 550, easing: 'ease-out' }).finished;
  }

  async function skip() {
    if (state === 'done' || state === 'skipping') return;
    state = 'skipping';
    intro.classList.add('is-playing');
    await play(intro, [{ opacity: 1 }, { opacity: 0 }], { duration: isReduced() ? 150 : 320, fill: 'forwards', easing: 'ease', reduced: 'run' });
    anims.cancel();
    state = 'skipped';
    finish();
  }

  function finish() {
    if (state === 'done') return;
    state = 'done';
    store.set('dn.opened', '1');
    root.classList.remove('intro-pending');
    intro.classList.remove('is-playing');
    intro.hidden = true;
    if ('scrollRestoration' in history) history.scrollRestoration = 'auto';
    const title = $('#hero-title');
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
  }

  return { replay };
}

/* Bấm biểu tượng D♥N trên thanh công cụ: mở lại cảnh thiệp khép từ đầu (giữ mã thư mời, bỏ #mục để không nhảy xuống giữa trang) */
export function replay() {
  store.remove('dn.opened');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  history.replaceState(null, '', location.pathname + location.search);
  window.scrollTo({ top: 0, behavior: 'instant' });
  location.reload();
}
