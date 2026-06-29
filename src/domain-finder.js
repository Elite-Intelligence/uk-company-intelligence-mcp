/**
 * Infer a UK company's website by probing likely domain names.
 * No external search API required.
 *
 * Strategy:
 *   1. Strip legal suffixes from the company name.
 *   2. Generate slug candidates (full name slug, first word, two-word).
 *   3. For each candidate, try .co.uk then .com.
 *   4. Return the first URL that responds with a non-error HTTP status.
 */

// Legal suffixes and noise words common in CH names, ordered longest-first so
// multi-word suffixes are stripped before single-word ones.
const STRIP_PATTERNS = [
  /\bpublic limited company\b/gi,
  /\blimited liability partnership\b/gi,
  /\bcharitable incorporated organisation\b/gi,
  /\bscottish charitable incorporated organisation\b/gi,
  /\bregistered society\b/gi,
  /\bindustrial and provident society\b/gi,
  /\blimited\b/gi,
  /\bltd\b/gi,
  /\bplc\b/gi,
  /\bllp\b/gi,
  /\blp\b/gi,
  /\bcic\b/gi,
  /\bgroup\b/gi,
  /\bholdings\b/gi,
  /\bholding\b/gi,
  /\binternational\b/gi,
  /\bglobal\b/gi,
  /\buk\b/gi,
  /\(uk\)/gi,
  /\bengland\b/gi,
  /\beurope\b/gi,
];

function slugify(name) {
  let s = name;
  for (const p of STRIP_PATTERNS) s = s.replace(p, ' ');
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')  // remove punctuation
    .trim()
    .replace(/\s+/g, '');          // collapse spaces (no separator — domain style)
}

function firstWord(name) {
  return name
    .replace(/[^a-z0-9\s]/gi, ' ')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();
}

function twoWords(name) {
  const words = name
    .replace(/[^a-z0-9\s]/gi, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w.toLowerCase());
  return words.join('');
}

function candidateDomains(companyName) {
  const full = slugify(companyName);
  const first = firstWord(companyName);
  const two = twoWords(companyName);

  // Deduplicate while preserving order
  const unique = [...new Set([full, two, first].filter(s => s.length >= 2))];
  const domains = [];
  for (const slug of unique) {
    domains.push(`https://${slug}.co.uk`);
    domains.push(`https://${slug}.com`);
  }
  return domains;
}

/**
 * Probe a URL with a HEAD request. Returns true if the server responds
 * with a non-5xx status (redirects are followed).
 */
async function probeUrl(url, fetchFn) {
  try {
    const res = await fetchFn(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'BusinessX-MCP/1.0' },
      signal: AbortSignal.timeout(6000),
    });
    // Accept anything that isn't a server error or "not found at domain level"
    return res.status < 400 || res.status === 403 || res.status === 405;
  } catch {
    return false;
  }
}

/**
 * Attempt to discover the website for a company.
 * Returns a URL string or null if none found.
 *
 * @param {string} companyName
 * @param {Function} fetchFn  node-fetch compatible fetch function
 */
export async function findWebsite(companyName, fetchFn) {
  const candidates = candidateDomains(companyName);

  // Probe in parallel batches of 4 to stay fast without hammering DNS
  const BATCH = 4;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(url => probeUrl(url, fetchFn)));
    const found = batch.find((_, idx) => results[idx]);
    if (found) return found;
  }

  return null;
}
