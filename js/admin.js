/**
 * ==========================================================================
 * LOST & FOUND SYSTEM - ADMINISTRATOR BACKEND LOGIC
 * Statistics Aggregation, Activity Feeds, Report Approvals, and User Ban Panels
 * ==========================================================================
 */

import { 
  db, 
  storage,
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  limit, 
  ref, 
  deleteObject 
} from "./firebase.js";
import { 
  showToast, 
  showLoader, 
  hideLoader, 
  formatDate, 
  timeAgo, 
  createNotification, 
  logActivity 
} from "./utils.js";

// Global reference for Chart.js instances
let reportChartInstance = null;

/**
 * Initializes Admin Dashboard Elements
 */
export async function initAdminDashboard() {
  showLoader();
  try {
    // 1. Fetch & Render Statistics Card Counts
    const stats = await fetchSystemStats();
    renderStatsUI(stats);
    
    // 2. Render Graphical Chart
    renderChart(stats);

    // 3. Load latest activity logs feed
    await loadActivityLogs();

    // 4. Load reports moderation queue
    await loadModerationQueue();

    // 5. Load user accounts list
    await loadUserAccounts();

  } catch (err) {
    showToast(err.message, "danger");
  } finally {
    hideLoader();
  }
}

/**
 * Calculate count aggregates for reports & users
 */
async function fetchSystemStats() {
  const reportsSnap = await getDocs(collection(db, "reports"));
  const usersSnap = await getDocs(collection(db, "users"));

  const stats = {
    totalUsers: usersSnap.size,
    totalReports: reportsSnap.size,
    lostCount: 0,
    foundCount: 0,
    pending: 0,
    active: 0,
    solved: 0, // claimed + returned
    closed: 0,
    rejected: 0
  };

  reportsSnap.forEach(docSnap => {
    const data = docSnap.data();
    if (data.type === 'lost') stats.lostCount++;
    else if (data.type === 'found') stats.foundCount++;

    if (data.status === 'pending') stats.pending++;
    else if (data.status === 'active') stats.active++;
    else if (data.status === 'claimed' || data.status === 'returned') stats.solved++;
    else if (data.status === 'closed') stats.closed++;
    else if (data.status === 'rejected') stats.rejected++;
  });

  return stats;
}

function renderStatsUI(stats) {
  const elUsers = document.getElementById('admin-stat-users');
  const elReports = document.getElementById('admin-stat-reports');
  const elPending = document.getElementById('admin-stat-pending');
  const elSolved = document.getElementById('admin-stat-solved');
  const elClosed = document.getElementById('admin-stat-closed');

  if (elUsers) elUsers.textContent = stats.totalUsers;
  if (elReports) elReports.textContent = stats.totalReports;
  if (elPending) elPending.textContent = stats.pending;
  if (elSolved) elSolved.textContent = stats.solved;
  if (elClosed) elClosed.textContent = stats.closed;
}

/**
 * Initialize / Update ChartJS Canvas Graphic
 */
function renderChart(stats) {
  const ctx = document.getElementById('reportsSummaryChart');
  if (!ctx) return;

  if (reportChartInstance) {
    reportChartInstance.destroy();
  }

  const isDarkMode = document.documentElement.getAttribute('data-bs-theme') === 'dark';
  const labelColor = isDarkMode ? '#f8fafc' : '#0f172a';
  const gridColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

  // Initializing Chart.js
  reportChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Pending', 'Active', 'Solved/Returned', 'Closed', 'Rejected'],
      datasets: [{
        label: 'Reports Count',
        data: [stats.pending, stats.active, stats.solved, stats.closed, stats.rejected],
        backgroundColor: [
          '#fbbf24', // Amber
          '#10b981', // Emerald
          '#3b82f6', // Blue
          '#64748b', // Slate
          '#f43f5e'  // Rose
        ],
        borderWidth: 0,
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: 'Reports Status Summary Breakdown',
          color: labelColor,
          font: { family: 'Plus Jakarta Sans', size: 14, weight: 'bold' }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: labelColor, stepSize: 1 },
          grid: { color: gridColor }
        },
        x: {
          ticks: { color: labelColor },
          grid: { display: false }
        }
      }
    }
  });
}

