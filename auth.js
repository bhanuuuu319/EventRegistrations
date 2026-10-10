import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, updateDoc, addDoc, collection, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { normalizeUsername } from "./utils.js";

export class AppError extends Error {}

export function friendlyAuthError(e) {
  if (e instanceof AppError) return e.message;
  switch (e?.code) {
    case "auth/email-already-in-use": return "Email already exists. Please log in or reset your password.";
    case "auth/invalid-email": return "That email address is not valid.";
    case "auth/weak-password": return "Password is too weak. Use at least 8 characters with a mix of letters, numbers and symbols.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found": return "Incorrect email or password.";
    case "auth/user-disabled": return "This account has been disabled. Contact the college administrator.";
    case "auth/too-many-requests": return "Too many attempts. Wait a few minutes or reset your password.";
    case "auth/network-request-failed": return "Network error. Check your connection and try again.";
    case "permission-denied": return "Permission denied by Firestore rules. Check that firestore.rules is published.";
    default: return "Something went wrong. Please try again.";
  }
}

export async function getProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Student registration.
 * 1) Create the Auth account (Firebase enforces unique email).
 * 2) In ONE Firestore transaction, reserve usernames/{username} and create users/{uid}.
 *    Rules require both writes together and refuse an already-existing username doc,
 *    so two simultaneous sign-ups can never both win the same username.
 * 3) If step 2 fails, delete the new Auth account so nothing is left half-created.
 */
export async function registerStudent(f) {
  const username = normalizeUsername(f.username);
  const cred = await createUserWithEmailAndPassword(auth, f.email.trim(), f.password);
  const uid = cred.user.uid;
  try {
    await runTransaction(db, async (tx) => {
      const nameRef = doc(db, "usernames", username);
      if ((await tx.get(nameRef)).exists()) throw new AppError("Username already exists. Please choose another username.");
      tx.set(nameRef, { uid, createdAt: serverTimestamp() });
      tx.set(doc(db, "users", uid), {
        uid, fullName: f.fullName.trim(), username, email: f.email.trim().toLowerCase(),
        studentId: f.studentId.trim().toUpperCase(), department: f.department, year: f.year,
        role: "student", status: "active",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastLoginAt: serverTimestamp()
      });
    });
  } catch (err) {
    try { await cred.user.delete(); }            // roll back the Auth account
    catch { await signOut(auth); }               // if rollback fails: see README "Recovering incomplete registrations"
    throw err;
  }
  await logActivity("login", f.fullName.trim());
  return uid;
}

export async function loginUser(email, password, remember) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const profile = await getProfile(cred.user.uid);
  if (!profile) {
    await signOut(auth);
    throw new AppError("Your account has no profile. Please contact the administrator.");
  }
  if (profile.status !== "active") {
    await signOut(auth);
    throw new AppError("This account is deactivated. Contact the college administrator.");
  }
  await updateDoc(doc(db, "users", profile.uid), { lastLoginAt: serverTimestamp() });
  await logActivity("login", profile.fullName);
  return profile;
}

export async function logActivity(type, fullName) {
  const u = auth.currentUser;
  if (!u) return;
  try {
    await addDoc(collection(db, "loginActivity"), { uid: u.uid, fullName, type, createdAt: serverTimestamp() });
  } catch (e) { console.warn("Activity log skipped:", e.code); }
}

export async function logout(fullName) {
  await logActivity("logout", fullName || "");      // best effort; a closed tab will not record this
  await signOut(auth);
  location.replace("login.html");
}

export const resetPassword = (email) => sendPasswordResetEmail(auth, email.trim());
