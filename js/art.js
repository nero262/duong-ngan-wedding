/*
 * Hình vẽ dùng chung cho trình duyệt và bước build (scripts/build-static.mjs).
 * Chỉ chứa dữ liệu và hàm thuần (không truy cập DOM) để Node có thể import.
 */

/* Biểu tượng D & N: chữ Didone trong một vòm cửa. Hệ toạ độ 100 × 124. */
export const MONO = {
  viewBox: '0 0 100 124',
  arch: 'M18 118V52a32 32 0 0 1 64 0v66',
  base: 'M11 118h78',
  star: 'M50 31.5l1.2 3.6 3.6 1.2-3.6 1.2-1.2 3.6-1.2-3.6-3.6-1.2 3.6-1.2z',
  D: 'M0 0H12C21.5 0 26 8.5 26 18C26 27.5 21.5 36 12 36H0V35.2H2.6V.8H0ZM6.4 1.3V34.7H11.5C18.8 34.7 22.4 27.4 22.4 18C22.4 8.6 18.8 1.3 11.5 1.3Z',
  N: 'M0 0H7L24.6 31.5V.9H21.4V0H28V.9H25.8V36H22.6L4 3.5V35.1H7V36H0V35.1H2.8V.9H0Z',
  amp: 'M13.6 19.8C10 15.5 6.5 11 4.6 8C3.2 5.8 3.6 1.2 6.6 1.2C9.4 1.2 9.6 4.8 7.6 6.6C5.6 8.4 1.2 10.6 1.2 14.6C1.2 18 3.6 19.8 6.4 19.8C9.6 19.8 11.6 16.8 12.6 12.4M10.4 12.2H14.4',
  // [tx, ty, scale] cho từng ký tự
  dT: [23.6, 61, 0.72],
  ampT: [44.2, 66.4, 0.72],
  nT: [56.2, 61, 0.72],
};

const t = ([x, y, s]) => `translate(${x} ${y}) scale(${s})`;

// Nơi dùng có thể làm nét đậm hơn bằng biến CSS (kế thừa vào <use>): --mono-line (vòm, đế), --mono-amp (chữ &), --mono-glyph (viền thêm cho D, N)
export function monogramInner({ star = true, archWidth = 1.4 } = {}) {
  const line = `stroke-width="${archWidth}" style="stroke-width:var(--mono-line,${archWidth})"`;
  const glyph = 'stroke="currentColor" stroke-width="0" style="stroke-width:var(--mono-glyph,0)"';
  return `<path d="${MONO.arch}" fill="none" stroke="currentColor" ${line}/>` +
    `<path d="${MONO.base}" fill="none" stroke="currentColor" ${line}/>` +
    (star ? `<path d="${MONO.star}" fill="currentColor"/>` : '') +
    `<path transform="${t(MONO.dT)}" d="${MONO.D}" fill="currentColor" fill-rule="evenodd" ${glyph}/>` +
    `<path transform="${t(MONO.ampT)}" d="${MONO.amp}" fill="none" stroke="currentColor" stroke-width="1.6" style="stroke-width:var(--mono-amp,1.6)" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path transform="${t(MONO.nT)}" d="${MONO.N}" fill="currentColor" ${glyph}/>`;
}

export function monogramSymbol(id = 'mono') {
  return `<symbol id="${id}" viewBox="${MONO.viewBox}">${monogramInner()}</symbol>`;
}

export function faviconSVG({ bg = '#FBF7EF', ink = '#84612E' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 124 124">` +
    `<rect width="124" height="124" rx="28" fill="${bg}"/>` +
    `<g transform="translate(12 2)" color="${ink}" style="color:${ink}">${monogramInner({ star: false, archWidth: 4 })}</g></svg>`;
}

/* Khung cảnh cố định phía sau toàn bộ thiệp: ảnh mẫu theo sắc trời + lớp hiệu ứng (scene.js). */
export function stageMarkup() {
  return `<div class="stage" id="stage" aria-hidden="true">
  <div class="stage__scene"><canvas class="scene__fx"></canvas></div>
</div>`;
}
