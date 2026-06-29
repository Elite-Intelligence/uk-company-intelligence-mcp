/**
 * Website enrichment layer.
 * Given a company name (and optionally a known website URL), discovers the site,
 * checks robots.txt, and extracts a plain-English description plus contact details.
 */

import { checkRobots, OUR_USER_AGENT } from './robots.js';
import { findWebsite } from './domain-finder.js';
import { parsePage } from './page-parser.js';
import { cache } from './cache.js';

const FETCH_TIMEOUT_MS = 12000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB — don't buffer entire large sites

async function getFetch() {
  const { default: fetch } = await import('node-fetch');
  return fetch;
}

async function fetchPage(url, fetchFn) {
  const res = await fetchFn(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': `${OUR_USER_AGENT}/1.0 (+https://apify.com/actors/business-x-mcp)`,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-GB,en;q=0.9',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('html')) throw new Error(`Non-HTML content-type: ${contentType}`);

  // Read with a size cap to avoid huge pages
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of res.body) {
    chunks.push(chunk);
    totalBytes += chunk.length;
    if (totalBytes >= MAX_RESPONSE_BYTES) break;
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Enrich a company with website data.
 *
 * @param {object} options
 * @param {string} options.companyName   - Used for domain inference
 * @param {string} [options.websiteUrl]  - Optional known URL; skips discovery if provided
 * @returns {object} enrichment result
 */
export async function enrichWebsite({ companyName, websiteUrl }) {
  const cacheKey = `website:${(websiteUrl || companyName).toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const fetchFn = await getFetch();
  const result = {
    websiteFound: false,
    websiteUrl: null,
    robotsAllowed: null,
    robotsReason: null,
    description: null,
    pageTitle: null,
    contactEmail: null,
    contactPhone: null,
    contactAddress: null,
    enrichmentError: null,
  };

  try {
    // 1. Discover or use provided URL
    let url = websiteUrl || null;
    if (!url) {
      url = await findWebsite(companyName, fetchFn);
    }
    if (!url) {
      result.enrichmentError = 'Website not found via domain inference';
      return cache.set(cacheKey, result), result;
    }

    result.websiteUrl = url;
    result.websiteFound = true;

    // 2. Check robots.txt
    const { allowed, reason } = await checkRobots(url, fetchFn);
    result.robotsAllowed = allowed;
    result.robotsReason = reason;

    if (!allowed) {
      result.enrichmentError = 'Scraping disallowed by robots.txt';
      return cache.set(cacheKey, result), result;
    }

    // 3. Fetch and parse homepage
    const html = await fetchPage(url, fetchFn);
    const parsed = parsePage(html, url);

    result.description = parsed.description;
    result.pageTitle = parsed.pageTitle;
    result.contactEmail = parsed.contactEmail;
    result.contactPhone = parsed.contactPhone;
    result.contactAddress = parsed.contactAddress;
  } catch (err) {
    result.enrichmentError = err.message;
  }

  cache.set(cacheKey, result);
  return result;
}
