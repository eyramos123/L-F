/**
 * ==========================================================================
 * LOST & FOUND SYSTEM - REPORTS MODULE
 * Report Creation, Form Validations, Multi-image Uploads, Details Rendering, & Messages
 * ==========================================================================
 */

import { 
  db, 
  storage, 
  collection, 
  doc, 
  getDoc, 
  addDoc, 
  setDoc,
  updateDoc, 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  increment,
  auth
} from "./firebase.js";
import { 
  showToast, 
  showLoader, 
  hideLoader, 
  formatDate, 
  formatTime, 
  createNotification, 
  isBookmarked, 
  toggleBookmark,
  logActivity 
} from "./utils.js";

// Temp storage for files selected in form prior to submission
let selectedFiles = [];

/**
 * Initialize Multi-Image Preview Component for Forms
 * @param {HTMLInputElement} fileInputEl - The hidden file input
 * @param {HTMLElement} dropZoneEl - The drag/drop visual trigger
 * @param {HTMLElement} previewContainerEl - Grid to display image previews
 */
export function initImageUploadPreview(fileInputEl, dropZoneEl, previewContainerEl) {
  if (!fileInputEl || !dropZoneEl || !previewContainerEl) return;

  selectedFiles = []; // Reset local state

  // Click on dropzone triggers input click
  dropZoneEl.addEventListener('click', () => fileInputEl.click());

  // Drag and Drop Events
  dropZoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZoneEl.classList.add('border-primary');
  });

  dropZoneEl.addEventListener('dragleave', () => {
    dropZoneEl.classList.remove('border-primary');
  });

  dropZoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZoneEl.classList.remove('border-primary');
    handleFileSelection(e.dataTransfer.files, previewContainerEl);
  });

  // Manual File Selection
  fileInputEl.addEventListener('change', () => {
    handleFileSelection(fileInputEl.files, previewContainerEl);
  });
}

function handleFileSelection(files, previewContainerEl) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast("Only image files are allowed.", "danger");
      continue;
    }
    
    // Validate size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      showToast(`${file.name} is too large (maximum size is 5MB).`, "danger");
      continue;
    }

    selectedFiles.push(file);
    renderPreviews(previewContainerEl);
  }
}

function renderPreviews(previewContainerEl) {
  previewContainerEl.innerHTML = '';
  
  selectedFiles.forEach((file, index) => {
    const reader = new FileReader();
    const previewCard = document.createElement('div');
    previewCard.className = 'preview-card animate-fade-in';
    
    reader.onload = (e) => {
      previewCard.innerHTML = `
        <img src="${e.target.result}" alt="Preview thumbnail">
        <button type="button" class="remove-btn" data-index="${index}">&times;</button>
      `;
      
      // Attach remove trigger
      previewCard.querySelector('.remove-btn').addEventListener('click', (ev) => {
        const idxToRemove = parseInt(ev.target.getAttribute('data-index'));
        selectedFiles.splice(idxToRemove, 1);
        renderPreviews(previewContainerEl);
      });
    };
    
    reader.readAsDataURL(file);
    previewContainerEl.appendChild(previewCard);
  });
}

/**
 * Handle Lost/Found Report Form Submission
 * @param {HTMLFormElement} formEl - The submission form
 * @param {string} type - Report type ('lost' | 'found')
 */
