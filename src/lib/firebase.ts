import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics, isSupported } from "firebase/analytics";

// Firebase configuration using Vite environment variables
// Note: These must be prefixed with VITE_ to be accessible in the client
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

import { getFirestore } from "firebase/firestore";
import { getRemoteConfig } from "firebase/remote-config";

// Initialize Firebase with safety checks
let app: any = null;
let auth: any = null;
let db: any = null;
let remoteConfig: any = null;

try {
  if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    remoteConfig = getRemoteConfig(app);
    console.log("[Firebase] Initialized successfully.");
  } else {
    console.warn("[Firebase] API Key is missing. Cloud features will be disabled.");
  }
} catch (error) {
  console.error("[Firebase] Initialization failed:", error);
  // We do NOT re-throw here to allow the app to boot in "offline/local" mode
}

// Exported instances (might be null if key is missing)
export { auth, db, remoteConfig };

// Initialize Analytics (checking if supported and if app exists)
export const analytics = isSupported().then(yes => (yes && app) ? getAnalytics(app) : null);

export default app;
