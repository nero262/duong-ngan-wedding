/*
 * Cảnh 5 & 6 — Xác nhận tham dự và Sổ lưu bút.
 * Dữ liệu gửi tới Google Apps Script gắn với Google Sheet của cô dâu chú rể (content.settings.sheetApi —
 * mã ở google-apps-script/Code.gs). Chưa có địa chỉ đó thì biểu mẫu chạy ở chế độ xem thử.
 * Nguyên tắc: chỉ báo thành công khi Sheet xác nhận đã lưu; lỗi thì giữ nguyên nội dung để gửi lại;
 * mỗi lần gửi mang một mã riêng nên chạm nhiều lần hay gửi lại sau lỗi mạng không tạo bản trùng.
 */
import { $, $$, el, store, uid, fetchWithTimeout, watchVisibility, formatDate, parseDate, isReduced } from './util.js';
import { stagger, PRESET } from './anim.js';

const loadedAt = Date.now();

/* Apps Script luôn trả HTTP 200, trạng thái thật nằm trong JSON. Gửi text/plain để trình duyệt không hỏi trước CORS. */
async function postJSON(api, payload) {
  if (!api) return { ok: false, network: true };
  let res;
  try {
    res = await fetchWithTimeout(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) }, 25000);
  } catch {
    return { ok: false, network: true };
  }
  let data = {};
  try { data = await res.json(); } catch { /* phản hồi không phải JSON */ }
  if (res.ok && data.ok) return { ok: true, data };
  return { ok: false, status: data.status || (res.ok ? 500 : res.status), error: data.error, fields: data.fields };
}

function failMessage(result, previewMode) {
  if (result.network) {
    return previewMode
      ? 'Đây là bản xem thử chưa kết nối nơi lưu dữ liệu, nên nội dung chưa được gửi đi.'
      : 'Chưa gửi được vì kết nối mạng chập chờn. Nội dung bạn điền vẫn còn nguyên — hãy bấm “Gửi lại”.';
  }
  if (result.status >= 500) return 'Chưa lưu được. Nội dung vẫn còn nguyên, bạn thử gửi lại sau giây lát nhé.';
  return result.error || 'Chưa gửi được. Vui lòng kiểm tra lại và thử lần nữa.';
}

function showErrors(form, fields = {}) {
  let first = null;
  $$('[data-error-for]', form).forEach((p) => {
    const key = p.dataset.errorFor;
    const msg = fields[key] || '';
    p.textContent = msg;
    const field = p.closest('.field');
    field.classList.toggle('fieldset-invalid', !!msg && field.tagName === 'FIELDSET');
    const input = field.querySelector('.input');
    if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg && !first) first = field.querySelector('input:not([type=hidden]), textarea');
  });
  first?.focus();
}

/* Khách sửa ô nào thì xoá lỗi của ô đó. */
function clearErrorsOnEdit(form) {
  const clear = (e) => {
    const field = e.target.closest('.field');
    const err = field?.querySelector('[data-error-for]');
    if (!err || !err.textContent) return;
    err.textContent = '';
    field.classList.remove('fieldset-invalid');
    field.querySelector('.input')?.setAttribute('aria-invalid', 'false');
  };
  form.addEventListener('input', clear);
  form.addEventListener('change', clear);
}

function setStatus(form, msg = '', kind = 'error') {
  const box = $('[data-status]', form);
  box.textContent = msg;
  box.className = `form__status${msg ? ` is-${kind}` : ''}`;
}

function setSending(form, sending, label) {
  const btn = $('[data-submit]', form);
  btn.classList.toggle('is-sending', sending);
  btn.setAttribute('aria-disabled', String(sending));
  if (label) $('[data-submit-label]', form).textContent = label;
}

function counters(form) {
  $$('[data-count-for]', form).forEach((span) => {
    const input = $(`#${span.dataset.countFor}`, form);
    const update = () => { span.textContent = input.value.length ? `${input.value.length}/${input.maxLength}` : ''; };
    input.addEventListener('input', update);
    update();
  });
}

