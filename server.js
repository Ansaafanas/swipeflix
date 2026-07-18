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

// Helper to get from cache or set
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
    // Stale-cache-serve fallback: Serve stale data on API error
    if (cached) {
      console.warn(`TMDB error. Serving stale cache for key: ${key}`);
      return cached.value;
    }
    throw error;
  }
};

// Clean expired cache items every 5 minutes to prevent leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of cache.entries()) {
    if (item.expiry <= now) {
      cache.delete(key);
    }
  }
}, 5 * 60 * 1000);


// ==========================================
// Mock Database (Fallback & Dev Mode)
// ==========================================
const BASE_MOCK_MOVIES = [
  {
    id: 157336,
    title: "Interstellar",
    poster_path: "/gEU2QniE6E7vNIvTa7KM7xt2Z1a.jpg",
    synopsis: "The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage.",
    genre_ids: [12, 18, 878],
    original_language: "en",
    popularity: 92.5,
    release_date: "2014-11-05",
    vote_average: 8.4
  },
  {
    id: 155,
    title: "The Dark Knight",
    poster_path: "/qJ2tW65lU91wSpGC2uUNnsRStIM.jpg",
    synopsis: "Batman raises the stakes in his war on crime. With the help of Lt. Jim Gordon and District Attorney Harvey Dent, Batman sets out to dismantle the remaining criminal organizations that plague the streets. The partnership proves to be effective, but they soon find themselves prey to a reign of chaos unleashed by a rising criminal mastermind known to the terrified citizens of Gotham as the Joker.",
    genre_ids: [28, 80, 18, 53],
    original_language: "en",
    popularity: 85.2,
    release_date: "2008-07-16",
    vote_average: 8.5
  },
  {
    id: 129,
    title: "Spirited Away",
    poster_path: "/39wmItIWsg5sclJmTyhjuhvwtv.jpg",
    synopsis: "A young girl, Chihiro, becomes trapped in a strange new world of spirits. When her parents undergo a mysterious transformation, she must call on the courage she never knew she had to free her family.",
    genre_ids: [14, 16, 10751],
    original_language: "ja",
    popularity: 78.4,
    release_date: "2001-07-20",
    vote_average: 8.5
  },
  {
    id: 496243,
    title: "Parasite",
    poster_path: "/7iiO7mBz5Y17t6eXqmtVZo4zVnC.jpg",
    synopsis: "All unemployed, Ki-taek's family takes peculiar interest in the wealthy and glamorous Parks for their livelihood until they get entangled in an unexpected incident.",
    genre_ids: [35, 18, 53],
    original_language: "ko",
    popularity: 69.1,
    release_date: "2019-05-30",
    vote_average: 8.5
  },
  {
    id: 680,
    title: "Pulp Fiction",
    poster_path: "/d5i25Cc3je0tSt0v2qXP0m0F5gq.jpg",
    synopsis: "A burger-loving hitman, his philosophical partner, a drug-addled gangster's moll, and a washed-up boxer converge in this sprawling, comedic crime caper. Their adventures unfurl in three stories that weave in and out of each other.",
    genre_ids: [53, 80],
    original_language: "en",
    popularity: 74.2,
    release_date: "1994-09-10",
    vote_average: 8.5
  },
  {
    id: 324857,
    title: "Spider-Man: Into the Spider-Verse",
    poster_path: "/iizzNCOiEIv526OSc6u2n275m3q.jpg",
    synopsis: "Struggling to find his place in the world while coping with new web-slinging powers, Brooklyn teenager Miles Morales encounters multi-dimensional spider-heroes who show him that anyone can wear the mask.",
    genre_ids: [28, 12, 16, 878],
    original_language: "en",
    popularity: 81.3,
    release_date: "2018-12-06",
    vote_average: 8.4
  },
  {
    id: 194,
    title: "Amélie",
    poster_path: "/5nCzc7W2a21t1953n265j6680A6.jpg",
    synopsis: "Amélie is an innocent and naive girl in Paris with her own sense of justice. She decides to help those around her and, along the way, discovers love.",
    genre_ids: [35, 10749],
    original_language: "fr",
    popularity: 42.1,
    release_date: "2001-04-25",
    vote_average: 7.9
  },
  {
    id: 1417,
    title: "Pan's Labyrinth",
    poster_path: "/cuF0s65tPzCiw6L7X8p9G7Rk97v.jpg",
    synopsis: "In the Falangist Spain of 1944, the young stepdaughter of a sadistic army officer takes refuge in a eerie but captivating fantasy world.",
    genre_ids: [14, 18, 27],
    original_language: "es",
    popularity: 38.6,
    release_date: "2006-10-15",
    vote_average: 8.0
  },
  {
    id: 372058,
    title: "Your Name.",
    poster_path: "/q719jXXEz5gtz8e6IYR6K4Jt3t1.jpg",
    synopsis: "High schoolers Mitsuha and Taki are complete strangers living separate lives. But one night, they suddenly switch places. Mitsuha wakes up in Taki’s body, and he in hers. This bizarre occurrence continues to happen randomly, and the two must adjust their lives around each other.",
    genre_ids: [10749, 16, 18],
    original_language: "ja",
    popularity: 64.7,
    release_date: "2016-08-26",
    vote_average: 8.5
  },
  {
    id: 438631,
    title: "Dune",
    poster_path: "/d5N2VWNiZcwNpJUkrI6G561iE3i.jpg",
    synopsis: "Paul Atreides, a brilliant and gifted young man born into a great destiny beyond his understanding, must travel to the most dangerous planet in the universe to ensure the future of his family and his people.",
    genre_ids: [878, 12],
    original_language: "en",
    popularity: 88.9,
    release_date: "2021-09-15",
    vote_average: 7.8
  },
  {
    id: 354912,
    title: "Coco",
    poster_path: "/gGEZw9EM45Pt6m6YiJbAlT5BSAE.jpg",
    synopsis: "Aspiring musician Miguel, confronted with his family's ancestral ban on music, enters the Land of the Dead to find his great-great-grandfather, a legendary singer.",
    genre_ids: [16, 10751, 35],
    original_language: "en",
    popularity: 72.8,
    release_date: "2017-10-27",
    vote_average: 8.2
  },
  {
    id: 98,
    title: "Gladiator",
    poster_path: "/ty85ILfsBuyVw2KyxRNeNqvO687.jpg",
    synopsis: "In the year 180, the death of Emperor Marcus Aurelius throws the Roman Empire into chaos. Maximus is one of the Roman army's most capable and trusted generals and a key advisor to the Emperor. As Marcus' devious son Commodus ascends to the throne, Maximus is set to be executed. He escapes, but is captured by slave traders and forced to become a gladiator.",
    genre_ids: [28, 12, 18],
    original_language: "en",
    popularity: 63.4,
    release_date: "2000-05-01",
    vote_average: 8.2
  },
  {
    id: 546554,
    title: "Knives Out",
    poster_path: "/pThyQOV5616t1405zZLy2i2m173.jpg",
    synopsis: "When renowned crime novelist Harlan Thrombey is found dead at his estate just after his 85th birthday, the inquisitive and debonair Detective Benoit Blanc is mysteriously enlisted to investigate. From Harlan's dysfunctional family to his devoted staff, Blanc sifts through a web of red herrings and self-serving lies to uncover the truth.",
    genre_ids: [35, 9648, 53],
    original_language: "en",
    popularity: 58.1,
    release_date: "2019-11-27",
    vote_average: 7.9
  },
  {
    id: 244786,
    title: "Whiplash",
    poster_path: "/7fn624pXjO3nqp686Rb131kr6Ju.jpg",
    synopsis: "Under the direction of a ruthless instructor, a talented young drummer begins to pursue perfection at any cost, even his humanity.",
    genre_ids: [18, 10402],
    original_language: "en",
    popularity: 49.3,
    release_date: "2014-10-10",
    vote_average: 8.4
  },
  {
    id: 772071,
    title: "Everything Everywhere All at Once",
    poster_path: "/w355EzdcyH8Vf9e7tWz42YgV62X.jpg",
    synopsis: "An aging Chinese immigrant is swept up in an insane adventure, where she alone can save the world by exploring other universes connecting with the lives she could have led.",
    genre_ids: [28, 12, 878, 35],
    original_language: "en",
    popularity: 76.5,
    release_date: "2022-03-24",
    vote_average: 8.0
  },
  {
    id: 27205,
    title: "Inception",
    poster_path: "/oYu2m5c1Im4u43jFcJ17s4ag5cc.jpg",
    synopsis: "Cobb, a skilled thief who commits corporate espionage by infiltrating the subconscious of his targets is offered a chance to regain his old life as payment for a task considered to be impossible: \"inception\", the implantation of another person's idea into a target's subconscious.",
    genre_ids: [28, 878, 12, 53],
    original_language: "en",
    popularity: 83.7,
    release_date: "2010-07-15",
    vote_average: 8.4
  },
  {
    id: 77338,
    title: "The Intouchables",
    poster_path: "/16s1qC7csa81QeeL2nC1bY8c281.jpg",
    synopsis: "A close-knit, unlikely friendship develops between a wealthy quadriplegic aristocrat, Philippe, and his street-smart caregiver, Driss.",
    genre_ids: [18, 35],
    original_language: "fr",
    popularity: 39.4,
    release_date: "2011-11-02",
    vote_average: 8.3
  },
  {
    id: 426426,
    title: "Roma",
    poster_path: "/7iiO7mBz5Y17t6eXqmtVZo4zVnC.jpg", // placeholder if none, let's use a nice one
    synopsis: "A year in the life of a middle-class family's housekeeper in Mexico City in the early 1970s.",
    genre_ids: [18],
    original_language: "es",
    popularity: 28.3,
    release_date: "2018-08-25",
    vote_average: 7.7
  },
  {
    id: 128,
    title: "Princess Mononoke",
    poster_path: "/gEu2QniE6E7vNIvTa7KM7xt2Z1a.jpg", // placeholder
    synopsis: "Ashitaka, a prince of the disappearing Emishi people, is cursed by a demonized boar god and must journey to the west to find a cure. Along the way, he encounters San, a young woman raised by wolves, fighting to protect the forest from industrialization.",
    genre_ids: [12, 14, 16],
    original_language: "ja",
    popularity: 56.4,
    release_date: "1997-07-12",
    vote_average: 8.3
  },
  {
    id: 11324,
    title: "Shutter Island",
    poster_path: "/ty85ILfsBuyVw2KyxRNeNqvO687.jpg",
    synopsis: "World War II soldier turned U.S. Marshal Teddy Daniels investigates the disappearance of a patient from Boston's Shutter Island Ashecliffe Hospital.",
    genre_ids: [18, 53, 9648],
    original_language: "en",
    popularity: 59.8,
    release_date: "2010-02-14",
    vote_average: 8.2
  },
  {
    id: 120467,
    title: "The Grand Budapest Hotel",
    poster_path: "/pThyQOV5616t1405zZLy2i2m173.jpg",
    synopsis: "The writer relates his adventures at a renowned European resort between the wars with a concierge who is wrongly framed for murder.",
    genre_ids: [35, 18],
    original_language: "en",
    popularity: 43.1,
    release_date: "2014-02-26",
    vote_average: 8.0
  },
  {
    id: 603,
    title: "The Matrix",
    poster_path: "/f89U3wzPwMUOW67587z3fiiGjY6.jpg",
    synopsis: "Set in the 22nd century, The Matrix tells the story of a computer hacker who joins a group of underground insurgents fighting the vast and powerful computers who now rule the earth.",
    genre_ids: [28, 878],
    original_language: "en",
    popularity: 72.1,
    release_date: "1999-03-30",
    vote_average: 8.2
  },
  {
    id: 33157,
    title: "The Secret in Their Eyes",
    synopsis: "A retired legal counselor writes a novel hoping to find closure for one of his past unresolved homicide cases and for his unreciprocated love with his superior - both of which still haunt him decades later.",
    poster_path: "/16s1qC7csa81QeeL2nC1bY8c281.jpg",
    genre_ids: [18, 9648, 53, 10749],
    original_language: "es",
    popularity: 29.5,
    release_date: "2009-08-13",
    vote_average: 8.0
  },
  {
    id: 531428,
    title: "Portrait of a Lady on Fire",
    synopsis: "On an isolated island in Brittany at the end of the eighteenth century, a female painter is obliged to paint a wedding portrait of a young woman.",
    poster_path: "/cuF0s65tPzCiw6L7X8p9G7Rk97v.jpg",
    genre_ids: [18, 10749],
    original_language: "fr",
    popularity: 33.1,
    release_date: "2019-09-18",
    vote_average: 8.2
  },
  {
    id: 244049,
    title: "Drishyam",
    poster_path: "/7d8GLneJkF81q1POdK7VUrjWafX.jpg",
    synopsis: "A man goes to extreme lengths to save his family from punishment after they accidentally commit a crime.",
    genre_ids: [18, 53, 80],
    original_language: "ml",
    popularity: 42.5,
    release_date: "2013-12-19",
    vote_average: 8.4
  },
  {
    id: 1199580,
    title: "Manjummel Boys",
    poster_path: "/4N8WNoZSOELr35J21Du6XiYeakN.jpg",
    synopsis: "A group of friends from a small town face a harrowing rescue mission when one of them falls into deep caves.",
    genre_ids: [12, 18, 53],
    original_language: "ml",
    popularity: 58.1,
    release_date: "2024-02-22",
    vote_average: 8.2
  },
  {
    id: 341895,
    title: "Premam",
    poster_path: "/wfMgsfDrtouYOM6MbrkHtU96Xij.jpg",
    synopsis: "A young man finds romance in three different stages of his life, discovering himself along the way.",
    genre_ids: [35, 18, 10749],
    original_language: "ml",
    popularity: 38.6,
    release_date: "2015-05-29",
    vote_average: 8.3
  }
];

