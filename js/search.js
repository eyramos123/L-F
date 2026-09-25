/**
 * ==========================================================================
 * LOST & FOUND SYSTEM - SEARCH ENGINE
 * Advanced Multi-field Query Filtering, Pagination, and Autocomplete Suggestions
 * ==========================================================================
 */

import { db, collection, query, where, getDocs, orderBy } from "./firebase.js";

// Default Fallback Showcase Reports for Public Preview if Firestore rules block unauthenticated read in Cloud Console
const FALLBACK_SHOWCASE_REPORTS = [
  {
    id: "showcase-1",
    itemName: "iPhone 15 Pro Max (Natural Titanium)",
    type: "lost",
    category: "Electronics",
    status: "active",
    location: "Central Library 2nd Floor Study Nook",
    date: "2026-09-24",
    description: "Lost an iPhone 15 Pro Max in a clear MagSafe case with a blue sticker on the back. Dropped near table #12.",
    photos: ["https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80"],
    createdAt: new Date(Date.now() - 3600000 * 5)
  },
  {
    id: "showcase-2",
    itemName: "Black Leather Tri-fold Wallet",
    type: "found",
    category: "Wallets & Purses",
    status: "active",
    location: "Student Union Cafeteria Booth",
    date: "2026-09-25",
    description: "Found a black leather wallet containing a transit card and student identity card. Turned over to desk.",
    photos: ["https://images.unsplash.com/photo-1627123424574-724758594e93?w=600&auto=format&fit=crop&q=80"],
    createdAt: new Date(Date.now() - 3600000 * 2)
  },
  {
    id: "showcase-3",
    itemName: "Sony WH-1000XM5 Headphones",
    type: "found",
    category: "Electronics",
    status: "claimed",
    location: "Engineering Quad Bench",
    date: "2026-09-23",
    description: "Silver Sony noise-canceling headphones inside grey zipper travel case.",
    photos: ["https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&auto=format&fit=crop&q=80"],
    createdAt: new Date(Date.now() - 3600000 * 24)
  },
  {
    id: "showcase-4",
    itemName: "Brass Keychain & Smart Car FOB",
    type: "lost",
    category: "Keys & Badges",
    status: "active",
    location: "Science Complex Parking Lot B",
    date: "2026-09-25",
    description: "Set of house keys with a brass bottle opener and red car remote fob.",
    photos: ["https://images.unsplash.com/photo-1582142407894-ec85a1260aee?w=600&auto=format&fit=crop&q=80"],
    createdAt: new Date(Date.now() - 3600000 * 8)
  }
];

/**
 * Fetch all reports eligible for public search (approved and active/claimed/returned/closed)
 * Admin can search everything (handled separately or by passing admin status)
 */
export async function fetchSearchableReports(includePending = false) {
  try {
    const reportsRef = collection(db, "reports");
    let querySnapshot;

    try {
      const q = query(reportsRef, orderBy("createdAt", "desc"));
      querySnapshot = await getDocs(q);
    } catch (qErr) {
      console.warn("Ordered query failed, falling back to basic collection fetch:", qErr);
      querySnapshot = await getDocs(reportsRef);
    }

    const reports = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      data.id = doc.id;
      
      // Public view exclusion for pending and rejected reports
      if (includePending || (data.status !== 'pending' && data.status !== 'rejected')) {
        reports.push(data);
      }
    });

    if (reports.length === 0 && !includePending) {
      return FALLBACK_SHOWCASE_REPORTS;
    }

    return reports;
  } catch (err) {
    console.warn("Firestore public fetch restricted, displaying showcase fallback reports:", err);
    return FALLBACK_SHOWCASE_REPORTS;
  }
}

/**
 * Advanced Client-Side Search and Filter Engine
 * 
 * @param {Array} reports - The list of reports to search within
 * @param {Object} criteria - Search parameters
 * @param {string} criteria.keyword - Text match (item name, description, brand, color, location)
 * @param {string} criteria.category - Category filter
 * @param {string} criteria.type - Item type ('lost' | 'found')
 * @param {string} criteria.status - Status filter ('active' | 'claimed' | 'returned' | 'closed')
 * @param {string} criteria.location - Location specific filter
 * @param {string} criteria.date - Precise Date filter (YYYY-MM-DD)
 * @param {string} criteria.color - Color match
 * @param {string} criteria.brand - Brand match
 * @param {string} criteria.sortBy - Sort order ('newest' | 'oldest')
 */
