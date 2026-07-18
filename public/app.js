import { FEATURE_DIM, buildFeatureVector, MOVIE_GENRES_IDS } from './features.js';
import { identityMatrix, matVecMul, dotProduct, sherman_morrison_update, quadForm, vecAdd, vecScale } from './linalg.js';

// Global error logging for debugging
window.addEventListener('error', (e) => {
  console.error("SwipeFlix Runtime Error Captured: ", e.message, "at", e.filename, ":", e.lineno);
  if (typeof showToast === 'function') {
    showToast(`App Error: ${e.message}`, 'warning');
  }
});

// ==========================================
// CONFIGURATION (EMOJIS STRIPPED)
// ==========================================
const MOVIE_GENRES = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Science Fiction" },
  { id: 10770, name: "TV Movie" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
  { id: 37, name: "Western" }
];

const AVAILABLE_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'ja', name: 'Japanese' },
  { code: 'de', name: 'German' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'da', name: 'Danish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'pl', name: 'Polish' },
  { code: 'he', name: 'Hebrew' },
  { code: 'el', name: 'Greek' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ms', name: 'Malay' },
  { code: 'cs', name: 'Czech' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'ro', name: 'Romanian' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'hr', name: 'Croatian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'et', name: 'Estonian' },
  { code: 'lv', name: 'Latvian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'fa', name: 'Persian' },
  { code: 'ur', name: 'Urdu' },
  { code: 'bn', name: 'Bengali' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'te', name: 'Telugu' },
  { code: 'ta', name: 'Tamil' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'mr', name: 'Marathi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'ne', name: 'Nepali' },
  { code: 'si', name: 'Sinhala' },
  { code: 'my', name: 'Burmese' },
  { code: 'km', name: 'Khmer' },
  { code: 'lo', name: 'Lao' },
  { code: 'am', name: 'Amharic' },
  { code: 'sw', name: 'Swahili' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'zu', name: 'Zulu' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'cy', name: 'Welsh' },
  { code: 'ga', name: 'Irish' },
  { code: 'gd', name: 'Scottish Gaelic' },
  { code: 'la', name: 'Latin' },
  { code: 'is', name: 'Icelandic' },
  { code: 'gl', name: 'Galician' },
  { code: 'ca', name: 'Catalan' },
  { code: 'eu', name: 'Basque' }
];

// Default featured selections (first 5 of each)
const FEATURED_LANGUAGES = ['en', 'es', 'fr', 'ja', 'de'];
const FEATURED_GENRES = [28, 35, 18, 53, 10749]; // Action, Comedy, Drama, Thriller, Romance

const ALL_GENRES_LOOKUP = [
  ...MOVIE_GENRES,
  { id: 10759, name: "Action & Adventure" },
  { id: 10762, name: "Kids" },
  { id: 10763, name: "News" },
  { id: 10764, name: "Reality" },
  { id: 10765, name: "Sci-Fi & Fantasy" },
  { id: 10766, name: "Soap" },
  { id: 10767, name: "Talk" },
  { id: 10768, name: "War & Politics" }
];

// ==========================================
// APPLICATION STATE
// ==========================================
let state = {
  userSelectedLanguages: ['en'], // Multi-select, non-mandatory
  userSelectedGenreIds: [],      // Multi-select, non-mandatory
  viewStateStack: [],            // Ephemeral buffer: 10-15 cards
  discardList: [],               // Swiped left IDs
  likedArray: [],                // Swiped right movie objects
  banditModel: null,             // LinUCB model state
  currentPage: 1,
  totalPages: 1,
  isFetching: false,
  undoStack: [],                 // History for UNDO
  activeCardIndex: 0             // Top card tracker
};

// Pointer event variables for swipe tracking
let dragStart = null;
let currentCardEl = null;
let isDragging = false;

// Search modal state variables
let searchModalType = 'language'; // 'language' | 'genre'
let searchIsSettings = false;

// ==========================================
// DOM SELECTORS
// ==========================================
const onboardingScreen = document.getElementById('onboarding-screen');
const swipeScreen = document.getElementById('swipe-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const onboardingLangGrid = document.getElementById('onboarding-lang-grid');
const onboardingGenresGrid = document.getElementById('onboarding-genres-grid');
const settingsLangGrid = document.getElementById('settings-lang-grid');
const settingsGenresGrid = document.getElementById('settings-genres-grid');
const btnStartSwiping = document.getElementById('btn-start-swiping');
const cardStack = document.getElementById('card-stack');
const likesCount = document.getElementById('likes-count');
const btnUndo = document.getElementById('btn-undo');
const btnDiscard = document.getElementById('btn-discard');
const btnLike = document.getElementById('btn-like');
const btnEnd = document.getElementById('btn-end');
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const settingsModal = document.getElementById('settings-modal');
const toastContainer = document.getElementById('toast-container');
const detailsPanel = document.getElementById('details-panel');
const btnCloseDetails = document.getElementById('btn-close-details');

// Search Modal Selectors
const searchModal = document.getElementById('search-modal');
const searchModalTitle = document.getElementById('search-modal-title');
const searchInput = document.getElementById('search-input');
const searchResultsList = document.getElementById('search-results-list');
const btnCloseSearch = document.getElementById('btn-close-search');
const btnSaveSearch = document.getElementById('btn-save-search');

// Details elements
const detailTitle = document.getElementById('detail-title');
const detailYear = document.getElementById('detail-year');
const detailRating = document.getElementById('detail-rating');
const detailLang = document.getElementById('detail-lang');
const detailGenres = document.getElementById('detail-genres');
const detailSynopsis = document.getElementById('detail-synopsis');

// Overlays
const likeOverlay = document.querySelector('.like-overlay');
const discardOverlay = document.querySelector('.discard-overlay');


// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadPersistedPreferences();
  // If preferences weren't loaded, skip onboard loading (it loads by default since onboarding-screen is active)
  if (!swipeScreen.classList.contains('active')) {
    renderFeaturedGrid(onboardingLangGrid, 'language', false);
    renderFeaturedGrid(onboardingGenresGrid, 'genre', false);
  }
  setupEventListeners();
  setupPullToRefresh();
});

// Load preferences from localStorage (FR-1.3)
function loadPersistedPreferences() {
  const savedLangs = localStorage.getItem('swipeflix_langs');
  const savedGenres = localStorage.getItem('swipeflix_genres');

  if (savedLangs || savedGenres) {
    state.userSelectedLanguages = savedLangs ? JSON.parse(savedLangs) : [];
    state.userSelectedGenreIds = savedGenres ? JSON.parse(savedGenres) : [];

    initBanditModel();
    
    // Jump straight to swiping
    transitionToScreen(swipeScreen);
    startSession();
  }
}

// Populate Onboarding / Settings grids with featured items + custom selections (no emojis!)
function renderFeaturedGrid(container, type, isSettings) {
  if (!container) return;
  container.innerHTML = '';

  const isLang = type === 'language';
  const selectedList = isLang ? state.userSelectedLanguages : state.userSelectedGenreIds;
  const defaultFeatured = isLang ? FEATURED_LANGUAGES : FEATURED_GENRES;
  const allSource = isLang ? AVAILABLE_LANGUAGES : MOVIE_GENRES;
  const itemKey = isLang ? 'code' : 'id';

  // 1. Gather items to render (5 featured + any custom selected that aren't featured)
  const itemsToRender = [];
  
  // Add first 5 featured
  defaultFeatured.forEach(val => {
    const matched = allSource.find(item => item[itemKey] === val);
    if (matched) itemsToRender.push(matched);
  });

  // Add selected items that are not in featured
  selectedList.forEach(val => {
    if (!defaultFeatured.includes(val)) {
      const matched = allSource.find(item => item[itemKey] === val);
      if (matched && !itemsToRender.some(rendered => rendered[itemKey] === val)) {
        itemsToRender.push(matched);
      }
    }
  });

  // 2. Render each item
  itemsToRender.forEach(item => {
    const val = item[itemKey];
    const isActive = selectedList.includes(val);
    
    const btn = document.createElement('button');
    btn.className = `preference-btn ${isActive ? 'active' : ''}`;
    btn.textContent = item.name;
    
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      if (btn.classList.contains('active')) {
        if (!selectedList.includes(val)) {
          selectedList.push(val);
        }
      } else {
        const index = selectedList.indexOf(val);
        if (index > -1) {
          selectedList.splice(index, 1);
        }
        
        // If it's a custom-searched item and was deselected, re-render to clear it from the featured container
        if (!defaultFeatured.includes(val)) {
          renderFeaturedGrid(container, type, isSettings);
        }
      }
    });
    
    container.appendChild(btn);
  });

  // 3. Append the 6th button: "More" tab
  const moreBtn = document.createElement('button');
  moreBtn.className = 'preference-btn more-btn';
  moreBtn.textContent = 'More...';
  moreBtn.addEventListener('click', () => {
    openSearchModal(type, isSettings);
  });
  
  container.appendChild(moreBtn);
}

// ==========================================
// SEARCHABLE MODAL FOR 'MORE' SELECTION
// ==========================================
function openSearchModal(type, isSettings) {
  searchModalType = type;
  searchIsSettings = isSettings;
  
  searchModalTitle.textContent = type === 'language' ? 'Select Languages' : 'Select Genres';
  searchInput.value = '';
  renderSearchItems('');
  
  searchModal.classList.add('active');
  searchInput.focus();
}

function closeSearchModal() {
  searchModal.classList.remove('active');
}

function renderSearchItems(filterText = '') {
  searchResultsList.innerHTML = '';
  
  const isLang = searchModalType === 'language';
  const allSource = isLang ? AVAILABLE_LANGUAGES : MOVIE_GENRES;
  const selectedList = isLang ? state.userSelectedLanguages : state.userSelectedGenreIds;
  const itemKey = isLang ? 'code' : 'id';
  
  const query = filterText.toLowerCase().trim();
  const filtered = allSource.filter(item => item.name.toLowerCase().includes(query));
  
  if (filtered.length === 0) {
    searchResultsList.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted); font-size: 0.85rem;">No results found</div>`;
    return;
  }
  
  filtered.forEach(item => {
    const val = item[itemKey];
    const isActive = selectedList.includes(val);
    
    const row = document.createElement('div');
    row.className = `search-item ${isActive ? 'active' : ''}`;
    row.textContent = item.name;
    
    row.addEventListener('click', () => {
      row.classList.toggle('active');
      if (row.classList.contains('active')) {
        if (!selectedList.includes(val)) {
          selectedList.push(val);
        }
      } else {
        const index = selectedList.indexOf(val);
        if (index > -1) {
          selectedList.splice(index, 1);
        }
      }
    });
    
    searchResultsList.appendChild(row);
  });
}

