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

function normalise(value, min, max) {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Score a single item given a genre-weight map.
 * score = Σ genreWeight[g]  +  0.5 × (0.6 × norm_vote + 0.4 × norm_pop)
 */
function scoreItem(item, genreWeights, normStats) {
  const genreScore = (item.genre_ids || []).reduce((acc, gid) => {
    return acc + (genreWeights[gid] || 0);
  }, 0);
  const normVote = normalise(item.vote_average || 0, normStats.minVote, normStats.maxVote);
  const normPop  = normalise(item.popularity   || 0, normStats.minPop,  normStats.maxPop);
  const qualityBonus = 0.5 * (0.6 * normVote + 0.4 * normPop);
  return genreScore + qualityBonus;
}

/**
 * Diversity pass: re-order so no more than 2 consecutive cards share the
 * same primary genre (first element of genre_ids array).
 */
function diversityPass(items) {
  const result = [];
  const pending = [...items];
  while (pending.length > 0) {
    const lastTwo = result.slice(-2).map(m => (m.genre_ids || [])[0]);
    const blocked = (lastTwo.length === 2 && lastTwo[0] === lastTwo[1]) ? lastTwo[0] : null;
    let chosen = -1;
    if (blocked !== null) {
      chosen = pending.findIndex(m => (m.genre_ids || [])[0] !== blocked);
    }
    if (chosen === -1) chosen = 0;
    result.push(pending.splice(chosen, 1)[0]);
  }
  return result;
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
 * Known provider link map, including all Hotstar / JioHotstar / Disney+ Hotstar variants.
 */
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
//   genres      - pipe-separated genre IDs (top-5 positive-weight, coarse OR filter)
//   userGenres  - pipe-separated genre IDs explicitly selected by the user (strict post-filter)
//   page        - page number
//   weights     - full preference vector "genreId:weight,..." for server-side scoring
app.get('/api/discover', async (req, res) => {
  const { lang = '', genres = '', userGenres = '', page = 1, weights = '' } = req.query;
  const pageNum = parseInt(page, 10) || 1;

  if (!process.env.TMDB_API_KEY) {
    return res.status(503).json({ error: 'TMDB API key not configured.' });
  }

  // Parse preference weights
  const genreWeights = {};
  if (weights) {
    weights.split(',').forEach(pair => {
      const [id, w] = pair.split(':');
      const gid = parseInt(id, 10);
      const weight = parseFloat(w);
      if (!isNaN(gid) && !isNaN(weight)) genreWeights[gid] = weight;
    });
  }

  // Parse strict user-selected genre IDs for post-filtering
  const userGenreIds = userGenres
    ? userGenres.split('|').map(g => parseInt(g, 10)).filter(Boolean)
    : [];

  // Build base TMDB query parameters
  const baseParams = `api_key=${process.env.TMDB_API_KEY}&sort_by=popularity.desc&page=${pageNum}&vote_count.gte=20`;
  const langParam   = lang   ? `&with_original_language=${lang}`  : '';
  // Use comma (AND) for single genre, pipe (OR) for multiple — ensures Animation only gives Animation
  const genreParam  = genres
    ? `&with_genres=${genres.includes('|') ? genres : genres}`
    : '';

  const movieUrl = `https://api.themoviedb.org/3/discover/movie?${baseParams}${langParam}${genreParam}`;
  const tvUrl    = `https://api.themoviedb.org/3/discover/tv?${baseParams}${langParam}${genreParam}`;

  const cacheKey = `discover:${lang}:${genres}:${pageNum}`;

  try {
    // Fetch movies and TV shows in parallel
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
    let combined   = [...movies, ...tvShows];

    // Strict genre post-filter: if the user explicitly selected genres,
    // only keep items that include at least one of those genres.
    if (userGenreIds.length > 0) {
      combined = combined.filter(item =>
        (item.genre_ids || []).some(gid => userGenreIds.includes(gid))
      );
    }

    // Server-side scoring
    if (Object.keys(genreWeights).length > 0 && combined.length > 0) {
      const votes = combined.map(m => m.vote_average || 0);
      const pops  = combined.map(m => m.popularity   || 0);
      const normStats = {
        minVote: Math.min(...votes), maxVote: Math.max(...votes),
        minPop:  Math.min(...pops),  maxPop:  Math.max(...pops)
      };
      combined = combined
        .map(m => ({ ...m, _score: scoreItem(m, genreWeights, normStats) }))
        .sort((a, b) => b._score - a._score);
      combined = diversityPass(combined);
      combined = combined.map(({ _score, ...rest }) => rest);
    } else {
      // No weights yet — still apply diversity pass on the merged list
      combined = diversityPass(combined);
    }

    // Use the higher of the two total_pages as the pagination ceiling
    const totalPages = Math.max(
      movieData.total_pages || 1,
      tvData.total_pages   || 1
    );

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
    console.log(`SwipeFlix Server running at http://localhost:${PORT}`);
    console.log(`TMDB API Key: ${process.env.TMDB_API_KEY ? 'Configured ✓' : 'MISSING ✗'}`);
    console.log(`===================================================`);
  });
}

export default app;
