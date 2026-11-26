/*
 * Cảnh nền dựng từ ảnh mẫu cô dâu chú rể đã duyệt — ba bộ, mỗi bộ 6 ảnh cùng thứ tự khung hình:
 * Sáng = sang-1…6 (bình minh), Trầm = tram-1…6 (hoàng hôn), Tối = dem-1…6 (đêm trăng) trong public/assets/scene/:
 * 1 trên cao · 2 sân hiên · 3 bậc thang dưới cây · 4 lối đi ra cổng hoa · 5 hai người bên phải · 6 dưới cổng hoa.
 * scripts/prep-scene.py nén ảnh và dò sẵn (sang.json…) vị trí đèn,
 * mặt trời / trăng, vệt phản chiếu trên mặt nước và vùng trời có sao để lớp vẽ bằng code phía trên làm cảnh "sống":
 *  - trời: quầng mặt trời / trăng thở nhẹ, tia nắng xoay rất chậm, bóng loé ống kính (Sáng / Trầm), sao nhấp nháy (Tối);
 *  - mặt nước: lấp lánh trong cột phản chiếu dưới mặt trời / trăng;
 *  - đèn lập loè đúng chỗ đèn trong ảnh; đom đóm (Tối) hoặc bụi nắng (Sáng / Trầm); cánh hoa rơi;
 *  - đốm sáng nhoè ở tiền cảnh trượt nhanh hơn ảnh khi cuộn (thị sai); lớp tối mềm sau chữ / phía bên thẻ.
 * Máy quay: mỗi trạm một khung (ảnh, độ phóng, điểm nhìn); khi đứng yên khung "thở" rất chậm. Hai trạm cùng ảnh thì máy đẩy / lia
 * trong ảnh; khác ảnh thì mỗi cú một động tác máy (CUTS: lao vào đôi uyên ương, lượn phải, lượn trái, cẩu máy lên trời rồi hạ xuống),
 * ảnh đổi ngắn giữa chừng sau lớp đèn nhoè lướt sát ống kính và một quầng sáng mềm (không lộ hai cảnh chồng nhau).
 * Tiến độ q (0 → 6) lấy từ stage.js nên khớp nhịp cuộn; đổi sắc trời thì ba bộ hoà vào nhau theo --o-day / --o-dusk / --o-night.
 */
import { addTicker, removeTicker, quality } from './loop.js';
import { isReduced, clamp } from './util.js';

const VER = 8; // tăng khi tạo lại ảnh (scripts/prep-scene.py) để trình duyệt không dùng bản cũ trong bộ nhớ đệm
const SETS = { day: 'sang', dusk: 'tram', night: 'dem' };
const WEIGHT = { day: 'oDay', dusk: 'oDusk', night: 'oNight' };
/* ảnh thứ i (0–5) của bộ ảnh theo sắc trời — dùng chung với tấm thiệp mở đầu (intro.js) */
export const plateSrc = (mode, i) => `assets/scene/${SETS[mode]}-${i + 1}.webp?v=${VER}`;
/* Ánh sáng từng sắc trời: màu quầng mặt trời / trăng, độ mạnh tia nắng, màu lấp lánh mặt nước, hạt bay (đom đóm / bụi nắng) */
const LOOK = {
  day: { sun: '255,236,206', rays: 1, ghost: 1, glint: '255,236,214', mote: '255,228,180', fireflies: false },
  dusk: { sun: '255,196,128', rays: 1.1, ghost: 1, glint: '255,206,140', mote: '255,200,140', fireflies: false },
  night: { sun: '214,226,255', rays: 0.35, ghost: 0, glint: '214,228,255', mote: '232,255,170', fireflies: true },
};
/* Khung từng trạm: p = ảnh, z = độ phóng thêm (1 = vừa phủ màn hình), x / y = điểm trên ảnh (0–1) đặt vào tâm nhìn,
   side = chỗ chữ: 'c' giữa, 'r' / 'l' thẻ bên phải / trái, 'b' thẻ nửa dưới (màn hình dọc) */
