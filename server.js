import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ==========================================
// In-Memory Caching System
// ==========================================
const cache = new Map();

const getOrSetCache = async (key, fetchFn, ttlMs) => {
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && cached.expiry > now) return cached.value;
  try {
    const value = await fetchFn();
    cache.set(key, { value, expiry: now + ttlMs });
    return value;
  } catch (error) {
    if (cached) {
      console.warn(`TMDB error. Serving stale cache for key: ${key}`);
      return cached.value;
    }
    throw error;
  }
};

setInterval(() => {
  const now = Date.now();
  for (const [key, item] of cache.entries()) {
    if (item.expiry <= now) cache.delete(key);
  }
}, 5 * 60 * 1000);


// ==========================================
// Helpers
// ==========================================

const MOVIE_TO_TV_GENRE_MAP = {
  28: 10759,    // Action -> Action & Adventure
  12: 10759,    // Adventure -> Action & Adventure
  878: 10765,   // Sci-Fi -> Sci-Fi & Fantasy
  14: 10765,    // Fantasy -> Sci-Fi & Fantasy
  10752: 10768, // War -> War & Politics
};

const TV_TO_MOVIE_GENRE_MAP = {
  10759: [28, 12],    // Action & Adventure -> Action, Adventure
  10765: [878, 14],   // Sci-Fi & Fantasy -> Sci-Fi, Fantasy
  10768: [10752]      // War & Politics -> War
};

function translateMovieGenresToTv(genresStr) {
  if (!genresStr) return '';
  const separator = genresStr.includes('|') ? '|' : ',';
  const ids = genresStr.split(separator).map(id => parseInt(id, 10)).filter(Boolean);
  const tvIds = new Set();
  ids.forEach(id => {
    if (MOVIE_TO_TV_GENRE_MAP[id]) {
      tvIds.add(MOVIE_TO_TV_GENRE_MAP[id]);
    } else {
      tvIds.add(id);
    }
  });
  return Array.from(tvIds).join(separator);
}

function itemMatchesGenres(item, selectedGenreIds) {
  if (selectedGenreIds.length === 0) return true;
  const itemGenreIds = item.genre_ids || [];
  
  if (item.media_type === 'tv') {
    return itemGenreIds.some(gid => {
      if (selectedGenreIds.includes(gid)) return true;
      const movieEquivs = TV_TO_MOVIE_GENRE_MAP[gid];
      if (movieEquivs) {
        return movieEquivs.some(meg => selectedGenreIds.includes(meg));
      }
      return false;
    });
  } else {
    return itemGenreIds.some(gid => selectedGenreIds.includes(gid));
  }
}

/**
 * Normalise a TMDB movie result to a consistent shape.
 */
function normaliseMovie(m) {
  return {
    ...m,
    media_type: 'movie',
    synopsis: m.overview || m.synopsis || ''
  };
}

/**
 * Normalise a TMDB TV show result to the same shape as movies.
 * TV shows have `name` instead of `title` and `first_air_date` instead of `release_date`.
 */
function normaliseTVShow(m) {
  return {
    ...m,
    media_type: 'tv',
    title: m.name || m.title || 'Untitled',
    release_date: m.first_air_date || m.release_date || '',
    synopsis: m.overview || m.synopsis || ''
  };
}

/**
 * Fetch watch providers for a movie or TV show, trying a prioritised region list.
 * mediaType: 'movie' | 'tv'
 */
async function fetchProviders(itemId, regionList, mediaType = 'movie') {
  const endpoint = mediaType === 'tv'
    ? `https://api.themoviedb.org/3/tv/${itemId}/watch/providers?api_key=${process.env.TMDB_API_KEY}`
    : `https://api.themoviedb.org/3/movie/${itemId}/watch/providers?api_key=${process.env.TMDB_API_KEY}`;
  const cacheKey = `providers:${mediaType}:${itemId}`;

  const data = await getOrSetCache(cacheKey, async () => {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`TMDB responded with ${response.status}`);
    return await response.json();
  }, 12 * 60 * 60 * 1000);

  const allRegions = data?.results || {};
  for (const region of regionList) {
    const regionData = allRegions[region];
    if (regionData) {
      return {
        flatrate: regionData.flatrate || [],
        rent:     regionData.rent     || [],
        buy:      regionData.buy      || [],
        region
      };
    }
  }
  return { flatrate: [], rent: [], buy: [], region: null };
}


