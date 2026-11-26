/*
 * Nhạc nền — các bài trong content.music.playlist phát lần lượt, hết bài cuối quay lại bài đầu.
 * Trình duyệt chỉ cho phát tiếng sau khi khách chạm / bấm phím, nên nhạc tự bật ở lần chạm đầu tiên (thường là nút “Mở thiệp”).
 * Khách tắt nhạc thì nhớ lựa chọn đó, lần sau không tự bật nữa. Tệp nhạc do scripts/prep-music.py tạo (AAC 96 kbps, cùng độ to).
 */
import { $, store } from './util.js';

const OFF = 'dn.music-off';
const GESTURES = ['pointerdown', 'pointerup', 'keydown', 'touchend'];

export function initMusic(music) {
  const btn = $('#music-button');
  const label = $('[data-music-label]');
  const list = (music?.playlist || []).filter((t) => t.src);
  if (!list.length) { btn.hidden = true; return; }

  const audio = new Audio();
  audio.preload = 'none'; // chưa phát thì không tải gì
  audio.volume = 0.6;
  let i = 0;
  let playing = false;
  let fails = 0;
  let pausedByHidden = false;

  const sync = () => {
    btn.setAttribute('aria-pressed', String(playing));
    label.textContent = playing ? 'Tắt nhạc' : 'Bật nhạc';
    btn.setAttribute('aria-label', playing ? 'Tắt nhạc nền' : 'Bật nhạc nền');
  };
  const load = (n) => { i = (n + list.length) % list.length; audio.src = list[i].src; };
  const play = () => audio.play().then(() => { playing = true; fails = 0; unkick(); sync(); }, () => { playing = false; sync(); });
  const next = () => { load(i + 1); play(); };

  audio.addEventListener('ended', next);
  audio.addEventListener('error', () => { if (++fails < list.length) next(); }); // tệp lỗi → bỏ qua sang bài sau
  load(0);

  // tự bật ở lần chạm / phím đầu tiên (trừ khi chính là nút nhạc — nút đó tự xử lý)
  function kick(e) { if (!playing && !e.target.closest?.('#music-button')) play(); }
  function unkick() { GESTURES.forEach((t) => removeEventListener(t, kick, true)); } // đã phát được một lần → thôi tự bật
  if (store.get(OFF) !== '1') {
    GESTURES.forEach((t) => addEventListener(t, kick, true));
    play(); // khách đã chạm trước khi tệp này tải xong (vd. nút “Mở thiệp”) thì phát luôn; chưa chạm thì trình duyệt từ chối, chờ kick
  }

  btn.addEventListener('click', () => {
    if (playing) { audio.pause(); playing = false; store.set(OFF, '1'); sync(); }
    else { store.set(OFF, '0'); play(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) { audio.pause(); playing = false; pausedByHidden = true; }
    else if (!document.hidden && pausedByHidden) { pausedByHidden = false; play(); }
  });
  sync();
}
