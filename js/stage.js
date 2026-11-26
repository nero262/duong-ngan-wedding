/*
 * Một cú máy liền mạch: khung cảnh cố định phía sau toàn bộ thiệp (ảnh mẫu — scene.js), khách cuộn là máy đi qua 7 trạm.
 * Máy chỉ chuyển trong khoảng trống giữa hai tấm thiệp; khi khách đọc, cảnh đứng yên.
 * Stage tính tiến độ q (0 → 6, có phần lẻ khi đang chuyển) theo vị trí cuộn, có quán tính để con lăn chuột từng nấc vẫn mượt,
 * và độ đậm từng sắc trời (đổi mượt trong 1 giây khi khách đổi sắc trời) cho scene.js.
 */
import { $, $$, on, root, isReduced, clamp } from './util.js';
import { addTicker, removeTicker } from './loop.js';
import { play } from './anim.js';
import { PlateScene } from './scene.js';

/* Tăng tốc ngắn — đi đều — giảm tốc dài hơn trước điểm dừng */
const A_IN = 0.22, A_OUT = 0.3, VMAX = 1 / (1 - A_IN / 2 - A_OUT / 2);
const cruise = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < A_IN ? (VMAX * t * t) / (2 * A_IN)
  : t < 1 - A_OUT ? VMAX * (A_IN / 2 + t - A_IN) : 1 - (VMAX * (1 - t) ** 2) / (2 * A_OUT));
/* Tấm thiệp vừa màn hình: chừa mép dưới BOT px; chữ thu nhỏ tối đa còn ZMIN (chữ thường ≥ 14 px, nút ≥ 44 px — không bắt khách phải phóng to);
   vẫn dài thì thiệp cao hơn màn hình và cuộn cùng trang (không cuộn lồng bên trong thiệp) */
const BOT = 14, ZMIN = 0.9;

export class Stage {
  constructor(el) {
    this.el = el;
    this.heroContent = $('.hero__content');
    this.thanksContent = $('.thanks__content');
    this.stations = $$('[data-station]')
      .map((s) => ({ el: s, i: Number(s.dataset.station) }))
      .filter((s) => s.i > 0)
      .sort((a, b) => a.i - b.i)
      .map(({ el: s }) => {
        const thanks = s.querySelector('.thanks__content');
        const snap = s.querySelector('.snap'), sheet = s.querySelector('.sheet');
        return { el: s, anchor: thanks || snap || sheet || s, thanks: !!thanks, snap, sheet };
      });
    this.sheets = this.stations.map((st) => st.sheet).filter(Boolean);
    this.fitted = new WeakMap(); // thiệp → chiều cao lúc vừa khớp
    this.tick = this.tick.bind(this);
    this.lastIdx = -1;
    this.colorsUntil = 0;
    this.covered = false;
    this.coverCheck = 0;

    // dựng cảnh (bắt đầu tải ảnh nền) trước khi đo bố cục
    this.readColors();
    this.scene = new PlateScene($('.stage__scene', el), () => this.q, () => this.covered || !!document.activeElement?.closest?.('form'), () => this.C);
    this.measure();
    this.q = this.goal();
    el.classList.add('is-ready');

    // Độ đậm từng sắc trời: đọc mỗi khung hình trong lúc CSS chuyển (1 s), rồi một lần nữa khi chuyển xong / tab hiện lại
    on('dn:sky', () => { this.colorsUntil = performance.now() + 1200; this.start(); setTimeout(() => this.readColors(), 1300); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.readColors(); });
    on('dn:motion', () => { this.lastIdx = -1; this.start(); });
    addEventListener('scroll', () => this.start(), { passive: true });
    // khách đang gõ trong biểu mẫu → cảnh đứng yên hoàn toàn; rời biểu mẫu thì sống lại
    document.addEventListener('focusin', () => this.start());
    document.addEventListener('focusout', () => this.start());
    let rt;
    addEventListener('resize', () => {
      clearTimeout(rt);
      // Thanh địa chỉ trên điện thoại co giãn liên tục — bỏ qua thay đổi nhỏ về chiều cao.
      rt = setTimeout(() => { if (innerWidth === this.W && Math.abs(innerHeight - this.H) < 90) this.computeAnchors(); else this.measure(); this.start(); }, 140);
    });
    new ResizeObserver(() => { this.computeAnchors(); this.start(); }).observe(document.querySelector('main'));
    // Nội dung tấm thiệp đổi (sự kiện, lời chúc tải về, gửi xong biểu mẫu…) → khớp lại ở khung hình sau.
    // Khách đang gõ chữ trong thiệp thì không đổi cỡ chữ dưới tay họ (thiệp dài ra thì cứ dài, trang cuộn tiếp).
    // Bỏ qua thông báo do chính fit() gây ra (cao đúng bằng lúc vừa khớp) — đổi --z tốn ~30 ms mỗi thiệp vì chữ phải dàn lại.
    const refit = new Set();
    const ro = new ResizeObserver((es) => {
      const changed = es.filter((e) => Math.round(e.borderBoxSize[0].blockSize) !== this.fitted.get(e.target));
      if (!changed.length) return;
      if (!refit.size) requestAnimationFrame(() => {
        const a = document.activeElement;
        const typing = a?.matches?.('textarea, input:not([type=radio], [type=checkbox])'); // bấm chọn ô tròn (mở thêm phần “Mình sẽ đến”) thì vẫn co lại
        this.fit([...refit].filter((s) => !(typing && s.contains(a))));
        refit.clear();
        this.computeAnchors();
      });
      for (const e of changed) refit.add(e.target);
    });
    this.sheets.forEach((s) => ro.observe(s));
    document.fonts?.ready.then(() => { this.measure(false); this.start(); });
    this.start();
  }

