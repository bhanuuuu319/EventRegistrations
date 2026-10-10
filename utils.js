export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

export function toast(message, type = "success") {
  let box = document.getElementById("toastBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "toastBox";
    box.className = "toast-container position-fixed top-0 end-0 p-3";
    box.setAttribute("aria-live", "polite");
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.className = `toast er-toast er-${type} border-0`;
  el.setAttribute("role", type === "danger" ? "alert" : "status");
  el.innerHTML = `<div class="d-flex"><div class="toast-body"></div><button class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
  el.querySelector(".toast-body").textContent = message;
  box.appendChild(el);
  const t = new bootstrap.Toast(el, { delay: 5000 });
  el.addEventListener("hidden.bs.toast", () => el.remove());
  t.show();
}

export function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>${esc(label || "Please wait…")}`;
  } else { btn.disabled = false; btn.innerHTML = btn.dataset.label || btn.innerHTML; }
}

export function setFieldError(input, msg) {
  const fb = input.parentElement.querySelector(".invalid-feedback") || input.closest(".col-12, .col-md-6, .mb-3")?.querySelector(".invalid-feedback");
  input.classList.toggle("is-invalid", !!msg);
  input.classList.toggle("is-valid", !msg && input.value !== "");
  if (fb) fb.textContent = msg || "";
  return !msg;
}

/* ---------- Validators: return "" when valid, else an error message ---------- */
export const normalizeUsername = (u) => u.trim().toLowerCase();
export const v = {
  fullName: (s) => /^[A-Za-z][A-Za-z .'-]{1,78}$/.test(s.trim()) ? "" : "Enter your full name (letters only, 2–80 characters).",
  username: (s) => /^[a-z0-9_]{3,20}$/i.test(s.trim()) ? "" : "3–20 characters: letters, numbers and underscore only.",
  email: (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()) ? "" : "Enter a valid email address.",
  studentId: (s) => /^[A-Za-z0-9\-\/]{4,20}$/.test(s.trim()) ? "" : "Use 4–20 letters, numbers, - or /.",
  required: (s, label) => s.trim() ? "" : `${label} is required.`,
};

export const PW_RULES = {
  len: (p) => p.length >= 8,
  upper: (p) => /[A-Z]/.test(p),
  lower: (p) => /[a-z]/.test(p),
  num: (p) => /\d/.test(p),
  special: (p) => /[^A-Za-z0-9\s]/.test(p),
};
export const passwordValid = (p) => Object.values(PW_RULES).every(f => f(p));

export function passwordStrength(p) {
  const met = Object.values(PW_RULES).filter(f => f(p)).length;
  const score = p ? met + (p.length >= 12 ? 1 : 0) : 0;      // 0..6
  const labels = ["Very Weak","Very Weak","Weak","Medium","Medium","Strong","Very Strong"];
  const colors = ["#ef476f","#ef476f","#ff8a5c","#ffd166","#ffd166","#34d6c2","#7c5cff"];
  return { score, label: labels[score], color: colors[score], pct: Math.round((score / 6) * 100) };
}

export function bindPasswordToggles() {
  document.querySelectorAll("[data-toggle-pw]").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.togglePw);
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = `<i class="bi ${show ? "bi-eye-slash" : "bi-eye"}"></i>`;
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });
}

export const fmtDate = (iso) => iso ? new Date(iso + "T00:00:00+05:30").toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short", year:"numeric", timeZone:"Asia/Kolkata" }) : "";
export const fmtTime = (hhmm) => { if (!hhmm) return ""; const [h,m] = hhmm.split(":").map(Number); return `${((h+11)%12)+1}:${String(m).padStart(2,"0")} ${h<12?"AM":"PM"} IST`; };
