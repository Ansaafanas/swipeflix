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

/**
 * Normalise a value from [min, max] → [0, 1].
 * Returns 0.5 (middle) if range is zero.
 */
function normalise(value, min, max) {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Score a single movie given a genre-weight map.
 * score = Σ genreWeight[g]  +  0.5 × (0.6 × norm_vote + 0.4 × norm_pop)
 */
function scoreMovie(movie, genreWeights, normStats) {
  const genreScore = (movie.genre_ids || []).reduce((acc, gid) => {
    return acc + (genreWeights[gid] || 0);
  }, 0);

  const normVote = normalise(movie.vote_average || 0, normStats.minVote, normStats.maxVote);
  const normPop  = normalise(movie.popularity   || 0, normStats.minPop,  normStats.maxPop);
  const qualityBonus = 0.5 * (0.6 * normVote + 0.4 * normPop);

  return genreScore + qualityBonus;
}

/**
 * Diversity pass: re-order so no more than 2 consecutive cards share the
 * same primary genre (first element of genre_ids array).
 */
function diversityPass(movies) {
  const result = [];
  const pending = [...movies];

  while (pending.length > 0) {
    // Determine the primary genre of the last 2 cards
    const lastTwo = result.slice(-2).map(m => (m.genre_ids || [])[0]);
    const blocked = (lastTwo.length === 2 && lastTwo[0] === lastTwo[1])
      ? lastTwo[0]
      : null;

    // Find the highest-ranked card that isn't blocked
    let chosen = -1;
    if (blocked !== null) {
      chosen = pending.findIndex(m => (m.genre_ids || [])[0] !== blocked);
    }

    if (chosen === -1) chosen = 0; // no alternative — just take the top
    result.push(pending.splice(chosen, 1)[0]);
  }

  return result;
}

/**
 * Map TMDB `overview` → `synopsis` so all clients receive a consistent shape.
 */
function normaliseTMDBMovie(m) {
  return {
    ...m,
    synopsis: m.overview || m.synopsis || ''
  };
}

/**
 * Fetch watch providers for a single movie, trying a prioritised region list.
 * Returns { flatrate, rent, buy } arrays from the best matching region.
 */
async function fetchProviders(movieId, regionList) {
  const url = `https://api.themoviedb.org/3/movie/${movieId}/watch/providers?api_key=${process.env.TMDB_API_KEY}`;
  const cacheKey = `providers:${movieId}`;

  const data = await getOrSetCache(cacheKey, async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`TMDB responded with ${response.status}`);
    return await response.json();
  }, 12 * 60 * 60 * 1000); // 12 hour TTL

  const allRegions = data?.results || {};

  // Walk through priority regions and return the first one with usable data
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
app.get('/api/discover', async (req, res) => {
  const { lang = '', genres = '', page = 1, weights = '' } = req.query;
  const pageNum = parseInt(page, 10) || 1;

  if (!process.env.TMDB_API_KEY) {
    return res.status(503).json({ error: 'TMDB API key not configured.' });
  }

  // Parse the full preference weight vector sent by the client
  // Format: "genreId:weight,genreId:weight,..."
  const genreWeights = {};
  if (weights) {
    weights.split(',').forEach(pair => {
      const [id, w] = pair.split(':');
      const gid = parseInt(id, 10);
      const weight = parseFloat(w);
      if (!isNaN(gid) && !isNaN(weight)) {
        genreWeights[gid] = weight;
      }
    });
  }

  // Coarse TMDB filter: top ~5 genres with positive weight
  // (client already computes this, but we parse genres param as the pre-filtered list)
  let url = `https://api.themoviedb.org/3/discover/movie?api_key=${process.env.TMDB_API_KEY}&sort_by=popularity.desc&page=${pageNum}&vote_count.gte=50`;
  if (lang) url += `&with_original_language=${lang}`;
  if (genres) url += `&with_genres=${genres}`;

  const cacheKey = `discover:${lang}:${genres}:${pageNum}`;

  try {
    const data = await getOrSetCache(cacheKey, async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`TMDB responded with ${response.status}`);
      return await response.json();
    }, 15 * 60 * 1000); // 15 min TTL

    let movies = (data.results || []).map(normaliseTMDBMovie);

    // Server-side scoring (only meaningful when weights are provided)
    if (Object.keys(genreWeights).length > 0) {
      // Compute normalisation bounds across this candidate set
      const votes = movies.map(m => m.vote_average || 0);
      const pops  = movies.map(m => m.popularity   || 0);
      const normStats = {
        minVote: Math.min(...votes), maxVote: Math.max(...votes),
        minPop:  Math.min(...pops),  maxPop:  Math.max(...pops)
      };

      movies = movies
        .map(m => ({ ...m, _score: scoreMovie(m, genreWeights, normStats) }))
        .sort((a, b) => b._score - a._score);

      // Diversity pass: prevent runs of >2 same-primary-genre cards
      movies = diversityPass(movies);

      // Strip internal score field before sending to client
      movies = movies.map(({ _score, ...rest }) => rest);
    }

    return res.json({
      results: movies,
      page: data.page,
      total_pages: data.total_pages
    });
  } catch (error) {
    console.error('Discovery fetch failed:', error.message);
    return res.status(503).json({ error: 'Failed to fetch movies from TMDB. Please try again.' });
  }
});

