/**
 * ==========================================================================
 * LOST & FOUND SYSTEM - UTIL MODULE
 * Common Helper Functions, UI Components, Theme, Toast, & Notifications
 * ==========================================================================
 */

import { auth, db, doc, getDoc, updateDoc, collection, query, where, orderBy, getDocs, limit, addDoc } from "./firebase.js";

/* ==========================================================================
   THEME CONTROLLER (LIGHT/DARK)
   ========================================================================== */

export function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
    document.documentElement.setAttribute('data-bs-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-bs-theme', 'light');
  }
}

export function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-bs-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-bs-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeToggleIcons(newTheme);
}

function updateThemeToggleIcons(theme) {
  const icons = document.querySelectorAll('.theme-toggle-icon');
  icons.forEach(icon => {
    if (theme === 'dark') {
      icon.className = 'bi bi-sun-fill theme-toggle-icon';
    } else {
      icon.className = 'bi bi-moon-stars-fill theme-toggle-icon';
    }
  });
}

/* ==========================================================================
   DYNAMIC NAVBAR AND FOOTER GENERATION
   ========================================================================== */

export function injectHeaderAndFooter(userRole = 'customer') {
  injectNavbar(userRole);
  injectFooter();
  initThemeToggleAction();
  setupNotificationsDropdown();
}

function injectNavbar(userRole) {
  const header = document.querySelector('header');
  if (!header) return;

  const currentTheme = document.documentElement.getAttribute('data-bs-theme');
  const themeIconClass = currentTheme === 'dark' ? 'bi-sun-fill' : 'bi-moon-stars-fill';

  // Construct links based on user status/role
  const user = auth.currentUser;
  
  let navItems = '';
  let authButtons = '';

  if (user) {
    // Authenticated Links
    navItems += `
      <li class="nav-item">
        <a class="nav-link" href="dashboard.html"><i class="bi bi-grid-fill me-1"></i> Dashboard</a>
      </li>
      <li class="nav-item">
        <a class="nav-link" href="report-lost.html"><i class="bi bi-search me-1"></i> Report Lost</a>
      </li>
      <li class="nav-item">
        <a class="nav-link" href="report-found.html"><i class="bi bi-plus-circle me-1"></i> Report Found</a>
      </li>
    `;

    if (userRole === 'admin') {
      navItems += `
        <li class="nav-item">
          <a class="nav-link text-warning fw-bold" href="admin.html"><i class="bi bi-shield-lock-fill me-1"></i> Admin Panel</a>
        </li>
      `;
    }

    authButtons = `
      <div class="dropdown me-2" id="notif-dropdown-wrapper">
        <button class="btn btn-link position-relative p-2 text-decoration-none text-main" type="button" id="notifDropdown" data-bs-toggle="dropdown" aria-expanded="false">
          <i class="bi bi-bell-fill fs-5"></i>
          <span class="position-absolute top-1 start-70 translate-middle badge rounded-pill bg-danger d-none" id="notif-badge">
            0
          </span>
        </button>
        <ul class="dropdown-menu dropdown-menu-end glass-card p-2" aria-labelledby="notifDropdown" style="width: 320px; max-height: 400px; overflow-y: auto;" id="notif-list">
          <li class="dropdown-header text-center">Notifications</li>
          <li><hr class="dropdown-divider"></li>
          <li class="text-center py-3 text-muted" id="notif-empty-state">No new notifications</li>
        </ul>
      </div>
      
      <div class="dropdown">
        <button class="btn btn-link dropdown-toggle text-decoration-none text-main d-flex align-items-center gap-2 p-0 border-0" type="button" id="userMenu" data-bs-toggle="dropdown" aria-expanded="false">
          <img src="${user.photoURL || 'https://via.placeholder.com/40'}" alt="${user.displayName}" class="rounded-circle border" width="36" height="36" id="nav-avatar">
          <span class="d-none d-lg-inline fs-6 fw-semibold text-main">${user.displayName}</span>
        </button>
        <ul class="dropdown-menu dropdown-menu-end glass-card shadow" aria-labelledby="userMenu">
          <li><a class="dropdown-item py-2" href="profile.html"><i class="bi bi-person-fill me-2"></i> My Profile</a></li>
          <li><a class="dropdown-item py-2" href="dashboard.html"><i class="bi bi-file-earmark-text-fill me-2"></i> My Reports</a></li>
          <li><hr class="dropdown-divider"></li>
          <li><button class="dropdown-item py-2 text-danger" id="btn-sign-out"><i class="bi bi-box-arrow-right me-2"></i> Sign Out</button></li>
        </ul>
      </div>
    `;
  } else {
    // Guest Links
    authButtons = `
      <a href="login.html" class="btn btn-custom btn-custom-primary"><i class="bi bi-google me-2"></i> Sign In</a>
    `;
  }

  header.innerHTML = `
    <nav class="navbar navbar-expand-lg glass-nav fixed-top py-2">
      <div class="container">
        <a class="navbar-brand fw-extrabold d-flex align-items-center gap-2" href="index.html">
          <i class="bi bi-box-seam-fill text-emerald fs-3"></i>
          <span class="fs-4 fw-bold letter-spacing--1">TraceBack</span>
        </a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarContent" aria-controls="navbarContent" aria-expanded="false" aria-label="Toggle navigation">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarContent">
          <ul class="navbar-nav me-auto mb-2 mb-lg-0 gap-1 ms-lg-4">
            <li class="nav-item">
              <a class="nav-link" href="index.html"><i class="bi bi-house-door-fill me-1"></i> Home</a>
            </li>
            ${navItems}
          </ul>
          <div class="d-flex align-items-center gap-3">
            <button class="theme-toggle-btn me-1" id="theme-toggle-navbar" title="Toggle Dark/Light Mode">
              <i class="bi ${themeIconClass} theme-toggle-icon fs-5"></i>
            </button>
            ${authButtons}
          </div>
        </div>
      </div>
    </nav>
  `;

  // Attach sign out event if button is present
  const signOutBtn = document.getElementById('btn-sign-out');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      showLoader();
      try {
        await auth.signOut();
        window.location.href = 'index.html';
      } catch (err) {
        showToast(err.message, 'danger');
      } finally {
        hideLoader();
      }
    });
  }
}

