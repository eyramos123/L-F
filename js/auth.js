/**
 * ==========================================================================
 * LOST & FOUND SYSTEM - AUTH CONTROLLER
 * Google Authentication, Role-based Routing, & Protected Routes Guard
 * ==========================================================================
 */

import { 
  auth, 
  db, 
  signInWithPopup, 
  GoogleAuthProvider, 
  doc, 
  getDoc, 
  setDoc, 
  onAuthStateChanged 
} from "./firebase.js";
import { showToast, showLoader, hideLoader, injectHeaderAndFooter } from "./utils.js";

// Google Auth Provider instance
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

/**
 * Handle Google Single Sign-In
 */
export async function signInWithGoogle() {
  showLoader();
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    // Check/create user document inside Firestore
    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);
    
    if (!userSnap.exists()) {
      // Create new user profile document in Firestore
      await setDoc(userDocRef, {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        role: "customer",      // Default role
        status: "active",       // Default status
        bookmarks: [],
        createdAt: new Date(),
        updatedAt: new Date()
      });
      showToast(`Welcome to TraceBack, ${user.displayName}!`, "success");
      window.location.href = "dashboard.html";
    } else {
      const userData = userSnap.data();
      
      // Check user status
      if (userData.status === 'suspended') {
        await auth.signOut();
        showToast("Your account has been suspended by an administrator.", "danger");
        setTimeout(() => { window.location.href = "login.html"; }, 3000);
        return;
      } else if (userData.status === 'banned') {
        await auth.signOut();
        showToast("Your account has been permanently banned from TraceBack.", "danger");
        setTimeout(() => { window.location.href = "login.html"; }, 3000);
        return;
      }

      showToast(`Welcome back, ${user.displayName}!`, "success");
      
      // Redirect based on role
      if (userData.role === 'admin') {
        window.location.href = "admin.html";
      } else {
        window.location.href = "dashboard.html";
      }
    }
  } catch (err) {
    console.error("Authentication error: ", err);
    showToast(`Authentication failed: ${err.message}`, "danger");
  } finally {
    hideLoader();
  }
}

/**
 * Monitors Authentication States & Guards Protected Pages
 */
export function monitorAuthState() {
  const currentPage = window.location.pathname.split("/").pop();
  
  // Public files where login is not strictly required to read
  const publicPages = ["", "index.html", "login.html"];
  const isPublicPage = publicPages.includes(currentPage);
  
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // User is logged in, pull Firestore document to resolve roles & status
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userDocRef);
        
        if (userSnap.exists()) {
          const userData = userSnap.data();
          
          // Verify status
          if (userData.status === 'suspended' || userData.status === 'banned') {
            await auth.signOut();
            showToast("Your account is currently inactive.", "danger");
            window.location.href = "login.html";
            return;
          }

          // Inject user-specific navbar and footer
          injectHeaderAndFooter(userData.role);
          
          // Redirect authenticated users away from Login page
          if (currentPage === "login.html") {
            if (userData.role === "admin") {
              window.location.href = "admin.html";
            } else {
              window.location.href = "dashboard.html";
            }
          }

          // Guard Admin pages
          if (currentPage === "admin.html" && userData.role !== "admin") {
            showToast("Unauthorized Access: Administrator credentials required.", "danger");
            window.location.href = "dashboard.html";
          }
        } else {
          // If Firestore doc doesn't exist for some reason, create it
          await setDoc(userDocRef, {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            role: "customer",
            status: "active",
            bookmarks: [],
            createdAt: new Date(),
            updatedAt: new Date()
          });
          injectHeaderAndFooter("customer");
          if (currentPage === "login.html") window.location.href = "dashboard.html";
        }
      } catch (err) {
        console.error("Error retrieving user status:", err);
        injectHeaderAndFooter("customer");
      }
    } else {
      // User is not logged in
      injectHeaderAndFooter(null);
      
      // If page is not in public list, bounce user to Login
      if (!isPublicPage) {
        showToast("Access Denied: Please sign in first.", "warning");
        setTimeout(() => {
          window.location.href = "login.html";
        }, 1000);
      }
    }
  });
}

// Auto-run auth monitoring on page load
document.addEventListener("DOMContentLoaded", () => {
  monitorAuthState();
});