/**
 * Load Activity Log Feed
 */
async function loadActivityLogs() {
  const container = document.getElementById('activity-feed-container');
  if (!container) return;

  try {
    const q = query(collection(db, "activityLogs"), orderBy("timestamp", "desc"), limit(10));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.size === 0) {
      container.innerHTML = `<p class="text-muted text-center my-3">No activity logs recorded.</p>`;
      return;
    }

    container.innerHTML = '';
    querySnapshot.forEach(docSnapshot => {
      const log = docSnapshot.data();
      const timeStr = timeAgo(log.timestamp);
      
      let styleClass = '';
      if (log.actionType.includes('ban') || log.actionType.includes('reject') || log.actionType.includes('delete')) {
        styleClass = 'danger';
      } else if (log.actionType.includes('suspend') || log.actionType.includes('close')) {
        styleClass = 'warning';
      }

      const logItem = document.createElement('div');
      logItem.className = `activity-feed-item ${styleClass} mb-4 animate-fade-in`;
      logItem.innerHTML = `
        <div class="d-flex justify-content-between mb-1">
          <strong class="text-main text-capitalize">${log.actionType.replace('_', ' ')}</strong>
          <span class="text-muted small">${timeStr}</span>
        </div>
        <p class="text-muted small mb-0">${log.description}</p>
        <span class="text-muted" style="font-size:0.75rem;">By ${log.userName} (${log.userRole})</span>
      `;
      container.appendChild(logItem);
    });
  } catch (err) {
    console.error("Error loading activity logs: ", err);
  }
}

/**
 * Load reports for approval/denial queue
 */
async function loadModerationQueue() {
  const container = document.getElementById('moderation-queue-table');
  if (!container) return;

  try {
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.size === 0) {
      container.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No reports found in the system.</td></tr>`;
      return;
    }

    container.innerHTML = '';
    querySnapshot.forEach(docSnap => {
      const report = docSnap.data();
      report.id = docSnap.id;

      let statusBadge = 'status-pending';
      if (report.status === 'active') statusBadge = 'status-active';
      else if (report.status === 'claimed' || report.status === 'returned') statusBadge = 'status-claimed';
      else if (report.status === 'closed') statusBadge = 'status-closed';
      else if (report.status === 'rejected') statusBadge = 'status-rejected';

      const row = document.createElement('tr');
      row.className = 'align-middle animate-fade-in';
      row.innerHTML = `
        <td>
          <img src="${report.photos?.[0] || 'https://via.placeholder.com/50'}" alt="${report.itemName}" class="rounded" width="45" height="45" style="object-fit:cover;">
        </td>
        <td>
          <div class="fw-bold text-main">${report.itemName}</div>
          <span class="badge ${report.type === 'lost' ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success'} text-uppercase" style="font-size:0.65rem;">${report.type}</span>
        </td>
        <td><span class="text-muted small">${report.category}</span></td>
        <td><span class="text-muted small">${formatDate(report.date)}</span></td>
        <td><span class="status-badge ${statusBadge}">${report.status}</span></td>
        <td>
          <div class="text-main small">${report.reporterName}</div>
          <div class="text-muted" style="font-size:0.75rem;">${report.reporterEmail}</div>
        </td>
        <td>
          <div class="d-flex gap-1">
            <a href="report-details.html?id=${report.id}" class="btn btn-sm btn-outline-secondary" title="View details"><i class="bi bi-eye"></i></a>
            
            ${report.status === 'pending' ? `
              <button class="btn btn-sm btn-success btn-approve" data-id="${report.id}" data-uid="${report.reporterId}" data-name="${report.itemName}"><i class="bi bi-check-circle"></i></button>
              <button class="btn btn-sm btn-warning btn-reject" data-id="${report.id}" data-uid="${report.reporterId}" data-name="${report.itemName}"><i class="bi bi-x-circle"></i></button>
            ` : ''}
            
            <button class="btn btn-sm btn-danger btn-delete-report" data-id="${report.id}" data-name="${report.itemName}"><i class="bi bi-trash"></i></button>
          </div>
        </td>
      `;

      container.appendChild(row);
    });

    // Attach Event Listeners to Moderate elements
    container.querySelectorAll('.btn-approve').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const uid = e.currentTarget.getAttribute('data-uid');
        const name = e.currentTarget.getAttribute('data-name');
        approveReport(id, uid, name);
      });
    });

    container.querySelectorAll('.btn-reject').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const uid = e.currentTarget.getAttribute('data-uid');
        const name = e.currentTarget.getAttribute('data-name');
        rejectReport(id, uid, name);
      });
    });

    container.querySelectorAll('.btn-delete-report').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const name = e.currentTarget.getAttribute('data-name');
        deleteReport(id, name);
      });
    });

  } catch (err) {
    console.error("Error loading moderation reports: ", err);
    container.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Failed to load system reports.</td></tr>`;
  }
}

