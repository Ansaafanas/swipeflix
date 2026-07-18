import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Resolve static folder path
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

  if (cached && cached.expiry > now) {
    return cached.value;
  }

  try {
    const value = await fetchFn();
    cache.set(key, { value, expiry: now + ttlMs });
    return value;
  } catch (error) {
    // Stale-cache-serve fallback: serve stale data on API error
    if (cached) {
      console.warn(`TMDB error. Serving stale cache for key: ${key}`);
      return cached.value;
    }
    throw error;
  }
};

// Clean expired cache items every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of cache.entries()) {
    if (item.expiry <= now) {
      cache.delete(key);
    }
  }
}, 5 * 60 * 1000);


// ==========================================
// Middleware & Routes
// ==========================================

// GET /api/discover
app.get('/api/discover', async (req, res) => {
  const { lang = '', genres = '', page = 1 } = req.query;
  const pageNum = parseInt(page, 10) || 1;

  if (!process.env.TMDB_API_KEY) {
    return res.status(503).json({ error: 'TMDB API key not configured.' });
  }

  // Randomize TMDB sorting parameter to guarantee unique flows on each session
  const sortOptions = [
    'popularity.desc',
    'revenue.desc',
    'vote_average.desc',
    'vote_count.desc',
    'release_date.desc'
  ];
  const randomSort = sortOptions[Math.floor(Math.random() * sortOptions.length)];
  const cacheKey = `discover:${lang}:${genres}:${pageNum}:${randomSort}`;

  let url = `https://api.themoviedb.org/3/discover/movie?api_key=${process.env.TMDB_API_KEY}&sort_by=${randomSort}&page=${pageNum}&vote_count.gte=50`;
  if (lang) {
    url += `&with_original_language=${lang}`;
  }
  if (genres) {
    url += `&with_genres=${genres}`;
  }

  try {
    const data = await getOrSetCache(cacheKey, async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`TMDB responded with ${response.status}`);
      return await response.json();
    }, 15 * 60 * 1000); // 15 min TTL

    // Shuffle results for randomised card flow
    const shuffled = [...(data.results || [])];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return res.json({
      results: shuffled,
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

  if (!process.env.TMDB_API_KEY || isNaN(movieId)) {
    return res.status(503).json({ error: 'TMDB API key not configured or invalid movie ID.' });
  }

  const cacheKey = `providers:${movieId}`;
  const url = `https://api.themoviedb.org/3/movie/${movieId}/watch/providers?api_key=${process.env.TMDB_API_KEY}`;

  try {
    const data = await getOrSetCache(cacheKey, async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`TMDB responded with ${response.status}`);
      return await response.json();
    }, 12 * 60 * 60 * 1000); // 12 hour TTL

    return res.json(data);
  } catch (error) {
    console.error(`Watch providers fetch failed for movie ${movieId}:`, error.message);
    return res.status(503).json({ error: 'Failed to fetch watch providers from TMDB.' });
  }
});

// POST /api/optimize
app.post('/api/optimize', async (req, res) => {
  const { movieIds = [], region = 'US' } = req.body;

  if (movieIds.length === 0) {
    return res.json({ providers: [], totalLikedWithProviderData: 0 });
  }

  if (!process.env.TMDB_API_KEY) {
    return res.status(503).json({ error: 'TMDB API key not configured.' });
  }

  try {
    const providerLookups = movieIds.map(async (id) => {
      const cacheKey = `providers:${id}`;
      const url = `https://api.themoviedb.org/3/movie/${id}/watch/providers?api_key=${process.env.TMDB_API_KEY}`;
      try {
        const data = await getOrSetCache(cacheKey, async () => {
          const response = await fetch(url);
          if (!response.ok) throw new Error('TMDB error');
          return await response.json();
        }, 12 * 60 * 60 * 1000);
        return { id, data };
      } catch (e) {
        return { id, data: { results: {} } };
      }
    });

    const resolved = await Promise.all(providerLookups);

    // Aggregate flatrate providers
    const counts = {};
    const details = {};
    let likedWithProviderData = 0;

    resolved.forEach(({ id, data }) => {
      const regionData = data?.results?.[region];
      const flatrate = regionData?.flatrate || [];

      if (flatrate.length > 0) {
        likedWithProviderData++;
        flatrate.forEach(prov => {
          const name = prov.provider_name;
          counts[name] = (counts[name] || 0) + 1;
          if (!details[name]) {
            details[name] = prov.logo_path;
          }
        });
      }
    });

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

    const providersList = Object.keys(counts).map(name => {
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
        affiliate_link: directLink
      };
    });

    providersList.sort((a, b) => b.match_percentage - a.match_percentage);

    setTimeout(() => {
      res.json({
        providers: providersList,
        totalLikedWithProviderData: likedWithProviderData
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

// Start the server (local development only)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`SwipeFlix Server running at http://localhost:${PORT}`);
    console.log(`TMDB API Key: ${process.env.TMDB_API_KEY ? 'Configured' : 'MISSING'}`);
    console.log(`===================================================`);
  });
}

export default app;