const VIEWS = {
  landscape: [
    { p: 0, z: 1, x: 0.5, y: 0.5, side: 'c' },
    { p: 1, z: 1, x: 0.5, y: 0.5, side: 'r' },
    { p: 2, z: 1, x: 0.5, y: 0.5, side: 'r' },
    { p: 3, z: 1, x: 0.5, y: 0.5, side: 'r' },
    { p: 4, z: 1, x: 0.5, y: 0.5, side: 'l' },
    { p: 4, z: 1.16, x: 0.6, y: 0.5, side: 'l' },
    { p: 5, z: 1, x: 0.5, y: 0.5, side: 'c' },
  ],
  portrait: [
    { p: 0, z: 1, x: 0.5, y: 0.38, side: 'c' },
    { p: 1, z: 1.05, x: 0.33, y: 0.5, side: 'b' },
    { p: 2, z: 1.05, x: 0.5, y: 0.52, side: 'b' },
    { p: 3, z: 1.05, x: 0.4, y: 0.52, side: 'b' },
    { p: 4, z: 1.05, x: 0.66, y: 0.52, side: 'b' },
    { p: 4, z: 1.2, x: 0.62, y: 0.42, side: 'b' },
    { p: 5, z: 1, x: 0.5, y: 0.42, side: 'c' },
  ],
};
/* Cú chuyển giữa hai ảnh khác nhau (theo trạm xuất phát n → n+1) — mỗi cú một động tác máy, như phim:
   out = khung cuối của ảnh cũ (máy tăng tốc tới đó), in = khung đầu của ảnh mới (máy giảm tốc từ đó về khung trạm);
   z nhân với độ phóng của khung trạm, x / y là điểm nhìn trên ảnh (0–1). Chỗ đổi ảnh được che bằng đèn nhoè lướt sát ống kính
   (flow: hướng lớp tiền cảnh trôi trên màn hình; 'out' = toả ra từ tâm như lao qua đám đèn). */
const CUTS = {
  // khớp theo đôi uyên ương: lao vào hai người nhìn từ trên cao, hiện ra sát lưng hai người bên hồ rồi lùi lại
  0: { out: { z: 1.7, x: 0.5, y: 0.36 }, in: { z: 1.45, x: 0.3, y: 0.56 }, flow: 'out' },
  // lượn vòng sang phải theo con đường ven hồ
  1: { out: { z: 1.35, x: 0.66, y: 0.5 }, in: { z: 1.3, x: 0.3, y: 0.55 }, flow: [-1, 0] },
  // đi tiếp xuống bậc thang, ra lối đi giữa mặt hồ
  2: { out: { z: 1.4, x: 0.5, y: 0.6 }, in: { z: 1.3, x: 0.42, y: 0.4 }, flow: 'out' },
  // lượn sang trái, về phía cổng hoa
  3: { out: { z: 1.35, x: 0.3, y: 0.55 }, in: { z: 1.3, x: 0.72, y: 0.52 }, flow: [1, 0] },
  // cú máy riêng của thiệp: cẩu máy ngước lên trời, khớp hai bầu trời, rồi hạ xuống cổng hoa cuối
  5: { out: { z: 1.6, x: 0.55, y: 0 }, in: { z: 1.6, x: 0.5, y: 0 }, flow: [0, 1] },
};
const NAVY = '10,16,32';
const TAU = Math.PI * 2;
const smoother = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const hash = (n, s) => { const v = Math.sin(n * 12.9898 + s * 78.233) * 43758.5453; return v - Math.floor(v); };
const has = (im) => im.complete && im.naturalWidth > 0;

/* Ảnh vẽ sẵn một lần: quầng sáng, đĩa bokeh, tia lấp lánh bốn cánh */
function sprite(size, paint) { const c = document.createElement('canvas'); c.width = c.height = size; paint(c.getContext('2d'), size / 2); return c; }
const glowOf = (rgb) => sprite(64, (x, r) => {
  const g = x.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.25, `rgba(${rgb},.5)`); g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g; x.fillRect(0, 0, 2 * r, 2 * r);
});
const GLOW = glowOf('255,206,140');
const BOKEH = sprite(96, (x, r) => { // đĩa nhoè: lòng đều, mép sáng hơn một chút như ống kính thật
  const g = x.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,236,200,.55)'); g.addColorStop(0.78, 'rgba(255,226,180,.62)'); g.addColorStop(0.9, 'rgba(255,230,190,.8)'); g.addColorStop(1, 'rgba(255,220,170,0)');
  x.fillStyle = g; x.fillRect(0, 0, 2 * r, 2 * r);
});
const sparkOf = (rgb) => sprite(48, (x, r) => { // tia bốn cánh mảnh + lõi tròn — lấp lánh mặt nước, sao
  x.translate(r, r);
  for (const [w, l, a] of [[1.6, r, 0.9], [1.1, r * 0.55, 0.6]]) {
    for (let k = 0; k < (a > 0.8 ? 2 : 4); k++) {
      x.save(); x.rotate((k * Math.PI) / (a > 0.8 ? 2 : 4) + (a > 0.8 ? 0 : Math.PI / 4));
      const g = x.createLinearGradient(-l, 0, l, 0);
      g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.5, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
      x.fillStyle = g; x.fillRect(-l, -w / 2, 2 * l, w); x.restore();
    }
  }
  const g = x.createRadialGradient(0, 0, 0, 0, 0, r * 0.35);
  g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g; x.fillRect(-r, -r, 2 * r, 2 * r);
});