function confirmSearchSelection() {
  closeSearchModal();
  
  // Re-render corresponding grids to display selection states
  if (searchIsSettings) {
    if (searchModalType === 'language') {
      renderFeaturedGrid(settingsLangGrid, 'language', true);
    } else {
      renderFeaturedGrid(settingsGenresGrid, 'genre', true);
    }
  } else {
    if (searchModalType === 'language') {
      renderFeaturedGrid(onboardingLangGrid, 'language', false);
    } else {
      renderFeaturedGrid(onboardingGenresGrid, 'genre', false);
    }
  }
}

// Initialize LinUCB Bandit Model based on Onboarding selection (Onboarding virtual-swipe cold-start)
function initBanditModel() {
  state.banditModel = {
    Ainv: identityMatrix(FEATURE_DIM),
    b: new Array(FEATURE_DIM).fill(0),
    alpha: 0.6
  };

  const context = {
    userSelectedLanguages: state.userSelectedLanguages,
    minPop: 0,
    maxPop: 100
  };

  state.userSelectedGenreIds.forEach(genreId => {
    // Run update twice per selected genre to seed theta strongly
    for (let k = 0; k < 2; k++) {
      const fakeItem = {
        genre_ids: [genreId],
        media_type: 'movie',
        release_date: '2024-01-01',
        original_language: state.userSelectedLanguages[0] || 'en',
        vote_average: 7.5,
        popularity: 50.0
      };
      const x = buildFeatureVector(fakeItem, context);
      state.banditModel.Ainv = sherman_morrison_update(state.banditModel.Ainv, x);
      state.banditModel.b = vecAdd(state.banditModel.b, vecScale(x, 1.0)); // reward = 1.0
    }
  });
}

