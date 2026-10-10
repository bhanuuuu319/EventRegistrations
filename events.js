import { optionalUser } from "./guards.js";
import { renderNav } from "./layout.js";
import { CATALOG, catInfo } from "./catalog.js";
import { loadEvents, loadStats, eventState, eventCard, bindCards, showEvent } from "./service.js";
import { esc } from "./utils.js";
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = { cat: params.get("category") || "", sub: params.get("sub") || "", q: "", past: false };

const { user, profile } = await optionalUser();
renderNav(profile, "events");
$("grid").innerHTML = '<div class="col-md-4"><div class="skeleton"></div></div>'.repeat(3);

let events = [], stats = {};
try { [events, stats] = await Promise.all([loadEvents(), loadStats()]); }
catch (e) { console.error(e); $("grid").innerHTML = `<div class="empty glass"><i class="bi bi-exclamation-triangle"></i>Events could not be loaded. Check that firestore.rules is published.</div>`; }
const byId = Object.fromEntries(events.map(e => [e.id, e]));
const ctx = () => ({ user, profile, onChange: async () => { stats = await loadStats(); render(); } });
bindCards($("grid"), (id) => byId[id], ctx);

function chips() {
  $("catChips").innerHTML = ["", ...Object.keys(CATALOG)].map(c => `<button class="chip ${state.cat === c ? "active" : ""}" data-cat="${esc(c)}"><i class="bi ${c ? catInfo(c).icon : "bi-grid"} me-1"></i>${c || "All"}</button>`).join("");
  const subs = state.cat ? catInfo(state.cat).subs : [];
  $("subChips").innerHTML = subs.length > 1 ? ["", ...subs].map(s => `<button class="chip ${state.sub === s ? "active" : ""}" data-sub="${esc(s)}">${s || "All " + state.cat}</button>`).join("") : "";
}
function render() {
  chips();
  const q = state.q.toLowerCase();
  const list = events.filter(e =>
    (!state.cat || e.category === state.cat) && (!state.sub || e.subcategory === state.sub) &&
    (state.past || eventState(e, stats[e.id] || 0).key !== "completed") &&
    (!q || [e.title, e.venue, e.description, e.organizer].some(t => (t || "").toLowerCase().includes(q))));
  $("grid").innerHTML = list.length ? list.map(e => eventCard(e, stats[e.id] || 0)).join("")
    : `<div class="empty glass"><i class="bi bi-calendar2-x"></i>No events match these filters. Try another category or clear your search.</div>`;
  const p = new URLSearchParams(); if (state.cat) p.set("category", state.cat); if (state.sub) p.set("sub", state.sub);
  history.replaceState(null, "", p.toString() ? "?" + p : location.pathname);
}
$("catChips").addEventListener("click", (e) => { const b = e.target.closest("[data-cat]"); if (b) { state.cat = b.dataset.cat; state.sub = ""; render(); } });
$("subChips").addEventListener("click", (e) => { const b = e.target.closest("[data-sub]"); if (b) { state.sub = b.dataset.sub; render(); } });
$("searchInput").addEventListener("input", (e) => { state.q = e.target.value; render(); });
$("showPast").addEventListener("change", (e) => { state.past = e.target.checked; render(); });
render();
const id = params.get("id"); if (id && byId[id]) showEvent(byId[id], ctx());
