/**
 * Linear algebra helper functions for client-side LinUCB recommendation engine.
 */

export function identityMatrix(d) {
  const A = new Array(d);
  for (let i = 0; i < d; i++) {
    A[i] = new Array(d).fill(0);
    A[i][i] = 1;
  }
  return A;
}

export function matVecMul(A, x) {
  const d = x.length;
  const y = new Array(d).fill(0);
  for (let i = 0; i < d; i++) {
    let sum = 0;
    for (let j = 0; j < d; j++) {
      sum += A[i][j] * x[j];
    }
    y[i] = sum;
  }
  return y;
}

export function dotProduct(x, y) {
  let sum = 0;
  const d = x.length;
  for (let i = 0; i < d; i++) {
    sum += x[i] * y[i];
  }
  return sum;
}

export function outerProduct(x, y) {
  const d = x.length;
  const A = new Array(d);
  for (let i = 0; i < d; i++) {
    A[i] = new Array(d);
    for (let j = 0; j < d; j++) {
      A[i][j] = x[i] * y[j];
    }
  }
  return A;
}

export function matAdd(A, B) {
  const d = A.length;
  const C = new Array(d);
  for (let i = 0; i < d; i++) {
    C[i] = new Array(d);
    for (let j = 0; j < d; j++) {
      C[i][j] = A[i][j] + B[i][j];
    }
  }
  return C;
}

export function vecAdd(a, b) {
  const d = a.length;
  const c = new Array(d);
  for (let i = 0; i < d; i++) {
    c[i] = a[i] + b[i];
  }
  return c;
}

export function vecScale(a, scalar) {
  const d = a.length;
  const c = new Array(d);
  for (let i = 0; i < d; i++) {
    c[i] = a[i] * scalar;
  }
  return c;
}

/**
 * Incremental rank-1 inverse update using Sherman-Morrison formula:
 * Ainv_new = Ainv - (Ainv * x * xᵀ * Ainv) / (1 + xᵀ * Ainv * x)
 */
export function sherman_morrison_update(Ainv, x) {
  const d = x.length;
  
  // Compute u = Ainv * x
  const u = matVecMul(Ainv, x);
  
  // Compute denom = 1 + xᵀ * Ainv * x = 1 + xᵀ * u
  const denom = 1 + dotProduct(x, u);
  
  // Compute numerator matrix: u * uᵀ (since Ainv is symmetric, Ainv * x * xᵀ * Ainv = u * uᵀ)
  const numer = outerProduct(u, u);
  
  // Update inverse: Ainv_new = Ainv - numer / denom
  const Ainv_new = new Array(d);
  for (let i = 0; i < d; i++) {
    Ainv_new[i] = new Array(d);
    for (let j = 0; j < d; j++) {
      Ainv_new[i][j] = Ainv[i][j] - (numer[i][j] / denom);
    }
  }
  
  return Ainv_new;
}

/**
 * Computes xᵀ * Ainv * x
 */
export function quadForm(x, Ainv) {
  const u = matVecMul(Ainv, x);
  return dotProduct(x, u);
}
