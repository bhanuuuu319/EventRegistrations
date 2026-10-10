import { optionalUser } from "./guards.js";
import { renderNav, animateCount, initReveal } from "./layout.js";
import { CATALOG } from "./catalog.js";
import { loadEvents, loadStats, eventState, eventCard, bindCards, startAt, countdown, banner } from "./service.js";
import { esc, fmtDate, fmtTime } from "./utils.js";
const $ = (id) => document.getElementById(id);

const { user, profile } = await optionalUser();
renderNav(profile, "home");
$("catGrid").innerHTML = Object.entries(CATALOG).map(([name, c]) => `<div class="col-6 col-md-4 col-lg-3 reveal"><a class="glass cat-card" href="events.html?category=${encodeURIComponent(name)}"><i class="bi ${c.icon}" style="color:${c.grad[1]}"></i><h3 class="h6 mb-0">${esc(name)}</h3></a></div>`).join("");
animateCount($("s-cats"), Object.keys(CATALOG).length);

try {
  const [events, stats] = await Promise.all([loadEvents(), loadStats()]);
  const live = events.filter(e => !["completed", "cancelled"].includes(eventState(e, stats[e.id] || 0).key)).sort((a, b) => startAt(a) - startAt(b));
  const open = live.filter(e => eventState(e, stats[e.id] || 0).open);
  animateCount($("s-events"), live.length); animateCount($("s-open"), open.length);
  animateCount($("s-seats"), Object.values(stats).reduce((a, b) => a + b, 0));
  const map = Object.fromEntries(events.map(e => [e.id, e]));
  $("featured").innerHTML = live.length ? live.slice(0, 3).map(e => eventCard(e, stats[e.id] || 0)).join("")
    : `<div class="empty glass"><i class="bi bi-calendar2-x"></i>No upcoming events yet. Check back soon.</div>`;
  bindCards($("featured"), (id) => map[id], () => ({ user, profile }));
  const n = live[0];
  if (n) {
    $("heroTicket").innerHTML = `<div class="small text-secondary">Next up</div><h2 class="h4 my-2">${esc(n.title)}</h2>
      <div class="small"><i class="bi bi-calendar-event me-1"></i>${fmtDate(n.eventDate)}, ${fmtTime(n.startTime)}</div>
      <div class="small"><i class="bi bi-geo-alt me-1"></i>${esc(n.venue)}</div><div class="tear"></div>
      <div class="countdown"><span class="small text-secondary">Starts in</span><strong id="tkCd"></strong></div>`;
    const tick = () => $("tkCd").textContent = countdown(startAt(n) - new Date()); tick(); setInterval(tick, 1000);
  } else $("heroTicket").innerHTML = `<div class="empty"><i class="bi bi-stars"></i>New events are on the way.</div>`;
} catch (e) {
  console.error(e);
  $("featured").innerHTML = `<div class="empty glass"><i class="bi bi-exclamation-triangle"></i>Events could not be loaded. Check that firestore.rules is published.</div>`;
  $("heroTicket").innerHTML = "";
}
initReveal();
