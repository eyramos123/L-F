/**
 * ==========================================================================
 * LOST & FOUND SYSTEM - CUSTOMER DASHBOARD & PROFILE MANAGER
 * Handles User Reports List, Bookmarks, Status Solved/Closed, Profile Updates
 * ==========================================================================
 */

import { 
  db, 
  storage, 
  auth, 
  doc, 
  getDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "./firebase.js";
import { 
  showToast, 
  showLoader, 
  hideLoader, 
  formatDate, 
  timeAgo,
  logActivity 
} from "./utils.js";

/**
 * Initializes the Customer Dashboard
 */
export async function initCustomerDashboard() {
  const user = auth.currentUser;
  if (!user) return;

  showLoader();
  try {
    // 1. Fetch User Data
    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) return;

    const userData = userSnap.data();
    
    // Render Dashboard Stats Overview
    renderDashboardStats(user.uid);
    
    // Load lists
    await loadUserReports(user.uid);
    await loadBookmarkedReports(userData.bookmarks || []);
  } catch (err) {
    showToast(err.message, "danger");
  } finally {
    hideLoader();
  }
}

/**
 * Calculate and render user's reports metrics
 */
async function renderDashboardStats(uid) {
  try {
    const q = query(collection(db, "reports"), where("reporterId", "==", uid));
    const querySnapshot = await getDocs(q);
    
    let total = 0;
    let active = 0;
    let solved = 0;
    let pending = 0;

    querySnapshot.forEach(doc => {
      const data = doc.data();
      total++;
      if (data.status === 'pending') pending++;
      else if (data.status === 'active') active++;
      else if (data.status === 'claimed' || data.status === 'returned') solved++;
    });

    const totalEl = document.getElementById('stat-total-reports');
    const activeEl = document.getElementById('stat-active-reports');
    const solvedEl = document.getElementById('stat-solved-reports');
    const pendingEl = document.getElementById('stat-pending-reports');

    if (totalEl) totalEl.textContent = total;
    if (activeEl) activeEl.textContent = active;
    if (solvedEl) solvedEl.textContent = solved;
    if (pendingEl) pendingEl.textContent = pending;
  } catch (err) {
    console.error("Error loading dashboard stats:", err);
  }
}

/**
 * Load and render reports created by the current user
 */
