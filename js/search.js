/**
 * ==========================================================================
 * LOST & FOUND SYSTEM - SEARCH ENGINE
 * Advanced Multi-field Query Filtering, Pagination, and Autocomplete Suggestions
 * ==========================================================================
 */

import { db, collection, query, where, getDocs, orderBy } from "./firebase.js";

/**
 * Fetch all reports eligible for public search (approved and active/claimed/returned/closed)
 * Admin can search everything (handled separately or by passing admin status)
 */
export async function fetchSearchableReports(includePending = false) {
  try {
    const reportsRef = collection(db, "reports");
    let q;

    if (includePending) {
      // Admins can see all reports
      q = query(reportsRef, orderBy("createdAt", "desc"));
    } else {
      // Public search can only search reports with status not equal to 'pending' or 'rejected'
      // Note: Since Firestore rules limit, public users can retrieve all non-pending reports.
      // We will perform the query and filter out 'pending' status records.
      q = query(reportsRef, orderBy("createdAt", "desc"));
    }

    const querySnapshot = await getDocs(q);
    const reports = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      data.id = doc.id;
      
      // Public view exclusion for pending reports
      if (includePending || data.status !== 'pending') {
        reports.push(data);
      }
    });

    return reports;
  } catch (err) {
    console.error("Error fetching searchable reports:", err);
    throw err;
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
