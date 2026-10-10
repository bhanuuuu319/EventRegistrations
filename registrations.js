import { requireRole } from "./guards.js";
import { renderNav } from "./layout.js";
import { CATALOG } from "./catalog.js";
import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { loadMyRegs, eventState, startAt, endAt, cancelRegistration, confirmDialog, showEvent, loadStats } from "./service.js";
import { esc, fmtDate, fmtTime, toast } from "./utils.js";
import { AppError } from "./auth.js";
const $ = (id) => document.getElementById(id);
const { user, profile } = await requireRole("student");
renderNav(profile, "regs");
$("catFilter").insertAdjacentHTML("beforeend", Object.keys(CATALOG).map(c => `<option>${esc(c)}</option>`).join(""));
let tab = "upcoming", rows = [];

async function load() {
  $("list").innerHTML = '<div class="skeleton" style="height:120px"></div>';
  const regs = await loadMyRegs(user.uid);
  const evs = await Promise.all(regs.map(r => getDoc(doc(db, "events", r.eventId)).then(s => s.exists() ? { id: s.id, ...s.data() } : null).catch(() => null)));
  rows = regs.map((r, i) => ({ r, ev: evs[i] })).filter(x => x.ev);
  render();
}
function bucket({ r, ev }) {
  if (r.status === "cancelled" || ev.status === "cancelled") return "cancelled";
  return endAt(ev) < new Date() || ev.status === "completed" ? "completed" : "upcoming";
}
function render() {
  const q = $("searchInput").value.toLowerCase(), c = $("catFilter").value;
  const list = rows.filter(x => bucket(x) === tab && (!c || x.ev.category === c) && (!q || x.ev.title.toLowerCase().includes(q) || (x.r.reference || "").toLowerCase().includes(q)));
  $("list").innerHTML = list.length ? list.map(({ r, ev }) => `
    <div class="glass p-3 mb-3"><div class="row align-items-center g-2">
      <div class="col-md-6"><h2 class="h5 mb-1">${esc(ev.title)}</h2><div class="small text-secondary">${esc(ev.category)}${ev.subcategory && ev.subcategory !== "General" ? ": " + esc(ev.subcategory) : ""}</div></div>
      <div class="col-md-4 small"><div><i class="bi bi-calendar-event me-1"></i>${fmtDate(ev.eventDate)}, ${fmtTime(ev.startTime)}</div><div><i class="bi bi-geo-alt me-1"></i>${esc(ev.venue)}</div>
        <div class="text-secondary">Registered ${r.registeredAt?.toDate ? r.registeredAt.toDate().toLocaleDateString("en-IN") : "just now"}, ref <strong>${esc(r.reference)}</strong></div></div>
      <div class="col-md-2 text-md-end"><span class="badge bg-${r.status === "confirmed" ? "success" : "secondary"} mb-2">${esc(r.status)}</span><br>
        <button class="btn btn-outline-light btn-sm rounded-pill" data-view="${esc(ev.id)}">View</button>
        ${bucket({ r, ev }) === "upcoming" ? `<button class="btn btn-outline-danger btn-sm rounded-pill ms-1" data-cancel="${esc(ev.id)}">Cancel</button>` : ""}</div>
    </div></div>`).join("") : `<div class="empty glass"><i class="bi bi-ticket-perforated"></i>Nothing in ${tab} yet. <a href="events.html">Explore events</a></div>`;
}
$("tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (!b) return; tab = b.dataset.tab; document.querySelectorAll("#tabs .nav-link").forEach(x => x.classList.toggle("active", x === b)); render(); });
$("searchInput").addEventListener("input", render); $("catFilter").addEventListener("change", render);
$("list").addEventListener("click", async (e) => {
  const v = e.target.closest("[data-view]"), c = e.target.closest("[data-cancel]");
  if (v) showEvent(rows.find(x => x.ev.id === v.dataset.view).ev, { user, profile, onChange: load });
  if (c) {
    if (!await confirmDialog("Cancel registration?", "Your seat will be released for other students.", "Cancel registration")) return;
    try { await cancelRegistration(user.uid, c.dataset.cancel); toast("Registration cancelled."); await load(); }
    catch (err) { toast(err instanceof AppError ? err.message : "Could not cancel. Try again.", "danger"); }
  }
});
load().catch(e => { console.error(e); $("list").innerHTML = `<div class="empty glass"><i class="bi bi-exclamation-triangle"></i>Could not load registrations. Check Firestore rules and indexes.</div>`; });