// ==========================================
// Routes
// ==========================================

// GET /api/discover
// Query params:
//   lang        - pipe-separated ISO language codes for coarse TMDB filter
//   genres      - pipe-separated genre IDs (top-5 positive-weight, coarse OR filter from bandit)
//   page        - page number (base, before pageOffset is applied)
//   pageOffset  - random per-session page offset for variety (Bug 2b)
//   sortBy      - TMDB sort_by field; default 'popularity.desc' (Bug 2b)
//   contentType - 'both' | 'movie' | 'tv'
app.get('/api/discover', async (req, res) => {
  const { lang = '', genres = '', page = 1, pageOffset = 0, sortBy = 'popularity.desc', contentType = 'both' } = req.query;
  const pageNum = Math.max(1, (parseInt(page, 10) || 1) + (parseInt(pageOffset, 10) || 0));

  if (!process.env.TMDB_API_KEY) {
    return res.status(503).json({ error: 'TMDB API key not configured.' });
  }

  // Validate sortBy against an allowlist for safety
  const ALLOWED_SORT = ['popularity.desc', 'vote_average.desc', 'revenue.desc', 'primary_release_date.desc'];
  const safeSortBy = ALLOWED_SORT.includes(sortBy) ? sortBy : 'popularity.desc';

  // vote_average.desc needs a floor filter so results aren't garbage
  const voteFloor = safeSortBy === 'vote_average.desc' ? '&vote_count.gte=200' : '&vote_count.gte=20';

  // Build base TMDB query parameters
  const baseParams = `api_key=${process.env.TMDB_API_KEY}&sort_by=${safeSortBy}&page=${pageNum}${voteFloor}`;
  const langParam   = lang   ? `&with_original_language=${lang}`  : '';

  // Coarse movie genre filter (derived from bandit top-5 weights — trusted directly)
  const genreParamMovie = genres
    ? `&with_genres=${genres}`
    : '';

  // Coarse TV genre filter (translated from movie genre IDs)
  const genresTv = translateMovieGenresToTv(genres);
  const genreParamTv = genresTv
    ? `&with_genres=${genresTv}`
    : '';

  const movieUrl = `https://api.themoviedb.org/3/discover/movie?${baseParams}${langParam}${genreParamMovie}`;
  const tvUrl    = `https://api.themoviedb.org/3/discover/tv?${baseParams}${langParam}${genreParamTv}`;

  // Cache key includes sortBy and effective page so session seeds don't collide (Bug 3 fix)
  const cacheKey = `discover:${lang}:${genres}:${pageNum}:${safeSortBy}`;

  try {
    let combined = [];
    let totalPages = 1;

    if (contentType === 'movie') {
      const movieData = await getOrSetCache(`movie:${cacheKey}`, async () => {
        const r = await fetch(movieUrl);
        if (!r.ok) throw new Error(`TMDB movie error ${r.status}`);
        return r.json();
      }, 15 * 60 * 1000);
      combined = (movieData.results || []).map(normaliseMovie);
      totalPages = movieData.total_pages || 1;
    } else if (contentType === 'tv') {
      const tvData = await getOrSetCache(`tv:${cacheKey}`, async () => {
        const r = await fetch(tvUrl);
        if (!r.ok) throw new Error(`TMDB TV error ${r.status}`);
        return r.json();
      }, 15 * 60 * 1000);
      combined = (tvData.results || []).map(normaliseTVShow);
      totalPages = tvData.total_pages || 1;
    } else {
      // both
      const [movieData, tvData] = await Promise.all([
        getOrSetCache(`movie:${cacheKey}`, async () => {
          const r = await fetch(movieUrl);
          if (!r.ok) throw new Error(`TMDB movie error ${r.status}`);
          return r.json();
        }, 15 * 60 * 1000),
        getOrSetCache(`tv:${cacheKey}`, async () => {
          const r = await fetch(tvUrl);
          if (!r.ok) throw new Error(`TMDB TV error ${r.status}`);
          return r.json();
        }, 15 * 60 * 1000)
      ]);
      const movies   = (movieData.results || []).map(normaliseMovie);
      const tvShows  = (tvData.results   || []).map(normaliseTVShow);
      combined   = [...movies, ...tvShows];
      totalPages = Math.max(movieData.total_pages || 1, tvData.total_pages || 1);
    }

    // Bug 1 fix: strict genre post-filter removed — the bandit-derived coarse `genres` param
    // already reflects learned + onboarding-seeded weights; hard-filtering back to onboarding genres
    // prevented the model from ever changing what the user sees.
    console.log(`[discover] lang=${lang} genres=${genres} sortBy=${safeSortBy} page=${pageNum} results=${combined.length}`);

    return res.json({
      results: combined,
      page: pageNum,
      total_pages: totalPages
    });
  } catch (error) {
    console.error('Discovery fetch failed:', error.message);
    return res.status(503).json({ error: 'Failed to fetch content from TMDB. Please try again.' });
  }
});