function injectFooter() {
  const footer = document.querySelector('footer');
  if (!footer) return;
  
  footer.innerHTML = `
    <div class="glass-footer py-5 mt-auto">
      <div class="container">
        <div class="row g-4 justify-content-between">
          <div class="col-lg-4 col-md-6">
            <div class="d-flex align-items-center gap-2 mb-3">
              <i class="bi bi-box-seam-fill text-emerald fs-3"></i>
              <span class="fs-4 fw-bold text-main">TraceBack</span>
            </div>
            <p class="text-muted mb-3">
              A comprehensive lost and found catalog designed to reconnect owners with their missing items. Production-ready, secure, and intuitive.
            </p>
            <div class="d-flex gap-3">
              <a href="#" class="text-muted fs-5"><i class="bi bi-facebook"></i></a>
              <a href="#" class="text-muted fs-5"><i class="bi bi-twitter-x"></i></a>
              <a href="#" class="text-muted fs-5"><i class="bi bi-instagram"></i></a>
              <a href="#" class="text-muted fs-5"><i class="bi bi-github"></i></a>
            </div>
          </div>
          <div class="col-lg-2 col-md-6">
            <h6 class="text-uppercase fw-bold text-main mb-3">Navigation</h6>
            <ul class="list-unstyled d-flex flex-column gap-2">
              <li><a href="index.html" class="text-muted text-decoration-none hover-text-main">Home</a></li>
              <li><a href="dashboard.html" class="text-muted text-decoration-none hover-text-main">Dashboard</a></li>
              <li><a href="report-lost.html" class="text-muted text-decoration-none hover-text-main">Report Lost</a></li>
              <li><a href="report-found.html" class="text-muted text-decoration-none hover-text-main">Report Found</a></li>
            </ul>
          </div>
          <div class="col-lg-3 col-md-6">
            <h6 class="text-uppercase fw-bold text-main mb-3">Security & Privacy</h6>
            <p class="text-muted small">
              This application requires secure login via Google Auth. All uploaded content is scanned and moderated in compliance with firestore security controls.
            </p>
          </div>
        </div>
        <hr class="my-4 border-secondary opacity-25">
        <div class="d-flex flex-column flex-sm-row justify-content-between align-items-center gap-2">
          <span class="text-muted small">&copy; ${new Date().getFullYear()} TraceBack Inc. All rights reserved.</span>
          <span class="text-muted small">Designed for visual & functional premium quality.</span>
        </div>
      </div>
    </div>
  `;
}

function initThemeToggleAction() {
  const toggleBtn = document.getElementById('theme-toggle-navbar');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleTheme);
  }
}