export class PlateScene {
  /**
   * @param el    .stage__scene (chứa canvas.scene__fx)
   * @param getQ  () => tiến độ trạm hiện tại (0 → 6)
   * @param still () => true khi cảnh phải đứng yên (đang gõ, thẻ che kín)
   * @param getC  () => bảng màu stage (oDay / oDusk / oNight đổi mượt khi chuyển sắc trời)
   */
  constructor(el, getQ, still, getC) {
    this.el = el;
    this.getQ = getQ;
    this.still = still;
    this.getC = getC;
    this.canvas = el.querySelector('.scene__fx');
    this.ctx = this.canvas.getContext('2d');
    this.groups = {};
    this.sprites = {};
    this.cover = 0;
    this.tick = this.tick.bind(this);
    // điện thoại / máy yếu / tiết kiệm dữ liệu: chỉ tải bộ ảnh đang xem (~1,6 MB); hai bộ kia (~3,2 MB) tải khi khách chạm nút Sắc trời
    this.lite = quality.level < 1 || !!navigator.connection?.saveData;
    const sky = document.getElementById('sky-button');
    for (const ev of ['pointerenter', 'pointerdown', 'focus']) sky?.addEventListener(ev, () => this.preloadRest(true), { once: true });
    this.resize();
    // tải ngay bộ ảnh của sắc trời hiện tại, không chờ khung hình đầu
    for (const m of Object.keys(SETS)) if ((getC()?.[WEIGHT[m]] || 0) > 0.001) this.load(m);
    this.preloadRest();
    this.wake();
  }

  /* Cảnh đứng yên hẳn thì rời vòng lặp khung hình (điện thoại không phải thức 60 lần / giây khi khách đọc thiệp);
     stage.start() (cuộn, đổi sắc trời, gõ / rời biểu mẫu, đổi cỡ màn hình) và ảnh vừa tải xong gọi lại. */
  wake() { addTicker(this.tick); }

  /* Tải một bộ ảnh (lần đầu cần tới). Ảnh 1 tải một mình trước — màn hình đầu hiện ngay khi có nó, không chờ cả bộ ~1,6 MB;
     xong thì 5 ảnh sau tải tiếp. Bộ sắc trời khác chỉ tải (lúc rảnh) khi bộ đang xem đã đủ, không tranh đường truyền. */
  load(mode) {
    if (this.groups[mode]) return this.groups[mode];
    const key = SETS[mode], wrap = document.createElement('div');
    wrap.className = 'scene__set'; wrap.dataset.set = key; wrap.style.opacity = '0';
    this.el.insertBefore(wrap, this.canvas);
    const g = (this.groups[mode] = { mode, key, wrap, imgs: [], meta: null, w: 0, q: -1 });
    for (let i = 0; i < 6; i++) {
      const im = new Image();
      im.decoding = 'async'; im.alt = ''; im.className = 'scene__plate';
      im.onload = im.onerror = () => {
        im.decode?.().catch(() => {}); // giải mã sẵn: lần đầu ảnh hiện khi chuyển cảnh không bị khựng
        if (!i) g.imgs.forEach((m, k) => { if (k) m.src = plateSrc(mode, k); });
        if (g.imgs.every(has)) this.preloadRest();
        this.wake();
      };
      wrap.append(im);
      g.imgs.push(im);
    }
    g.imgs[0].fetchPriority = 'high';
    g.imgs[0].src = plateSrc(mode, 0);
    fetch(`assets/scene/${key}.json?v=${VER}`).then((r) => r.json()).then((m) => { g.meta = m; this.wake(); }).catch(() => {});
    return g;
  }

  preloadRest(now = false) {
    if (!now && (this.lite || !Object.values(this.groups).every((g) => g.imgs.every(has)))) return;
    const idle = now ? (fn) => fn() : window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
    for (const m of Object.keys(SETS)) if (!this.groups[m]) { idle(() => { this.load(m); this.preloadRest(now); }); return; }
  }

  /* Tiến độ vẽ được với các ảnh đã tải: ảnh của trạm kế chưa có thì máy chờ ở trạm đang có ảnh; −1 = chưa có ảnh nào */
  reach(g, q) {
    if (!g.meta) return -1;
    const V = VIEWS[this.portrait ? 'portrait' : 'landscape'], ok = (n) => has(g.imgs[V[n].p]);
    let n = clamp(Math.floor(q), 0, 6);
    if (ok(n) && ok(Math.min(6, n + 1))) return q;
    while (n > 0 && !ok(n)) n--;
    return ok(n) ? n : -1;
  }