/**
 * Load System Users Accounts List
 */
async function loadUserAccounts() {
  const container = document.getElementById('users-table');
  if (!container) return;

  try {
    const querySnapshot = await getDocs(collection(db, "users"));
    
    if (querySnapshot.size === 0) {
      container.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No users registered in system.</td></tr>`;
      return;
    }

    container.innerHTML = '';
    querySnapshot.forEach(docSnap => {
      const user = docSnap.data();
      user.id = docSnap.id;

      let statusBadge = 'status-active';
      if (user.status === 'suspended') statusBadge = 'status-pending';
      else if (user.status === 'banned') statusBadge = 'status-rejected';

      const row = document.createElement('tr');
      row.className = 'align-middle animate-fade-in';
      row.innerHTML = `
        <td>
          <img src="${user.photoURL || 'https://via.placeholder.com/40'}" alt="${user.displayName}" class="rounded-circle border" width="40" height="40">
        </td>
        <td>
          <div class="fw-bold text-main">${user.displayName}</div>
          <span class="text-muted small" style="font-size:0.75rem;">UID: ${user.uid}</span>
        </td>
        <td><span class="text-main small">${user.email}</span></td>
        <td>
          <span class="badge ${user.role === 'admin' ? 'bg-warning text-dark' : 'bg-secondary text-light'} text-capitalize" style="font-size:0.75rem;">${user.role}</span>
        </td>
        <td><span class="status-badge ${statusBadge}">${user.status}</span></td>
        <td>
          <div class="d-flex gap-1">
            ${user.role !== 'admin' ? `
              ${user.status === 'active' ? `
                <button class="btn btn-sm btn-outline-warning btn-suspend-user" data-id="${user.uid}" data-name="${user.displayName}" title="Suspend User"><i class="bi bi-slash-circle"></i></button>
                <button class="btn btn-sm btn-danger btn-ban-user" data-id="${user.uid}" data-name="${user.displayName}" title="Ban User"><i class="bi bi-x-octagon"></i></button>
              ` : `
                <button class="btn btn-sm btn-success btn-restore-user" data-id="${user.uid}" data-name="${user.displayName}" title="Restore User"><i class="bi bi-arrow-counterclockwise"></i> Restore</button>
              `}
            ` : '<span class="text-muted small">Cannot Moderate Admin</span>'}
          </div>
        </td>
      `;

      container.appendChild(row);
    });

    // Attach actions
    container.querySelectorAll('.btn-suspend-user').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uid = e.currentTarget.getAttribute('data-id');
        const name = e.currentTarget.getAttribute('data-name');
        updateUserStatus(uid, name, 'suspended');
      });
    });

    container.querySelectorAll('.btn-ban-user').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uid = e.currentTarget.getAttribute('data-id');
        const name = e.currentTarget.getAttribute('data-name');
        updateUserStatus(uid, name, 'banned');
      });
    });

    container.querySelectorAll('.btn-restore-user').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uid = e.currentTarget.getAttribute('data-id');
        const name = e.currentTarget.getAttribute('data-name');
        updateUserStatus(uid, name, 'active');
      });
    });

  } catch (err) {
    console.error("Error loading users: ", err);
    container.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Failed to load system users.</td></tr>`;
  }
}

/* ==========================================================================
   MODERATION ACTION WRAPPERS
   ========================================================================== */

async function approveReport(reportId, reporterId, itemName) {
  showLoader();
  try {
    // 1. Update Report status
    await updateDoc(doc(db, "reports", reportId), {
      status: "active",
      updatedAt: new Date()
    });

    // 2. Alert creator
    await createNotification(
      reporterId,
      "Report Approved!",
      `Your report for "${itemName}" has been approved and is now active.`,
      `report-details.html?id=${reportId}`
    );

    // 3. Log System Action
    await logActivity("approve_report", `Approved report: ${itemName} (${reportId})`);
    
    showToast(`Report "${itemName}" approved.`, "success");
    await initAdminDashboard(); // Reload data
  } catch (err) {
    showToast(err.message, "danger");
  } finally {
    hideLoader();
  }
}

async function rejectReport(reportId, reporterId, itemName) {
  const reason = prompt("Please provide a reason for rejecting this report (notified to reporter):");
  if (reason === null) return; // Cancelled

  showLoader();
  try {
    // 1. Update Report status
    await updateDoc(doc(db, "reports", reportId), {
      status: "rejected",
      updatedAt: new Date()
    });

    // 2. Alert creator
    await createNotification(
      reporterId,
      "Report Rejected",
      `Your report for "${itemName}" was rejected. Reason: ${reason || 'Inappropriate content or insufficient data'}`,
      "dashboard.html"
    );

    // 3. Log System Action
    await logActivity("reject_report", `Rejected report: ${itemName} (${reportId}). Reason: ${reason}`);

    showToast(`Report "${itemName}" rejected.`, "warning");
    await initAdminDashboard(); // Reload data
  } catch (err) {
    showToast(err.message, "danger");
  } finally {
    hideLoader();
  }
}

async function deleteReport(reportId, itemName) {
  if (confirm(`CRITICAL: Are you sure you want to permanently delete "${itemName}"? This will physically erase the report document and all storage photos. This cannot be undone.`)) {
    showLoader();
    try {
      const docRef = doc(db, "reports", reportId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const report = docSnap.data();
        
        // 1. Delete associated images from Firebase Storage if they are hosted URLs
        if (report.photos && report.photos.length > 0) {
          for (const url of report.photos) {
            if (url && url.startsWith('http')) {
              try {
                // Parse photo filename from URL to delete it
                // Firebase URLs contain name segments that can be decoded, or delete via exact reference
                const photoRef = ref(storage, url);
                await deleteObject(photoRef);
              } catch (err) {
                console.warn("Storage deletion warning (might already be deleted or outside bucket):", err);
              }
            }
          }
        }

        // 2. Delete Firestore Document
        await deleteDoc(docRef);

        // 3. Alert creator
        await createNotification(
          report.reporterId,
          "Report Deleted",
          `Your report for "${itemName}" was removed by an administrator.`,
          "dashboard.html"
        );

        // 4. Log System Action
        await logActivity("delete_report", `Deleted report: ${itemName} (${reportId})`);

        showToast(`Report "${itemName}" has been permanently deleted.`, "success");
        await initAdminDashboard(); // Reload data
      }
    } catch (err) {
      showToast(err.message, "danger");
    } finally {
      hideLoader();
    }
  }
}

async function updateUserStatus(userId, userName, newStatus) {
  const confirmMsg = newStatus === 'active' 
    ? `Are you sure you want to restore "${userName}" to active status?`
    : `Are you sure you want to change "${userName}" status to ${newStatus}? They will be kicked out of their session.`;

  if (confirm(confirmMsg)) {
    showLoader();
    try {
      // Update User Document
      await updateDoc(doc(db, "users", userId), {
        status: newStatus,
        updatedAt: new Date()
      });

      // Log activity
      await logActivity(`${newStatus}_user`, `Set user ${userName} status to ${newStatus} (${userId})`);

      showToast(`User "${userName}" is now ${newStatus}.`, "success");
      await initAdminDashboard(); // Reload dashboard
    } catch (err) {
      showToast(err.message, "danger");
    } finally {
      hideLoader();
    }
  }
}
