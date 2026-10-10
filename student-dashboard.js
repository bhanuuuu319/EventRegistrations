import { requireRole } from "./guards.js";
import { renderNav, animateCount, initReveal } from "./layout.js";
import { db } from "./firebase-config.js";
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { loadEvents, loadStats, loadMyRegs, eventState, startAt, endAt, eventCard, bindCards, countdown } from "./service.js";
import { esc, fmtDate, fmtTime, toast, setBusy, setFieldError, v } from "./utils.js";
const $ = (id) => document.getElementById(id);
let { user, profile } = await requireRole("student");
renderNav(profile, "dash");

function renderProfile() {
  $("welcome").textContent = `Welcome back, ${profile.fullName.split(" ")[0]}`;
  $("sub").textContent = "Here is what is happening on campus.";
  $("profileCard").innerHTML = [["Name", profile.fullName], ["Username", "@" + profile.username], ["Student ID", profile.studentId], ["Department", profile.department], ["Year", profile.year], ["Email", profile.email]]
    .map(([k, val]) => `<div class="d-flex justify-content-between list-line"><span class="text-secondary">${k}</span><span>${esc(val)}</span></div>`).join("");
}
renderProfile();

let timer, byId = {};
bindCards($("recommended"), (id) => byId[id], () => ctx());
bindCards($("recent"), (id) => byId[id], () => ctx());
async function main() {
  const [events, stats, regs] = await Promise.all([loadEvents(), loadStats(), loadMyRegs(user.uid)]);
  byId = Object.fromEntries(events.map(e => [e.id, e]));
  const confirmed = regs.filter(r => r.status === "confirmed"), mine = new Set(confirmed.map(r => r.eventId));
  const now = new Date(); let upcoming = [], done = 0;
  confirmed.forEach(r => { const e = byId[r.eventId]; if (!e || e.status === "cancelled") return; endAt(e) < now ? done++ : upcoming.push(e); });
  upcoming.sort((a, b) => startAt(a) - startAt(b));
  const open = events.filter(e => eventState(e, stats[e.id] || 0).open);
  animateCount($("st-available"), open.length); animateCount($("st-upcoming"), upcoming.length);
  animateCount($("st-completed"), done); animateCount($("st-confirmed"), confirmed.length);

  clearInterval(timer);
  const n = upcoming[0];
  $("nextEvent").innerHTML = n ? `<div class="text-light h6">${esc(n.title)}</div><div>${fmtDate(n.eventDate)}, ${fmtTime(n.startTime)}</div><div>${esc(n.venue)}</div><div class="countdown mt-2"><strong id="nxCd"></strong></div>`
    : `You have no upcoming registrations. <a href="events.html">Find an event</a>`;
  if (n) { const t = () => $("nxCd").textContent = countdown(startAt(n) - new Date()); t(); timer = setInterval(t, 1000); }

  // Notifications are derived from the student's own registrations (no extra collection needed).
  const notes = regs.slice(0, 4).map(r => { const e = byId[r.eventId]; return e ? `${r.status === "confirmed" ? "Confirmed" : "Cancelled"}: ${esc(e.title)} (${esc(r.reference)})` : null; }).filter(Boolean);
  upcoming.filter(e => startAt(e) - now < 48 * 36e5).forEach(e => notes.unshift(`Starting soon: ${esc(e.title)}`));
  $("notifs").innerHTML = notes.length ? notes.map(t => `<div class="list-line">${t}</div>`).join("") : '<span class="text-secondary">No notifications yet.</span>';

  const favCats = new Set(confirmed.map(r => byId[r.eventId]?.category).filter(Boolean));
  const rec = open.filter(e => !mine.has(e.id)).sort((a, b) => (favCats.has(b.category) - favCats.has(a.category)) || (startAt(a) - startAt(b))).slice(0, 3);
  const recent = [...events].filter(e => !["completed", "cancelled"].includes(eventState(e, stats[e.id] || 0).key)).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).slice(0, 3);
  const empty = '<div class="empty glass"><i class="bi bi-calendar2-x"></i>Nothing here yet.</div>';
  $("recommended").innerHTML = rec.length ? rec.map(e => eventCard(e, stats[e.id] || 0)).join("") : empty;
  $("recent").innerHTML = recent.length ? recent.map(e => eventCard(e, stats[e.id] || 0)).join("") : empty;
}
const ctx = () => ({ user, profile, onChange: main });
main().catch(e => { console.error(e); toast("Could not load dashboard data. Check Firestore rules and indexes.", "danger"); });

/* profile editing (only fullName, department, year: matches the rules) */
const pm = new bootstrap.Modal($("profileModal"));
function openProfile() { $("pfName").value = profile.fullName; $("pfDept").value = profile.department; $("pfYear").value = profile.year; pm.show(); }
$("editProfile").addEventListener("click", openProfile);
if (location.hash === "#profile") openProfile();
window.addEventListener("hashchange", () => { if (location.hash === "#profile") openProfile(); });
let busy = false;
$("profileForm").addEventListener("submit", async (e) => {
  e.preventDefault(); if (busy) return;
  if (!setFieldError($("pfName"), v.fullName($("pfName").value))) return;
  busy = true; setBusy($("pfSave"), true, "Saving…");
  try {
    const data = { fullName: $("pfName").value.trim(), department: $("pfDept").value, year: $("pfYear").value };
    await updateDoc(doc(db, "users", user.uid), { ...data, updatedAt: serverTimestamp() });
    profile = { ...profile, ...data }; renderProfile(); renderNav(profile, "dash"); pm.hide(); toast("Profile updated.");
  } catch (err) { toast("Could not update profile.", "danger"); }
  busy = false; setBusy($("pfSave"), false);
});
initReveal();