// GET /api/providers/:itemId
// Query params: region (ISO 3166-1 alpha-2), mediaType (movie|tv)
app.get('/api/providers/:itemId', async (req, res) => {
  const itemId    = parseInt(req.params.itemId, 10);
  const regionParam  = req.query.region    || 'US';
  const mediaType    = req.query.mediaType === 'tv' ? 'tv' : 'movie';

  if (!process.env.TMDB_API_KEY || isNaN(itemId)) {
    return res.status(503).json({ error: 'TMDB API key not configured or invalid ID.' });
  }

  const regionList = [regionParam, 'US', 'IN', 'GB'].filter(
    (r, i, arr) => arr.indexOf(r) === i
  );

  try {
    const providers = await fetchProviders(itemId, regionList, mediaType);
    return res.json({
      id: itemId,
      results: {
        [providers.region || regionList[0]]: {
          flatrate: providers.flatrate,
          rent:     providers.rent,
          buy:      providers.buy
        }
      }
    });
  } catch (error) {
    console.error(`Watch providers fetch failed for ${mediaType} ${itemId}:`, error.message);
    return res.status(503).json({ error: 'Failed to fetch watch providers from TMDB.' });
  }
});

const PROVIDER_LINKS = {
  // Global
  "netflix":                   "https://www.netflix.com",
  "amazon prime video":        "https://www.primevideo.com",
  "prime video":               "https://www.primevideo.com",
  "hulu":                      "https://www.hulu.com",
  "disney+":                   "https://www.disneyplus.com",
  "disney plus":               "https://www.disneyplus.com",
  "max":                       "https://www.max.com",
  "hbo max":                   "https://www.max.com",
  "apple tv+":                 "https://tv.apple.com",
  "apple tv plus":             "https://tv.apple.com",
  "peacock":                   "https://www.peacocktv.com",
  "paramount+":                "https://www.paramountplus.com",
  "paramount plus":            "https://www.paramountplus.com",
  // India — Hotstar variants
  "disney+ hotstar":           "https://www.jiohotstar.com",
  "hotstar":                   "https://www.jiohotstar.com",
  "jiohotstar":                "https://www.jiohotstar.com",
  "jio hotstar":               "https://www.jiohotstar.com",
  // India — other platforms
  "zee5":                      "https://www.zee5.com",
  "sonyliv":                   "https://www.sonyliv.com",
  "sony liv":                  "https://www.sonyliv.com",
  "mxplayer":                  "https://www.mxplayer.in",
  "mx player":                 "https://www.mxplayer.in",
  "sun nxt":                   "https://www.sunnxt.com",
  "sunnxt":                    "https://www.sunnxt.com",
  "aha":                       "https://www.aha.video",
  "erosnow":                   "https://erosnow.com",
  "eros now":                  "https://erosnow.com",
  "jio cinema":                "https://www.jiocinema.com",
  "jiocinema":                 "https://www.jiocinema.com",
  "voot":                      "https://www.voot.com",
  "neestream":                 "https://neestream.com",
  "manorama max":              "https://www.manoramamax.com",
  "planet marathi":            "https://planetmarathi.com"
};

