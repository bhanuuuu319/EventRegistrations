import { db } from "./firebase-config.js";
import { collection, query, where, orderBy, getDocs, doc, getDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { AppError } from "./auth.js";
import { esc, fmtDate, fmtTime, toast, setBusy } from "./utils.js";
import { catInfo } from "./catalog.js";

export const PUBLIC = ["published", "cancelled", "completed"];
const at = (d, t) => new Date(`${d}T${t || "00:00"}:00+05:30`);   // all event times are IST
export const startAt = (ev) => at(ev.eventDate, ev.startTime);
export const endAt = (ev) => at(ev.eventDate, ev.endTime);
const deadlineAt = (ev) => ev.registrationDeadlineAt?.toDate ? ev.registrationDeadlineAt.toDate() : at(ev.registrationDeadline, "23:59");

export async function loadEvents() {
  const s = await getDocs(query(collection(db, "events"), where("status", "in", PUBLIC), orderBy("eventDate")));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function loadStats() {
  const s = await getDocs(collection(db, "eventStats")); const m = {};
  s.forEach(d => m[d.id] = d.data().registeredCount || 0); return m;
}
export async function loadMyRegs(uid) {
  const s = await getDocs(query(collection(db, "registrations"), where("studentUid", "==", uid), orderBy("registeredAt", "desc")));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Status shown to users. Seat count comes from eventStats, which only the rules-checked transaction can change. */
export function eventState(ev, count) {
  const now = new Date();
  if (ev.status === "cancelled") return { key: "cancelled", label: "Cancelled", cls: "danger", open: false };
  if (ev.status === "completed" || endAt(ev) < now) return { key: "completed", label: "Completed", cls: "secondary", open: false };
  if (deadlineAt(ev) < now) return { key: "closed", label: "Registration Closed", cls: "warning text-dark", open: false };
  if (count >= ev.capacity) return { key: "full", label: "Registration Closed (Full)", cls: "warning text-dark", open: false };
  if (count >= ev.capacity * 0.8) return { key: "almost", label: "Almost Full", cls: "info text-dark", open: true };
  return { key: "open", label: "Registration Open", cls: "success", open: true };
}

export function countdown(ms) {
  if (ms <= 0) return "Started";
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3);
  return `${d}d ${h}h ${m}m ${s}s`;
}

const SAFE_URL = /^https:\/\/[^\s'"()<>\\]+$/;
export function banner(ev, cls = "") {
  const c = catInfo(ev.category);
  const img = SAFE_URL.test(ev.imageUrl || "") ? `,url('${esc(ev.imageUrl)}') center/cover` : "";
  return `<div class="ev-banner ${cls}" style="background:linear-gradient(135deg,${c.grad[0]}d9,${c.grad[1]}d9)${img}"><i class="bi ${c.icon}"></i><span class="ev-cat">${esc(ev.category)}${ev.subcategory && ev.subcategory !== "General" ? ": " + esc(ev.subcategory) : ""}</span></div>`;
}

export function eventCard(ev, count) {
  const st = eventState(ev, count), left = Math.max(0, ev.capacity - count);
  return `<div class="col-md-6 col-xl-4"><article class="glass ev-card" data-id="${esc(ev.id)}" tabindex="0" role="button" aria-label="Open ${esc(ev.title)}">
    ${banner(ev)}
    <div class="p-3">
      <span class="badge bg-${st.cls}">${st.label}</span>
      <h3 class="h5 mt-2 mb-2">${esc(ev.title)}</h3>
      <p class="small text-secondary mb-1"><i class="bi bi-calendar-event me-1"></i>${fmtDate(ev.eventDate)}, ${fmtTime(ev.startTime)}</p>
      <p class="small text-secondary mb-1"><i class="bi bi-geo-alt me-1"></i>${esc(ev.venue)}</p>
      <p class="small mb-0 ${left < 6 ? "text-warning" : "text-secondary"}"><i class="bi bi-people me-1"></i>${left} of ${ev.capacity} seats left</p>
    </div></article></div>`;
}

export function bindCards(container, getEvent, ctx) {
  const open = (t) => { const c = t.closest(".ev-card"); if (c) { const ev = getEvent(c.dataset.id); if (ev) showEvent(ev, ctx()); } };
  container.addEventListener("click", (e) => open(e.target));
  container.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(e.target); } });
}