export function searchAndFilterReports(reports, criteria) {
  let results = [...reports];

  // 1. Text Keyword Filter (matches item name, description, brand, color, location)
  if (criteria.keyword && criteria.keyword.trim() !== '') {
    const kw = criteria.keyword.toLowerCase().trim();
    results = results.filter(report => {
      return (
        (report.itemName && report.itemName.toLowerCase().includes(kw)) ||
        (report.description && report.description.toLowerCase().includes(kw)) ||
        (report.brand && report.brand.toLowerCase().includes(kw)) ||
        (report.color && report.color.toLowerCase().includes(kw)) ||
        (report.location && report.location.toLowerCase().includes(kw))
      );
    });
  }

  // 2. Category Filter
  if (criteria.category && criteria.category !== 'all') {
    results = results.filter(report => report.category === criteria.category);
  }

  // 3. Type Filter ('lost' or 'found')
  if (criteria.type && criteria.type !== 'all') {
    results = results.filter(report => report.type === criteria.type);
  }

  // 4. Status Filter
  if (criteria.status && criteria.status !== 'all') {
    results = results.filter(report => report.status === criteria.status);
  }

  // 5. Location Filter (specific text match)
  if (criteria.location && criteria.location.trim() !== '') {
    const loc = criteria.location.toLowerCase().trim();
    results = results.filter(report => report.location && report.location.toLowerCase().includes(loc));
  }

  // 6. Color Filter (specific text match)
  if (criteria.color && criteria.color.trim() !== '') {
    const col = criteria.color.toLowerCase().trim();
    results = results.filter(report => report.color && report.color.toLowerCase().includes(col));
  }

  // 7. Brand Filter (specific text match)
  if (criteria.brand && criteria.brand.trim() !== '') {
    const br = criteria.brand.toLowerCase().trim();
    results = results.filter(report => report.brand && report.brand.toLowerCase().includes(br));
  }

  // 8. Date Filter
  if (criteria.date && criteria.date !== '') {
    results = results.filter(report => report.date === criteria.date);
  }

  // 9. Sorting
  if (criteria.sortBy === 'oldest') {
    results.sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return dateA - dateB;
    });
  } else {
    // Default: newest
    results.sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return dateB - dateA;
    });
  }

  return results;
}

/**
 * Attaches Live Search Autocomplete Suggestions to an input field
 * 
 * @param {HTMLInputElement} inputEl - The input element to monitor
 * @param {HTMLElement} suggestionContainerEl - The wrapper where suggestions list is injected
 * @param {Array} reports - The master list of reports to scan
 * @param {Function} onSelectCallback - Event fired when a suggestion is clicked
 */
export function setupSearchSuggestions(inputEl, suggestionContainerEl, reports, onSelectCallback) {
  if (!inputEl || !suggestionContainerEl) return;

  // Clear suggestions on document click outside
  document.addEventListener('click', (e) => {
    if (e.target !== inputEl && e.target !== suggestionContainerEl) {
      suggestionContainerEl.style.display = 'none';
    }
  });

  inputEl.addEventListener('input', () => {
    const val = inputEl.value.trim().toLowerCase();
    suggestionContainerEl.innerHTML = '';
    
    if (val.length < 2) {
      suggestionContainerEl.style.display = 'none';
      return;
    }

    // Extract unique titles matching the criteria
    const matches = new Set();
    reports.forEach(report => {
      if (report.itemName && report.itemName.toLowerCase().includes(val)) {
        matches.add(report.itemName);
      }
      if (report.brand && report.brand.toLowerCase().includes(val)) {
        matches.add(report.brand);
      }
      if (report.category && report.category.toLowerCase().includes(val)) {
        matches.add(report.category);
      }
    });

    const suggestions = Array.from(matches).slice(0, 6); // Limit suggestions

    if (suggestions.length === 0) {
      suggestionContainerEl.style.display = 'none';
      return;
    }

    suggestions.forEach(item => {
      const suggItem = document.createElement('div');
      suggItem.className = 'search-suggestion-item';
      suggItem.textContent = item;
      
      suggItem.addEventListener('click', () => {
        inputEl.value = item;
        suggestionContainerEl.style.display = 'none';
        if (onSelectCallback) onSelectCallback(item);
      });

      suggestionContainerEl.appendChild(suggItem);
    });

    suggestionContainerEl.style.display = 'block';
  });
}
