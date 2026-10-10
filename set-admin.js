// OPTIONAL, TRUSTED ENVIRONMENT ONLY (your own computer). Never put this in the website folder you deploy.
// Usage:  npm i firebase-admin   then   node set-admin.js <UID>
// Needs a service-account key downloaded from Firebase Console > Project settings > Service accounts.
// Keep that key file private and out of Git.
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(require("./serviceAccountKey.json")) });
const uid = process.argv[2];
if (!uid) { console.error("Pass the user's UID."); process.exit(1); }
admin.firestore().doc(`users/${uid}`).update({ role: "admin" })
  .then(() => { console.log("Done: users/" + uid + " is now an admin."); process.exit(0); })
  .catch((e) => { console.error(e.message); process.exit(1); });