export const calendarUrl = (ev) => {
  const s = (d, t) => d.replaceAll("-", "") + "T" + t.replace(":", "") + "00";
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.title)}&dates=${s(ev.eventDate, ev.startTime)}/${s(ev.eventDate, ev.endTime)}&ctz=Asia%2FKolkata&location=${encodeURIComponent(ev.venue)}&details=${encodeURIComponent(ev.description || "")}`;
};

/* ---------------- registration (race-safe) ----------------
   One transaction: read registration + seat counter, then write both.
   Rules re-check capacity, deadline, ownership and "+1 only" on the server side. */
export async function registerForEvent(uid, ev) {
  const regRef = doc(db, "registrations", `${uid}_${ev.id}`), stRef = doc(db, "eventStats", ev.id);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const reference = "ER-" + Array.from(crypto.getRandomValues(new Uint8Array(6)), b => alphabet[b % 32]).join("");
  try {
    return await runTransaction(db, async (tx) => {
      const [r, s] = await Promise.all([tx.get(regRef), tx.get(stRef)]);
      if (!s.exists()) throw new AppError("This event is not ready for registration yet.");
      const count = s.data().registeredCount || 0;
      if (r.exists() && r.data().status === "confirmed") throw new AppError("You are already registered for this event.");
      if (count >= ev.capacity) throw new AppError("Sorry, this event is full.");
      tx.update(stRef, { registeredCount: count + 1 });
      if (r.exists()) { tx.update(regRef, { status: "confirmed", registeredAt: serverTimestamp() }); return r.data().reference; }
      tx.set(regRef, { studentUid: uid, eventId: ev.id, status: "confirmed", reference, registeredAt: serverTimestamp() });
      return reference;
    });
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (e.code === "permission-denied") throw new AppError("Registration refused: the event may be full, closed or cancelled.");
    throw e;
  }
}

export async function cancelRegistration(uid, eventId) {
  const regRef = doc(db, "registrations", `${uid}_${eventId}`), stRef = doc(db, "eventStats", eventId);
  await runTransaction(db, async (tx) => {
    const [r, s] = await Promise.all([tx.get(regRef), tx.get(stRef)]);
    if (!r.exists() || r.data().status !== "confirmed") throw new AppError("This registration is not active.");
    tx.update(regRef, { status: "cancelled", cancelledAt: serverTimestamp() });
    tx.update(stRef, { registeredCount: Math.max(0, (s.data().registeredCount || 1) - 1) });
  });
}

/* ---------------- dialogs ---------------- */
export function confirmDialog(title, message, okLabel = "Confirm") {
  return new Promise((resolve) => {
    let m = document.getElementById("cfModal");
    if (!m) {
      document.body.insertAdjacentHTML("beforeend", `<div class="modal fade" id="cfModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-dialog-centered"><div class="modal-content glass-modal">
        <div class="modal-header border-0"><h2 class="h5 modal-title" id="cfTitle"></h2></div><div class="modal-body" id="cfMsg"></div>
        <div class="modal-footer border-0"><button class="btn btn-outline-light rounded-pill" id="cfNo">Go Back</button><button class="btn btn-glow" id="cfYes"></button></div></div></div></div>`);
      m = document.getElementById("cfModal");
    }
    m.querySelector("#cfTitle").textContent = title; m.querySelector("#cfMsg").textContent = message; m.querySelector("#cfYes").textContent = okLabel;
    const inst = bootstrap.Modal.getOrCreateInstance(m); let done = false;
    const fin = (val) => { if (done) return; done = true; inst.hide(); resolve(val); };
    m.querySelector("#cfYes").onclick = () => fin(true); m.querySelector("#cfNo").onclick = () => fin(false);
    m.addEventListener("hidden.bs.modal", () => fin(false), { once: true });
    inst.show();
  });
}

let evEl, evModal, timer;
function ensureModal() {
  if (evEl) return;
  document.body.insertAdjacentHTML("beforeend", `<div class="modal fade" id="evModal" tabindex="-1" aria-labelledby="evTitle" aria-hidden="true"><div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"><div class="modal-content glass-modal" id="evBody"></div></div></div>`);
  evEl = document.getElementById("evModal"); evModal = new bootstrap.Modal(evEl);
  evEl.addEventListener("hidden.bs.modal", () => clearInterval(timer));
}

/** ctx = { user, profile, onChange } ; user/profile are null for visitors. */
export async function showEvent(ev, ctx = {}) {
  ensureModal();
  const body = document.getElementById("evBody");
  body.innerHTML = `<div class="p-5 text-center"><div class="spinner-border text-info" role="status"><span class="visually-hidden">Loading</span></div></div>`;
  evModal.show();
  let count = 0, reg = null;
  try {
    const s = await getDoc(doc(db, "eventStats", ev.id)); count = s.exists() ? s.data().registeredCount || 0 : 0;
    if (ctx.user && ctx.profile?.role === "student") { const r = await getDoc(doc(db, "registrations", `${ctx.user.uid}_${ev.id}`)); reg = r.exists() ? r.data() : null; }
  } catch (e) { console.warn(e); }
  renderDetails(body, ev, count, reg, ctx);
}

