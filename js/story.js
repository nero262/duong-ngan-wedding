/*
 * Album — ảnh bìa và nút mở album. Cảnh nền đứng yên khi khách xem;
 * ảnh mở trong trình xem riêng, đóng lại thì khách vẫn ở đúng chỗ trên hành trình.
 * Ảnh do scripts/prep-album.py tạo (WebP nhiều cỡ + ảnh mờ 24 px): story.cover, story.pages trong content.json.
 */
import { el, svgUse } from './util.js';
import { openLightbox } from './lightbox.js';

const SIZES = '(min-width: 900px) 440px, 90vw'; // ô bìa vuông, cao min(46svh, 440px)

export function initStory(rootEl, story) {
  const pages = story?.pages || [];
  const cover = story?.cover || pages[0];
  const section = rootEl.closest('section');
  if (!cover) { section.hidden = true; return; }
  const items = story?.cover ? [story.cover, ...pages] : pages;
  const open = () => openLightbox(items, 0);
  const label = `Mở album · ${pages.length} trang`;
  rootEl.append(
    // ảnh mờ 24 px làm nền ô bìa: hiện ngay, ảnh nét phủ lên khi tải xong
    el('button', { class: 'story__cover', type: 'button', 'aria-label': label, onclick: open, style: { backgroundImage: cover.lqip ? `url("${cover.lqip}")` : null } },
      el('img', {
        sizes: SIZES, srcset: cover.srcset || null, src: cover.src, width: cover.w || null, height: cover.h || null, alt: cover.alt || '',
        loading: 'lazy', decoding: 'async', draggable: 'false',
      }),
      el('span', { class: 'story__expand', 'aria-hidden': 'true' }, svgUse('i-expand'))),
    el('button', { class: 'btn btn--primary story__open', type: 'button', onclick: open }, label),
  );
}
