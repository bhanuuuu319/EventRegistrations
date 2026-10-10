import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getProfile } from "./auth.js";

/** Call at the top of every protected page. Resolves with { user, profile } or redirects.
 *  This is only UX. Real enforcement is in firestore.rules. */
export function requireRole(role) {
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, async (user) => {
      off();
      if (!user) return location.replace("login.html");
      const profile = await getProfile(user.uid).catch(() => null);
      if (!profile || profile.status !== "active") {
        await signOut(auth);
        return location.replace("login.html?reason=inactive");
      }
      if (role && profile.role !== role) {
        return location.replace(profile.role === "admin" ? "admin-dashboard.html" : "student-dashboard.html");
      }
      resolve({ user, profile });
    });
  });
}

/** For public pages: resolves with the active profile, or null when signed out. */
export function optionalUser() {
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, async (user) => {
      off();
      if (!user) return resolve({ user: null, profile: null });
      const profile = await getProfile(user.uid).catch(() => null);
      resolve(profile && profile.status === "active" ? { user, profile } : { user: null, profile: null });
    });
  });
}
