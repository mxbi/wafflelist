// Generates the SHA-256/SHA-512 round constants and initial hash values
// exactly (fractional parts of integer cube/square roots of primes, via
// BigInt arithmetic) so nothing is copied from memory. Output is pasted
// into src/pkjs/crypto.js.

function primes(n) {
  const out = [];
  for (let c = 2; out.length < n; c++) {
    let ok = true;
    for (let p = 2; p * p <= c; p++) if (c % p === 0) { ok = false; break; }
    if (ok) out.push(c);
  }
  return out;
}

// floor(cbrt(p * 2^(3*bits))) mod 2^bits  ==  frac(cbrt(p)) * 2^bits
function cbrtFrac(p, bits) {
  const target = BigInt(p) << BigInt(3 * bits);
  let lo = 0n, hi = 1n << BigInt(bits + 8);
  while (lo < hi) {
    const mid = (lo + hi + 1n) >> 1n;
    if (mid * mid * mid <= target) lo = mid; else hi = mid - 1n;
  }
  return lo & ((1n << BigInt(bits)) - 1n);
}

// floor(sqrt(p * 2^(2*bits))) mod 2^bits  ==  frac(sqrt(p)) * 2^bits
function sqrtFrac(p, bits) {
  const target = BigInt(p) << BigInt(2 * bits);
  let lo = 0n, hi = 1n << BigInt(bits + 8);
  while (lo < hi) {
    const mid = (lo + hi + 1n) >> 1n;
    if (mid * mid <= target) lo = mid; else hi = mid - 1n;
  }
  return lo & ((1n << BigInt(bits)) - 1n);
}

const hex32 = (v) => '0x' + v.toString(16).padStart(8, '0');

const p64 = primes(64);
const p80 = primes(80);
const p8 = primes(8);

console.log('// SHA-256 K (32-bit)');
console.log('var SHA256_K = [' + p64.map(p => hex32(cbrtFrac(p, 32))).join(', ') + '];');
console.log('// SHA-256 H0');
console.log('var SHA256_H = [' + p8.map(p => hex32(sqrtFrac(p, 32))).join(', ') + '];');

const k512 = p80.map(p => cbrtFrac(p, 64));
console.log('// SHA-512 K split into hi/lo 32-bit halves');
console.log('var SHA512_KH = [' + k512.map(v => hex32(v >> 32n)).join(', ') + '];');
console.log('var SHA512_KL = [' + k512.map(v => hex32(v & 0xffffffffn)).join(', ') + '];');
const h512 = p8.map(p => sqrtFrac(p, 64));
console.log('// SHA-512 H0 hi/lo');
console.log('var SHA512_HH = [' + h512.map(v => hex32(v >> 32n)).join(', ') + '];');
console.log('var SHA512_HL = [' + h512.map(v => hex32(v & 0xffffffffn)).join(', ') + '];');