// Transitions between panels smoothly
function transitionToScreen(targetScreen) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  targetScreen.classList.add('active');
}

// Show standard non-blocking notifications (FR-2.5)
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'warning') icon = '⚠️';
  
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  toastContainer.appendChild(toast);
  
  // Remove toast after animation finishes
  setTimeout(() => {
    toast.remove();
  }, 3000);
}


// ==========================================
// CORE DISCOVERY ENGINE & HYDRATION
// ==========================================
async function startSession() {
  state.currentPage = 1;
  state.viewStateStack = [];
  state.discardList = [];
  state.likedArray = [];
  state.undoStack = [];
  
  likesCount.textContent = '0';
  btnUndo.disabled = true;
  initBanditModel();
  
  renderStackLoading();
  await hydrateBuffer();
}

// Pull down to refresh gesture for mobile (FR-4.x)
function setupPullToRefresh() {
  let startY = 0;
  let startX = 0;
  let pullY = 0;
  let isPulling = false;
  
  cardStack.addEventListener('pointerdown', (e) => {
    // Only trigger if we are not currently dragging a card
    if (isDragging) return;
    
    isPulling = true;
    startY = e.clientY;
    startX = e.clientX;
    cardStack.style.transition = 'none';
  });
  
  cardStack.addEventListener('pointermove', (e) => {
    if (!isPulling) return;
    
    const deltaY = e.clientY - startY;
    const deltaX = e.clientX - startX;
    
    // Only pull downwards, and ignore horizontal pulls
    if (deltaY > 0 && deltaY > Math.abs(deltaX) * 1.5) {
      pullY = Math.min(deltaY * 0.4, 80); // Cap at 80px translation
      cardStack.style.transform = `translateY(${pullY}px)`;
    } else if (deltaY <= 0) {
      pullY = 0;
      cardStack.style.transform = '';
    }
  });
  
  const endPull = () => {
    if (!isPulling) return;
    isPulling = false;
    
    cardStack.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.15)';
    cardStack.style.transform = '';
    
    if (pullY > 40) {
      refreshStack();
    }
    pullY = 0;
    
    setTimeout(() => {
      if (!isPulling) {
        cardStack.style.transition = '';
      }
    }, 400);
  };
  
  cardStack.addEventListener('pointerup', endPull);
  cardStack.addEventListener('pointercancel', endPull);
}

// Refresh stack without wiping likes or discards.
// Injects one exploratory genre at a low exploratory weight (0.3) via a virtual update.
window.refreshStack = async function() {
  renderStackLoading();
  state.viewStateStack = [];

  const availableGenres = MOVIE_GENRES.filter(g => !state.userSelectedGenreIds.includes(g.id));
  if (availableGenres.length > 0) {
    const randomGenre = availableGenres[Math.floor(Math.random() * availableGenres.length)];
    const context = {
      userSelectedLanguages: state.userSelectedLanguages,
      minPop: 0,
      maxPop: 100
    };
    const fakeItem = {
      genre_ids: [randomGenre.id],
      media_type: 'movie',
      release_date: '2024-01-01',
      original_language: state.userSelectedLanguages[0] || 'en',
      vote_average: 7.0,
      popularity: 40.0
    };
    const x = buildFeatureVector(fakeItem, context);
    state.banditModel.Ainv = sherman_morrison_update(state.banditModel.Ainv, x);
    state.banditModel.b = vecAdd(state.banditModel.b, vecScale(x, 0.3));
  }

  // Loop page back to 1 if we've swiped through all pages
  if (state.currentPage > state.totalPages) {
    state.currentPage = 1;
  }

  await hydrateBuffer();
};

