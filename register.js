import { registerStudent, friendlyAuthError, AppError } from "./auth.js";
import { toast, setBusy, setFieldError, v, PW_RULES, passwordValid, passwordStrength, bindPasswordToggles } from "./utils.js";

const $ = (id) => document.getElementById(id);
const form = $("registerForm"), btn = $("submitBtn");
let busy = false;
bindPasswordToggles();

function renderStrength() {
  const p = $("password").value, s = passwordStrength(p);
  $("strengthBar").style.width = s.pct + "%";
  $("strengthBar").style.background = s.color;
  $("strengthLabel").textContent = p ? s.label : "";
  document.querySelectorAll("[data-req]").forEach(li => {
    const ok = PW_RULES[li.dataset.req](p);
    li.classList.toggle("met", ok);
    li.querySelector("i").className = "bi " + (ok ? "bi-check-circle-fill" : "bi-circle");
  });
}
$("password").addEventListener("input", renderStrength);

const checks = {
  fullName: () => setFieldError($("fullName"), v.fullName($("fullName").value)),
  username: () => setFieldError($("username"), v.username($("username").value)),
  email: () => setFieldError($("email"), v.email($("email").value)),
  studentId: () => setFieldError($("studentId"), v.studentId($("studentId").value)),
  department: () => setFieldError($("department"), v.required($("department").value, "Department")),
  year: () => setFieldError($("year"), v.required($("year").value, "Year of study")),
  password: () => setFieldError($("password"), passwordValid($("password").value) ? "" : "Password does not meet all requirements."),
  confirmPassword: () => setFieldError($("confirmPassword"), $("confirmPassword").value === $("password").value && $("confirmPassword").value ? "" : "Passwords do not match."),
  terms: () => { const ok = $("terms").checked; $("terms").classList.toggle("is-invalid", !ok); return ok; }
};
Object.entries(checks).forEach(([id, fn]) => $(id).addEventListener("blur", fn));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;
  const results = Object.values(checks).map(fn => fn());   // run all so every error shows
  if (results.includes(false)) { toast("Please fix the highlighted fields.", "danger"); return; }
  busy = true; setBusy(btn, true, "Creating account…");
  try {
    await registerStudent({
      fullName: $("fullName").value, username: $("username").value, email: $("email").value,
      studentId: $("studentId").value, department: $("department").value, year: $("year").value,
      password: $("password").value
    });
    toast("Account created. Redirecting…");
    setTimeout(() => location.replace("student-dashboard.html"), 800);
  } catch (err) {
    const msg = friendlyAuthError(err);
    if (err?.code === "auth/email-already-in-use") setFieldError($("email"), msg);
    if (err instanceof AppError) setFieldError($("username"), msg);
    toast(msg, "danger");
    busy = false; setBusy(btn, false);
  }
});
