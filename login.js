import { loginUser, resetPassword, friendlyAuthError } from "./auth.js";
import { toast, setBusy, setFieldError, v, bindPasswordToggles } from "./utils.js";

const form = document.getElementById("loginForm");
const btn = document.getElementById("loginBtn");
const email = document.getElementById("email");
const password = document.getElementById("password");
let busy = false;

bindPasswordToggles();
if (new URLSearchParams(location.search).get("reason") === "inactive")
  toast("Your session ended or the account is not active.", "danger");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;
  const ok1 = setFieldError(email, v.email(email.value));
  const ok2 = setFieldError(password, password.value ? "" : "Password is required.");
  if (!ok1 || !ok2) return;
  busy = true; setBusy(btn, true, "Signing in…");
  try {
    const p = await loginUser(email.value, password.value, document.getElementById("remember").checked);
    location.replace(p.role === "admin" ? "admin-dashboard.html" : "student-dashboard.html");
  } catch (err) {
    toast(friendlyAuthError(err), "danger");
    busy = false; setBusy(btn, false);
  }
});

document.getElementById("forgotLink").addEventListener("click", async (e) => {
  e.preventDefault();
  if (v.email(email.value)) { setFieldError(email, "Enter your email above first."); return; }
  try { await resetPassword(email.value); } catch {}
  toast("If an account exists for that email, a reset link has been sent.");   // same message either way
});
