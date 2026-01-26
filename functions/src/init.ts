import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Initialize the app only once
// We use a try-catch or check getApps() if multiple inits are a risk, 
// but in Cloud Functions, top-level init is standard practice.
// However, to ensure it runs before db access, we put it here.

// Double-check if already initialized to avoid errors in tests or re-imports (rare in CF but good practice)
import { getApps } from "firebase-admin/app";

if (getApps().length === 0) {
    initializeApp();
}

export const db = getFirestore();
