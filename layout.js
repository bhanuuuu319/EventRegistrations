import { logout } from "./auth.js";
import { esc } from "./utils.js";

export function renderNav(profile, active = "") {
  const L = (href, label, key, icon) => `<li class="nav-item"><a class="nav-link ${active === key ? "active" : ""}" ${active === key ? 'aria-current="page"' : ""} href="${href}"><i class="bi ${icon} me-1"></i>${label}</a></li>`;
  let items, right;
  if (profile?.role === "student") {
    items = [L("student-dashboard.html","Dashboard","dash","bi-grid-1x2"), L("events.html","Explore Events","events","bi-compass"),
             L("my-registrations.html","My Registrations","regs","bi-ticket-perforated"), L("student-dashboard.html#profile","My Profile","profile","bi-person-circle")];
  } else if (profile?.role === "admin") {
    items = [L("admin-dashboard.html","Admin Dashboard","dash","bi-speedometer2"), L("events.html","Explore Events","events","bi-compass")];
  } else {
    items = [L("index.html","Home","home","bi-house"), L("events.html","Explore Events","events","bi-compass"),
             L("index.html#about","About","about","bi-info-circle"), L("login.html","Login","login","bi-box-arrow-in-right")];
  }
  right = profile
    ? `<span class="small text-secondary me-3 d-none d-lg-inline">${esc(profile.fullName)}</span><button class="btn btn-outline-light btn-sm rounded-pill" data-logout><i class="bi bi-box-arrow-right me-1"></i>Logout</button>`
    : `<a class="btn btn-glow btn-sm" href="register.html">Create Account</a>`;
  document.getElementById("nav").innerHTML = `
  <nav class="navbar navbar-expand-lg navbar-dark er-nav sticky-top">
    <div class="container">
      <a class="brand" href="${profile ? (profile.role === "admin" ? "admin-dashboard.html" : "student-dashboard.html") : "index.html"}"><i class="bi bi-stars"></i> EventRegister</a>
      <button class="navbar-toggler" data-bs-toggle="collapse" data-bs-target="#navMenu" aria-label="Toggle menu"><span class="navbar-toggler-icon"></span></button>
      <div class="collapse navbar-collapse" id="navMenu">
        <ul class="navbar-nav mx-auto">${items.join("")}</ul>
        <div class="d-flex align-items-center mt-2 mt-lg-0">${right}</div>
      </div>
    </div>
  </nav>`;
  document.querySelectorAll("[data-logout]").forEach(b => b.addEventListener("click", () => logout(profile?.fullName)));
}

export function animateCount(el, target, ms = 900) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = target; return; }
  const t0 = performance.now();
  const step = (t) => { const p = Math.min(1, (t - t0) / ms); el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

export function initReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) return els.forEach(e => e.classList.add("in"));
  const io = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12 });
  els.forEach(e => io.observe(e));
}
