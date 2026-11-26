/*
 * Cảnh 4 — Thông tin lễ cưới.
 * Thông tin chưa chốt hiện “Sẽ cập nhật”. Chỉ bật “Chỉ đường” khi có địa chỉ/bản đồ,
 * chỉ bật “Thêm vào lịch” khi có ngày + giờ bắt đầu. Giờ luôn hiểu theo Asia/Ho_Chi_Minh (UTC+7).
 */
import { el, svgUse, parseDate, weekday } from './util.js';

const KIND = { ceremony: 'Lễ cưới', reception: 'Tiệc cưới', groom: 'Nhà trai', bride: 'Nhà gái', other: 'Sự kiện' };
const DEFAULT_HOURS = 2; // thời lượng mặc định trong lịch khi chưa có giờ kết thúc

const tbd = (text = 'Sẽ cập nhật') => el('span', { class: 'tbd' }, text);

function toUTC(date, time) {
  const p = parseDate(date);
  const [h, m] = time.split(':').map(Number);
  return new Date(Date.UTC(p.y, p.m - 1, p.d, h - 7, m)); // Việt Nam: UTC+7 cố định
}
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function range(ev) {
  const start = toUTC(ev.date, ev.start);
  let end = ev.end ? toUTC(ev.date, ev.end) : new Date(start.getTime() + DEFAULT_HOURS * 3600e3);
  if (end <= start) end = new Date(end.getTime() + 86400e3);
  return { start, end };
}

function details(ev, couple) {
  const lines = [`${ev.title} — ${couple}`];
  if (ev.schedule?.length) lines.push('', ...ev.schedule.map((s) => `${s.time ? `${s.time} · ` : ''}${s.label}`));
  if (ev.note) lines.push('', ev.note);
  lines.push('', location.origin + location.pathname);
  return lines.join('\n');
}

function googleUrl(ev, couple) {
  const { start, end } = range(ev);
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: `${ev.title} · ${couple}`, dates: `${stamp(start)}/${stamp(end)}`,
    ctz: 'Asia/Ho_Chi_Minh', details: details(ev, couple), location: [ev.venue, ev.address].filter(Boolean).join(', '),
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }

function downloadIcs(ev, couple) {
  const { start, end } = range(ev);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Duong Ngan//Wedding//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${ev.id}-${stamp(start)}@duong-ngan`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${icsEscape(`${ev.title} · ${couple}`)}`,
    `DESCRIPTION:${icsEscape(details(ev, couple))}`, `LOCATION:${icsEscape([ev.venue, ev.address].filter(Boolean).join(', '))}`,
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(ev.title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = el('a', { href: url, download: `${ev.id}.ics` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function calendarMenu(ev, couple) {
  const list = el('div', { class: 'calmenu__list', role: 'menu', hidden: true },
    el('a', { role: 'menuitem', href: googleUrl(ev, couple), target: '_blank', rel: 'noopener' }, 'Google Calendar'),
    el('button', { role: 'menuitem', type: 'button', onclick: () => { downloadIcs(ev, couple); toggle(false); } }, 'Apple / Outlook (tệp .ics)'),
  );
  const btn = el('button', { class: 'btn btn--ghost btn--icon', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', title: 'Thêm vào lịch' }, svgUse('i-cal'), el('span', { class: 'event__label' }, 'Thêm vào lịch'));
  const wrap = el('div', { class: 'calmenu' }, btn, list);
  function toggle(open) {
    list.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) list.querySelector('a').focus();
  }
  btn.addEventListener('click', () => toggle(list.hidden));
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggle(false); btn.focus(); } });
  document.addEventListener('pointerdown', (e) => { if (!wrap.contains(e.target)) toggle(false); });
  return wrap;
}

function joined(parts, sep) {
  return el('span', {}, ...parts.filter(Boolean).flatMap((p, i) => [i ? sep : null, el('span', { class: 'nw' }, p)]).filter(Boolean));
}

function line(icon, label, value) {
  return el('p', { class: 'event__line' }, svgUse(icon), el('span', {}, el('span', { class: 'event__label' }, `${label}: `), value));
}

/* Dòng thời gian theo thứ tự trong nội dung. Mỗi mục gọn trong vài dòng để cả trang nhìn một lần là thấy hết:
   tên sự kiện · dòng giờ (lịch trình nếu có) + ngày · dòng nơi tổ chức + địa chỉ · nút chỉ đường / thêm vào lịch khi đủ thông tin. */
export function renderEvents(container, content) {
  const couple = content.couple.displayName;
  const events = content.events || [];
  if (!events.length) {
    container.append(el('div', { class: 'event' }, el('p', { class: 'tbd' }, 'Thông tin sự kiện sẽ được cập nhật.')));
    return;
  }
  const missing = new Set();
  for (const ev of events) {
    // mỗi cụm (giờ, ngày, từng phần địa chỉ) không bị ngắt giữa chừng — chỉ xuống dòng sau dấu “·” hoặc dấu phẩy
    const times = ev.schedule?.length
      ? ev.schedule.map((s) => [s.label, s.time].filter(Boolean).join(' '))
      : ev.start ? [ev.end ? `${ev.start} – ${ev.end}` : ev.start] : [];
    const d = parseDate(ev.date);
    const when = times.length || d
      ? joined([d ? `${weekday(ev.date)}, ${d.d}.${d.m}` : 'ngày sẽ cập nhật', ...times.map((t) => el('strong', {}, t))], ' · ')
      : tbd();
    const place = ev.venue || ev.address
      ? el('span', {}, ev.venue ? el('strong', { class: 'nw' }, ev.venue) : null, ev.venue && ev.address ? ' — ' : null,
        ev.address ? joined(ev.address.split(/,\s*/), ', ') : null)
      : tbd();
    const side = ev.kind === 'groom' || ev.kind === 'bride';
    const card = el('article', { class: `event event--${KIND[ev.kind] ? ev.kind : 'other'}`, 'aria-labelledby': `ev-${ev.id}` },
      el('span', { class: 'event__mark', 'aria-hidden': 'true' }),
      // nhãn “Nhà trai / Nhà gái” chỉ khi tiêu đề chưa nói rõ
      side && !ev.title.toLowerCase().includes(KIND[ev.kind].toLowerCase()) ? el('p', { class: 'event__kind' }, KIND[ev.kind]) : null,
      el('div', { class: 'event__head' }, el('h3', { class: 'event__title', id: `ev-${ev.id}` }, ev.title)),
      line('i-clock', 'Thời gian', when),
      line('i-pin', 'Địa điểm', place),
    );
    if (ev.note) card.append(el('p', { class: 'event__note' }, ev.note));

    const canMap = !!(ev.mapUrl || ev.address);
    const canCal = !!(ev.date && ev.start);
    const actions = el('div', { class: 'event__actions' });
    if (canMap) {
      const href = ev.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([ev.venue, ev.address].filter(Boolean).join(', '))}`;
      actions.append(el('a', { class: 'btn btn--primary btn--icon', href, target: '_blank', rel: 'noopener', title: 'Chỉ đường' }, svgUse('i-pin'), el('span', { class: 'event__label' }, 'Chỉ đường')));
    }
    if (canCal) actions.append(calendarMenu(ev, couple));
    if (actions.childNodes.length) card.querySelector('.event__head').append(actions);
    if (!canMap) missing.add('chỉ đường');
    if (!canCal) missing.add('thêm vào lịch');
    container.append(card);
  }
  // một ghi chú chung cho cả trang thay vì lặp lại dưới từng sự kiện
  if (missing.size) container.append(el('p', { class: 'event__pending' }, `Nút ${[...missing].join(' và ')} sẽ xuất hiện ở từng phần khi có đủ thông tin.`));
}