async function loadUserReports(uid) {
  const container = document.getElementById('my-reports-container');
  if (!container) return;

  try {
    const q = query(
      collection(db, "reports"), 
      where("reporterId", "==", uid)
    );
    const querySnapshot = await getDocs(q);
    const reports = [];
    
    querySnapshot.forEach(doc => {
      const data = doc.data();
      data.id = doc.id;
      reports.push(data);
    });

    // Sort client-side by date to guarantee order (fallback since indexes may not be ready)
    reports.sort((a, b) => {
      const dA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
      const dB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return dB - dA;
    });

    if (reports.length === 0) {
      container.innerHTML = `
        <div class="text-center py-5 text-muted animate-fade-in">
          <i class="bi bi-folder-x fs-1 mb-2 d-block"></i>
          <p>You haven't reported any lost or found items yet.</p>
          <div class="d-flex justify-content-center gap-2 mt-3">
            <a href="report-lost.html" class="btn btn-sm btn-custom btn-custom-primary">Report Lost</a>
            <a href="report-found.html" class="btn btn-sm btn-custom btn-custom-outline">Report Found</a>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `<div class="row g-4 animate-slide-up">`;
    const row = container.querySelector('.row');

    reports.forEach(report => {
      const isLost = report.type === 'lost';
      const badgeClass = isLost ? 'type-lost' : 'type-found';
      const imgUrl = report.photos?.[0] || 'https://via.placeholder.com/300x200?text=No+Photo';
      
      let statusBadge = 'status-pending';
      if (report.status === 'active') statusBadge = 'status-active';
      else if (report.status === 'claimed' || report.status === 'returned') statusBadge = 'status-claimed';
      else if (report.status === 'closed') statusBadge = 'status-closed';

      const cardHTML = `
        <div class="col-md-6 col-lg-4" id="report-card-${report.id}">
          <div class="card glass-card h-100 overflow-hidden">
            <div class="card-img-wrapper">
              <span class="type-pill ${badgeClass}">${report.type}</span>
              <img src="${imgUrl}" alt="${report.itemName}" loading="lazy">
            </div>
            <div class="card-body d-flex flex-column p-4">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="status-badge ${statusBadge}">${report.status}</span>
                <span class="text-muted small"><i class="bi bi-clock"></i> ${timeAgo(report.createdAt)}</span>
              </div>
              <h5 class="card-title text-main fw-bold mb-2">${report.itemName}</h5>
              <p class="card-text text-muted small flex-grow-1">${report.description.substring(0, 80)}${report.description.length > 80 ? '...' : ''}</p>
              
              <div class="d-flex flex-column gap-2 mt-3">
                <a href="report-details.html?id=${report.id}" class="btn btn-sm btn-custom btn-custom-outline w-100">
                  <i class="bi bi-eye"></i> View Details
                </a>
                
                ${report.status === 'active' ? `
                  <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-success flex-grow-1 btn-custom btn-solve-report" data-id="${report.id}" data-type="${report.type}">
                      <i class="bi bi-check-lg"></i> Mark Solved
                    </button>
                    <button class="btn btn-sm btn-danger btn-custom btn-close-report" data-id="${report.id}">
                      <i class="bi bi-x-lg"></i> Close
                    </button>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
      row.insertAdjacentHTML('beforeend', cardHTML);
    });

    // Attach actions
    row.querySelectorAll('.btn-solve-report').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const rType = e.currentTarget.getAttribute('data-type');
        handleSolveReport(id, rType);
      });
    });

    row.querySelectorAll('.btn-close-report').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        handleCloseReport(id);
      });
    });

  } catch (err) {
    console.error("Error loading user reports: ", err);
    container.innerHTML = `<div class="alert alert-danger">Failed to load reports.</div>`;
  }
}

/**
 * Load and render bookmarked reports
 */
async function loadBookmarkedReports(bookmarkIds) {
  const container = document.getElementById('bookmarks-container');
  if (!container) return;

  if (!bookmarkIds || bookmarkIds.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5 text-muted animate-fade-in">
        <i class="bi bi-bookmark-x fs-1 mb-2 d-block"></i>
        <p>You haven't bookmarked any reports yet.</p>
      </div>
    `;
    return;
  }

  try {
    container.innerHTML = `<div class="row g-4 animate-slide-up">`;
    const row = container.querySelector('.row');

    for (const reportId of bookmarkIds) {
      const reportRef = doc(db, "reports", reportId);
      const reportSnap = await getDoc(reportRef);
      
      if (reportSnap.exists()) {
        const report = reportSnap.data();
        report.id = reportSnap.id;
        
        const isLost = report.type === 'lost';
        const badgeClass = isLost ? 'type-lost' : 'type-found';
        const imgUrl = report.photos?.[0] || 'https://via.placeholder.com/300x200?text=No+Photo';
        
        let statusBadge = 'status-pending';
        if (report.status === 'active') statusBadge = 'status-active';
        else if (report.status === 'claimed' || report.status === 'returned') statusBadge = 'status-claimed';
        else if (report.status === 'closed') statusBadge = 'status-closed';

        const cardHTML = `
          <div class="col-md-6 col-lg-4" id="bookmark-card-${report.id}">
            <div class="card glass-card h-100 overflow-hidden">
              <div class="card-img-wrapper">
                <span class="type-pill ${badgeClass}">${report.type}</span>
                <img src="${imgUrl}" alt="${report.itemName}" loading="lazy">
              </div>
              <div class="card-body d-flex flex-column p-4">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="status-badge ${statusBadge}">${report.status}</span>
                  <span class="text-muted small"><i class="bi bi-clock"></i> ${timeAgo(report.createdAt)}</span>
                </div>
                <h5 class="card-title text-main fw-bold mb-2">${report.itemName}</h5>
                <p class="card-text text-muted small flex-grow-1">${report.description.substring(0, 80)}${report.description.length > 80 ? '...' : ''}</p>
                <div class="d-flex gap-2 mt-3">
                  <a href="report-details.html?id=${report.id}" class="btn btn-sm btn-custom btn-custom-outline flex-grow-1">
                    <i class="bi bi-eye"></i> Details
                  </a>
                  <button class="btn btn-sm btn-outline-danger btn-custom btn-remove-bookmark" data-id="${report.id}">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
        row.insertAdjacentHTML('beforeend', cardHTML);
      }
    }

    // Attach bookmark removal trigger
    row.querySelectorAll('.btn-remove-bookmark').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        showLoader();
        try {
          const user = auth.currentUser;
          const userDocRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            const bookmarks = userSnap.data().bookmarks || [];
            const updated = bookmarks.filter(bId => bId !== id);
            await updateDoc(userDocRef, { bookmarks: updated });
            
            // Remove element from DOM
            document.getElementById(`bookmark-card-${id}`)?.remove();
            showToast("Bookmark removed.", "success");
            
            // If empty now, show empty state
            if (updated.length === 0) {
              container.innerHTML = `
                <div class="text-center py-5 text-muted animate-fade-in">
                  <i class="bi bi-bookmark-x fs-1 mb-2 d-block"></i>
                  <p>You haven't bookmarked any reports yet.</p>
                </div>
              `;
            }
          }
        } catch (err) {
          showToast(err.message, "danger");
        } finally {
          hideLoader();
        }
      });
    });

  } catch (err) {
    console.error("Error loading bookmarks: ", err);
    container.innerHTML = `<div class="alert alert-danger">Failed to load bookmarks.</div>`;
  }
}

/**
 * Handle "Mark Solved" action
 */
async function handleSolveReport(reportId, type) {
  if (confirm("Are you sure you want to mark this item as resolved/solved? This cannot be undone.")) {
    showLoader();
    try {
      const solvedStatus = type === 'lost' ? 'claimed' : 'returned';
      await updateDoc(doc(db, "reports", reportId), {
        status: solvedStatus,
        updatedAt: new Date()
      });
      
      await logActivity("resolve_report", `Marked report ${reportId} as solved (${solvedStatus})`);
      showToast("Congratulations on resolving this item!", "success");
      
      // Reload Dashboard
      initCustomerDashboard();
    } catch (err) {
      showToast(err.message, "danger");
    } finally {
      hideLoader();
    }
  }
}

/**
 * Handle "Close" action
 */
async function handleCloseReport(reportId) {
  if (confirm("Are you sure you want to close this report? It will no longer show as active in search results.")) {
    showLoader();
    try {
      await updateDoc(doc(db, "reports", reportId), {
        status: "closed",
        updatedAt: new Date()
      });

      await logActivity("close_report", `Closed report ${reportId}`);
      showToast("Report closed successfully.", "success");
      
      // Reload Dashboard
      initCustomerDashboard();
    } catch (err) {
      showToast(err.message, "danger");
    } finally {
      hideLoader();
    }
  }
}

/**
 * Initialize Profile Form and Load Values
 */
export async function initProfilePage() {
  const user = auth.currentUser;
  if (!user) return;

  const profileNameInput = document.getElementById('profile-name');
  const profileEmailInput = document.getElementById('profile-email');
  const profilePhoneInput = document.getElementById('profile-phone');
  const profileImg = document.getElementById('profile-avatar-img');

  showLoader();
  try {
    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);
    
    if (userSnap.exists()) {
      const data = userSnap.data();
      if (profileNameInput) profileNameInput.value = data.displayName || "";
      if (profileEmailInput) profileEmailInput.value = data.email || "";
      if (profilePhoneInput) profilePhoneInput.value = data.contactNumber || "";
      if (profileImg) profileImg.src = data.photoURL || "https://via.placeholder.com/130";
    }
  } catch (err) {
    showToast(err.message, "danger");
  } finally {
    hideLoader();
  }
}

/**
 * Updates Customer Profile in Firestore & Auth Details
 */
export async function handleProfileUpdate(formEl) {
  const user = auth.currentUser;
  if (!user) return;

  const displayName = document.getElementById('profile-name').value.trim();
  const contactNumber = document.getElementById('profile-phone').value.trim();
  const avatarFile = document.getElementById('profile-avatar-input').files[0];

  if (!displayName || !contactNumber) {
    showToast("Please fill in name and contact number.", "warning");
    return;
  }

  showLoader();
  try {
    const userDocRef = doc(db, "users", user.uid);
    let avatarUrl = user.photoURL;

    // Upload new profile avatar if selected
    if (avatarFile) {
      // Validate File size (2MB limit for profiles)
      if (avatarFile.size > 2 * 1024 * 1024) {
        showToast("Profile pictures must be under 2MB.", "warning");
        hideLoader();
        return;
      }
      
      const storageRef = ref(storage, `profiles/${user.uid}/${Date.now()}_${avatarFile.name}`);
      const uploadResult = await uploadBytes(storageRef, avatarFile);
      avatarUrl = await getDownloadURL(uploadResult.ref);
    }

    // Update Firestore Document
    await updateDoc(userDocRef, {
      displayName: displayName,
      photoURL: avatarUrl,
      contactNumber: contactNumber,
      updatedAt: new Date()
    });

    // We can also trigger a local auth profile update if required, 
    // but updating the Firestore doc is our single source of truth.
    showToast("Profile updated successfully!", "success");
    
    // Update local nav image preview
    const navAvatar = document.getElementById('nav-avatar');
    if (navAvatar) navAvatar.src = avatarUrl;

    initProfilePage();
  } catch (err) {
    showToast(err.message, "danger");
  } finally {
    hideLoader();
  }
}
