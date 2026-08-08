/**
 * ==========================================================================
 * LOST & FOUND SYSTEM - REPORTS MODULE
 * Report Creation, Form Validations, Multi-image Uploads, Details Rendering, & Messages
 * ==========================================================================
 */

import { 
  db, 
  collection, 
  doc, 
  getDoc, 
  addDoc, 
  setDoc,
  updateDoc, 
  increment,
  auth,
  query,
  where,
  orderBy,
  getDocs
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
  logActivity,
  compressImage
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
    console.log("--- Starting Report Submission ---");
    console.log("User details:", { uid: user.uid, email: user.email, displayName: user.displayName });
    
    // 1. Create Firestore Document ID first (to reference in Storage path)
    const reportRef = doc(collection(db, "reports"));
    const reportId = reportRef.id;
    console.log("Generated report ID:", reportId);

    // 2. Compress and convert images to Base64
    const photoUrls = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      console.log(`Processing file ${i + 1}/${selectedFiles.length}: ${file.name} (original size: ${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      try {
        console.log(`Compressing ${file.name}...`);
        const compressedBase64 = await compressImage(file);
        console.log(`Successfully compressed ${file.name}. Base64 size: ${(compressedBase64.length / 1024).toFixed(2)} KB`);
        photoUrls.push(compressedBase64);
      } catch (compressErr) {
        console.error(`Error compressing image ${file.name}, using raw base64 fallback:`, compressErr);
        const base64Fallback = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result);
          reader.onerror = (err) => reject(err);
        });
        console.log(`Raw base64 fallback loaded. Size: ${(base64Fallback.length / 1024).toFixed(2)} KB`);
        photoUrls.push(base64Fallback);
      }
    }

    console.log("All photos ready. Count:", photoUrls.length);

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
    console.log("Writing payload to Cloud Firestore...", payload);
    await setDoc(reportRef, payload);
    console.log("Firestore write succeeded!");
    
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
    report.id = reportSnap.id;
    
    // Log view increments if current user is not the owner
    const currentUser = auth.currentUser;
    if (currentUser && currentUser.uid !== report.reporterId) {
      try {
        await updateDoc(reportDocRef, { views: increment(1) });
      } catch (viewErr) {
        console.warn("Could not increment views due to permissions/rules:", viewErr);
      }
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
      
      <!-- Reporter Information & Direct Message Chat -->
      <div class="col-12 mt-4" id="messaging-section-container">
        <!-- populated dynamically by renderMessagingSection -->
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

  // 5. Setup Direct Messaging Section
  renderMessagingSection(report);
}

// ==========================================================================
// MESSAGE / CHAT SYSTEM FOR REPORT DETAILS
// ==========================================================================
async function renderMessagingSection(report) {
  const container = document.getElementById('messaging-section-container');
  if (!container) return;

  const currentUser = auth.currentUser;
  if (!currentUser) {
    container.innerHTML = `
      <div class="glass-card p-4 text-center">
        <h5 class="fw-bold text-main mb-2">Direct Messages Center</h5>
        <p class="text-muted mb-3">Please log in to contact the reporter or view message logs.</p>
        <a href="login.html" class="btn btn-custom btn-custom-primary px-4"><i class="bi bi-shield-lock-fill me-2"></i> Log In to Access</a>
      </div>
    `;
    return;
  }

  const isOwner = currentUser.uid === report.reporterId;

  container.innerHTML = `
    <div class="glass-card p-4">
      <div class="text-center py-4 text-muted">
        <div class="spinner-border text-emerald mb-2" role="status"></div>
        <p class="mb-0">Loading messaging workspace...</p>
      </div>
    </div>
  `;

  try {
    // 1. Fetch related messages (merged queries for strict rules validation)
    const q1 = query(
      collection(db, "messages"),
      where("reportId", "==", report.id),
      where("senderId", "==", currentUser.uid)
    );
    const q2 = query(
      collection(db, "messages"),
      where("reportId", "==", report.id),
      where("receiverId", "==", currentUser.uid)
    );

    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

    const msgMap = new Map();
    snap1.forEach(doc => {
      const d = doc.data();
      d.id = doc.id;
      msgMap.set(d.id, d);
    });
    snap2.forEach(doc => {
      const d = doc.data();
      d.id = doc.id;
      msgMap.set(d.id, d);
    });

    const messages = Array.from(msgMap.values());
    messages.sort((a, b) => {
      const tA = a.createdAt?.seconds || 0;
      const tB = b.createdAt?.seconds || 0;
      return tA - tB;
    });

    if (isOwner) {
      // 2a. Reporter View: Group messages by the other participant
      const chats = {}; // userId -> { userName: string, messages: [] }
      messages.forEach(msg => {
        const otherId = msg.senderId === currentUser.uid ? msg.receiverId : msg.senderId;
        const otherName = msg.senderId === currentUser.uid ? (msg.receiverName || "Finder/Claimant") : msg.senderName;
        if (!chats[otherId]) {
          chats[otherId] = {
            userId: otherId,
            userName: otherName,
            messages: []
          };
        }
        chats[otherId].messages.push(msg);
      });

      const chatList = Object.values(chats);

      if (chatList.length === 0) {
        container.innerHTML = `
          <div class="glass-card p-4">
            <h5 class="fw-bold text-main mb-3">Direct Messages (Reporter Hub)</h5>
            <div class="text-center py-5 border border-dashed border-secondary border-opacity-15 rounded bg-body-tertiary">
              <i class="bi bi-chat-left-dots text-muted fs-2 mb-2 d-block"></i>
              <h6 class="text-main fw-bold">No Messages Received</h6>
              <p class="text-muted small mb-0 px-3">When finders or claimants message you about this item, they will appear here.</p>
            </div>
          </div>
        `;
        return;
      }

      // Read active conversation from sessionStorage, fallback to first active chat
      let activeUserId = sessionStorage.getItem(`active_chat_${report.id}`) || chatList[0].userId;
      if (!chats[activeUserId]) {
        activeUserId = chatList[0].userId;
      }
      sessionStorage.setItem(`active_chat_${report.id}`, activeUserId);

      const activeChat = chats[activeUserId];

      let conversationSidebarHTML = '';
      chatList.forEach(chat => {
        const isActive = chat.userId === activeUserId ? 'active' : '';
        const lastMsg = chat.messages[chat.messages.length - 1];
        const snippet = lastMsg ? (lastMsg.messageText.substring(0, 30) + (lastMsg.messageText.length > 30 ? '...' : '')) : '';
        conversationSidebarHTML += `
          <div class="conversation-item ${isActive}" data-user-id="${chat.userId}">
            <div class="rounded-circle bg-emerald text-white d-flex align-items-center justify-content-center border" style="width: 38px; height: 38px; font-weight: bold; flex-shrink: 0;">
              ${chat.userName.charAt(0).toUpperCase()}
            </div>
            <div class="overflow-hidden">
              <h6 class="mb-0 text-main small fw-bold">${chat.userName}</h6>
              <p class="text-muted mb-0 small text-truncate" style="font-size: 0.75rem;">${snippet}</p>
            </div>
          </div>
        `;
      });

      let chatHistoryHTML = '';
      activeChat.messages.forEach(msg => {
        const isSentByMe = msg.senderId === currentUser.uid;
        const bubbleClass = isSentByMe ? 'sent' : 'received';
        const metaClass = isSentByMe ? 'sent' : 'received';
        const timeStr = msg.createdAt ? formatChatTime(typeof msg.createdAt.toDate === 'function' ? msg.createdAt.toDate() : new Date(msg.createdAt)) : '';
        chatHistoryHTML += `
          <div class="chat-bubble ${bubbleClass}">
            <span class="d-block">${msg.messageText}</span>
            <span class="chat-meta ${metaClass}">${timeStr}</span>
          </div>
        `;
      });

      container.innerHTML = `
        <div class="glass-card p-4">
          <h5 class="fw-bold text-main mb-4"><i class="bi bi-chat-dots-fill text-emerald me-2"></i> Direct Messages Workspace</h5>
          <div class="row g-3">
            <div class="col-md-4">
              <h6 class="text-muted small fw-bold mb-2">Incoming Inquiries</h6>
              <div class="conversation-list">
                ${conversationSidebarHTML}
              </div>
            </div>
            <div class="col-md-8">
              <div class="chat-container">
                <div class="chat-header text-main fw-bold small d-flex align-items-center gap-2">
                  <div class="rounded-circle bg-emerald text-white d-flex align-items-center justify-content-center" style="width: 28px; height: 28px; font-size: 0.8rem; font-weight: bold;">
                    ${activeChat.userName.charAt(0).toUpperCase()}
                  </div>
                  <span>Chat with ${activeChat.userName}</span>
                </div>
                <div class="chat-history" id="chat-history-pane">
                  ${chatHistoryHTML}
                </div>
                <form class="chat-input-area" id="owner-reply-form">
                  <div class="input-group">
                    <input type="text" class="form-control form-control-sm" id="reply-message-text" placeholder="Type your reply..." required autocomplete="off">
                    <button type="submit" class="btn btn-custom btn-custom-primary btn-sm px-3 d-flex align-items-center justify-content-center">
                      <i class="bi bi-send-fill"></i>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      `;

      // Attach sidebar click handlers
      const sidebarItems = container.querySelectorAll('.conversation-item');
      sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
          const clickedUid = item.getAttribute('data-user-id');
          sessionStorage.setItem(`active_chat_${report.id}`, clickedUid);
          renderMessagingSection(report);
        });
      });

      // Scroll to bottom
      const pane = document.getElementById('chat-history-pane');
      if (pane) pane.scrollTop = pane.scrollHeight;

      // Handle reply submit
      const replyForm = document.getElementById('owner-reply-form');
      replyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const textEl = document.getElementById('reply-message-text');
        const text = textEl.value.trim();
        if (!text) return;

        showLoader();
        try {
          await addDoc(collection(db, "messages"), {
            reportId: report.id,
            senderId: currentUser.uid,
            senderName: currentUser.displayName,
            receiverId: activeChat.userId,
            receiverName: activeChat.userName,
            messageText: text,
            createdAt: new Date()
          });

          await createNotification(
            activeChat.userId,
            `Reply: ${report.itemName}`,
            `${currentUser.displayName} replied: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`,
            `report-details.html?id=${report.id}`
          );

          textEl.value = '';
          await renderMessagingSection(report);
        } catch (err) {
          showToast(err.message, "danger");
        } finally {
          hideLoader();
        }
      });

    } else {
      // 2b. Interested User View: Chat history with the reporter + Send message form
      let chatHistoryHTML = '';
      messages.forEach(msg => {
        const isSentByMe = msg.senderId === currentUser.uid;
        const bubbleClass = isSentByMe ? 'sent' : 'received';
        const metaClass = isSentByMe ? 'sent' : 'received';
        const timeStr = msg.createdAt ? formatChatTime(typeof msg.createdAt.toDate === 'function' ? msg.createdAt.toDate() : new Date(msg.createdAt)) : '';
        chatHistoryHTML += `
          <div class="chat-bubble ${bubbleClass}">
            <span class="d-block">${msg.messageText}</span>
            <span class="chat-meta ${metaClass}">${timeStr}</span>
          </div>
        `;
      });

      container.innerHTML = `
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
              <h5 class="fw-bold text-main mb-3">Direct Messaging</h5>
              <div class="chat-container">
                <div class="chat-header text-main fw-bold small d-flex align-items-center gap-2">
                  <div class="rounded-circle bg-emerald text-white d-flex align-items-center justify-content-center" style="width: 28px; height: 28px; font-size: 0.8rem; font-weight: bold;">
                    ${report.reporterName.charAt(0).toUpperCase()}
                  </div>
                  <span>Chat with ${report.reporterName}</span>
                </div>
                <div class="chat-history" id="chat-history-pane">
                  ${chatHistoryHTML.length > 0 ? chatHistoryHTML : `
                    <div class="text-center py-5 text-muted my-auto">
                      <i class="bi bi-chat-left-dots-fill text-muted fs-3 mb-2 d-block"></i>
                      <p class="small mb-0">No message history yet. Write a message below to contact the reporter.</p>
                    </div>
                  `}
                </div>
                <form class="chat-input-area" id="details-contact-form">
                  <div class="input-group">
                    <input type="text" class="form-control form-control-sm" id="contact-message-text" placeholder="Write a message to contact the reporter..." required autocomplete="off">
                    <button type="submit" class="btn btn-custom btn-custom-primary btn-sm px-3 d-flex align-items-center justify-content-center" id="btn-send-message">
                      <i class="bi bi-send-fill"></i>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      `;

      // Scroll to bottom
      const pane = document.getElementById('chat-history-pane');
      if (pane) pane.scrollTop = pane.scrollHeight;

      // Handle message submission
      const contactForm = document.getElementById('details-contact-form');
      contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const textEl = document.getElementById('contact-message-text');
        const text = textEl.value.trim();
        if (!text) return;

        showLoader();
        try {
          await addDoc(collection(db, "messages"), {
            reportId: report.id,
            senderId: currentUser.uid,
            senderName: currentUser.displayName,
            receiverId: report.reporterId,
            receiverName: report.reporterName,
            messageText: text,
            createdAt: new Date()
          });

          await createNotification(
            report.reporterId,
            `New Message: ${report.itemName}`,
            `${currentUser.displayName} sent a message: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`,
            `report-details.html?id=${report.id}`
          );

          textEl.value = '';
          await renderMessagingSection(report);
        } catch (err) {
          showToast(err.message, "danger");
        } finally {
          hideLoader();
        }
      });
    }

  } catch (err) {
    console.error("Error loading chat:", err);
    container.innerHTML = `
      <div class="glass-card p-4 text-center">
        <h5 class="fw-bold text-danger mb-2">Error Loading Chat</h5>
        <p class="text-muted mb-0">${err.message}</p>
      </div>
    `;
  }
}

function formatChatTime(date) {
  if (!date) return '';
  const d = (date instanceof Date) ? date : new Date(date);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