// GET /api/providers/:movieId
app.get('/api/providers/:movieId', async (req, res) => {
  const movieId = parseInt(req.params.movieId, 10);
  const regionParam = req.query.region || 'US';

  if (!process.env.TMDB_API_KEY || isNaN(movieId)) {
    return res.status(503).json({ error: 'TMDB API key not configured or invalid movie ID.' });
  }

  // Build prioritised region list: requested region first, then common fallbacks
  const regionList = [regionParam, 'US', 'IN', 'GB'].filter(
    (r, i, arr) => arr.indexOf(r) === i
  );

  try {
    const providers = await fetchProviders(movieId, regionList);

    // Return in standard TMDB results wrapper shape
    return res.json({
      id: movieId,
      results: {
        [providers.region || regionList[0]]: {
          flatrate: providers.flatrate,
          rent:     providers.rent,
          buy:      providers.buy
        }
      }
    });
  } catch (error) {
    console.error(`Watch providers fetch failed for movie ${movieId}:`, error.message);
    return res.status(503).json({ error: 'Failed to fetch watch providers from TMDB.' });
  }
});

// POST /api/optimize
app.post('/api/optimize', async (req, res) => {
  let { movieIds = [], region = 'US' } = req.body;

  if (movieIds.length === 0) {
    return res.json({ providers: [], totalLikedWithProviderData: 0 });
  }

  if (!process.env.TMDB_API_KEY) {
    return res.status(503).json({ error: 'TMDB API key not configured.' });
  }

  // Safety cap to prevent unbounded fan-out
  movieIds = movieIds.slice(0, 200);

  // Build prioritised region list
  const regionList = [region, 'US', 'IN', 'GB'].filter(
    (r, i, arr) => arr.indexOf(r) === i
  );

  const providerLinks = {
    "netflix": "https://www.netflix.com",
    "amazon prime video": "https://www.primevideo.com",
    "hulu": "https://www.hulu.com",
    "disney+": "https://www.disneyplus.com",
    "disney plus": "https://www.disneyplus.com",
    "max": "https://www.max.com",
    "hbo max": "https://www.max.com",
    "apple tv+": "https://tv.apple.com",
    "apple tv plus": "https://tv.apple.com"
  };

  try {
    const resolved = await Promise.all(
      movieIds.map(async (id) => {
        try {
          return { id, ...(await fetchProviders(id, regionList)) };
        } catch (e) {
          return { id, flatrate: [], rent: [], buy: [], region: null };
        }
      })
    );

    // Separate aggregation for flatrate vs rent/buy
    const flatrateCounts = {}, flatrateDetails = {};
    const rentBuyCounts  = {}, rentBuyDetails  = {};
    let likedWithProviderData = 0;

    resolved.forEach(({ id, flatrate, rent, buy }) => {
      const anyData = flatrate.length > 0 || rent.length > 0 || buy.length > 0;
      if (anyData) likedWithProviderData++;

      flatrate.forEach(prov => {
        const name = prov.provider_name;
        flatrateCounts[name] = (flatrateCounts[name] || 0) + 1;
        if (!flatrateDetails[name]) flatrateDetails[name] = prov.logo_path;
      });

      // Rent & buy as a single "available to rent/buy" tier
      [...rent, ...buy].forEach(prov => {
        const name = prov.provider_name;
        if (!flatrateCounts[name]) { // don't double-count flatrate providers
          rentBuyCounts[name] = (rentBuyCounts[name] || 0) + 1;
          if (!rentBuyDetails[name]) rentBuyDetails[name] = prov.logo_path;
        }
      });
    });

    const buildList = (counts, details, tier) =>
      Object.keys(counts).map(name => {
        const matchCount = counts[name];
        const matchPercentage = likedWithProviderData > 0
          ? Math.round((matchCount / movieIds.length) * 100)
          : 0;
        const cleanKey = name.toLowerCase().trim();
        const directLink = providerLinks[cleanKey] || `https://google.com/search?q=${encodeURIComponent(name)}`;
        return {
          provider_name: name,
          logo_path: details[name] || '',
          match_count: matchCount,
          match_percentage: matchPercentage,
          affiliate_link: directLink,
          tier // 'flatrate' | 'rent_buy'
        };
      }).sort((a, b) => b.match_percentage - a.match_percentage);

    const providersList = [
      ...buildList(flatrateCounts, flatrateDetails, 'flatrate'),
      ...buildList(rentBuyCounts,  rentBuyDetails,  'rent_buy')
    ];

    // Also send back per-movie provider breakdown for the "Where to Watch" section
    const perMovie = resolved.map(({ id, flatrate, rent, buy, region: matchedRegion }) => ({
      id,
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