  measure(refit = true) {
    // Tab mở nền / trình duyệt nhúng có lúc báo kích thước 0 — dùng tạm cỡ điện thoại, sự kiện resize sẽ đo lại.
    const W = innerWidth || 375, H = innerHeight || 812;
    this.W = W; this.H = H;
    const portrait = W / H < 0.9;
    this.pad = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
    // Chữ màn hình đầu / lời cảm ơn bắt đầu ở ~56–60% chiều cao (màn hình thấp — điện thoại xoay ngang — cao hơn để vừa chữ);
    // chữ dài hơn phần còn lại thì đẩy lên cho đáy chữ không lọt khỏi màn hình
    const block = (el, last = el?.lastElementChild) => (el ? last.offsetTop + last.offsetHeight - el.firstElementChild.offsetTop : 0);
    const need = Math.max(block(this.heroContent), block(this.thanksContent, $('.thanks__sign'))) + 0.03 * H + 12;
    const thr = Math.max(this.pad, Math.min(H * (portrait ? 0.56 : H < 520 ? 0.47 : 0.6), H - BOT - need));
    // Điểm “tới nơi” của mỗi tấm thiệp: điện thoại chừa nửa trên cho cảnh, máy tính đưa thiệp lên gần hết màn hình.
    this.line = portrait ? 0.58 : 0.2;
    this.avail = H - this.pad - BOT;
    root.style.setProperty('--thr', `${thr.toFixed(1)}px`);
    if (refit) this.fit(this.sheets);
    this.computeAnchors();
  }

  /* Tấm thiệp nằm trọn trong màn hình (dưới thanh công cụ): thu nhỏ đều chữ và khoảng cách (--z, zoom phần nội dung, không nhỏ hơn ZMIN);
     nhỏ tới mức đó mà vẫn dài thì để thiệp cao hơn màn hình — khách đọc tiếp bằng cuộn trang, máy quay chỉ đi khi đã đọc gần hết.
     Đo gộp mọi thiệp, 3 lần tính bố cục bất kể bao nhiêu thiệp (mỗi lần đo là một lần tính lại cả trang — đắt trên điện thoại):
     thu nhỏ z thì chiều cao ≤ z × cao gốc (chữ được thêm chỗ ngang, ngắt dòng ít đi) → z = chỗ trống / cao gốc chắc chắn vừa;
     rồi nhích lên một bước theo chiều cao thật, quá thì lùi về. */
  fit(list) {
    const room = this.avail - 2, floor3 = (v) => Math.floor(v * 1000) / 1000;
    const set = (zs) => list.forEach((s, i) => (zs[i] < 1 ? s.style.setProperty('--z', zs[i].toFixed(3)) : s.style.removeProperty('--z')));
    set(list.map(() => 1));
    const z = list.map((s) => { const h = s.offsetHeight; return h > room ? Math.max(ZMIN, floor3(room / h)) : 1; });
    set(z);
    const up = list.map((s, i) => (z[i] < 1 ? Math.max(z[i], Math.min(1, floor3((z[i] * (room - 10)) / s.offsetHeight))) : 1));
    set(up);
    const over = list.map((s, i) => up[i] !== z[i] && s.offsetHeight > this.avail);
    if (over.some(Boolean)) set(up.map((v, i) => (over[i] ? z[i] : v)));
    list.forEach((s) => this.fitted.set(s, s.offsetHeight));
  }

