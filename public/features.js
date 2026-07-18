/**
 * Feature vector builder for LinUCB recommendation engine.
 */

// Ordered lists of genre IDs to map to feature vector indexes
export const MOVIE_GENRES_IDS = [
  28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37
];

export const TV_GENRES_IDS = [
  10759, 10762, 10763, 10764, 10765, 10766, 10767, 10768
];

// Total dimensions:
// 19 (movie genres) + 8 (TV genres) + 6 (eras) + 1 (is_tv) + 1 (lang match) + 1 (norm vote) + 1 (norm pop) + 1 (bias) = 38
export const FEATURE_DIM = 38;

/**
 * Builds a fixed-length (FEATURE_DIM) feature vector for a movie or TV show.
 * 
 * @param {Object} item The movie or TV show object
 * @param {Object} context Context object containing:
 *   - userSelectedLanguages: Array of language codes selected by user
 *   - minPop: Minimum popularity in current batch
 *   - maxPop: Maximum popularity in current batch
 */
export function buildFeatureVector(item, context) {
  const vec = new Array(FEATURE_DIM).fill(0);
  let idx = 0;

  // 1. Movie Genres (19 dimensions)
  const itemGenreIds = item.genre_ids || [];
  for (let i = 0; i < MOVIE_GENRES_IDS.length; i++) {
    vec[idx++] = itemGenreIds.includes(MOVIE_GENRES_IDS[i]) ? 1.0 : 0.0;
  }

  // 2. TV-only Genres (8 dimensions)
  for (let i = 0; i < TV_GENRES_IDS.length; i++) {
    vec[idx++] = itemGenreIds.includes(TV_GENRES_IDS[i]) ? 1.0 : 0.0;
  }

  // 3. Era buckets (6 dimensions)
  // pre-1980, 1980s, 1990s, 2000s, 2010s, 2020s
  let year = 2020; // default fallback
  if (item.release_date) {
    const parsedYear = parseInt(item.release_date.split('-')[0], 10);
    if (!isNaN(parsedYear)) {
      year = parsedYear;
    }
  }

  let eraIdx = 0; // pre-1980
  if (year >= 1980 && year < 1990) eraIdx = 1;
  else if (year >= 1990 && year < 2000) eraIdx = 2;
  else if (year >= 2000 && year < 2010) eraIdx = 3;
  else if (year >= 2010 && year < 2020) eraIdx = 4;
  else if (year >= 2020) eraIdx = 5;

  for (let i = 0; i < 6; i++) {
    vec[idx++] = (i === eraIdx) ? 1.0 : 0.0;
  }

  // 4. Content type: is_tv (1 dimension)
  const isTV = (item.media_type === 'tv');
  vec[idx++] = isTV ? 1.0 : 0.0;

  // 5. Language match (1 dimension)
  const userLangs = context.userSelectedLanguages || ['en'];
  const langMatch = userLangs.includes(item.original_language) ? 1.0 : 0.0;
  vec[idx++] = langMatch;

  // 6. Normalized vote_average (1 dimension)
  const vote = item.vote_average || 0;
  vec[idx++] = vote / 10.0;

  // 7. Normalized popularity (1 dimension)
  const pop = item.popularity || 0;
  const minPop = context.minPop || 0;
  const maxPop = context.maxPop || 0;
  let normPop = 0.5;
  if (maxPop > minPop) {
    normPop = (pop - minPop) / (maxPop - minPop);
    normPop = Math.max(0.0, Math.min(1.0, normPop));
  }
  vec[idx++] = normPop;

  // 8. Bias (1 dimension)
  vec[idx++] = 1.0;

  return vec;
}
