import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Web config is public by design. Real protection = firestore.rules.
const firebaseConfig = {
  apiKey: "AIzaSyBmSF_YZglnP4KwHaQ5bYt_GEu26UZ0RwU",
  authDomain: "eventregistration-2b0a2.firebaseapp.com",
  projectId: "eventregistration-2b0a2",
  storageBucket: "eventregistration-2b0a2.firebasestorage.app",
  messagingSenderId: "903456218696",
  appId: "1:903456218696:web:92b0d87aaae7590590c27d",
  measurementId: "G-S27SC862CJ"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