  resize() {
    const W = innerWidth || 375, H = innerHeight || 812;
    this.W = W; this.H = H; this.portrait = W / H < 0.9;
    this.dpr = Math.min(quality.dpr(), 1.25);
    this.canvas.width = Math.round(W * this.dpr); this.canvas.height = Math.round(H * this.dpr);
  }

  /* khung của ảnh p với độ phóng z, điểm nhìn (x, y) → { s, tx, ty } (ảnh luôn phủ kín màn hình) */
  frame(g, p, z, x, y) {
    const im = g.imgs[p], iw = im.naturalWidth || 1600, ih = im.naturalHeight || 940;
    const { W, H } = this;
    const s = Math.max(W / iw, H / ih) * z;
    const fy = this.portrait ? 0.3 : 0.5;
    const tx = clamp(W * 0.5 - x * iw * s, W - iw * s, 0), ty = clamp(H * fy - y * ih * s, H - ih * s, 0);
    return { p, s, tx, ty, iw, ih, m: g.meta[p + 1] };
  }

  /* Hai khung đang hiện (ảnh dưới; ảnh trên + độ hiện) và trọng số chữ / thẻ, theo tiến độ q; t: thời gian cho nhịp "thở" */
  shots(g, q, t) {
    const V = VIEWS[this.portrait ? 'portrait' : 'landscape'];
    const n = clamp(Math.floor(q), 0, 6), m = Math.min(6, n + 1), e = clamp(q - n, 0, 1);
    const A = V[n], B = V[m];
    const breath = 1 + 0.014 * Math.sin(t * 0.21), drift = 0.006 * Math.sin(t * 0.13); // khung đứng yên vẫn thở rất chậm
    if (A.p === B.p) {
      const L = (k) => A[k] + (B[k] - A[k]) * e;
      return { under: this.frame(g, A.p, L('z') * breath, L('x') + drift, L('y')), over: null, a: 0, sides: [[A.side, 1 - e], [B.side, e]] };
    }
    // khác ảnh: máy tăng tốc trên ảnh cũ tới khung "out", đổi ảnh ngắn giữa chừng (sau lớp đèn nhoè), rồi giảm tốc từ khung "in" về khung trạm
    const C = CUTS[n] || { out: { z: 1.2, x: A.x, y: A.y }, in: { z: 0.9, x: B.x, y: B.y }, flow: 'out' };
    // ảnh cũ chạy hết động tác trong lúc còn thấy (nhanh dần), ảnh mới chạy tiếp từ lúc hiện (chậm dần) — tốc độ hai bên khớp nhau ở chỗ đổi
    const a = smoother(0.36, 0.64, e), ti = clamp(e / 0.64, 0, 1), to = clamp((e - 0.36) / 0.64, 0, 1);
    const ein = ti * ti, eout = 1 - (1 - to) * (1 - to);
    const go = (P, Q, k) => [P.z * (1 + (Q.z - 1) * k), P.x + (Q.x - P.x) * k, P.y + (Q.y - P.y) * k];
    const [uz, ux, uy] = go(A, C.out, ein), [oz, ox, oy] = go(B, C.in, 1 - eout);
    return {
      under: this.frame(g, A.p, uz * breath, ux + drift, uy),
      over: a > 0.002 ? this.frame(g, B.p, oz * breath, ox + drift, oy) : null,
      a, cut: { e, flow: C.flow }, sides: [[A.side, 1 - e], [B.side, e]],
    };
  }

