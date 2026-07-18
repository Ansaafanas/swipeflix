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
  { id: 878, name: "Sci-Fi" },
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
  { code: 'da', name: 'Danish' }
];

// Default featured selections (first 5 of each)
const FEATURED_LANGUAGES = ['en', 'es', 'fr', 'ja', 'de'];
const FEATURED_GENRES = [28, 35, 18, 53, 10749]; // Action, Comedy, Drama, Thriller, Romance

// ==========================================
// APPLICATION STATE
// ==========================================
let state = {
  userSelectedLanguages: ['en'], // Multi-select, non-mandatory
  userSelectedGenreIds: [],      // Multi-select, non-mandatory
  viewStateStack: [],            // Ephemeral buffer: 10-15 cards
  discardList: [],               // Swiped left IDs
  likedArray: [],                // Swiped right movie objects
  preferenceVector: new Map(),      // genreId -> weight (float)
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

    initPreferenceVector();
    
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

// Initialize Preference Vector based on Onboarding selection (FR-4.x)
function initPreferenceVector() {
  state.preferenceVector.clear();
  MOVIE_GENRES.forEach(g => {
    // Set onboarding favorites with weight 1.0, others 0.0
    const initialWeight = state.userSelectedGenreIds.includes(g.id) ? 1.0 : 0.0;
    state.preferenceVector.set(g.id, initialWeight);
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
  initPreferenceVector();
  
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

// Refresh stack without wiping likes or discards, introducing category variety (FR-4.x)
window.refreshStack = async function() {
  renderStackLoading();
  state.viewStateStack = [];
  
  // Choose a random genre from MOVIE_GENRES not already selected to inject variety
  const availableGenres = MOVIE_GENRES.filter(g => !state.userSelectedGenreIds.includes(g.id));
  if (availableGenres.length > 0) {
    const randomGenre = availableGenres[Math.floor(Math.random() * availableGenres.length)];
    // Set weight to 1.0 in preference vector so it gets selected in discover query
    state.preferenceVector.set(randomGenre.id, 1.0);
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

  // Build recommendation dynamic filters (FR-4.3 / SDD 4.3)
  // Get active genres from the preference vector. Select genres with weight >= 0.5
  let biasedGenres = [];
  state.preferenceVector.forEach((weight, id) => {
    if (weight >= 0.5) {
      biasedGenres.push(id);
    }
  });

  // If no weights are high enough, fallback to initial onboarding selection
  if (biasedGenres.length === 0) {
    biasedGenres = [...state.userSelectedGenreIds];
  }

  // Construct query parameters
  const genresQuery = biasedGenres.join('|');
  const langQuery = state.userSelectedLanguages.join('|');

  try {
    const response = await fetch(`/api/discover?lang=${langQuery}&genres=${genresQuery}&page=${state.currentPage}`);
    if (!response.ok) throw new Error('API fetch failed');
    
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      // Exclude movies that are already swiped (liked or discarded) in this session
      const swipedIds = new Set([...state.discardList, ...state.likedArray.map(m => m.id)]);
      const newMovies = data.results.filter(movie => !swipedIds.has(movie.id));
      
      state.viewStateStack.push(...newMovies);
      state.totalPages = data.total_pages;
      state.currentPage++; // Advance page for next hydration
    }
    
    state.isFetching = false;
    renderStack();
  } catch (error) {
    console.error("Hydration attempt failed:", error);
    
    // Exponential backoff retry (capped at 3 attempts) (FR-2.5)
    if (attempts < 3) {
      const backoffDelay = Math.pow(2, attempts) * 1000;
      setTimeout(async () => {
        state.isFetching = false;
        await hydrateBuffer(attempts + 1);
      }, backoffDelay);
    } else {
      state.isFetching = false;
      showToast("Having issues connecting to server. Using local cache.", "warning");
      renderStack(); // render what we have left
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

  card.innerHTML = `
    <div class="card-poster-wrapper">
      
      <!-- Video-inspired floating white indicators inside the card -->
      <div class="card-indicator indicator-like">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
      </div>
      <div class="card-indicator indicator-discard">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </div>

      <img class="card-poster" src="${posterUrl}" alt="${movie.title}" loading="lazy">
      <div class="card-overlay">
        <h2 class="card-title">${movie.title}</h2>
        <div class="card-meta">
          <span class="meta-tag">${releaseYear}</span>
          <span class="meta-tag rating-tag">⭐ ${rating}</span>
          <span class="meta-tag">${movie.original_language.toUpperCase()}</span>
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
  
  card.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    card.releasePointerCapture(e.pointerId);
    
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
  });

  card.addEventListener('pointercancel', () => {
    isDragging = false;
    likeInd.style.opacity = 0;
    discardInd.style.opacity = 0;
    card.classList.add('snap-back');
    card.style.transform = '';
    
    const nextCard = card.previousElementSibling;
    if (nextCard) {
      nextCard.style.transform = 'scale(0.94)';
      nextCard.style.opacity = '0.85';
    }
  });
}

// Processes the swiping decisions
function commitSwipe(direction) {
  const card = currentCardEl;
  if (!card) return;
  
  const movie = state.viewStateStack[0];
  if (!movie) return;

  const nextCard = card.previousElementSibling;

  if (direction === 'right') {
    card.className = 'movie-card swipe-out-right';
    
    // Adjust recommendation weight (CBF)
    adjustPreferenceVector(movie.genre_ids, 0.5);
    
    state.likedArray.push(movie);
    state.viewStateStack.shift();
    
    // History push (for UNDO)
    state.undoStack.push({ action: 'like', movie });
    
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
    
    // Adjust recommendation dampening
    adjustPreferenceVector(movie.genre_ids, -0.3);
    
    state.discardList.push(movie.id);
    state.viewStateStack.shift();
    
    // History push
    state.undoStack.push({ action: 'discard', movie });
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

// Client-side CBF tuning
function adjustPreferenceVector(genreIds, delta) {
  if (!genreIds) return;
  genreIds.forEach(id => {
    const currentWeight = state.preferenceVector.get(id) || 0.0;
    const newWeight = Math.max(-1.0, Math.min(3.0, currentWeight + delta));
    state.preferenceVector.set(id, newWeight);
  });
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
    adjustPreferenceVector(movie.genre_ids, -0.5);
  } else if (lastState.action === 'discard') {
    state.discardList = state.discardList.filter(id => id !== movie.id);
    adjustPreferenceVector(movie.genre_ids, 0.3);
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
  detailLang.textContent = movie.original_language.toUpperCase();
  
  // Render genre badges (no emojis!)
  detailGenres.innerHTML = '';
  movie.genre_ids.forEach(gid => {
    const genre = MOVIE_GENRES.find(g => g.id === gid);
    if (genre) {
      const tag = document.createElement('span');
      tag.className = 'genre-tag';
      tag.textContent = genre.name;
      detailGenres.appendChild(tag);
    }
  });
  
  detailSynopsis.textContent = movie.synopsis || "No description available.";
  detailsPanel.classList.add('active');
}

function closeMovieDetails() {
  detailsPanel.classList.remove('active');
}


// ==========================================
// OPTIMIZATION & MONETIZATION DASHBOARD
// ==========================================
async function endSwipingSession() {
  transitionToScreen(dashboardScreen);
  renderDashboardLoader();
  
  if (state.likedArray.length === 0) {
    renderEmptyDashboard();
    return;
  }
  
  const movieIds = state.likedArray.map(m => m.id);
  
  try {
    const response = await fetch('/api/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movieIds, region: 'US' })
    });
    
    if (!response.ok) throw new Error('Optimization request failed');
    const result = await response.json();
    
    renderOptimizationReport(result);
  } catch (error) {
    console.error("Dashboard optimization engine failed:", error);
    showToast("Optimization failed. Showing local mock analytics.", "warning");
    simulateLocalOptimizationReport();
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

// Local simulation backup in case server has failure
function simulateLocalOptimizationReport() {
  const providers = {};
  state.likedArray.forEach(m => {
    const mockProviders = {
      157336: ["Netflix", "Amazon Prime Video"],
      155: ["Max", "Amazon Prime Video"],
      129: ["Max", "Netflix"],
      496243: ["Max", "Hulu"],
      680: ["Netflix", "Max"],
      324857: ["Disney+", "Netflix"],
      194: ["Amazon Prime Video", "Apple TV+"],
      1417: ["Amazon Prime Video", "Max"],
      372058: ["Amazon Prime Video"],
      438631: ["Max", "Hulu"]
    };
    
    const list = mockProviders[m.id] || ["Netflix"];
    list.forEach(p => {
      providers[p] = (providers[p] || 0) + 1;
    });
  });
  
  const providersList = Object.keys(providers).map(name => {
    const matchCount = providers[name];
    const matchPercentage = Math.round((matchCount / state.likedArray.length) * 100);
    return {
      provider_name: name,
      match_count: matchCount,
      match_percentage: matchPercentage,
      affiliate_link: `https://click.swipeflix.com/redirect?provider=${encodeURIComponent(name.toLowerCase())}`
    };
  }).sort((a,b) => b.match_percentage - a.match_percentage);
  
  renderOptimizationReport({
    providers: providersList,
    totalLikedWithProviderData: state.likedArray.length
  });
}

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
    
    <h3 class="winner-name">${topProvider.provider_name}</h3>
    <p class="winner-text">
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
        ? `<img src="https://image.tmdb.org/t/p/w92${prov.logo_path}" alt="${prov.provider_name}">`
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
  
  // 3. Breakdown of Liked Movies Grouped by Provider (Value-Add Feature, no emojis!)
  const breakdownCard = document.createElement('div');
  breakdownCard.className = 'breakdown-card';
  breakdownCard.innerHTML = `<h3 class="breakdown-title">Where to Watch</h3>`;
  
  const movieDetailsMap = {};
  
  state.likedArray.forEach(m => {
    const mockProvidersMapping = {
      157336: ["Netflix", "Amazon Prime Video"],
      155: ["Max", "Amazon Prime Video"],
      129: ["Max", "Netflix"],
      496243: ["Max", "Hulu"],
      680: ["Netflix", "Max"],
      324857: ["Disney+", "Netflix"],
      194: ["Amazon Prime Video", "Apple TV+"],
      1417: ["Amazon Prime Video", "Max"],
      372058: ["Amazon Prime Video"],
      438631: ["Max", "Hulu"],
      354912: ["Disney+"],
      98: ["Amazon Prime Video", "Netflix"],
      546554: ["Netflix"],
      244786: ["Netflix", "Apple TV+"],
      772071: ["Netflix", "Amazon Prime Video"],
      27205: ["Max", "Netflix"],
      77338: ["Netflix", "Amazon Prime Video"],
      426426: ["Netflix"],
      128: ["Max"],
      11324: ["Amazon Prime Video", "Netflix"],
      120467: ["Disney+", "Max"],
      603: ["Max", "Amazon Prime Video"],
      33157: ["Amazon Prime Video"],
      531428: ["Hulu"]
    };
    
    const provs = mockProvidersMapping[m.id] || ["Netflix"];
    provs.forEach(p => {
      if (data.providers.some(dp => dp.provider_name === p)) {
        if (!movieDetailsMap[p]) movieDetailsMap[p] = [];
        movieDetailsMap[p].push(m.title);
      }
    });
  });

  const breakdownContent = document.createElement('div');
  breakdownContent.className = 'breakdown-content';
  
  Object.keys(movieDetailsMap).forEach(provName => {
    const group = document.createElement('div');
    group.className = 'provider-group';
    group.innerHTML = `
      <div class="provider-group-header">
        <strong>${provName}</strong>
      </div>
      <div class="provider-movie-badges">
        ${movieDetailsMap[provName].map(title => `<span class="movie-badge">${title}</span>`).join('')}
      </div>
    `;
    breakdownContent.appendChild(group);
  });
  
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
    
    initPreferenceVector();
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