function showDone(card, form, done) {
  form.hidden = true;
  done.hidden = false;
  // hai chiếc nhẫn vẽ nét bằng CSS; tiêu đề, lời nhắn, nút lần lượt hiện lên theo sau
  stagger([...done.children].filter((n) => !n.matches('.done__rings')), PRESET.rise(14), { delay: 220, step: 90 });
  done.focus({ preventScroll: true });
  const top = card.getBoundingClientRect().top;
  if (top < 0 || top > innerHeight * 0.6) card.scrollIntoView({ block: 'start', behavior: isReduced() ? 'auto' : 'smooth' });
}

/* ------------------------------------------------------------------ */

export function initRsvp(content, invite) {
  const api = content.settings?.sheetApi || '';
  const form = $('#rsvp-form');
  const card = form.closest('.formcard');
  const done = $('[data-done]', card);
  const banner = $('[data-preview-banner]', card);
  const nameInput = $('#rsvp-name', form);
  const guestsInput = $('#rsvp-guests', form);
  const events = (content.events || []).filter((e) => e.rsvp !== false);
  const multi = events.length > 1;
  const maxGuests = Math.max(1, Number(content.rsvp?.maxGuests) || 10);
  guestsInput.max = String(maxGuests);

  const note = $('[data-rsvp-deadline]');
  if (content.rsvp?.deadline) {
    note.textContent = `Bạn vui lòng phản hồi trước ${formatDate(content.rsvp.deadline).replace(/\.\d{4}$/, '')} nhé.`;
    note.hidden = false;
  }
  // hạn chót chỉ để nhắc, quá hạn vẫn nhận; muốn đóng hẳn thì đặt rsvp.open = false
  if (content.rsvp?.open === false) {
    form.replaceWith(el('p', { class: 'section__lead', style: { textAlign: 'center' } }, 'Biểu mẫu xác nhận đã đóng. Nếu cần báo thêm, bạn nhắn trực tiếp cho chúng mình nhé.'));
    return;
  }

  const list = $('[data-event-list]', form);
  if (multi) {
    for (const ev of events) {
      const d = parseDate(ev.date);
      const meta = [ev.city, d && `${d.d}/${d.m}`].filter(Boolean).join(' - ');
      list.append(el('label', { class: 'choice' }, el('input', { type: 'radio', name: 'events', value: ev.id }),
        el('span', {}, ev.title, meta ? el('small', { class: 'choice__meta' }, meta) : null)));
    }
  } else {
    $('[data-event-choices]', form).remove();
  }

  const DRAFT = 'dn.rsvp.draft';
  const CID = 'dn.rsvp.cid';
  const read = () => ({
    name: nameInput.value.trim(),
    attending: form.attending.value || null,
    guests: Number(guestsInput.value),
    events: $$('input[name="events"]:checked', form).map((i) => i.value),
    message: $('#rsvp-message', form).value.trim(),
    hp: form.hp.value,
  });
  const syncYes = () => {
    const yes = form.attending.value === 'yes';
    $$('[data-when-yes]', form).forEach((f) => { f.hidden = !yes; });
  };
  const saveDraft = () => {
    const { hp, ...d } = read();
    store.set(DRAFT, JSON.stringify(d), true);
  };

  try {
    const d = JSON.parse(store.get(DRAFT, true) || 'null');
    if (d) {
      nameInput.value = d.name || '';
      if (d.attending) form.querySelector(`input[name="attending"][value="${d.attending}"]`).checked = true;
      if (d.guests) guestsInput.value = d.guests;
      if (Array.isArray(d.events) && multi) $$('input[name="events"]', form).forEach((i) => { i.checked = d.events.includes(i.value); });
      $('#rsvp-message', form).value = d.message || '';
    }
  } catch { /* bản nháp hỏng — bỏ qua */ }
  if (!nameInput.value && invite?.name) nameInput.value = invite.name;
  syncYes();
  counters(form);
  clearErrorsOnEdit(form);

  form.addEventListener('change', (e) => { if (e.target.name === 'attending') syncYes(); saveDraft(); });
  form.addEventListener('input', saveDraft);
  $$('[data-step]', form).forEach((b) => b.addEventListener('click', () => {
    const v = Math.min(maxGuests, Math.max(1, (Number(guestsInput.value) || 1) + Number(b.dataset.step)));
    guestsInput.value = v;
    saveDraft();
  }));

  banner.hidden = !!api;

  let sending = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    const data = read();
    const errors = {};
    if (data.name.length < 2) errors.name = 'Vui lòng nhập tên của bạn.';
    if (!data.attending) errors.attending = 'Vui lòng chọn một câu trả lời.';
    if (data.attending === 'yes') {
      if (!Number.isInteger(data.guests) || data.guests < 1 || data.guests > maxGuests) errors.guests = `Số người từ 1 đến ${maxGuests}.`;
      if (multi && !data.events.length) errors.events = 'Vui lòng chọn sự kiện bạn sẽ tham dự.';
    }
    showErrors(form, errors);
    if (Object.keys(errors).length) { setStatus(form, ''); return; }

    let cid = store.get(CID, true);
    if (!cid) { cid = uid(); store.set(CID, cid, true); }
    sending = true;
    setSending(form, true, 'Đang gửi…');
    setStatus(form, '');
    const payload = { type: 'rsvp', ...data, clientId: cid, invite: invite?.token || null };
    if (data.attending !== 'yes') { payload.guests = null; payload.events = []; }
    if (!multi && data.attending === 'yes') payload.events = events.map((ev) => ev.id);
    const result = await postJSON(api, payload);
    sending = false;

    if (result.ok) {
      setSending(form, false, 'Gửi xác nhận');
      store.remove(DRAFT, true);
      store.remove(CID, true);
      const t = {
        yes: ['Hẹn gặp bạn nhé!', `Chúng mình đã nhận được xác nhận của bạn (${data.guests} người). Cảm ơn bạn thật nhiều!`],
        no: ['Cảm ơn bạn đã báo cho chúng mình', 'Tiếc là lần này chưa gặp được bạn. Lời hỏi thăm của bạn đã đến nơi rồi.'],
        maybe: ['Cảm ơn bạn!', 'Chúng mình đã ghi nhận. Khi chắc chắn hơn, bạn có thể gửi thêm một phản hồi mới nhé.'],
      }[data.attending];
      $('[data-done-title]', done).textContent = t[0];
      $('[data-done-text]', done).textContent = t[1];
      note.hidden = true; // đã gửi xong thì không nhắc hạn nữa, chỉ còn lời cảm ơn
      showDone(card, form, done);
      return;
    }
    const preview = !api;
    setSending(form, false, result.status === 422 || result.status === 429 ? 'Gửi xác nhận' : 'Gửi lại');
    if (result.fields) showErrors(form, result.fields);
    setStatus(form, failMessage(result, preview));
    if (preview) banner.hidden = false;
  });

  $('[data-again]', done).addEventListener('click', () => {
    note.hidden = !content.rsvp?.deadline;
    form.reset();
    guestsInput.value = 1;
    syncYes();
    showErrors(form, {});
    setStatus(form, '');
    done.hidden = true;
    form.hidden = false;
    nameInput.focus();
  });
}