  tick(now) {
    if (this.W !== innerWidth || this.H !== innerHeight) this.resize();
    const C = this.getC();
    if (!C) return;
    const q = this.getQ();
    // bộ ảnh nào đang hiện (theo độ đậm từng sắc trời); tải khi cần
    let cover = 0, any = false, held = '';
    for (const mode of Object.keys(SETS)) {
      const w = C[WEIGHT[mode]] || 0;
      if (w > 0.001 && !this.groups[mode]) this.load(mode);
      const g = this.groups[mode];
      if (!g) continue;
      g.q = this.reach(g, q);
      g.w = g.q >= 0 ? w : 0;
      held += g.q.toFixed(4);
      cover += g.w;
      any ||= g.w > 0.001;
    }
    cover = Math.min(1, cover);
    this.cover = cover;
    if (!any) { if (this.drawn) { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.drawn = false; } removeTicker(this.tick); return; }

    const reduced = isReduced(), frozen = reduced || this.still();
    // đứng yên hẳn (giảm chuyển động, đang gõ, thẻ che kín) và không có gì đổi: không vẽ lại
    const key = `${q.toFixed(4)}|${held}|${this.W}x${this.H}|${cover.toFixed(3)}`; // held: ảnh trạm kế vừa tải xong cũng vẽ lại
    if (frozen && key === this.frozenKey) { removeTicker(this.tick); return; }
    this.frozenKey = frozen ? key : '';
    // đứng yên (không cuộn): ~30 hình/giây là đủ cho lấp lánh, đỡ tốn pin
    if (!frozen && key === this.lastKey && now - this.lastAt < 30) return;
    this.lastKey = key; this.lastAt = now;
    const t = frozen ? 0 : now / 1000;

    const { ctx: x, W, H, dpr } = this;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    x.clearRect(0, 0, W, H);
    // Máy quay đứng yên (khách đang đọc — phần lớn thời gian): đèn, sao, lấp lánh (hàng trăm điểm) vẽ vào lớp riêng ~12 lần/giây
    // rồi ghép một lần mỗi khung hình. Chúng nhấp nháy chậm (< 1 lần/giây) nên mắt không thấy khác; máy chạy thì vẽ thẳng như cũ.
    const moving = key !== this.prevKey;
    this.prevKey = key;
    let pts = x;
    if (moving) this.ptsAt = 0;
    else {
      const pc = (this.pc ||= document.createElement('canvas'));
      if (pc.width !== this.canvas.width || pc.height !== this.canvas.height) { pc.width = this.canvas.width; pc.height = this.canvas.height; this.ptsAt = 0; }
      if (now - (this.ptsAt || 0) > 80) {
        pts = pc.getContext('2d');
        pts.setTransform(1, 0, 0, 1, 0, 0); pts.clearRect(0, 0, pc.width, pc.height); pts.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ptsAt = now;
      } else pts = null;
    }
    let sides = null, dissolve = 0, cut = null;
    for (const g of Object.values(this.groups)) {
      const o = g.w.toFixed(3);
      if (g.wrap.style.opacity !== o) g.wrap.style.opacity = o;
      if (g.w <= 0.001) continue;
      const sh = this.shots(g, g.q, t);
      this.place(g, sh);
      sides = sh.sides; dissolve = Math.max(dissolve, sh.a); cut = sh.cut || cut;
      this.drawSky(g, sh, t, reduced, pts);
    }
    if (!moving) {
      x.globalCompositeOperation = 'lighter';
      x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(this.pc, 0, 0); x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.globalCompositeOperation = 'source-over';
    }
    this.drawCommon(sides, dissolve, q, t, reduced, cut);
    this.drawn = true;
  }

  /* đặt hai ảnh đang hiện (transform + độ hiện), ẩn các ảnh còn lại */
  place(g, sh) {
    g.imgs.forEach((im, i) => {
      const f = sh.over?.p === i ? sh.over : sh.under.p === i ? sh.under : null;
      const op = f ? (f === sh.over ? sh.a.toFixed(3) : '1') : '0';
      const tr = f ? `translate3d(${f.tx.toFixed(1)}px,${f.ty.toFixed(1)}px,0) scale(${f.s.toFixed(4)})` : im.style.transform;
      if (im.style.opacity !== op) im.style.opacity = op;
      if (im.style.transform !== tr) im.style.transform = tr;
      const z = f === sh.over ? '1' : '0';
      if (im.style.zIndex !== z) im.style.zIndex = z;
    });
  }

  sprite(name, rgb, make) { const k = `${name}|${rgb}`; return (this.sprites[k] ||= make(rgb)); }

