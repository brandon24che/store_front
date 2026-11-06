/* ==========================================================================
   Firebase bootstrap. The modular v10 SDK is only imported when real keys are
   present, so Demo Mode never touches the network.
   ========================================================================== */

import { firebaseConfig, isFirebaseConfigured } from "./config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.5";

let instance = null;

export function getFirebase() {
  if (!isFirebaseConfigured) {
    return Promise.reject(new Error("Firebase is not configured (demo mode)."));
  }
  if (!instance) {
    instance = (async () => {
      const [{ initializeApp }, authMod, firestoreMod, functionsMod] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-auth.js`),
        import(`${SDK}/firebase-firestore.js`),
        import(`${SDK}/firebase-functions.js`),
      ]);
      const app = initializeApp(firebaseConfig);
      return {
        app,
        auth: authMod.getAuth(app),
        db: firestoreMod.getFirestore(app),
        functions: functionsMod.getFunctions(app),
        authMod,
        firestoreMod,
        functionsMod,
      };
    })();
  }
  return instance;
}