const MOCK_PROVIDERS = {
  8: { provider_name: "Netflix", logo_path: "/peURlLhxptfv1QGIHGQwveUsR61.jpg" },
  9: { provider_name: "Amazon Prime Video", logo_path: "/9A1s49tdr34ZBc60nGNnF7N63gP.jpg" },
  15: { provider_name: "Hulu", logo_path: "/db814HG4qnnmZ22Uc8UB46vH4aB.jpg" },
  337: { provider_name: "Disney+", logo_path: "/7rw0EsR9ky7BF4R5fs7PwZgZu7y.jpg" },
  1899: { provider_name: "Max", logo_path: "/fksCUZ9QDWZMUwL2LgMtLckROUN.jpg" },
  350: { provider_name: "Apple TV+", logo_path: "/4k11wY2Zg95pT0tT8L4G8636B4D.jpg" }
};

// Map movie ID -> provider list
const MOCK_MOVIE_PROVIDERS = {
  157336: { flatrate: [MOCK_PROVIDERS[8], MOCK_PROVIDERS[9]] },
  155: { flatrate: [MOCK_PROVIDERS[1899], MOCK_PROVIDERS[9]] },
  129: { flatrate: [MOCK_PROVIDERS[1899], MOCK_PROVIDERS[8]] },
  496243: { flatrate: [MOCK_PROVIDERS[1899], MOCK_PROVIDERS[15]] },
  680: { flatrate: [MOCK_PROVIDERS[8], MOCK_PROVIDERS[1899]] },
  324857: { flatrate: [MOCK_PROVIDERS[337], MOCK_PROVIDERS[8]] },
  194: { flatrate: [MOCK_PROVIDERS[9], MOCK_PROVIDERS[350]] },
  1417: { flatrate: [MOCK_PROVIDERS[9], MOCK_PROVIDERS[1899]] },
  372058: { flatrate: [MOCK_PROVIDERS[9]] },
  438631: { flatrate: [MOCK_PROVIDERS[1899], MOCK_PROVIDERS[15]] },
  354912: { flatrate: [MOCK_PROVIDERS[337]] },
  98: { flatrate: [MOCK_PROVIDERS[9], MOCK_PROVIDERS[8]] },
  546554: { flatrate: [MOCK_PROVIDERS[8]] },
  244786: { flatrate: [MOCK_PROVIDERS[8], MOCK_PROVIDERS[350]] },
  772071: { flatrate: [MOCK_PROVIDERS[8], MOCK_PROVIDERS[9]] },
  27205: { flatrate: [MOCK_PROVIDERS[1899], MOCK_PROVIDERS[8]] },
  77338: { flatrate: [MOCK_PROVIDERS[8], MOCK_PROVIDERS[9]] },
  426426: { flatrate: [MOCK_PROVIDERS[8]] },
  128: { flatrate: [MOCK_PROVIDERS[1899]] },
  11324: { flatrate: [MOCK_PROVIDERS[9], MOCK_PROVIDERS[8]] },
  120467: { flatrate: [MOCK_PROVIDERS[337], MOCK_PROVIDERS[1899]] },
  603: { flatrate: [MOCK_PROVIDERS[1899], MOCK_PROVIDERS[9]] },
  33157: { flatrate: [MOCK_PROVIDERS[9]] },
  531428: { flatrate: [MOCK_PROVIDERS[15]] }
};