  /* Trời, mặt nước, đèn của một bộ ảnh — vẽ cho cả ảnh dưới và ảnh trên (theo độ hiện), nhân với độ đậm của sắc trời.
     pts: nơi vẽ đèn / sao / lấp lánh (canvas chính, lớp đệm, hoặc null = khung này dùng lại lớp đệm cũ) */
  drawSky(g, sh, t, reduced, pts) {
    const { ctx: x, W, H } = this;
    const look = LOOK[g.mode], low = quality.level < 0.5;
    const glint = this.sprite('spark', look.glint, sparkOf), star = this.sprite('spark', '255,255,255', sparkOf);
    x.globalCompositeOperation = 'lighter';
    for (const [f, fa] of [[sh.under, 1 - sh.a], [sh.over, sh.a]]) {
      const A = fa * g.w;
      if (!f || !f.m || A < 0.01) continue;
      const P = ([u, v]) => [f.tx + u * f.iw * f.s, f.ty + v * f.ih * f.s];
      const sun = f.m.sun && P(f.m.sun), sr = f.m.sun ? Math.max(6, f.m.sun[2] * f.iw * f.s) : 0;
      if (sun) {
        const [sx, sy] = sun;
        // tia nắng: hai vòng tia xoay ngược chiều rất chậm, mờ dần ra xa — lung linh mà không thành hình quạt cứng
        if (look.rays) {
          const R = Math.max(W, H) * 0.75;
          for (const [dir, nRay, base] of [[1, 14, 0], [-1, 9, 0.7]]) {
            const gr = x.createRadialGradient(sx, sy, sr, sx, sy, R);
            gr.addColorStop(0, `rgba(${look.sun},${0.07 * look.rays * A})`); gr.addColorStop(0.3, `rgba(${look.sun},${0.025 * look.rays * A})`); gr.addColorStop(1, `rgba(${look.sun},0)`);
            x.fillStyle = gr; x.beginPath();
            for (let i = 0; i < nRay; i++) {
              const ang = base + (i * TAU) / nRay + dir * t * 0.012 + 0.08 * Math.sin(t * 0.15 + i * 1.7);
              const w = 0.04 + hash(i, 31 + dir) * 0.07, len = R * (0.45 + 0.45 * hash(i, 33 + dir));
              x.moveTo(sx, sy); x.lineTo(sx + Math.cos(ang - w) * len, sy + Math.sin(ang - w) * len); x.lineTo(sx + Math.cos(ang + w) * len, sy + Math.sin(ang + w) * len); x.closePath();
            }
            x.fill();
          }
        }
        // quầng: vầng rộng thở chậm + lõi sáng
        const pulse = reduced ? 1 : 1 + 0.08 * Math.sin(t * 0.9) + 0.04 * Math.sin(t * 2.3);
        for (const [rk, al] of [[10, 0.28], [3.2, 0.45]]) {
          const rr = sr * rk * pulse, gr = x.createRadialGradient(sx, sy, 0, sx, sy, rr);
          gr.addColorStop(0, `rgba(${look.sun},${al * A})`); gr.addColorStop(0.4, `rgba(${look.sun},${al * 0.35 * A})`); gr.addColorStop(1, `rgba(${look.sun},0)`);
          x.fillStyle = gr; x.fillRect(sx - rr, sy - rr, 2 * rr, 2 * rr);
        }
        // bóng loé ống kính: vài vòng nhạt trên đường từ mặt trời qua tâm khung hình
        if (look.ghost) {
          for (let k = 0; k < 4; k++) {
            const kk = [0.45, 0.8, 1.25, 1.6][k], gx = sx + (W / 2 - sx) * kk, gy = sy + (H / 2 - sy) * kk, rr = sr * [2.2, 4, 1.4, 6][k];
            const gr = x.createRadialGradient(gx, gy, 0, gx, gy, rr);
            gr.addColorStop(0, `rgba(${look.sun},${0.05 * A})`); gr.addColorStop(0.7, `rgba(${look.sun},${0.07 * A})`); gr.addColorStop(1, `rgba(${look.sun},0)`);
            x.fillStyle = gr; x.fillRect(gx - rr, gy - rr, 2 * rr, 2 * rr);
          }
        }
      }
      if (pts) this.points(pts, f, A, look, glint, star, t, reduced, low);
    }
    // hạt bay: đom đóm trong vườn (đêm) hoặc bụi nắng lơ lửng (sáng / chiều)
    if (!reduced) {
      const mote = this.sprite('glow', look.mote, glowOf), n = low ? 12 : 26, U = Math.max(W, H) / 1400;
      for (let i = 0; i < n; i++) {
        const sp = 0.03 + hash(i, 61) * 0.05;
        const px = (hash(i, 62) + 0.06 * Math.sin(t * sp * 3 + i) + 0.02 * Math.sin(t * 0.7 + i * 2)) * W;
        const py = (look.fireflies ? 0.35 + 0.6 * hash(i, 63) : 0.1 + 0.85 * hash(i, 63)) * H + 22 * U * Math.sin(t * (0.4 + hash(i, 64)) + i) - (look.fireflies ? 0 : ((t * 6 * U * (1 + hash(i, 65))) % (H * 0.3)));
        const blink = look.fireflies ? Math.max(0, Math.sin(t * (0.8 + hash(i, 66)) + i * 3)) ** 2 : 0.45 + 0.35 * Math.sin(t * 1.3 + i);
        const r = (look.fireflies ? 9 : 5) * U * (0.7 + hash(i, 67));
        x.globalAlpha = g.w * blink * (look.fireflies ? 0.85 : 0.35);
        x.drawImage(mote, px - r, py - r, 2 * r, 2 * r);
      }
      x.globalAlpha = 1;
    }
    x.globalCompositeOperation = 'source-over';
  }