/* ==========================================================================
   SPINNER LOADER OVERLAY
   ========================================================================== */

export function showLoader(customText = "Loading, please wait...") {
  let loader = document.getElementById('loading-overlay');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'loading-overlay';
    loader.innerHTML = `
      <div class="spinner-border text-light" style="width: 3rem; height: 3rem;" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="mt-3 fs-5 fw-bold text-white" id="loader-text">${customText}</p>
    `;
    document.body.appendChild(loader);
  } else {
    const label = loader.querySelector('#loader-text');
    if (label) {
      label.textContent = customText;
    }
  }
  loader.classList.add('active');
}

export function hideLoader() {
  const loader = document.getElementById('loading-overlay');
  if (loader) {
    loader.classList.remove('active');
  }
}

/* ==========================================================================
   TOAST ALERTS SYSTEM
   ========================================================================== */

export function showToast(message, type = 'success') {
  let toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    document.body.appendChild(toastContainer);
  }

  const toastId = 'toast-' + Date.now();
  const iconClass = type === 'success' ? 'bi-check-circle-fill text-success' : 
                    type === 'danger' ? 'bi-exclamation-triangle-fill text-danger' : 
                    type === 'warning' ? 'bi-exclamation-circle-fill text-warning' : 'bi-info-circle-fill text-info';

  const toastHTML = `
    <div id="${toastId}" class="toast glass-card" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="4000">
      <div class="toast-header border-0 pb-0">
        <i class="bi ${iconClass} me-2 fs-5"></i>
        <strong class="me-auto text-capitalize">${type}</strong>
        <small class="text-muted">Just now</small>
        <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body text-main pb-3">
        ${message}
      </div>
    </div>
  `;

  toastContainer.insertAdjacentHTML('beforeend', toastHTML);
  const toastElement = document.getElementById(toastId);
  const bsToast = new bootstrap.Toast(toastElement);
  bsToast.show();

  toastElement.addEventListener('hidden.bs.toast', () => {
    toastElement.remove();
  });
}

/* ==========================================================================
   NOTIFICATIONS UTILS
   ========================================================================== */

async function setupNotificationsDropdown() {
  const user = auth.currentUser;
  if (!user) return;

  const notifBadge = document.getElementById('notif-badge');
  const notifList = document.getElementById('notif-list');
  const notifEmptyState = document.getElementById('notif-empty-state');
  
  if (!notifBadge || !notifList) return;

  // Real-time notifications queries
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", user.uid),
    orderBy("createdAt", "desc"),
    limit(10)
  );

  try {
    const querySnapshot = await getDocs(q);
    const notifications = [];
    let unreadCount = 0;

    querySnapshot.forEach(doc => {
      const data = doc.data();
      data.id = doc.id;
      notifications.push(data);
      if (!data.read) unreadCount++;
    });

    // Update Badge
    if (unreadCount > 0) {
      notifBadge.textContent = unreadCount;
      notifBadge.classList.remove('d-none');
    } else {
      notifBadge.classList.add('d-none');
    }

    // Clear old entries (keeping headers)
    const listItems = notifList.querySelectorAll('li:not(.dropdown-header):not(:has(hr))');
    listItems.forEach(item => item.remove());

    if (notifications.length === 0) {
      if (notifEmptyState) notifEmptyState.classList.remove('d-none');
    } else {
      if (notifEmptyState) notifEmptyState.classList.add('d-none');

      notifications.forEach(notif => {
        const timestampStr = timeAgo(notif.createdAt);
        const itemClass = notif.read ? '' : 'bg-body-secondary';
        const notifItem = document.createElement('li');
        
        notifItem.innerHTML = `
          <a class="dropdown-item p-3 d-flex flex-column gap-1 border-bottom ${itemClass}" href="${notif.link || '#'}" style="white-space: normal;">
            <div class="d-flex justify-content-between align-items-start">
              <span class="fw-bold text-main small">${notif.title}</span>
              <span class="text-muted" style="font-size: 0.7rem;">${timestampStr}</span>
            </div>
            <p class="text-muted mb-0 small">${notif.message}</p>
          </a>
        `;

        // Mark read on click
        notifItem.querySelector('a').addEventListener('click', async (e) => {
          if (!notif.read) {
            try {
              await updateDoc(doc(db, "notifications", notif.id), { read: true });
            } catch (err) {
              console.error("Error updating notification status:", err);
            }
          }
        });

        notifList.appendChild(notifItem);
      });
    }
  } catch (err) {
    console.error("Error setting up notifications dropdown: ", err);
  }
}