const MOCK_MOVIES = [];

// Dynamically generate exactly 100 movies with unique titles, genres, languages, and watch providers (FR-4.x mock database expansion)
(() => {
  // Push all base high-fidelity movies first
  MOCK_MOVIES.push(...BASE_MOCK_MOVIES);
  
  const adjectives = ["Epic", "Silent", "Secret", "Lost", "Hidden", "Final", "Golden", "Dark", "Deep", "Red", "Blue", "Eternal", "Sacred", "Wild", "Midnight", "Broken", "Shadow", "Forgotten", "Last", "First"];
  const nouns = ["Journey", "Empire", "Symphony", "Shadow", "Labyrinth", "Warrior", "Legend", "Story", "Horizon", "Kingdom", "Ocean", "Memory", "Dreams", "Knight", "Edge", "Dawn", "Revenge", "Alliance", "Legacy", "Truth"];
  
  let currentId = 900000;
  while (MOCK_MOVIES.length < 100) {
    const base = BASE_MOCK_MOVIES[Math.floor(Math.random() * BASE_MOCK_MOVIES.length)];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const newTitle = `${adj} ${noun}`;
    
    const clone = {
      ...base,
      id: currentId++,
      title: newTitle,
      popularity: parseFloat((Math.random() * 50 + 10).toFixed(1)),
      vote_average: parseFloat((Math.random() * 3 + 6).toFixed(1)),
      // Randomize languages and genres for full catalog distribution
      original_language: ['en', 'es', 'fr', 'ja', 'de', 'ko', 'zh', 'it', 'pt', 'ru', 'hi', 'da', 'ml'][Math.floor(Math.random() * 13)],
      genre_ids: [
        [28, 12], [35, 10749], [18, 35], [16, 10751], [878, 28], [53, 9648], [14, 12], [27, 53], [36, 18], [10752, 28]
      ][Math.floor(Math.random() * 10)]
    };
    MOCK_MOVIES.push(clone);
  }

  // Populate mock providers for all movies to keep dashboard stats fully populated
  MOCK_MOVIES.forEach(movie => {
    if (!MOCK_MOVIE_PROVIDERS[movie.id]) {
      const providerIds = [8, 9, 15, 337, 1899, 350];
      const numProviders = Math.floor(Math.random() * 3) + 1;
      const shuffled = [...providerIds].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, numProviders).map(pid => MOCK_PROVIDERS[pid]);
      MOCK_MOVIE_PROVIDERS[movie.id] = { flatrate: selected };
    }
  });
})();