export async function handleReportSubmission(formEl, type) {
  const user = auth.currentUser;
  if (!user) {
    showToast("You must be logged in to submit reports.", "danger");
    return;
  }

  // Get Form Fields
  const formData = new FormData(formEl);
  const itemName = formData.get('itemName')?.trim();
  const category = formData.get('category');
  const description = formData.get('description')?.trim();
  const color = formData.get('color')?.trim();
  const brand = formData.get('brand')?.trim();
  const date = formData.get('date');
  const time = formData.get('time');
  const location = formData.get('location')?.trim();
  const googleMapsLink = formData.get('googleMapsLink')?.trim();
  const instructions = formData.get('instructions')?.trim();
  const contactNumber = formData.get('contactNumber')?.trim();
  const reward = formData.get('reward') ? parseFloat(formData.get('reward')) : null;

  // Basic validations
  if (!itemName || !category || !description || !date || !time || !location || !contactNumber) {
    showToast("Please fill in all required fields.", "warning");
    return;
  }

  if (type === 'found' && !googleMapsLink) {
    showToast("Google Maps location link is required for found items.", "warning");
    return;
  }

  if (googleMapsLink && !googleMapsLink.startsWith('http')) {
    showToast("Please enter a valid Google Maps HTTP/HTTPS URL.", "warning");
    return;
  }

  if (selectedFiles.length === 0) {
    showToast("Please upload at least one photo of the item.", "warning");
    return;
  }

  showLoader();
  
  // Disable submit buttons to prevent duplicate entries
  const submitBtn = formEl.querySelector('[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    // 1. Create Firestore Document ID first (to reference in Storage path)
    const reportRef = doc(collection(db, "reports"));
    const reportId = reportRef.id;

    // 2. Upload images in parallel
    const photoUrls = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const filename = `${Date.now()}_${i}_${file.name}`;
      const storageRef = ref(storage, `reports/${reportId}/${filename}`);
      
      const uploadResult = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(uploadResult.ref);
      photoUrls.push(downloadUrl);
    }

    // 3. Assemble document payload
    const payload = {
      id: reportId,
      reporterId: user.uid,
      reporterName: user.displayName,
      reporterEmail: user.email,
      reporterPhoto: user.photoURL,
      type: type,
      itemName: itemName,
      category: category,
      description: description,
      color: color || "N/A",
      brand: brand || "N/A",
      date: date,
      time: time,
      location: location,
      googleMapsLink: googleMapsLink || "",
      instructions: instructions || "",
      contactNumber: contactNumber,
      reward: type === 'lost' ? (reward || 0) : 0,
      photos: photoUrls,
      status: "pending", // All new items require Admin approval first
      views: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // 4. Write document to Cloud Firestore
    await setDoc(reportRef, payload);
    
    // Log user activity
    await logActivity("create_report", `Reported ${type} item: ${itemName} (${reportId})`);

    showToast("Report submitted successfully! Waiting for admin approval.", "success");
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 2000);
  } catch (err) {
    console.error("Submission failed: ", err);
    showToast(`Failed to submit report: ${err.message}`, "danger");
    if (submitBtn) submitBtn.disabled = false;
  } finally {
    hideLoader();
  }
}

/**
 * Fetches and renders the details of a single report on report-details.html
 * @param {string} reportId - The unique document ID
 */
export async function loadReportDetails(reportId) {
  if (!reportId) {
    showToast("Invalid Report ID.", "danger");
    return;
  }

  showLoader();
  try {
    const reportDocRef = doc(db, "reports", reportId);
    const reportSnap = await getDoc(reportDocRef);

    if (!reportSnap.exists()) {
      document.getElementById('details-container').innerHTML = `
        <div class="alert alert-danger py-4 text-center">
          <i class="bi bi-exclamation-triangle-fill fs-3 mb-2 d-block"></i>
          <h4>Report Not Found</h4>
          <p class="mb-0">The requested lost or found report does not exist or has been removed.</p>
          <a href="index.html" class="btn btn-outline-primary mt-3">Back to Home</a>
        </div>
      `;
      hideLoader();
      return;
    }

    const report = reportSnap.data();
    
    // Log view increments if current user is not the owner
    const currentUser = auth.currentUser;
    if (currentUser && currentUser.uid !== report.reporterId) {
      await updateDoc(reportDocRef, { views: increment(1) });
    }

    // Render HTML details
    renderReportDetailsUI(report);
  } catch (err) {
    console.error("Error loading report details: ", err);
    showToast(err.message, "danger");
  } finally {
    hideLoader();
  }
}