/* ------------------------------------------------------------------ */

export function initGuestbook(content) {
  const api = content.settings?.sheetApi || '';
  const form = $('#wish-form');
  const card = form.closest('.formcard');
  const done = $('[data-done]', card);
  const banner = $('[data-preview-banner]', card);
  const section = card.closest('section');
  const listEl = $('[data-wishes]', section);
  const empty = $('[data-wishes-empty]', section);
  const errorEl = $('[data-wishes-error]', section);
  const nameEl = $('#wish-name', form);
  const msgEl = $('#wish-message', form);
  const DRAFT = 'dn.wish.draft';
  const CID = 'dn.wish.cid';
  let shownAt = 0;

  try {
    const d = JSON.parse(store.get(DRAFT, true) || 'null');
    if (d) { nameEl.value = d.name || ''; msgEl.value = d.message || ''; }
  } catch { /* bỏ qua */ }
  counters(form);
  clearErrorsOnEdit(form);
  form.addEventListener('input', () => store.set(DRAFT, JSON.stringify({ name: nameEl.value, message: msgEl.value }), true));

  // Lời chúc đã duyệt hiện lần lượt từng cái, 5 giây đổi một lần: “lời chúc” ~ người gửi.
  // Dừng khi khách rê chuột vào khung, khi phần này khuất khỏi màn hình hoặc tab bị ẩn.
  const STEP = 5000, MAX = 120; // ponytail: tải tối đa 120 lời chúc một lần, tăng MAX nếu nhiều hơn
  let slides = [], cur = 0, timer = 0, inView = false, held = false;
  const show = (i) => {
    const prev = slides[cur];
    if (prev && i !== cur) { prev.classList.replace('is-on', 'is-off'); setTimeout(() => prev.classList.remove('is-off'), 900); }
    cur = i;
    slides[cur].classList.add('is-on');
  };
  const sync = () => {
    const run = slides.length > 1 && inView && !held && !document.hidden;
    if (run && !timer) timer = setInterval(() => show((cur + 1) % slides.length), STEP);
    if (!run && timer) { clearInterval(timer); timer = 0; }
  };
  listEl.addEventListener('pointerenter', () => { held = true; sync(); });
  listEl.addEventListener('pointerleave', () => { held = false; sync(); });
  document.addEventListener('visibilitychange', sync);

  async function load() {
    errorEl.hidden = true;
    if (!api) { empty.hidden = false; return; }
    try {
      const items = [];
      for (let total = Infinity; items.length < Math.min(total, MAX);) {
        const res = await fetchWithTimeout(`${api}?type=wishes&offset=${items.length}&limit=30`, { cache: 'no-store' }, 20000);
        const data = await res.json();
        if (!data.ok) throw new Error(data.error);
        if (!data.items.length) break;
        items.push(...data.items);
        total = data.total;
      }
      slides = items.map((w) => el('li', { class: 'wish' },
        el('p', { class: 'wish__msg' }, `“${w.message}” `, el('span', { class: 'wish__name' }, `~ ${w.name}`))));
      listEl.replaceChildren(...slides);
      listEl.hidden = !slides.length;
      empty.hidden = !!slides.length;
      if (slides.length) show(0);
      sync();
    } catch {
      errorEl.hidden = false;
    }
  }
  $('[data-wishes-retry]', section).addEventListener('click', () => load());

  let started = false;
  watchVisibility(section, (v) => {
    inView = v;
    if (v && !started) {
      started = true;
      shownAt = Date.now();
      load();
      banner.hidden = !!api;
    }
    sync();
  }, '400px 0px');

  let sending = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    const name = nameEl.value.trim();
    const message = msgEl.value.trim();
    const errors = {};
    if (name.length < 2) errors.name = 'Vui lòng nhập tên của bạn.';
    if (message.length < 2) errors.message = 'Vui lòng viết lời chúc.';
    showErrors(form, errors);
    if (Object.keys(errors).length) { setStatus(form, ''); return; }

    let cid = store.get(CID, true);
    if (!cid) { cid = uid(); store.set(CID, cid, true); }
    sending = true;
    setSending(form, true, 'Đang gửi…');
    setStatus(form, '');
    const result = await postJSON(api, { type: 'wish', name, message, hp: form.hp.value, clientId: cid, elapsed: Date.now() - (shownAt || loadedAt) });
    sending = false;
    if (result.ok) {
      setSending(form, false, 'Gửi lời chúc');
      store.remove(DRAFT, true);
      store.remove(CID, true);
      showDone(card, form, done);
      return;
    }
    const preview = !api;
    setSending(form, false, result.status === 422 || result.status === 429 ? 'Gửi lời chúc' : 'Gửi lại');
    if (result.fields) showErrors(form, result.fields);
    setStatus(form, failMessage(result, preview));
    if (preview) banner.hidden = false;
  });

  $('[data-again]', done).addEventListener('click', () => {
    msgEl.value = '';
    showErrors(form, {});
    setStatus(form, '');
    done.hidden = true;
    form.hidden = false;
    shownAt = Date.now();
    msgEl.focus();
  });
}