// ==========================================
// Middleware & Routes
// ==========================================

// Helper to determine if we should run in live TMDB mode
const isLiveMode = () => {
  return process.env.TMDB_API_KEY && 
         process.env.TMDB_API_KEY.trim() !== "" && 
         process.env.TMDB_API_KEY !== "your_api_key_here";
};

// GET /api/discover
app.get('/api/discover', async (req, res) => {
  const { lang = '', genres = '', page = 1 } = req.query;
  const pageNum = parseInt(page, 10) || 1;

  if (isLiveMode()) {
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
    
    // Construct TMDB URL dynamically
    let url = `https://api.themoviedb.org/3/discover/movie?api_key=${process.env.TMDB_API_KEY}&sort_by=${randomSort}&page=${pageNum}`;
    if (lang) {
      url += `&with_original_languages=${lang}`;
    }
    if (genres) {
      url += `&with_genres=${genres}`;
    }
    
    try {
      const data = await getOrSetCache(cacheKey, async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch from TMDB');
        return await response.json();
      }, 15 * 60 * 1000); // 15 mins TTL
      
      // Shuffle the results array before returning to guarantee high entropy cards sequence
      const shuffledResults = [...(data.results || [])];
      for (let i = shuffledResults.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledResults[i], shuffledResults[j]] = [shuffledResults[j], shuffledResults[i]];
      }
      
      return res.json({
        results: shuffledResults,
        page: data.page,
        total_pages: data.total_pages
      });
    } catch (error) {
      console.error("Live discovery fetch failed. Falling back to mock data...", error);
    }
  }

  // MOCK DISCOVER LOGIC
  const selectedLangs = lang ? lang.split(/[|,]/).filter(Boolean) : [];
  const selectedGenreIds = genres ? genres.split(/[|,]/).map(g => parseInt(g, 10)).filter(Boolean) : [];
  
  // Filter mock movies based on criteria
  let filtered = MOCK_MOVIES.filter(movie => {
    // Check language (multi-select OR match)
    if (selectedLangs.length > 0) {
      if (!selectedLangs.includes(movie.original_language)) return false;
    }
    
    // Check genre match (OR matching: matches at least one of the selected genres)
    if (selectedGenreIds.length > 0) {
      const match = movie.genre_ids.some(gid => selectedGenreIds.includes(gid));
      if (!match) return false;
    }
    return true;
  });

  // Fallback: If filter is too restrictive, return general matches in those languages, or everything
  if (filtered.length === 0) {
    if (selectedLangs.length > 0) {
      filtered = MOCK_MOVIES.filter(m => selectedLangs.includes(m.original_language));
    }
  }
  if (filtered.length === 0) {
    filtered = MOCK_MOVIES;
  }

  // Shuffle the filtered list to guarantee fully randomized movie deck sequencing (FR-4.3)
  const shuffledMock = [...filtered];
  for (let i = shuffledMock.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledMock[i], shuffledMock[j]] = [shuffledMock[j], shuffledMock[i]];
  }

  // Pagination simulation (each page is size 10)
  const pageSize = 10;
  const startIndex = (pageNum - 1) * pageSize;
  const pagedResults = shuffledMock.slice(startIndex, startIndex + pageSize);
  const totalPages = Math.ceil(shuffledMock.length / pageSize) || 1;

  // Simulate latency
  setTimeout(() => {
    res.json({
      results: pagedResults,
      page: pageNum,
      total_pages: totalPages
    });
  }, 300);
});