// Global notification trigger function
export async function createNotification(userId, title, message, link = "") {
  try {
    await addDoc(collection(db, "notifications"), {
      userId: userId,
      title: title,
      message: message,
      link: link,
      read: false,
      createdAt: new Date()
    });
  } catch (err) {
    console.error("Error creating notification document: ", err);
  }
}

/* ==========================================================================
   FAVORITES / BOOKMARKS UTILS
   ========================================================================== */

export async function toggleBookmark(reportId) {
  const user = auth.currentUser;
  if (!user) {
    showToast("Please log in to bookmark reports.", "warning");
    return false;
  }

  showLoader();
  try {
    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const bookmarks = userData.bookmarks || [];
      const index = bookmarks.indexOf(reportId);
      
      let updatedBookmarks = [...bookmarks];
      let isAdded = false;

      if (index > -1) {
        updatedBookmarks.splice(index, 1);
        showToast("Removed from bookmarks.", "success");
      } else {
        updatedBookmarks.push(reportId);
        showToast("Added to bookmarks.", "success");
        isAdded = true;
      }

      await updateDoc(userDocRef, { bookmarks: updatedBookmarks });
      hideLoader();
      return isAdded;
    }
  } catch (err) {
    showToast(err.message, "danger");
  } finally {
    hideLoader();
  }
  return false;
}

export async function isBookmarked(reportId) {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
      const bookmarks = userSnap.data().bookmarks || [];
      return bookmarks.includes(reportId);
    }
  } catch (err) {
    console.error("Error checking bookmark: ", err);
  }
  return false;
}

/* ==========================================================================
   DATE & TIME FORMATTER UTILS
   ========================================================================== */

export function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    let date;
    if (typeof dateStr.toDate === 'function') {
      date = dateStr.toDate();
    } else if (dateStr.seconds) {
      date = new Date(dateStr.seconds * 1000);
    } else {
      date = new Date(dateStr);
    }
    if (isNaN(date.getTime())) return 'N/A';
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  } catch (err) {
    console.error("formatDate error: ", err);
    return 'N/A';
  }
}

export function formatTime(timeStr) {
  if (!timeStr) return 'N/A';
  try {
    let date;
    if (typeof timeStr.toDate === 'function') {
      date = timeStr.toDate();
    } else if (timeStr.seconds) {
      date = new Date(timeStr.seconds * 1000);
    } else if (typeof timeStr === 'string' && timeStr.includes(':')) {
      const [hours, minutes] = timeStr.split(':');
      const h = parseInt(hours);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hh = h % 12 || 12;
      return `${hh}:${minutes} ${ampm}`;
    } else {
      date = new Date(timeStr);
    }
    
    if (date && !isNaN(date.getTime())) {
      const hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const hh = hours % 12 || 12;
      return `${hh}:${minutes} ${ampm}`;
    }
    return 'N/A';
  } catch (err) {
    console.error("formatTime error: ", err);
    return 'N/A';
  }
}

export function timeAgo(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  
  return formatDate(date);
}

// Log admin action helper
export async function logActivity(actionType, description) {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const role = userSnap.exists() ? userSnap.data().role : 'customer';
    
    await addDoc(collection(db, "activityLogs"), {
      userId: user.uid,
      userName: user.displayName,
      userRole: role,
      actionType: actionType,
      description: description,
      timestamp: new Date()
    });
  } catch (err) {
    console.error("Error logging activity: ", err);
  }
}

/**
 * Compresses an image file on the client-side using Canvas and outputs a Base64 data URL.
 * Bypasses the need for Firebase Storage.
 */
export function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    // Setup safety timeout to avoid hanging the promise
    const timeoutId = setTimeout(() => {
      reject(new Error("Image compression timed out"));
    }, 4000);

    const cleanup = () => clearTimeout(timeoutId);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error("Could not get 2D context");
          }
          ctx.drawImage(img, 0, 0, width, height);

          // Convert canvas to base64 data URL with JPEG quality compression
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          cleanup();
          resolve(dataUrl);
        } catch (err) {
          cleanup();
          reject(err);
        }
      };
      img.onerror = (err) => {
        cleanup();
        reject(err);
      };
      img.src = event.target.result;
    };
    reader.onerror = (err) => {
      cleanup();
      reject(err);
    };
    reader.readAsDataURL(file);
  });
}