  /* lấp lánh mặt nước, sao, đèn của một khung ảnh f (độ đậm A) — vẽ lên ngữ cảnh p (cộng sáng) */
  points(p, f, A, look, glint, star, t, reduced, low) {
    const { W, H } = this;
    const P = ([u, v]) => [f.tx + u * f.iw * f.s, f.ty + v * f.ih * f.s];
    p.globalCompositeOperation = 'lighter';
    // lấp lánh mặt nước: mỗi điểm loé lên ngắn rồi tắt, lệch nhịp nhau
    const gl = f.m.glints || [];
    for (let i = 0; i < gl.length; i += low ? 2 : 1) {
      const tw = reduced ? 0.25 : Math.max(0, Math.sin(t * (1.1 + hash(i, 41) * 1.8) + hash(i, 42) * TAU)) ** 6;
      if (tw < 0.02) continue;
      const [px, py] = P(gl[i]), r = (5 + 7 * hash(i, 43)) * Math.min(1.6, f.s * 1.4);
      p.globalAlpha = A * tw * 0.9;
      p.drawImage(glint, px - r, py - r, 2 * r, 2 * r);
    }
    // sao nhấp nháy (đêm)
    const st = f.m.stars || [];
    for (let i = 0; i < st.length; i += low ? 2 : 1) {
      const tw = reduced ? 0.4 : 0.25 + 0.75 * Math.max(0, Math.sin(t * (0.5 + hash(i, 51) * 1.6) + hash(i, 52) * TAU)) ** 3;
      const [px, py] = P(st[i]), r = (2.5 + 4.5 * hash(i, 53) ** 2) * Math.min(1.4, f.s * 1.2);
      p.globalAlpha = A * tw * 0.7;
      p.drawImage(star, px - r, py - r, 2 * r, 2 * r);
    }
    // đèn lập loè đúng chỗ đèn trong ảnh: mỗi đèn một nhịp (tổng hai sóng lệch tần số — không lặp rõ)
    const L = f.m.lights || [];
    for (let i = 0; i < L.length; i += low ? 2 : 1) {
      const [lx, ly, k] = L[i];
      const [px, py] = P([lx, ly]);
      if (px < -40 || px > W + 40 || py < -40 || py > H + 40) continue;
      const fl = reduced ? 0.6 : 0.55 + 0.25 * Math.sin(t * (1.3 + hash(i, 1) * 1.7) + hash(i, 2) * 6.3) + 0.2 * Math.sin(t * (3.1 + hash(i, 3) * 2.3) + hash(i, 4) * 6.3);
      const r = (7 + 9 * k) * f.s * 1.4;
      p.globalAlpha = A * clamp(fl, 0, 1) * (0.16 + 0.14 * k);
      p.drawImage(GLOW, px - r, py - r, 2 * r, 2 * r);
    }
    p.globalAlpha = 1;
  }