function renderReportDetailsUI(report) {
  const container = document.getElementById('details-container');
  if (!container) return;

  const isTypeLost = report.type === 'lost';
  const typeBadgeClass = isTypeLost ? 'type-lost' : 'type-found';
  
  // Status Badge Rendering
  let statusBadgeClass = 'status-pending';
  if (report.status === 'active') statusBadgeClass = 'status-active';
  else if (report.status === 'claimed' || report.status === 'returned') statusBadgeClass = 'status-claimed';
  else if (report.status === 'closed') statusBadgeClass = 'status-closed';
  else if (report.status === 'rejected') statusBadgeClass = 'status-rejected';

  // Map Link rendering
  const mapLinkButton = report.googleMapsLink ? `
    <a href="${report.googleMapsLink}" target="_blank" class="btn btn-outline-success w-100 py-3 mb-3 btn-custom">
      <i class="bi bi-geo-alt-fill me-2"></i> Open Location in Google Maps
    </a>
  ` : '';

  // Instructions Header check
  const instructionsLabel = isTypeLost ? "Instructions for Finder" : "Instructions to Claim";
  
  // Reward details if exists
  const rewardSection = (isTypeLost && report.reward > 0) ? `
    <div class="p-3 mb-3 border border-warning rounded bg-warning-subtle text-dark d-flex align-items-center gap-3">
      <i class="bi bi-gift-fill fs-3 text-warning"></i>
      <div>
        <h6 class="mb-0 fw-bold">Offering Reward</h6>
        <span class="fs-4 fw-extrabold">$${report.reward}</span>
      </div>
    </div>
  ` : '';

  // Setup Image Gallery HTML
  let mainPhotoHTML = '';
  let thumbnailsHTML = '';
  
  if (report.photos && report.photos.length > 0) {
    mainPhotoHTML = `<img src="${report.photos[0]}" alt="${report.itemName}" class="img-fluid w-100 rounded-3" id="details-main-img" style="max-height: 450px; object-fit: contain; background: #000;">`;
    
    if (report.photos.length > 1) {
      thumbnailsHTML = `<div class="d-flex flex-wrap gap-2 mt-3">`;
      report.photos.forEach((photo, idx) => {
        const activeClass = idx === 0 ? 'active' : '';
        thumbnailsHTML += `<img src="${photo}" alt="Thumbnail ${idx}" class="details-thumb ${activeClass}" data-src="${photo}">`;
      });
      thumbnailsHTML += `</div>`;
    }
  } else {
    mainPhotoHTML = `<img src="https://via.placeholder.com/600x400?text=No+Photo+Uploaded" alt="No image" class="img-fluid w-100 rounded-3">`;
  }

  container.innerHTML = `
    <div class="row g-4 animate-slide-up">
      <!-- Media Gallery -->
      <div class="col-lg-6">
        <div class="glass-card p-3 h-100">
          <div class="position-relative">
            <span class="type-pill ${typeBadgeClass}">${report.type}</span>
            ${mainPhotoHTML}
          </div>
          ${thumbnailsHTML}
        </div>
      </div>
      
      <!-- Report Metadata -->
      <div class="col-lg-6">
        <div class="glass-card p-4 h-100 d-flex flex-column">
          <div class="d-flex justify-content-between align-items-start mb-3">
            <div>
              <span class="status-badge ${statusBadgeClass} mb-2">${report.status}</span>
              <h1 class="h2 text-main fw-extrabold mb-1">${report.itemName}</h1>
              <span class="text-muted"><i class="bi bi-tag-fill me-1"></i> ${report.category}</span>
            </div>
            
            <!-- Bookmark Toggle Button -->
            <button class="btn btn-outline-secondary btn-custom p-2" id="btn-bookmark" title="Bookmark report">
              <i class="bi bi-bookmark fs-5" id="bookmark-icon"></i>
            </button>
          </div>

          ${rewardSection}

          <!-- Details Grid -->
          <div class="row g-3 py-3 border-top border-bottom border-secondary border-opacity-10 mb-3">
            <div class="col-6">
              <span class="text-muted d-block small">Brand</span>
              <strong class="text-main">${report.brand}</strong>
            </div>
            <div class="col-6">
              <span class="text-muted d-block small">Color</span>
              <strong class="text-main">${report.color}</strong>
            </div>
            <div class="col-6">
              <span class="text-muted d-block small">Date ${isTypeLost ? 'Lost' : 'Found'}</span>
              <strong class="text-main">${formatDate(report.date)}</strong>
            </div>
            <div class="col-6">
              <span class="text-muted d-block small">Time ${isTypeLost ? 'Lost' : 'Found'}</span>
              <strong class="text-main">${formatTime(report.time)}</strong>
            </div>
            <div class="col-12">
              <span class="text-muted d-block small">Location</span>
              <strong class="text-main"><i class="bi bi-geo-alt"></i> ${report.location}</strong>
            </div>
          </div>

          <h5 class="fw-bold text-main">Description</h5>
          <p class="text-muted flex-grow-1">${report.description}</p>

          ${report.instructions ? `
            <h5 class="fw-bold text-main mt-2">${instructionsLabel}</h5>
            <p class="text-muted">${report.instructions}</p>
          ` : ''}

          <!-- Buttons and Actions -->
          <div class="mt-auto">
            ${mapLinkButton}
            
            <div class="row g-2">
              <div class="col-6">
                <button class="btn btn-custom btn-custom-outline w-100" id="btn-share">
                  <i class="bi bi-share-fill me-2"></i> Share Report
                </button>
              </div>
              <div class="col-6">
                <button class="btn btn-custom btn-danger w-100" id="btn-report-spam">
                  <i class="bi bi-flag-fill me-2"></i> Flag Report
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Reporter Information & Direct Message -->
      <div class="col-12 mt-4">
        <div class="glass-card p-4">
          <div class="row align-items-center g-4">
            <div class="col-md-5 border-end border-secondary border-opacity-10">
              <h5 class="fw-bold text-main mb-3">Reporter Profile</h5>
              <div class="d-flex align-items-center gap-3">
                <img src="${report.reporterPhoto || 'https://via.placeholder.com/60'}" alt="Reporter avatar" class="rounded-circle border" width="60" height="60">
                <div>
                  <h6 class="mb-1 text-main fw-bold">${report.reporterName}</h6>
                  <span class="text-muted d-block small mb-1"><i class="bi bi-envelope-fill me-1"></i> ${report.reporterEmail}</span>
                  <span class="text-muted d-block small"><i class="bi bi-telephone-fill me-1"></i> ${report.contactNumber}</span>
                </div>
              </div>
            </div>
            
            <div class="col-md-7">
              <h5 class="fw-bold text-main mb-3">Send a Direct Message</h5>
              <form id="details-contact-form">
                <div class="input-group">
                  <textarea class="form-control" placeholder="Write a message to contact the reporter..." rows="2" id="contact-message-text" required></textarea>
                  <button type="submit" class="btn btn-custom btn-custom-primary d-flex align-items-center justify-content-center px-4" id="btn-send-message">
                    <i class="bi bi-send-fill fs-5"></i>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // 1. Gallery Thumbnail Switcher
  const thumbs = document.querySelectorAll('.details-thumb');
  const mainImg = document.getElementById('details-main-img');
  
  thumbs.forEach(thumb => {
    thumb.addEventListener('click', () => {
      thumbs.forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
      mainImg.src = thumb.getAttribute('data-src');
    });
  });

  // 2. Initialize Bookmark UI State
  const bookmarkIcon = document.getElementById('bookmark-icon');
  const bookmarkBtn = document.getElementById('btn-bookmark');
  
  isBookmarked(report.id).then(status => {
    if (status) {
      bookmarkIcon.className = 'bi bi-bookmark-fill text-warning fs-5';
    }
  });

  // Bookmark Toggle action
  bookmarkBtn.addEventListener('click', async () => {
    const isAdded = await toggleBookmark(report.id);
    bookmarkIcon.className = isAdded ? 'bi bi-bookmark-fill text-warning fs-5' : 'bi bi-bookmark fs-5';
  });

  // 3. Share Button Handler
  document.getElementById('btn-share').addEventListener('click', () => {
    const shareUrl = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: `TraceBack - ${report.itemName}`,
        text: `Check out this report for the ${report.type} ${report.itemName}: ${report.description}`,
        url: shareUrl
      }).catch(err => console.error("Error sharing: ", err));
    } else {
      navigator.clipboard.writeText(shareUrl)
        .then(() => showToast("Report URL copied to clipboard!", "success"))
        .catch(() => showToast("Failed to copy URL.", "danger"));
    }
  });

  // 4. Report spam / Flag Handler
  document.getElementById('btn-report-spam').addEventListener('click', async () => {
    if (!auth.currentUser) {
      showToast("Please log in to report entries.", "warning");
      return;
    }
    
    if (confirm("Are you sure you want to flag this report as spam or inappropriate? An administrator will review it.")) {
      showLoader();
      try {
        await createNotification(
          "system-admin", 
          `Spam Flag: ${report.itemName}`, 
          `Report ID: ${report.id} has been flagged by ${auth.currentUser.displayName}`, 
          `admin.html`
        );
        showToast("Report has been flagged. Thank you for keeping TraceBack safe.", "success");
      } catch (err) {
        showToast(err.message, "danger");
      } finally {
        hideLoader();
      }
    }
  });

  // 5. Message Submission Handler
  const contactForm = document.getElementById('details-contact-form');
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      showToast("Please log in to send messages.", "warning");
      return;
    }

    if (user.uid === report.reporterId) {
      showToast("You cannot message yourself.", "warning");
      return;
    }

    const messageText = document.getElementById('contact-message-text').value.trim();
    if (!messageText) return;

    showLoader();
    try {
      // Create message document
      await addDoc(collection(db, "messages"), {
        reportId: report.id,
        senderId: user.uid,
        senderName: user.displayName,
        receiverId: report.reporterId,
        messageText: messageText,
        createdAt: new Date()
      });

      // Send alert notification to the reporter
      await createNotification(
        report.reporterId,
        `New Message: ${report.itemName}`,
        `${user.displayName} sent a message: "${messageText.substring(0, 40)}${messageText.length > 40 ? '...' : ''}"`,
        `report-details.html?id=${report.id}`
      );

      showToast("Message sent successfully! The reporter has been notified.", "success");
      document.getElementById('contact-message-text').value = '';
    } catch (err) {
      showToast(err.message, "danger");
    } finally {
      hideLoader();
    }
  });
}
