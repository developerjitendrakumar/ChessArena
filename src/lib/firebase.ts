import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { initializeFirestore, getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";

const firebaseConfig = {
  projectId: "elaborate-ocean-brwfn",
  appId: "1:552197439775:web:de372987b4bea71521702a",
  apiKey: "AIzaSyC273frDknh6VffAbOOi5bUcLQD0eo5GYY",
  authDomain: "elaborate-ocean-brwfn.firebaseapp.com",
  storageBucket: "elaborate-ocean-brwfn.firebasestorage.app",
  messagingSenderId: "552197439775"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use experimentalForceLongPolling to prevent WebSocket/fetch-stream drops in sandbox and iframe environments
let dbInstance: ReturnType<typeof getFirestore>;
try {
  dbInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  }, "ai-studio-cbdc0722-2ae7-4fa6-be41-64af744a4730");
} catch (e) {
  dbInstance = getFirestore(app, "ai-studio-cbdc0722-2ae7-4fa6-be41-64af744a4730");
}
export const db = dbInstance;
export const googleProvider = new GoogleAuthProvider();

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit
};
