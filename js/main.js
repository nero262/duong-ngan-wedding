/* Khởi động thiệp: lời mời và nút bấm trước, hiệu ứng và phần phía dưới sau. */
import { $, $$, root, store, el, weekday, parseDate, daysUntil, fetchWithTimeout, isReduced } from './util.js';
import { initTheme } from './theme.js';
import { Stage } from './stage.js';
import { initIntro, replay } from './intro.js';
import { initReveal, refreshReveal } from './reveal.js';
import { initPager } from './pager.js';

window.__dnReady = true;
const content = JSON.parse($('#content-data').textContent);

initTheme();

/* Thư mời cá nhân: chỉ có mã ngẫu nhiên trong URL, tên lấy từ tab ThuMoi của Google Sheet (qua Apps Script). */
const invitePromise = (async () => {
  const token = new URLSearchParams(location.search).get('i') || store.get('dn.invite', true);
  const api = content.settings?.sheetApi;
  if (!api || !token || content.settings?.personalizedInvites === false || !/^[A-Za-z0-9_-]{6,40}$/.test(token)) return null;
  try {
    const res = await fetchWithTimeout(`${api}?type=invite&token=${encodeURIComponent(token)}`, {}, 15000);
    const { ok, name } = await res.json();
    if (!ok || !name) return null;
    store.set('dn.invite', token, true);
    $$('[data-guest-name]').forEach((n) => { n.textContent = name; });
    $$('[data-guest-line]').forEach((n) => { n.hidden = false; });
    return { token, name };
  } catch { return null; }
})();

initIntro();

/* Ngày cưới, đếm ngày, thông tin gia đình */
(() => {
  const iso = content.wedding?.date;
  const p = parseDate(iso);
  if (p) {
    $('[data-weekday]').textContent = weekday(iso);
    $('[data-day]').textContent = String(p.d).padStart(2, '0');
    $('[data-month]').textContent = `Tháng ${p.m}
${p.y}`;
    // Đếm ngược từng giây tới giờ làm lễ (giờ Việt Nam; chưa có giờ thì tính tới 00:00 ngày cưới)
    const start = content.events?.find((e) => e.date === iso && /^\d{1,2}:\d{2}$/.test(e.start || ''))?.start || '00:00';
    const at = Date.parse(`${iso}T${start.padStart(5, '0')}:00+07:00`);
    const cd = $('[data-countdown]');
    const cells = [['ngày', 86400], ['giờ', 3600], ['phút', 60], ['giây', 1]].map(([label, sec]) => {
      const n = el('b', { class: 'countdown__n' });
      cd.append(el('span', { class: 'countdown__cell' }, n, ` ${label} `));
      return { n, sec };
    });
    const tick = () => {
      let s = Math.floor((at - Date.now()) / 1000);
      if (s <= 0) {
        clearInterval(timer);
        cd.classList.add('is-done');
        cd.textContent = daysUntil(iso) === 0 ? 'Hôm nay là ngày vui của chúng mình!' : '';
        return;
      }
      for (const c of cells) { const v = Math.floor(s / c.sec); s -= v * c.sec; c.n.textContent = c.sec === 86400 ? v : String(v).padStart(2, '0'); }
    };
    const timer = setInterval(tick, 1000);
    tick();
  }
  const fam = $('[data-families]');
  const sides = ['groom', 'bride'].map((k) => content.families?.[k]).filter(Boolean);
  if (sides.some((f) => f.parents || f.address)) {
    for (const f of sides) {
      fam.append(el('div', { class: 'family' },
        el('p', { class: 'family__label' }, f.label),
        f.parents ? el('p', { class: 'family__text' }, f.parents) : el('p', { class: 'tbd' }, 'Sẽ cập nhật'),
        f.address ? el('p', { class: 'family__addr' }, f.address) : null));
    }
  } else {
    fam.append(el('p', { class: 'tbd' }, 'Thông tin hai gia đình sẽ được cập nhật.'));
  }
})();

// Dựng cảnh sau khi thẻ Lời mời đã đủ nội dung (đếm ngược, hai gia đình): đo và co thiệp một lần, không phải co lại
const stage = new Stage($('#stage'));
window.__dnStage = stage; // để kiểm tra trong bảng điều khiển trình duyệt
initReveal();
initPager(stage);

/* Điểm dừng của một phần: mốc .snap trùng mép trên tấm thiệp (máy quay đã tới trạm, thiệp đứng yên) */
const stopOf = (sec) => sec.querySelector(':scope > .snap') || sec;

/* Nút xác nhận nổi hiện dần khi cuộn */
(() => {
  const fab = $('[data-fab]');
  const hero = $('#hero');
  // tấm thiệp giờ cao gần hết màn hình — nút nổi chỉ hiện ở khoảng cảnh giữa hai thiệp, không đè lên thiệp
  const hideFabZones = [...$$('.station .sheet'), $('#loi-cam-on'), hero];
  const visibleZones = new Set();
  let pastHero = false;
  const updateFab = () => {
    const show = pastHero && visibleZones.size === 0 && !root.classList.contains('intro-pending');
    fab.classList.toggle('is-visible', show);
    fab.setAttribute('aria-hidden', String(!show));
    fab.tabIndex = show ? 0 : -1;
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.target === hero) pastHero = !e.isIntersecting && e.boundingClientRect.top < 0;
      if (e.isIntersecting) visibleZones.add(e.target); else visibleZones.delete(e.target);
    }
    updateFab();
  }, { rootMargin: '0px 0px -15% 0px' });
  hideFabZones.forEach((z) => io.observe(z));
  document.addEventListener('focusin', (e) => { if (e.target.closest('form')) fab.classList.remove('is-visible'); });

  $('[data-replay-intro]').addEventListener('click', replay);

  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const target = a.getAttribute('href') === '#top' ? document.body : $(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (a.getAttribute('href') === '#top') scrollTo({ top: 0, behavior: isReduced() ? 'auto' : 'smooth' });
    else stopOf(target).scrollIntoView({ behavior: isReduced() ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', a.getAttribute('href') === '#top' ? location.pathname + location.search : a.getAttribute('href'));
    const focusTarget = a.getAttribute('href') === '#xac-nhan' ? $('#rsvp-name') : null;
    if (focusTarget) setTimeout(() => focusTarget.focus({ preventScroll: true }), isReduced() ? 0 : 700);
  }));

})();

/* Phần phía dưới: tải sau khi màn hình đầu đã sẵn sàng. */
const later = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
later(async () => {
  const [{ renderEvents }, { initStory }, { initRsvp, initGuestbook }, { initMusic }] = await Promise.all([
    import('./events.js'), import('./story.js'), import('./forms.js'), import('./music.js'),
  ]);
  renderEvents($('[data-events]'), content);
  initStory($('[data-story]'), content.story);
  initRsvp(content, await invitePromise);
  initGuestbook(content);
  initMusic(content.music);
  refreshReveal();
  if (location.hash.length > 1 && $(location.hash)) stopOf($(location.hash)).scrollIntoView();
});
