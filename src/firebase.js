import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAtvsRwDMqmYRVF43nBMD42liLpjo3e340",
  authDomain: "chalaysanta-2026.firebaseapp.com",
  databaseURL: "https://chalaysanta-2026-default-rtdb.firebaseio.com",
  projectId: "chalaysanta-2026",
  storageBucket: "chalaysanta-2026.firebasestorage.app",
  messagingSenderId: "482778599004",
  appId: "1:482778599004:web:2aad1063dbb121d2af2099"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