  /* Phần chung mọi sắc trời: lớp tối mềm (dưới cùng — vẽ trước bằng 'destination-over'), đốm sáng tiền cảnh, cánh hoa, quầng sáng khi chuyển ảnh */
  drawCommon(sides, dissolve, q, t, reduced, cut) {
    const { ctx: x, W, H } = this;
    const cover = this.cover;
    x.globalCompositeOperation = 'destination-over'; // nằm dưới các hiệu ứng sáng đã vẽ
    for (const [side, w0] of sides || []) {
      const w = w0 * cover;
      if (w < 0.01) continue;
      let g;
      if (side === 'r' || side === 'l') {
        g = side === 'r' ? x.createLinearGradient(W * 0.4, 0, W, 0) : x.createLinearGradient(W * 0.6, 0, 0, 0);
        g.addColorStop(0, `rgba(${NAVY},0)`); g.addColorStop(0.35, `rgba(${NAVY},${0.5 * w})`); g.addColorStop(1, `rgba(${NAVY},${0.72 * w})`);
      } else if (side === 'b') {
        g = x.createLinearGradient(0, H * 0.42, 0, H);
        g.addColorStop(0, `rgba(${NAVY},0)`); g.addColorStop(0.35, `rgba(${NAVY},${0.55 * w})`); g.addColorStop(1, `rgba(${NAVY},${0.75 * w})`);
      } else {
        const cy = H * (this.portrait ? 0.72 : 0.74), rx = Math.min(W * 0.46, 620), ry = H * 0.26;
        x.save(); x.translate(W / 2, cy); x.scale(1, ry / rx);
        g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, `rgba(${NAVY},${0.62 * w})`); g.addColorStop(0.6, `rgba(${NAVY},${0.42 * w})`); g.addColorStop(1, `rgba(${NAVY},0)`);
        x.fillStyle = g; x.fillRect(-rx, -rx, 2 * rx, 2 * rx); x.restore();
        continue;
      }
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    x.globalCompositeOperation = 'lighter';
    // chuyển sang ảnh khác: một quầng sáng mềm dâng lên đúng lúc đổi ảnh rồi lặn — hai cảnh không lộ ra chồng lên nhau
    if (dissolve > 0.002 && dissolve < 0.998) {
      const k = Math.sin(Math.PI * dissolve) * cover, R = Math.max(W, H) * 0.75;
      const g = x.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, R);
      g.addColorStop(0, `rgba(255,236,210,${0.26 * k})`); g.addColorStop(0.5, `rgba(255,226,196,${0.12 * k})`); g.addColorStop(1, 'rgba(255,220,190,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    // đèn nhoè lướt sát ống kính trong lúc máy chuyển cảnh (đèn lồng, dây đèn có sẵn trong ảnh — chuyển cảnh bằng chính chất liệu của cảnh):
    // dày nhất đúng lúc đổi ảnh, trôi ngược hướng máy đi; cú lao vào thì toả ra từ tâm và lớn dần
    if (cut && !reduced && cut.e > 0.04 && cut.e < 0.96) {
      const env = Math.sin(Math.PI * cut.e) ** 2 * cover, M = (W + H) / 2, n = quality.level < 0.5 ? 5 : 9;
      for (let i = 0; i < n; i++) {
        const depth = 0.6 + hash(i, 71) * 0.8, r = M * (0.04 + 0.09 * hash(i, 72)) * depth;
        let px, py, s = 1;
        if (cut.flow === 'out') {
          const ang = hash(i, 73) * TAU, d = M * (0.08 + 0.12 * hash(i, 74) + 0.9 * cut.e * cut.e * depth);
          px = W / 2 + Math.cos(ang) * d; py = H * 0.45 + Math.sin(ang) * d * 0.8; s = 0.5 + 1.6 * cut.e;
        } else {
          const [fx, fy] = cut.flow, lane = hash(i, 75), along = (hash(i, 76) - 0.5) * 0.9 + (cut.e - 0.5) * 2.4 * depth;
          px = fx ? W / 2 + fx * along * W : lane * W;
          py = fy ? H / 2 + fy * along * H : (0.15 + 0.8 * lane) * H;
        }
        const rr = r * s;
        x.globalAlpha = env * (0.06 + 0.1 * hash(i, 77)) / depth;
        x.drawImage(BOKEH, px - rr, py - rr, 2 * rr, 2 * rr);
      }
      x.globalAlpha = 1;
    }
    // đốm sáng nhoè ở tiền cảnh: hai góc dưới, trượt ngang nhanh hơn ảnh khi máy đi (thị sai), khẽ trôi theo thời gian
    const U = Math.max(W, H) / 1400;
    for (let i = 0; i < 9; i++) {
      const depth = 1.2 + hash(i, 11) * 1.2, band = 0.92 + hash(i, 13) * 0.14;
      const u = (((hash(i, 14) * 3 - q * 0.42 * depth + Math.sin(t * 0.1 + i) * 0.01) % 3) + 3) % 3;
      const px = (u - 0.5) * W, py = band * H + Math.sin(t * 0.35 + i * 1.7) * 6 * U;
      if (px > W * 0.3 && px < W * 0.7) continue; // chỉ hai góc dưới, không đè lên chữ / nút giữa màn hình
      const r = (26 + hash(i, 15) * 44) * U * depth * 0.7;
      x.globalAlpha = (0.07 + hash(i, 16) * 0.1) * cover;
      x.drawImage(BOKEH, px - r, py - r, 2 * r, 2 * r);
    }
    x.globalCompositeOperation = 'source-over';
    // cánh hoa rơi chậm, xoay, lệch theo gió; trượt theo máy như lớp gần
    if (!reduced) {
      const n = quality.level < 0.5 ? 8 : 16;
      for (let i = 0; i < n; i++) {
        const v = (16 + hash(i, 21) * 26) * U, sway = (18 + hash(i, 22) * 30) * U;
        const py = ((hash(i, 23) * (H + 80) + t * v) % (H + 80)) - 40;
        const px = ((((hash(i, 24) - q * 0.25 * (1 + hash(i, 25))) % 1) + 1) % 1) * (W + 60) - 30 + Math.sin(t * (0.6 + hash(i, 26)) + i) * sway;
        const rot = t * (0.8 + hash(i, 27) * 1.4) + i, sz = (4 + hash(i, 28) * 4) * U * 1.3;
        x.save(); x.translate(px, py); x.rotate(rot); x.scale(1, 0.45 + 0.35 * Math.abs(Math.sin(rot * 0.7)));
        x.globalAlpha = 0.85 * cover;
        x.fillStyle = '#FFF4E6'; x.beginPath(); x.ellipse(0, 0, sz, sz * 0.62, 0, 0, TAU); x.fill();
        x.globalAlpha = 0.25 * cover; x.fillStyle = '#E9C9B8'; x.beginPath(); x.ellipse(sz * 0.25, sz * 0.15, sz * 0.55, sz * 0.3, 0, 0, TAU); x.fill();
        x.restore();
      }
    }
    x.globalAlpha = 1;
  }
}
