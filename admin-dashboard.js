import { requireRole } from "./guards.js";
import { renderNav, animateCount } from "./layout.js";
import { CATALOG, catInfo } from "./catalog.js";
import { db } from "./firebase-config.js";
import { collection, query, where, orderBy, limit, getDocs, doc, updateDoc, writeBatch, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { eventState, startAt, endAt, confirmDialog } from "./service.js";
import { esc, fmtDate, fmtTime, toast, setBusy, setFieldError } from "./utils.js";
const $ = (id) => document.getElementById(id);
const { user, profile } = await requireRole("admin");
renderNav(profile, "dash");

const S = { students: [], events: [], stats: {}, regs: [], acts: [] };
const when = (t) => t?.toDate ? t.toDate().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "pending";
const evById = () => Object.fromEntries(S.events.map(e => [e.id, e]));
const stuById = () => Object.fromEntries(S.students.map(s => [s.uid, s]));
const count = (e) => S.stats[e.id] || 0;

async function loadAll() {
  const snap = (q) => getDocs(q).then(s => s.docs.map(d => ({ id: d.id, ...d.data() })));
  const [students, events, stats, regs, acts] = await Promise.all([
    snap(query(collection(db, "users"), where("role", "==", "student"))),
    snap(query(collection(db, "events"), orderBy("eventDate", "desc"))),
    getDocs(collection(db, "eventStats")),
    snap(collection(db, "registrations")),
    snap(query(collection(db, "loginActivity"), orderBy("createdAt", "desc"), limit(60)))]);
  S.students = students; S.events = events; S.regs = regs; S.acts = acts; S.stats = {};
  stats.forEach(d => S.stats[d.id] = d.data().registeredCount || 0);
  renderAll();
}

/* ---------------- tabs ---------------- */
$("panes").addEventListener("click", (e) => {
  const b = e.target.closest("[data-pane]"); if (!b) return;
  document.querySelectorAll("#panes .nav-link").forEach(x => x.classList.toggle("active", x === b));
  ["overview", "events", "students", "activity"].forEach(p => $("pane-" + p).hidden = p !== b.dataset.pane);
});

/* ---------------- overview ---------------- */
let charts = [];
function renderOverview() {
  const now = new Date(), ev = S.events, pub = ev.filter(e => e.status === "published");
  const upcoming = pub.filter(e => startAt(e) > now), completed = ev.filter(e => e.status !== "cancelled" && e.status !== "draft" && (e.status === "completed" || endAt(e) < now));
  const confirmed = S.regs.filter(r => r.status === "confirmed");
  const cap = pub.reduce((a, e) => a + (e.capacity || 0), 0), booked = pub.reduce((a, e) => a + count(e), 0);
  animateCount($("a-students"), S.students.length); animateCount($("a-active"), pub.filter(e => endAt(e) >= now).length);
  animateCount($("a-upcoming"), upcoming.length); animateCount($("a-completed"), completed.length);
  animateCount($("a-regs"), confirmed.length); animateCount($("a-fill"), cap ? Math.round(booked / cap * 100) : 0);

  const eMap = evById(), sMap = stuById();
  $("recentLogins").innerHTML = S.acts.filter(a => a.type === "login").slice(0, 6).map(a => `<div class="list-line d-flex justify-content-between"><span>${esc(a.fullName)}</span><span class="text-secondary">${when(a.createdAt)}</span></div>`).join("") || '<div class="text-secondary small">No sign-ins recorded yet.</div>';
  const recent = [...S.regs].sort((a, b) => (b.registeredAt?.toMillis?.() || 0) - (a.registeredAt?.toMillis?.() || 0)).slice(0, 6);
  $("recentRegs").innerHTML = recent.map(r => `<div class="list-line d-flex justify-content-between"><span>${esc(sMap[r.studentUid]?.fullName || "Student")} for ${esc(eMap[r.eventId]?.title || "event")}</span><span class="text-secondary">${when(r.registeredAt)}</span></div>`).join("") || '<div class="text-secondary small">No registrations yet.</div>';

  charts.forEach(c => c.destroy());
  if (typeof Chart === "undefined") return;
  Chart.defaults.color = "#b4aedd"; Chart.defaults.borderColor = "rgba(255,255,255,.1)";
  const cats = Object.keys(CATALOG), byCat = cats.map(c => ev.filter(e => e.category === c).reduce((a, e) => a + count(e), 0));
  charts = [
    new Chart($("chCat"), { type: "bar", data: { labels: cats, datasets: [{ data: byCat, backgroundColor: cats.map(c => catInfo(c).grad[0]), borderRadius: 8 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } }),
    new Chart($("chStatus"), { type: "doughnut", data: { labels: ["Draft", "Upcoming", "Completed", "Cancelled"], datasets: [{ data: [ev.filter(e => e.status === "draft").length, upcoming.length, completed.length, ev.filter(e => e.status === "cancelled").length], backgroundColor: ["#8a83bd", "#34d6c2", "#7c5cff", "#ff7eb6"], borderWidth: 0 }] }, options: { maintainAspectRatio: false } })];
}

/* ---------------- events ---------------- */
$("evCat").insertAdjacentHTML("beforeend", Object.keys(CATALOG).map(c => `<option>${esc(c)}</option>`).join(""));
function renderEvents() {
  const q = $("evSearch").value.toLowerCase(), st = $("evStatus").value, ct = $("evCat").value;
  const list = S.events.filter(e => (!st || e.status === st) && (!ct || e.category === ct) && (!q || [e.title, e.venue, e.organizer].some(t => (t || "").toLowerCase().includes(q))));
  $("evRows").innerHTML = list.map(e => {
    const s = eventState(e, count(e));
    return `<tr><td><strong>${esc(e.title)}</strong><div class="small text-secondary">${esc(e.category)}${e.subcategory && e.subcategory !== "General" ? ": " + esc(e.subcategory) : ""}</div></td>
      <td class="small">${fmtDate(e.eventDate)}<br>${fmtTime(e.startTime)}</td><td class="small">${esc(e.venue)}</td><td>${count(e)} / ${e.capacity}</td>
      <td><span class="badge bg-${e.status === "draft" ? "secondary" : s.cls}">${e.status === "draft" ? "Draft" : s.label}</span></td>
      <td class="text-end text-nowrap">
        <button class="btn btn-sm btn-outline-light rounded-pill" data-act="regs" data-id="${e.id}" title="Registrations"><i class="bi bi-people"></i></button>
        <button class="btn btn-sm btn-outline-light rounded-pill" data-act="edit" data-id="${e.id}" title="Edit"><i class="bi bi-pencil"></i></button>
        ${e.status === "draft" || e.status === "published" ? `<button class="btn btn-sm btn-outline-info rounded-pill" data-act="toggle" data-id="${e.id}">${e.status === "draft" ? "Publish" : "Unpublish"}</button>` : ""}
        ${e.status !== "cancelled" ? `<button class="btn btn-sm btn-outline-warning rounded-pill" data-act="cancel" data-id="${e.id}">Cancel</button>` : ""}
        <button class="btn btn-sm btn-outline-danger rounded-pill" data-act="delete" data-id="${e.id}" title="Delete"><i class="bi bi-trash"></i></button></td></tr>`;
  }).join("") || `<tr><td colspan="6"><div class="empty"><i class="bi bi-calendar2-plus"></i>No events yet. Create the first one.</div></td></tr>`;
}
["evSearch", "evStatus", "evCat"].forEach(id => $(id).addEventListener("input", renderEvents));

$("evRows").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const ev = S.events.find(x => x.id === b.dataset.id), act = b.dataset.act;
  try {
    if (act === "edit") return openForm(ev);
    if (act === "regs") return openRegs(ev);
    if (act === "toggle") { await updateDoc(doc(db, "events", ev.id), { status: ev.status === "draft" ? "published" : "draft", updatedAt: serverTimestamp() }); toast(ev.status === "draft" ? "Published." : "Unpublished."); }
    if (act === "cancel") {
      if (!await confirmDialog("Cancel this event?", "Students will see it as Cancelled. Existing registrations are kept for your records.", "Cancel event")) return;
      await updateDoc(doc(db, "events", ev.id), { status: "cancelled", updatedAt: serverTimestamp() }); toast("Event cancelled.");
    }
    if (act === "delete") {
      if (S.regs.some(r => r.eventId === ev.id)) return toast("This event has registrations. Cancel it instead so students keep their history.", "danger");
      if (!await confirmDialog("Delete this event?", "This permanently removes the event. This cannot be undone.", "Delete event")) return;
      const batch = writeBatch(db); batch.delete(doc(db, "events", ev.id)); batch.delete(doc(db, "eventStats", ev.id)); await batch.commit(); toast("Event deleted.");
    }
    await loadAll();
  } catch (err) { console.error(err); toast("That action failed. Check your connection and rules.", "danger"); }
});

/* ---- create / edit form ---- */
const F = (id) => $("f_" + id);
const efModal = new bootstrap.Modal($("evFormModal"));
F("category").innerHTML = Object.keys(CATALOG).map(c => `<option>${esc(c)}</option>`).join("");
const fillSubs = (sel) => { F("subcategory").innerHTML = catInfo(F("category").value).subs.map(s => `<option>${esc(s)}</option>`).join(""); if (sel) F("subcategory").value = sel; };
F("category").addEventListener("change", () => fillSubs());
let editing = null;
function openForm(ev) {
  editing = ev || null; $("efTitle").textContent = ev ? "Edit event" : "New event";
  document.querySelectorAll("#evForm .is-invalid,#evForm .is-valid").forEach(x => x.classList.remove("is-invalid", "is-valid"));
  const d = ev || { category: Object.keys(CATALOG)[0], status: "draft", capacity: 50 };
  F("title").value = d.title || ""; F("category").value = d.category; fillSubs(d.subcategory); F("description").value = d.description || ""; F("imageUrl").value = d.imageUrl || "";
  F("date").value = d.eventDate || ""; F("start").value = d.startTime || ""; F("end").value = d.endTime || ""; F("venue").value = d.venue || ""; F("address").value = d.venueAddress || "";
  F("organizer").value = d.organizer || ""; F("deadline").value = d.registrationDeadline || ""; F("capacity").value = d.capacity; F("status").value = d.status === "published" ? "published" : "draft"; F("rules").value = d.rules || "";
  efModal.show();
}
$("newEvent").addEventListener("click", () => openForm(null));

const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const MAX_DAYS_AHEAD = 730;   // business rule: events may be scheduled at most 2 years ahead
function validate() {
  const val = (id) => F(id).value.trim(), today = todayIST(), max = new Date(Date.now() + MAX_DAYS_AHEAD * 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const cap = Number(F("capacity").value), booked = editing ? count(editing) : 0;
  const checks = {
    title: val("title").length >= 3 ? "" : "Title must be at least 3 characters.",
    description: val("description").length >= 10 && val("description").length <= 1000 ? "" : "Description must be 10 to 1000 characters.",
    imageUrl: !val("imageUrl") || /^https:\/\/[^\s'"()<>\\]+$/.test(val("imageUrl")) ? "" : "Use a valid https:// image URL.",
    date: !F("date").value ? "Choose a date." : (!editing || F("date").value !== editing.eventDate) && F("date").value < today ? "Date cannot be in the past." : F("date").value > max ? "Date is too far ahead (2 years max)." : "",
    start: F("start").value ? "" : "Choose a start time.",
    end: !F("end").value ? "Choose an end time." : F("start").value && F("end").value <= F("start").value ? "End time must be after start time." : "",
    venue: val("venue") ? "" : "Venue is required.",
    organizer: val("organizer") ? "" : "Organizer is required.",
    deadline: !F("deadline").value ? "Choose a deadline." : F("date").value && F("deadline").value > F("date").value ? "Deadline must be on or before the event date." : "",
    capacity: !Number.isInteger(cap) || cap < 1 || cap > 10000 ? "Enter a whole number from 1 to 10000." : cap < booked ? `Capacity cannot be below the ${booked} seats already booked.` : "",
  };
  return Object.entries(checks).map(([id, msg]) => setFieldError(F(id), msg)).every(Boolean);
}
let saving = false;
$("evForm").addEventListener("submit", async (e) => {
  e.preventDefault(); if (saving) return;
  if (!validate()) return toast("Please fix the highlighted fields.", "danger");
  saving = true; setBusy($("efSave"), true, "Saving…");
  const data = {
    title: F("title").value.trim(), category: F("category").value, subcategory: F("subcategory").value, description: F("description").value.trim(), imageUrl: F("imageUrl").value.trim(),
    eventDate: F("date").value, startTime: F("start").value, endTime: F("end").value, timezone: "Asia/Kolkata",
    venue: F("venue").value.trim(), venueAddress: F("address").value.trim(), organizer: F("organizer").value.trim(),
    registrationDeadline: F("deadline").value, registrationDeadlineAt: Timestamp.fromDate(new Date(F("deadline").value + "T23:59:59+05:30")),
    capacity: Number(F("capacity").value), rules: F("rules").value.trim(), updatedAt: serverTimestamp(),
  };
  try {
    if (editing) await updateDoc(doc(db, "events", editing.id), { ...data, status: editing.status === "cancelled" || editing.status === "completed" ? editing.status : F("status").value });
    else {
      const ref = doc(collection(db, "events")), batch = writeBatch(db);
      batch.set(ref, { ...data, status: F("status").value, createdBy: user.uid, createdAt: serverTimestamp() });
      batch.set(doc(db, "eventStats", ref.id), { registeredCount: 0 });   // seat counter, created together with the event
      await batch.commit();
    }
    efModal.hide(); toast(editing ? "Event updated." : "Event created."); await loadAll();
  } catch (err) { console.error(err); toast("Could not save the event.", "danger"); }
  saving = false; setBusy($("efSave"), false);
});

/* ---- per-event registrations + CSV ---- */
const lm = new bootstrap.Modal($("listModal"));
const csvCell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };   // blocks spreadsheet formula injection
function openRegs(ev) {
  const sMap = stuById(), rows = S.regs.filter(r => r.eventId === ev.id);
  $("lmTitle").textContent = `Registrations: ${ev.title} (${rows.filter(r => r.status === "confirmed").length} confirmed)`;
  $("lmBody").innerHTML = rows.length ? `<table class="table er-table"><thead><tr><th>Reference</th><th>Name</th><th>Student ID</th><th>Dept / Year</th><th>Status</th><th>Registered</th></tr></thead><tbody>${rows.map(r => { const s = sMap[r.studentUid] || {}; return `<tr><td>${esc(r.reference)}</td><td>${esc(s.fullName)}</td><td>${esc(s.studentId)}</td><td>${esc(s.department)} / ${esc(s.year)}</td><td>${esc(r.status)}</td><td>${when(r.registeredAt)}</td></tr>`; }).join("")}</tbody></table>` : '<div class="empty"><i class="bi bi-people"></i>No registrations yet.</div>';
  $("lmFoot").innerHTML = rows.length ? `<button class="btn btn-glow" id="csvBtn"><i class="bi bi-download me-1"></i>Export CSV</button>` : "";
  $("csvBtn")?.addEventListener("click", () => {
    const head = ["Reference", "Full name", "Username", "Email", "Student ID", "Department", "Year", "Status", "Registered at"];
    const body = rows.map(r => { const s = sMap[r.studentUid] || {}; return [r.reference, s.fullName, s.username, s.email, s.studentId, s.department, s.year, r.status, r.registeredAt?.toDate?.().toISOString()]; });
    const csv = [head, ...body].map(l => l.map(csvCell).join(",")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
    a.download = `registrations-${ev.id}.csv`; a.click(); URL.revokeObjectURL(a.href);
  });
  lm.show();
}

/* ---------------- students ---------------- */
function renderStudents() {
  const depts = [...new Set(S.students.map(s => s.department))].sort(), cur = $("stDept").value;
  $("stDept").innerHTML = '<option value="">All departments</option>' + depts.map(d => `<option ${d === cur ? "selected" : ""}>${esc(d)}</option>`).join("");
  const q = $("stSearch").value.toLowerCase(), d = $("stDept").value, y = $("stYear").value;
  const list = S.students.filter(s => (!d || s.department === d) && (!y || s.year === y) && (!q || [s.fullName, s.email, s.username, s.studentId].some(t => (t || "").toLowerCase().includes(q))));
  $("stRows").innerHTML = list.map(s => `<tr><td><strong>${esc(s.fullName)}</strong><div class="small text-secondary">@${esc(s.username)}, ${esc(s.email)}</div></td><td>${esc(s.studentId)}</td><td>${esc(s.department)} / ${esc(s.year)}</td>
    <td class="small">${when(s.lastLoginAt)}</td><td><span class="badge bg-${s.status === "active" ? "success" : "secondary"}">${esc(s.status)}</span></td>
    <td class="text-end text-nowrap"><button class="btn btn-sm btn-outline-light rounded-pill" data-sact="view" data-id="${s.uid}">Registrations</button>
    <button class="btn btn-sm btn-outline-${s.status === "active" ? "warning" : "info"} rounded-pill" data-sact="toggle" data-id="${s.uid}">${s.status === "active" ? "Deactivate" : "Activate"}</button></td></tr>`).join("")
    || `<tr><td colspan="6"><div class="empty"><i class="bi bi-person-x"></i>No students match.</div></td></tr>`;
}
["stSearch", "stDept", "stYear"].forEach(id => $(id).addEventListener("input", renderStudents));
$("stRows").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-sact]"); if (!b) return;
  const s = S.students.find(x => x.uid === b.dataset.id);
  if (b.dataset.sact === "view") {
    const eMap = evById(), rows = S.regs.filter(r => r.studentUid === s.uid);
    $("lmTitle").textContent = `${s.fullName}: registrations`; $("lmFoot").innerHTML = "";
    $("lmBody").innerHTML = rows.length ? `<table class="table er-table"><thead><tr><th>Event</th><th>Date</th><th>Reference</th><th>Status</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(eMap[r.eventId]?.title || "Deleted event")}</td><td>${fmtDate(eMap[r.eventId]?.eventDate)}</td><td>${esc(r.reference)}</td><td>${esc(r.status)}</td></tr>`).join("")}</tbody></table>` : '<div class="empty"><i class="bi bi-ticket-perforated"></i>No registrations.</div>';
    return lm.show();
  }
  const next = s.status === "active" ? "disabled" : "active";
  if (!await confirmDialog(`${next === "disabled" ? "Deactivate" : "Activate"} ${s.fullName}?`, next === "disabled" ? "They will be signed out of EventRegister and blocked from registering." : "They will be able to use EventRegister again.", next === "disabled" ? "Deactivate" : "Activate")) return;
  try { await updateDoc(doc(db, "users", s.uid), { status: next, updatedAt: serverTimestamp() }); toast("Student updated."); await loadAll(); }
  catch { toast("Could not update the student.", "danger"); }
});

function renderActivity() {
  $("actRows").innerHTML = S.acts.map(a => `<div class="list-line d-flex justify-content-between"><span><i class="bi ${a.type === "login" ? "bi-box-arrow-in-right text-info" : "bi-box-arrow-right text-warning"} me-2"></i>${esc(a.fullName || a.uid)} ${a.type === "login" ? "signed in" : "signed out"}</span><span class="text-secondary">${when(a.createdAt)}</span></div>`).join("") || '<div class="text-secondary small">No activity yet.</div>';
}
function renderAll() { renderOverview(); renderEvents(); renderStudents(); renderActivity(); }
loadAll().catch(e => { console.error(e); toast("Could not load admin data. Check that your user has role 'admin' and the rules/indexes are published.", "danger"); });