// GET /api/providers/:movieId
app.get('/api/providers/:movieId', async (req, res) => {
  const movieId = parseInt(req.params.movieId, 10);

  if (isLiveMode() && !isNaN(movieId)) {
    const cacheKey = `providers:${movieId}`;
    const url = `https://api.themoviedb.org/3/movie/${movieId}/watch/providers?api_key=${process.env.TMDB_API_KEY}`;
    
    try {
      const data = await getOrSetCache(cacheKey, async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch watch providers');
        return await response.json();
      }, 12 * 60 * 60 * 1000); // 12 hours TTL
      
      return res.json(data);
    } catch (error) {
      console.error(`Live watch providers fetch failed for movie ${movieId}. Falling back to mock data...`);
    }
  }

  // MOCK PROVIDER MATRIX LOGIC
  const mockProvider = MOCK_MOVIE_PROVIDERS[movieId] || { flatrate: [] };
  
  // Return standard TMDB results structure
  const result = {
    id: movieId,
    results: {
      US: {
        link: `https://www.themoviedb.org/movie/${movieId}/watch?locale=US`,
        flatrate: mockProvider.flatrate
      }
    }
  };

  setTimeout(() => {
    res.json(result);
  }, 100);
});

// POST /api/optimize
app.post('/api/optimize', async (req, res) => {
  const { movieIds = [], region = 'US' } = req.body;

  if (movieIds.length === 0) {
    return res.json({
      providers: [],
      totalLikedWithProviderData: 0
    });
  }

  try {
    // Resolve provider data for all liked movie IDs
    const providerLookups = movieIds.map(async (id) => {
      // 1. Check live TMDB if API key is active
      if (isLiveMode()) {
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
          // Fall through to mock on error
        }
      }

      // 2. Mock fallback
      const mockProvider = MOCK_MOVIE_PROVIDERS[id] || { flatrate: [] };
      return {
        id,
        data: {
          results: {
            [region]: {
              flatrate: mockProvider.flatrate
            }
          }
        }
      };
    });

    const resolved = await Promise.all(providerLookups);

    // Aggregate flatrate providers
    const counts = {};
    const details = {}; // store logo paths
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

    // Create ranked array with match percentages and affiliate links
    const providersList = Object.keys(counts).map(name => {
      const matchCount = counts[name];
      const matchPercentage = likedWithProviderData > 0 
        ? Math.round((matchCount / movieIds.length) * 100)
        : 0;
      
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

    // Sort descending by percentage match
    providersList.sort((a, b) => b.match_percentage - a.match_percentage);

    setTimeout(() => {
      res.json({
        providers: providersList,
        totalLikedWithProviderData: likedWithProviderData
      });
    }, 400); // Simulate processing latency for loading animations
  } catch (error) {
    console.error("Optimization failed:", error);
    res.status(500).json({ error: "Failed to optimize providers" });
  }
});

// Fallback to index.html for UI client routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server (local development only)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`SwipeFlix Server running at http://localhost:${PORT}`);
    console.log(`Running in: ${isLiveMode() ? 'LIVE TMDB API' : 'MOCK DATABASE'} mode`);
    console.log(`===================================================`);
  });
}

export default app;