  /* Mốc cuộn của từng trạm: a = bắt đầu chuyển, b = tới nơi (tấm thiệp lên tới điểm dừng). */
  computeAnchors() {
    const H = this.H || innerHeight;
    let prevB = 0;
    this.anchors = this.stations.map((st, n) => {
      const top = st.el.getBoundingClientRect().top + scrollY;
      const anchor = st.anchor.getBoundingClientRect().top + scrollY;
      // thiệp ngắn vẫn có một đoạn cuộn để cảnh đứng yên trước khi máy đi tiếp
      const a = n === 0 ? 0 : Math.max(top - 0.6 * H, prevB + 0.22 * H);
      // Điểm dừng: điện thoại chừa nửa trên cho cảnh, nhưng thiệp dài thì dừng cao hơn để đáy thiệp không lọt khỏi màn hình
      const arrive = Math.max(this.pad, Math.min(this.line * H, H - BOT - (st.sheet?.offsetHeight || 0)));
      if (st.snap) st.snap.style.scrollMarginTop = `${(arrive - this.pad).toFixed(1)}px`;
      // lời cảm ơn dừng như màn hình đầu: chữ đứng ở cùng độ cao
      const b = st.thanks ? anchor : anchor - arrive;
      prevB = Math.max(b, a + 40);
      // e: thiệp cao hơn màn hình thì đọc tiếp tới khi đáy thiệp lên mép dưới (pager.js để khách cuộn tự do trong đoạn b → e)
      const e = prevB + Math.max(0, arrive + (st.sheet?.offsetHeight || 0) - (H - BOT));
      return { a, b: prevB, e };
    });
  }

  progress(y) {
    let from = 0, to = 0, t = 1;
    for (let n = 0; n < this.anchors.length; n++) {
      const { a, b } = this.anchors[n];
      if (y < a) break;
      from = n; to = n + 1; t = clamp((y - a) / (b - a), 0, 1);
      if (y < b) break;
    }
    return { from, to, t };
  }

  /* Tiến độ đích theo vị trí cuộn. Giảm chuyển động: không bay — sang trạm mới thì cảnh mờ đi rồi hiện trạm mới. */
  goal() {
    const { from, to, t } = this.progress(scrollY);
    if (!isReduced()) return from + cruise(t);
    const idx = t < 0.5 ? from : to;
    if (idx !== this.lastIdx) {
      if (this.lastIdx !== -1) play(this.el, [{ opacity: 0.2 }, { opacity: 1 }], { duration: 700, easing: 'ease-out', reduced: 'run' });
      this.lastIdx = idx;
    }
    return idx;
  }

  readColors() {
    const cs = getComputedStyle(root), num = (n) => parseFloat(cs.getPropertyValue(n)) || 0;
    this.C = { oDay: num('--o-day'), oDusk: num('--o-dusk'), oNight: num('--o-night') };
  }

  start() { addTicker(this.tick); this.scene.wake(); }

  tick(now, dt) {
    let moving = false;
    if (now < this.colorsUntil) { this.readColors(); moving = true; }
    const goal = this.goal();
    if (isReduced()) this.q = goal;
    else {
      // Máy bám theo thao tác cuộn với quán tính (~220 ms) như máy quay có trọng lượng: chuyển cảnh trôi mượt, không giật theo từng nấc con lăn
      const d = goal - this.q;
      this.q += d * (1 - Math.exp(-dt / 220));
      if (Math.abs(d) > 0.0005) moving = true; else this.q = goal;
    }
    // Khi một tấm thiệp che kín màn hình (điện thoại) thì hiệu ứng cảnh tạm dừng
    if (now - this.coverCheck > 400) {
      this.coverCheck = now;
      const pts = [0.2, 0.5, 0.82].map((f) => document.elementFromPoint(this.W / 2, this.H * f));
      this.covered = pts.every((n) => n && n.closest('.sheet'));
    }
    // Chữ ở màn hình đầu mờ dần khi bắt đầu cuộn
    if (this.heroContent) {
      const f = isReduced() ? 1 : clamp(1 - scrollY / (this.H * 0.45), 0, 1);
      this.heroContent.style.opacity = f < 1 ? f.toFixed(3) : '';
      this.heroContent.style.transform = f < 1 ? `translateY(${(-scrollY * 0.12).toFixed(1)}px)` : '';
    }
    if (!moving) removeTicker(this.tick);
  }
}