// Hydrates the buffer asynchronously when queue < 4 (FR-2.3)
async function hydrateBuffer(attempts = 1) {
  if (state.isFetching) return;
  state.isFetching = true;

  // --- Compute current theta to find top coarse genres ---
  const theta = matVecMul(state.banditModel.Ainv, state.banditModel.b);
  let coarseGenres = [];
  for (let i = 0; i < MOVIE_GENRES_IDS.length; i++) {
    const gid = MOVIE_GENRES_IDS[i];
    const weight = theta[i];
    if (weight > 0) {
      coarseGenres.push({ id: gid, weight });
    }
  }
  coarseGenres.sort((a, b) => b.weight - a.weight);
  const topGenreIds = coarseGenres.slice(0, 5).map(g => g.id);

  // Fallback to initial onboarding selection if vector is empty
  const genreFilter = topGenreIds.length > 0 ? topGenreIds : [...state.userSelectedGenreIds];
  const genresQuery = genreFilter.join('|');
  const langQuery   = state.userSelectedLanguages.join('|');

  // Strict user genre selections
  const userGenresQuery = state.userSelectedGenreIds.join('|');

  try {
    const url = `/api/discover?lang=${langQuery}&genres=${genresQuery}&userGenres=${userGenresQuery}&page=${state.currentPage}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('API fetch failed');

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const swipedIds = new Set([...state.discardList, ...state.likedArray.map(m => m.id)]);
      let newMovies = data.results.filter(movie => !swipedIds.has(movie.id));

      if (newMovies.length > 0) {
        // --- Client-side LinUCB Scoring ---
        const popValues = newMovies.map(m => m.popularity || 0);
        const context = {
          userSelectedLanguages: state.userSelectedLanguages,
          minPop: Math.min(...popValues, 0),
          maxPop: Math.max(...popValues, 100)
        };

        newMovies = newMovies.map(item => {
          const x = buildFeatureVector(item, context);
          const exploitScore = dotProduct(theta, x);
          const exploreBonus = state.banditModel.alpha * Math.sqrt(quadForm(x, state.banditModel.Ainv));
          const finalScore = exploitScore + exploreBonus;
          return { ...item, _score: finalScore };
        });

        // Sort descending by finalScore
        newMovies.sort((a, b) => b._score - a._score);

        // Strip internal score field
        newMovies = newMovies.map(({ _score, ...rest }) => rest);

        state.viewStateStack.push(...newMovies);
      }
      
      state.totalPages = data.total_pages;
      state.currentPage++;
    }

    state.isFetching = false;
    renderStack();
  } catch (error) {
    console.error('Hydration attempt failed:', error);
    if (attempts < 3) {
      const backoffDelay = Math.pow(2, attempts) * 1000;
      setTimeout(async () => {
        state.isFetching = false;
        await hydrateBuffer(attempts + 1);
      }, backoffDelay);
    } else {
      state.isFetching = false;
      showToast('Having issues connecting to server. Please check your connection.', 'warning');
      renderStack();
    }
  }
}

// Display loader in card area
function renderStackLoading() {
  cardStack.innerHTML = `
    <div class="deck-loader">
      <div class="spinner"></div>
      <p>Loading card deck...</p>
    </div>
  `;
}

// Renders the deck container showing top 2 cards to conserve DOM nodes (SDD 4.1)
function renderStack() {
  cardStack.innerHTML = '';
  
  if (state.viewStateStack.length === 0) {
    if (state.isFetching) {
      renderStackLoading();
    } else {
      cardStack.innerHTML = `
        <div class="deck-loader">
          <p>You swiped through all movies!</p>
          <button onclick="refreshStack()" class="btn-secondary" style="margin-top:12px;">Refresh Stack</button>
        </div>
      `;
    }
    return;
  }
  
  const renderLimit = Math.min(state.viewStateStack.length, 2);
  
  for (let i = renderLimit - 1; i >= 0; i--) {
    const movie = state.viewStateStack[i];
    const cardEl = createCardElement(movie, i === 0);
    cardStack.appendChild(cardEl);
  }

  // Trigger undo slide-in animation if active
  if (state.undoAnimating) {
    const topCard = cardStack.lastElementChild;
    const nextCard = topCard ? topCard.previousElementSibling : null;
    
    if (topCard) {
      // Force layout reflow
      topCard.getBoundingClientRect();
      topCard.classList.add('snap-back');
      topCard.classList.remove('swipe-out-right', 'swipe-out-left');
      
      if (nextCard) {
        // Start next card at scale 1, opacity 1
        nextCard.style.transition = 'none';
        nextCard.style.transform = 'scale(1)';
        nextCard.style.opacity = '1';
        
        // Trigger reflow for next card
        nextCard.getBoundingClientRect();
        
        // Transition next card back to its default stack scale (0.94) and opacity (0.85)
        nextCard.style.transition = 'transform 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.15), opacity 0.45s ease';
        nextCard.style.transform = '';
        nextCard.style.opacity = '';
        
        // Clean up inline styles after transition
        setTimeout(() => {
          if (nextCard) {
            nextCard.style.transition = '';
            nextCard.style.transform = '';
            nextCard.style.opacity = '';
          }
        }, 500);
      }
      
      setTimeout(() => {
        if (topCard) topCard.classList.remove('snap-back');
      }, 500);
    }
    state.undoAnimating = null;
  }
}

// Creates single DOM element representing card
function createCardElement(movie, isTopCard) {
  const card = document.createElement('div');
  card.className = 'movie-card';
  card.dataset.id = movie.id;
  
  const posterUrl = movie.poster_path 
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=500&auto=format&fit=crop';
    
  const releaseYear = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'NR';

  const isTV = movie.media_type === 'tv';
  const badgeClass = isTV ? 'badge-tv' : 'badge-movie';
  const badgeLabel = isTV ? 'TV Series' : 'Movie';

  card.innerHTML = `
    <div class="card-poster-wrapper">
      
      <!-- Video-inspired floating white indicators inside the card -->
      <div class="card-indicator indicator-like">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
      </div>
      <div class="card-indicator indicator-discard">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </div>

      <!-- Media type badge: lives inside the card so it animates with the poster -->
      <span class="card-media-badge ${badgeClass}">${badgeLabel}</span>

      <img class="card-poster" src="${posterUrl}" alt="${movie.title}" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=500&auto=format&fit=crop';" loading="lazy">
      <div class="card-overlay">
        <h2 class="card-title">${movie.title}</h2>
        <div class="card-meta">
          <span class="meta-tag">${releaseYear}</span>
          <span class="meta-tag rating-tag">⭐ ${rating}</span>
          <span class="meta-tag">${(movie.original_language || 'EN').toUpperCase()}</span>
        </div>
        <div class="tap-hint">Tap for details</div>
      </div>
    </div>
  `;
  
  if (isTopCard) {
    currentCardEl = card;
    setupCardGestures(card);
    
    // Set initial position for undo entry transition
    if (state.undoAnimating) {
      card.classList.add(state.undoAnimating.direction === 'right' ? 'swipe-out-right' : 'swipe-out-left');
    }
  }
  
  return card;
}


// ==========================================
// GESTURE & SWIPE ENGINE
// ==========================================
function setupCardGestures(card) {
  let startX = 0;
  let startY = 0;
  let moveX = 0;
  let moveY = 0;
  
  // Grab local references to the card's indicators
  const likeInd = card.querySelector('.indicator-like');
  const discardInd = card.querySelector('.indicator-discard');
  
  card.addEventListener('pointerdown', (e) => {
    isDragging = true;
    dragStart = e;
    startX = e.clientX;
    startY = e.clientY;
    card.classList.remove('snap-back');
    card.style.transition = 'none';
    
    // Disable indicator transitions during drag for raw response
    likeInd.style.transition = 'none';
    discardInd.style.transition = 'none';
    
    card.setPointerCapture(e.pointerId);
  });
  
  card.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    
    moveX = e.clientX - startX;
    moveY = e.clientY - startY;
    
    // Physics mapping: rotate based on horizontal displacement
    const rotation = moveX * 0.05;
    card.style.transform = `translate(${moveX}px, ${moveY}px) rotate(${rotation}deg)`;
    
    // Calculate drag ratios relative to threshold (e.g. 100px for horiz)
    const ratioX = Math.min(Math.max(Math.abs(moveX) - 15, 0) / 100, 1);
    
    // Scale underlying card dynamically (from 0.94 to 1) for a rich tactile depth feel
    const nextCard = card.previousElementSibling;
    if (nextCard) {
      const dragTotal = Math.min(Math.abs(moveX) / 150, 1);
      const currentScale = 0.94 + dragTotal * 0.06;
      const currentOpacity = 0.85 + dragTotal * 0.15;
      nextCard.style.transform = `scale(${currentScale})`;
      nextCard.style.opacity = currentOpacity;
    }
    
    // Live feedback indicators (video-inspired white circles positioned inside card)
    if (moveX > 15) {
      // Like (swipe right)
      likeInd.style.opacity = ratioX;
      likeInd.style.transform = `translateY(-50%) scale(${0.5 + ratioX * 0.5})`;
      discardInd.style.opacity = 0;
    } else if (moveX < -15) {
      // Discard (swipe left)
      discardInd.style.opacity = ratioX;
      discardInd.style.transform = `translateY(-50%) scale(${0.5 + ratioX * 0.5})`;
      likeInd.style.opacity = 0;
    } else {
      likeInd.style.opacity = 0;
      discardInd.style.opacity = 0;
      
      likeInd.style.transform = 'translateY(-50%) scale(0.5)';
      discardInd.style.transform = 'translateY(-50%) scale(0.5)';
    }
  });
  
    const handleRelease = (e) => {
      if (!isDragging) return;
      isDragging = false;
      try {
        card.releasePointerCapture(e.pointerId);
      } catch (err) {}
      
      // Restore smooth indicator transitions for release phase
      likeInd.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      discardInd.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      
      // Clear indicator opacities
      likeInd.style.opacity = 0;
      discardInd.style.opacity = 0;
      
      likeInd.style.transform = 'translateY(-50%) scale(0.5)';
      discardInd.style.transform = 'translateY(-50%) scale(0.5)';
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      // Tap detection: small distance triggers movie info panel (FR-3.4)
      if (distance < 6) {
        openMovieDetails(state.viewStateStack[0]);
        card.classList.add('snap-back');
        card.style.transform = '';
        
        const nextCard = card.previousElementSibling;
        if (nextCard) {
          nextCard.style.transform = '';
          nextCard.style.opacity = '';
        }
        return;
      }
      
      // Threshold validation: commit vs. snap-back (Swipe Up is removed)
      if (deltaX > 120) {
        commitSwipe('right');
      } else if (deltaX < -120) {
        commitSwipe('left');
      } else {
        // Bounce back top card
        card.classList.add('snap-back');
        card.style.transform = '';
        
        // Bounce back secondary card underneath
        const nextCard = card.previousElementSibling;
        if (nextCard) {
          nextCard.style.transition = 'transform 0.4s ease, opacity 0.4s ease';
          nextCard.style.transform = 'scale(0.94)';
          nextCard.style.opacity = '0.85';
          setTimeout(() => {
            nextCard.style.transition = '';
          }, 400);
        }
      }
    };

    card.addEventListener('pointerup', handleRelease);
    card.addEventListener('pointercancel', handleRelease);

}

// Processes the swiping decisions
function commitSwipe(direction) {
  const card = currentCardEl;
  if (!card) return;
  
  const movie = state.viewStateStack[0];
  if (!movie) return;

  const nextCard = card.previousElementSibling;

  // Capture LinUCB state snapshot before updating
  const banditSnapshot = {
    Ainv: JSON.parse(JSON.stringify(state.banditModel.Ainv)),
    b: [...state.banditModel.b]
  };

  if (direction === 'right') {
    card.className = 'movie-card swipe-out-right';
    
    updateLinUCBModel(movie, 1.0);
    
    state.likedArray.push(movie);
    state.viewStateStack.shift();
    
    // History push (for UNDO)
    state.undoStack.push({ action: 'like', movie, banditSnapshot });
    
    likesCount.textContent = state.likedArray.length;
    btnUndo.disabled = false;
    
    if (nextCard) {
      nextCard.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease';
      nextCard.style.transform = 'scale(1)';
      nextCard.style.opacity = '1';
    }
    
    setTimeout(() => {
      renderStack();
      checkHydrationThreshold();
    }, 200);
    
  } else if (direction === 'left') {
    card.className = 'movie-card swipe-out-left';
    
    updateLinUCBModel(movie, 0.0);
    
    state.discardList.push(movie.id);
    state.viewStateStack.shift();
    
    // History push
    state.undoStack.push({ action: 'discard', movie, banditSnapshot });
    btnUndo.disabled = false;
    
    if (nextCard) {
      nextCard.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease';
      nextCard.style.transform = 'scale(1)';
      nextCard.style.opacity = '1';
    }
    
    setTimeout(() => {
      renderStack();
      checkHydrationThreshold();
    }, 200);
  }
}

// Client-side LinUCB Model Update
function updateLinUCBModel(movie, reward) {
  const popValues = state.viewStateStack.map(m => m.popularity || 0);
  const context = {
    userSelectedLanguages: state.userSelectedLanguages,
    minPop: Math.min(...popValues, 0),
    maxPop: Math.max(...popValues, 100)
  };
  const x = buildFeatureVector(movie, context);
  
  // Sherman-Morrison update of Ainv
  state.banditModel.Ainv = sherman_morrison_update(state.banditModel.Ainv, x);
  
  // Update b
  state.banditModel.b = vecAdd(state.banditModel.b, vecScale(x, reward));
  
  // Log learned weights (theta) to console for development verification
  const theta = matVecMul(state.banditModel.Ainv, state.banditModel.b);
  console.log("LinUCB Updated Theta:", theta);
  const genreWeights = MOVIE_GENRES_IDS.map((gid, idx) => {
    const genreObj = MOVIE_GENRES.find(g => g.id === gid);
    return { name: genreObj ? genreObj.name : gid, weight: theta[idx] };
  });
  genreWeights.sort((a, b) => b.weight - a.weight);
  console.log("LinUCB Top Learned Genres:", genreWeights.slice(0, 5));
}

// Check if stack count falls below 4
function checkHydrationThreshold() {
  if (state.viewStateStack.length < 4) {
    hydrateBuffer();
  }
}

// Undo Last Swipe Affordance
function undoLastSwipe() {
  if (state.undoStack.length === 0) return;
  
  const lastState = state.undoStack.pop();
  const movie = lastState.movie;
  
  if (lastState.action === 'like') {
    state.likedArray = state.likedArray.filter(m => m.id !== movie.id);
    likesCount.textContent = state.likedArray.length;
  } else if (lastState.action === 'discard') {
    state.discardList = state.discardList.filter(id => id !== movie.id);
  }

  // Restore model state snapshot
  if (lastState.banditSnapshot) {
    state.banditModel.Ainv = lastState.banditSnapshot.Ainv;
    state.banditModel.b = lastState.banditSnapshot.b;
  }
  
  state.undoAnimating = { direction: lastState.action === 'like' ? 'right' : 'left' };
  state.viewStateStack.unshift(movie);
  
  if (state.undoStack.length === 0) {
    btnUndo.disabled = true;
  }
  
  renderStack();
}


// ==========================================
// DETAILS DETAILS PANEL
// ==========================================
function openMovieDetails(movie) {
  if (!movie) return;

  detailTitle.textContent = movie.title;
  detailYear.textContent = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
  detailRating.textContent = `⭐ ${movie.vote_average ? movie.vote_average.toFixed(1) : 'NR'}`;
  detailLang.textContent = (movie.original_language || 'EN').toUpperCase();

  // Render genre badges
  detailGenres.innerHTML = '';
  (movie.genre_ids || []).forEach(gid => {
    const genre = ALL_GENRES_LOOKUP.find(g => g.id === gid);
    if (genre) {
      const tag = document.createElement('span');
      tag.className = 'genre-tag';
      tag.textContent = genre.name;
      detailGenres.appendChild(tag);
    }
  });

  // Accept both field names: server normalises overview→synopsis, but handle both defensively
  detailSynopsis.textContent = movie.synopsis || movie.overview || 'No description available.';
  detailsPanel.classList.add('active');
}

function closeMovieDetails() {
  detailsPanel.classList.remove('active');
}


// ==========================================
// OPTIMIZATION & MONETIZATION DASHBOARD
// ==========================================
// Detect user's likely region from browser locale / timezone
function detectUserRegion() {
  try {
    // navigator.language gives e.g. "ml-IN", "en-US", "ta-IN"
    const lang = navigator.language || '';
    const localeParts = lang.split('-');
    if (localeParts.length >= 2) {
      return localeParts[localeParts.length - 1].toUpperCase();
    }
    // Fallback: try to infer from timezone
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.includes('Calcutta') || tz.includes('Kolkata') || tz.includes('India')) return 'IN';
    if (tz.includes('London')) return 'GB';
  } catch (e) {}
  return 'US';
}

async function endSwipingSession() {
  transitionToScreen(dashboardScreen);
  renderDashboardLoader();

  if (state.likedArray.length === 0) {
    renderEmptyDashboard();
    return;
  }

  const movieIds = state.likedArray.map(m => ({ id: m.id, mediaType: m.media_type || 'movie' }));
  const region   = detectUserRegion();

  try {
    const response = await fetch('/api/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movieIds, region })
    });

    if (!response.ok) throw new Error('Optimization request failed');
    const result = await response.json();
    renderOptimizationReport(result);
  } catch (error) {
    console.error('Dashboard optimization engine failed:', error);
    showToast('Could not load streaming recommendations. Please try again.', 'warning');
    renderEmptyDashboard();
  }
}

function renderDashboardLoader() {
  dashboardScreen.querySelector('.dashboard-content').innerHTML = `
    <div class="dashboard-loader">
      <div class="spinner"></div>
      <p>Analyzing watched provider matrices...</p>
    </div>
  `;
}

// Display Empty Dashboard when session concludes without likes (FR-5.6)
function renderEmptyDashboard() {
  const container = dashboardScreen.querySelector('.dashboard-content');
  container.innerHTML = `
    <div class="empty-dashboard">
      <span class="empty-icon">🍿</span>
      <h2>No Liked Movies Yet</h2>
      <p>Swipe right on movies you want to watch to generate a cost-optimized streaming report!</p>
      <button class="btn-primary" onclick="restartSession()" style="width: 100%;">Restart Swiping</button>
    </div>
  `;
}

// (simulateLocalOptimizationReport removed — app always uses /api/optimize response)

// Helper methods to cleanly replace broken provider logos without inline HTML double-quote syntax parsing errors (FR-5.4)
window.handleWinnerLogoError = function(img, providerName) {
  const h3 = document.createElement('h3');
  h3.className = 'winner-name';
  h3.textContent = providerName;
  img.replaceWith(h3);
};

window.handleRowLogoError = function(img, firstLetter) {
  const span = document.createElement('span');
  span.textContent = firstLetter;
  img.replaceWith(span);
};

// Renders the final Cost Optimization Dashboard (FR-5.2 - FR-5.5)
function renderOptimizationReport(data) {
  const container = dashboardScreen.querySelector('.dashboard-content');
  container.innerHTML = '';
  
  if (!data.providers || data.providers.length === 0) {
    renderEmptyDashboard();
    return;
  }
  
  const topProvider = data.providers[0];
  
  // 1. Winner Top Match Card (Circular Gauge)
  const winnerCard = document.createElement('div');
  winnerCard.className = 'winner-card';
  
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (topProvider.match_percentage / 100) * circumference;

  const logoUrl = topProvider.logo_path 
    ? `https://image.tmdb.org/t/p/w154${topProvider.logo_path}`
    : '';

  winnerCard.innerHTML = `
    <div class="winner-badge">Optimal Provider</div>
    
    <div class="gauge-container">
      <svg class="gauge-svg" width="100" height="100">
        <circle class="gauge-bg" cx="50" cy="50" r="${radius}"></circle>
        <circle class="gauge-fill" cx="50" cy="50" r="${radius}" 
          style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeDashoffset}"></circle>
      </svg>
      <div class="gauge-text">${topProvider.match_percentage}%</div>
    </div>
    
    ${logoUrl ? `<img class="winner-logo" src="${logoUrl}" alt="${topProvider.provider_name}" onerror="handleWinnerLogoError(this, '${topProvider.provider_name}')">` : `<h3 class="winner-name">${topProvider.provider_name}</h3>`}
    
    <p class="winner-text" style="margin-top: 12px;">
      Matches <strong>${topProvider.match_percentage}%</strong> (${topProvider.match_count} of ${state.likedArray.length}) of your picks.
    </p>
    
    <a href="${topProvider.affiliate_link}" target="_blank" rel="noopener" class="affiliate-cta">
      Get ${topProvider.provider_name} <span>→</span>
    </a>
  `;
  container.appendChild(winnerCard);
  
  // 2. Secondary Ranked Providers list
  if (data.providers.length > 1) {
    const listCard = document.createElement('div');
    listCard.className = 'providers-list-card';
    listCard.innerHTML = `<h3 class="providers-list-title">Other Providers</h3>`;
    
    const listContainer = document.createElement('div');
    listContainer.className = 'providers-list-container';
    
    data.providers.slice(1).forEach(prov => {
      const row = document.createElement('div');
      row.className = 'provider-row';
      
      const firstLetter = prov.provider_name.charAt(0);
      const logoHtml = prov.logo_path 
        ? `<img src="https://image.tmdb.org/t/p/w92${prov.logo_path}" alt="${prov.provider_name}" onerror="handleRowLogoError(this, '${firstLetter}')">`
        : `<span>${firstLetter}</span>`;
        
      row.innerHTML = `
        <div class="provider-row-logo">${logoHtml}</div>
        <div class="provider-row-details">
          <div class="provider-row-header">
            <span>${prov.provider_name}</span>
            <span>${prov.match_percentage}% (${prov.match_count})</span>
          </div>
          <div class="provider-bar-wrapper">
            <div class="provider-bar-fill" style="width: ${prov.match_percentage}%"></div>
          </div>
        </div>
        <a href="${prov.affiliate_link}" target="_blank" rel="noopener" class="provider-row-link" aria-label="Join ${prov.provider_name}">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </a>
      `;
      listContainer.appendChild(row);
    });
    
    listCard.appendChild(listContainer);
    container.appendChild(listCard);
  }
  
  // 3. Breakdown of Liked Movies Grouped by Provider
  // Uses real perMovie data returned by /api/optimize (no hardcoded mappings)
  const breakdownCard = document.createElement('div');
  breakdownCard.className = 'breakdown-card';
  breakdownCard.innerHTML = `<h3 class="breakdown-title">Where to Watch</h3>`;

  const movieDetailsMap = {}; // providerName → [{ title, tier }]

  if (data.perMovie && data.perMovie.length > 0) {
    // Build a lookup: movieId → title
    const titleMap = {};
    state.likedArray.forEach(m => { titleMap[m.id] = m.title; });

    data.perMovie.forEach(({ id, flatrate, rentBuy }) => {
      const title = titleMap[id];
      if (!title) return;

      flatrate.forEach(p => {
        if (!movieDetailsMap[p]) movieDetailsMap[p] = [];
        movieDetailsMap[p].push({ title, tier: 'flatrate' });
      });

      rentBuy.forEach(p => {
        if (!movieDetailsMap[p]) movieDetailsMap[p] = [];
        // Only add if not already listed under flatrate for this movie
        if (!flatrate.includes(p)) {
          movieDetailsMap[p].push({ title, tier: 'rent' });
        }
      });
    });
  }

  const breakdownContent = document.createElement('div');
  breakdownContent.className = 'breakdown-content';

  if (Object.keys(movieDetailsMap).length === 0) {
    breakdownContent.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;padding:8px 0">No streaming data available for your liked movies in your region.</p>`;
  } else {
    Object.keys(movieDetailsMap).forEach(provName => {
      const group = document.createElement('div');
      group.className = 'provider-group';
      group.innerHTML = `
        <div class="provider-group-header"><strong>${provName}</strong></div>
        <div class="provider-movie-badges">
          ${movieDetailsMap[provName].map(({ title, tier }) => {
            const label = tier === 'rent' ? ` <em style="font-size:0.7rem;opacity:0.7">(rent)</em>` : '';
            return `<span class="movie-badge">${title}${label}</span>`;
          }).join('')}
        </div>
      `;
      breakdownContent.appendChild(group);
    });
  }

  breakdownCard.appendChild(breakdownContent);
  container.appendChild(breakdownCard);

  // 4. CTA buttons (Restart / Edit)
  const buttonsGroup = document.createElement('div');
  buttonsGroup.style.display = 'flex';
  buttonsGroup.style.gap = '12px';
  buttonsGroup.style.marginTop = '8px';
  
  buttonsGroup.innerHTML = `
    <button class="btn-primary" style="flex-grow: 1;" onclick="restartSession()">Restart Session</button>
    <button class="btn-secondary" onclick="openSettingsModal()">Preferences</button>
  `;
  container.appendChild(buttonsGroup);
}

// Restarts session
window.restartSession = function() {
  transitionToScreen(swipeScreen);
  startSession();
};


// ==========================================
// PREFERENCES / SETTINGS
// ==========================================
window.openSettingsModal = function() {
  renderFeaturedGrid(settingsLangGrid, 'language', true);
  renderFeaturedGrid(settingsGenresGrid, 'genre', true);
  settingsModal.classList.add('active');
};

function closeSettingsModal() {
  settingsModal.classList.remove('active');
}

function saveSettings() {
  // Save preferences
  localStorage.setItem('swipeflix_langs', JSON.stringify(state.userSelectedLanguages));
  localStorage.setItem('swipeflix_genres', JSON.stringify(state.userSelectedGenreIds));
  
  closeSettingsModal();
  
  transitionToScreen(swipeScreen);
  startSession();
}


// ==========================================
// EVENT LISTENERS REGISTER
// ==========================================
function setupEventListeners() {
  // Start Swiping CTA
  btnStartSwiping.addEventListener('click', () => {
    localStorage.setItem('swipeflix_langs', JSON.stringify(state.userSelectedLanguages));
    localStorage.setItem('swipeflix_genres', JSON.stringify(state.userSelectedGenreIds));
    
    initBanditModel();
    transitionToScreen(swipeScreen);
    startSession();
  });
  
  // Settings modal triggers
  btnOpenSettings.addEventListener('click', openSettingsModal);
  btnCloseSettings.addEventListener('click', closeSettingsModal);
  btnSaveSettings.addEventListener('click', saveSettings);
  
  // Search Modal triggers
  btnCloseSearch.addEventListener('click', closeSearchModal);
  btnSaveSearch.addEventListener('click', confirmSearchSelection);
  
  searchInput.addEventListener('input', (e) => {
    renderSearchItems(e.target.value);
  });
  
  searchModal.addEventListener('click', (e) => {
    if (e.target === searchModal) closeSearchModal();
  });
  
  // Close details trigger
  btnCloseDetails.addEventListener('click', closeMovieDetails);
  detailsPanel.addEventListener('click', (e) => {
    if (e.target === detailsPanel) closeMovieDetails();
  });
  

  // Control Panel buttons triggers
  btnDiscard.addEventListener('click', () => commitSwipe('left'));
  btnUndo.addEventListener('click', undoLastSwipe);
  btnLike.addEventListener('click', () => commitSwipe('right'));
  
  // Finish Session trigger
  btnEnd.addEventListener('click', () => endSwipingSession());
  
  // Keyboard Navigation accessibility shortcut
  document.addEventListener('keydown', (e) => {
    if (swipeScreen.classList.contains('active') && 
        !settingsModal.classList.contains('active') && 
        !detailsPanel.classList.contains('active') &&
        !searchModal.classList.contains('active')) {
      if (e.key === 'ArrowLeft') commitSwipe('left');
      if (e.key === 'ArrowRight') commitSwipe('right');
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) undoLastSwipe();
    }
  });
}