function renderDetails(body, ev, count, reg, ctx) {
  clearInterval(timer);
  const st = eventState(ev, count), left = Math.max(0, ev.capacity - count), mine = reg?.status === "confirmed";
  let action;
  if (!ctx.user) action = `<a class="btn btn-glow" href="login.html">Log in to register</a>`;
  else if (ctx.profile.role !== "student") action = `<span class="small text-secondary">Admins manage events from the admin dashboard.</span>`;
  else if (mine) action = `<span class="badge bg-success fs-6">You are registered (${esc(reg.reference)})</span> <a class="btn btn-outline-light btn-sm rounded-pill ms-2" href="my-registrations.html">My Registrations</a>`;
  else if (st.open) action = `<button class="btn btn-glow" id="evReg"><i class="bi bi-ticket-perforated me-1"></i>Register Now</button>`;
  else action = `<button class="btn btn-secondary" disabled>${st.label}</button>`;
  body.innerHTML = `
    ${banner(ev, "tall")}
    <button type="button" class="btn-close btn-close-white ev-x" data-bs-dismiss="modal" aria-label="Close"></button>
    <div class="p-4">
      <span class="badge bg-${st.cls}">${st.label}</span>
      <h2 class="h3 mt-2" id="evTitle">${esc(ev.title)}</h2>
      <div class="row g-3 my-2 small">
        <div class="col-sm-6"><i class="bi bi-calendar-event me-2 text-info"></i>${fmtDate(ev.eventDate)}</div>
        <div class="col-sm-6"><i class="bi bi-clock me-2 text-info"></i>${fmtTime(ev.startTime)} to ${fmtTime(ev.endTime)}</div>
        <div class="col-sm-6"><i class="bi bi-geo-alt me-2 text-info"></i>${esc(ev.venue)}${ev.venueAddress ? ", " + esc(ev.venueAddress) : ""}</div>
        <div class="col-sm-6"><i class="bi bi-person-badge me-2 text-info"></i>${esc(ev.organizer)}</div>
        <div class="col-sm-6"><i class="bi bi-hourglass-split me-2 text-info"></i>Register by ${fmtDate(ev.registrationDeadline)}</div>
        <div class="col-sm-6"><i class="bi bi-people me-2 text-info"></i>${left} of ${ev.capacity} seats available</div>
      </div>
      ${st.key !== "completed" && st.key !== "cancelled" ? `<div class="countdown my-3"><span class="small text-secondary">Starts in</span> <strong id="evCd"></strong></div>` : ""}
      <p>${esc(ev.description)}</p>
      ${ev.rules ? `<h3 class="h6 mt-3">Rules and eligibility</h3><p class="small text-secondary" style="white-space:pre-line">${esc(ev.rules)}</p>` : ""}
      <div class="mt-4" id="evAction">${action}</div>
    </div>`;
  const cd = body.querySelector("#evCd");
  if (cd) { const tick = () => cd.textContent = countdown(startAt(ev) - new Date()); tick(); timer = setInterval(tick, 1000); }
  body.querySelector("#evReg")?.addEventListener("click", () => renderConfirm(body, ev, count, reg, ctx));
}

function renderConfirm(body, ev, count, reg, ctx) {
  clearInterval(timer);
  body.innerHTML = `<div class="p-4 p-md-5 text-center">
    <i class="bi bi-question-circle display-4 text-info"></i>
    <h2 class="h4 mt-3">Are you sure you want to register for this event?</h2>
    <div class="glass p-3 my-4 text-start">
      <p class="mb-1"><strong>${esc(ev.title)}</strong></p>
      <p class="mb-1 small"><i class="bi bi-calendar-event me-2"></i>${fmtDate(ev.eventDate)}</p>
      <p class="mb-1 small"><i class="bi bi-clock me-2"></i>${fmtTime(ev.startTime)} to ${fmtTime(ev.endTime)}</p>
      <p class="mb-0 small"><i class="bi bi-geo-alt me-2"></i>${esc(ev.venue)}</p>
    </div>
    <button class="btn btn-outline-light rounded-pill me-2" id="cBack">Go Back</button>
    <button class="btn btn-glow" id="cOk">Confirm Registration</button></div>`;
  body.querySelector("#cBack").onclick = () => renderDetails(body, ev, count, reg, ctx);
  const ok = body.querySelector("#cOk"); let busy = false;
  ok.onclick = async () => {
    if (busy) return; busy = true; setBusy(ok, true, "Registering…");
    try {
      const ref = await registerForEvent(ctx.user.uid, ev);
      renderSuccess(body, ev, ref); toast("You are registered. Reference " + ref); ctx.onChange?.();
    } catch (e) {
      toast(e instanceof AppError ? e.message : "Could not register. Please try again.", "danger");
      busy = false; setBusy(ok, false);
    }
  };
}

function renderSuccess(body, ev, ref) {
  body.innerHTML = `<div class="p-4 p-md-5 text-center">
    <i class="bi bi-check-circle-fill display-3 text-success"></i>
    <h2 class="h3 mt-3">Registration confirmed</h2>
    <div class="glass p-3 my-4 text-start">
      <p class="mb-1"><strong>${esc(ev.title)}</strong></p>
      <p class="mb-1 small">${fmtDate(ev.eventDate)}, ${fmtTime(ev.startTime)} to ${fmtTime(ev.endTime)}</p>
      <p class="mb-1 small">${esc(ev.venue)}</p>
      <p class="mb-1 small">Status: <span class="badge bg-success">Confirmed</span></p>
      <p class="mb-0 small">Reference: <strong>${esc(ref)}</strong></p>
    </div>
    <a class="btn btn-outline-light rounded-pill me-2" target="_blank" rel="noopener" href="${calendarUrl(ev)}"><i class="bi bi-calendar-plus me-1"></i>Add to Calendar</a>
    <button class="btn btn-glow" data-bs-dismiss="modal">Done</button></div>`;
}