// POST /api/optimize
// Body: { movieIds: [{ id, mediaType }] | [id], region }
app.post('/api/optimize', async (req, res) => {
  let { movieIds = [], region = 'US' } = req.body;


  if (movieIds.length === 0) {
    return res.json({ providers: [], totalLikedWithProviderData: 0, perMovie: [] });
  }

  if (!process.env.TMDB_API_KEY) {
    return res.status(503).json({ error: 'TMDB API key not configured.' });
  }

  // Safety cap
  movieIds = movieIds.slice(0, 200);

  // Normalise: support both { id, mediaType } objects and plain numeric IDs
  const items = movieIds.map(entry =>
    typeof entry === 'object' ? entry : { id: entry, mediaType: 'movie' }
  );

  const regionList = [region, 'US', 'IN', 'GB'].filter(
    (r, i, arr) => arr.indexOf(r) === i
  );

  try {
    const resolved = await Promise.all(
      items.map(async ({ id, mediaType = 'movie' }) => {
        try {
          return { id, mediaType, ...(await fetchProviders(id, regionList, mediaType)) };
        } catch (e) {
          return { id, mediaType, flatrate: [], rent: [], buy: [], region: null };
        }
      })
    );

    const flatrateCounts = {}, flatrateDetails = {};
    const rentBuyCounts  = {}, rentBuyDetails  = {};
    let likedWithProviderData = 0;

    resolved.forEach(({ id, flatrate, rent, buy }) => {
      if (flatrate.length > 0 || rent.length > 0 || buy.length > 0) likedWithProviderData++;

      flatrate.forEach(prov => {
        const name = prov.provider_name;
        flatrateCounts[name] = (flatrateCounts[name] || 0) + 1;
        if (!flatrateDetails[name]) flatrateDetails[name] = prov.logo_path;
      });

      [...rent, ...buy].forEach(prov => {
        const name = prov.provider_name;
        if (!flatrateCounts[name]) {
          rentBuyCounts[name] = (rentBuyCounts[name] || 0) + 1;
          if (!rentBuyDetails[name]) rentBuyDetails[name] = prov.logo_path;
        }
      });
    });

    const buildList = (counts, details, tier) =>
      Object.keys(counts).map(name => {
        const matchCount = counts[name];
        const matchPercentage = likedWithProviderData > 0
          ? Math.round((matchCount / items.length) * 100)
          : 0;
        const cleanKey = name.toLowerCase().trim();
        const directLink = PROVIDER_LINKS[cleanKey] || `https://google.com/search?q=${encodeURIComponent(name)}`;
        return {
          provider_name: name,
          logo_path: details[name] || '',
          match_count: matchCount,
          match_percentage: matchPercentage,
          affiliate_link: directLink,
          tier
        };
      }).sort((a, b) => b.match_percentage - a.match_percentage);

    const providersList = [
      ...buildList(flatrateCounts, flatrateDetails, 'flatrate'),
      ...buildList(rentBuyCounts,  rentBuyDetails,  'rent_buy')
    ];

    const perMovie = resolved.map(({ id, mediaType, flatrate, rent, buy, region: matchedRegion }) => ({
      id,
      mediaType,
      region: matchedRegion,
      flatrate: flatrate.map(p => p.provider_name),
      rentBuy: [...rent, ...buy].map(p => p.provider_name)
    }));

    setTimeout(() => {
      res.json({
        providers: providersList,
        totalLikedWithProviderData: likedWithProviderData,
        perMovie
      });
    }, 400);
  } catch (error) {
    console.error('Optimization failed:', error);
    res.status(500).json({ error: 'Failed to optimize providers' });
  }
});

// Fallback to index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`bingbingbinge Server running at http://localhost:${PORT}`);
    console.log(`TMDB API Key: ${process.env.TMDB_API_KEY ? 'Configured ✓' : 'MISSING ✗'}`);
    console.log(`===================================================`);
  });
}

export default app;
