// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

// Import Firebase Authentication services
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Import Cloud Firestore services
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter,
  getDocs, 
  increment,
  arrayUnion,
  arrayRemove,
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Import Firebase Storage services
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Firebase configuration placeholder
// REPLACE THIS CONFIGURATION OBJECT WITH YOUR ACTURAL FIREBASE PROJECT SETTINGS FROM FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: "AIzaSyCEaaWgE5QQMnJ_oArXWqPTJ-SQFYk0Lr0",
  authDomain: "lost-and-found-6f595.firebaseapp.com",
  projectId: "lost-and-found-6f595",
  storageBucket: "lost-and-found-6f595.firebasestorage.app",
  messagingSenderId: "197871122124",
  appId: "1:197871122124:web:0c969b1cc783cc0438b469",
  measurementId: "G-DFFHXE2QD3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Export instances and modular SDK functions for codebase-wide reusability
export {
  app,
  auth,
  db,
  storage,
  
  // Auth Functions
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  
  // Firestore Database Functions
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  increment,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  
  // Storage Functions
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
};
