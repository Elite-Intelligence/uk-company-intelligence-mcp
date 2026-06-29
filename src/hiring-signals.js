/**
 * Hiring signals layer.
 *
 * Data sources, in priority order:
 *
 * 1. Greenhouse public API  — boards-api.greenhouse.io/v1/boards/{slug}/jobs
 *    Zero auth, designed to be machine-readable, used by ~40% of UK tech companies.
 *
 * 2. Lever public API       — api.lever.co/v0/postings/{slug}?mode=json
 *    Same philosophy; used by many UK startups.
 *
 * 3. JobPosting schema.org  — scraped from the company's own careers page.
 *    This is exactly the structured data Google Jobs indexes. Legally clean,
 *    subject to existing robots.txt check from website enrichment.
 *
 * 4. Indeed UK (production) — uk.indeed.com/cmp/{slug}/jobs
 *    Requires Apify residential proxy (Actor.createProxyConfiguration). Blocked by
 *    Cloudflare in local dev without proxy; gracefully skipped if unavailable.
 *    Google Jobs (SERP) has the same proxy requirement and is included in the same path.
 *
 * LinkedIn is intentionally excluded (UK Computer Misuse Act risk, ToS prohibition).
 */

import https from 'https';
import { load } from 'cheerio';
import { cache } from './cache.js';
import { checkRobots, OUR_USER_AGENT } from './robots.js';

// ATS Applicant Tracking System slugs are embedded in careers pages as embed URLs.
// These patterns extract the company slug from the embed HTML.
const ATS_PATTERNS = [
  // Greenhouse — matches US board (boards.greenhouse.io), EU board (job-boards.eu.greenhouse.io),
  // and embed patterns. The public API endpoint is the same for both regions.
  {
    ats: 'greenhouse',
    regex: /(?:(?:job-boards\.eu\.|boards\.|embed\.)greenhouse\.io)\/(?:embed\/job_board\?for=|job_board\/for\?for=)?([a-zA-Z0-9_-]+)/i,
    apiUrl: (slug) => `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
    parser: parseGreenhouseJobs,
  },
  // Lever
  {
    ats: 'lever',
    regex: /(?:jobs|api)\.lever\.co\/([a-zA-Z0-9_-]+)/i,
    apiUrl: (slug) => `https://api.lever.co/v0/postings/${slug}?mode=json`,
    parser: parseLeverJobs,
  },
  // Workable
  {
    ats: 'workable',
    regex: /apply\.workable\.com\/([a-zA-Z0-9_-]+)/i,
    apiUrl: (slug) => `https://apply.workable.com/api/v3/accounts/${slug}/jobs`,
    parser: parseWorkableJobs,
  },
  // Ashby (growing fast in UK startups)
  {
    ats: 'ashby',
    regex: /jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/i,
    apiUrl: (slug) => `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
    parser: parseAshbyJobs,
  },
];

// Technology keywords to look for in job descriptions.
// Grouped to avoid matching substrings (e.g. "R" matching "React").
const TECH_KEYWORD_PATTERNS = [
  // Languages — word-boundary matched
  'Python', 'Go(?:lang)?', 'Rust', 'Java(?:Script)?', 'TypeScript', 'Kotlin', 'Swift',
  'Ruby', 'Scala', 'PHP', 'C\\+\\+', 'C#',
  // Cloud
  'AWS', 'GCP', 'Azure', 'Terraform', 'CloudFormation',
  // Containers & orchestration
  'Kubernetes', 'Docker', 'Helm',
  // Data & streaming
  'Kafka', 'Spark', 'Airflow', 'dbt', 'Snowflake', 'Databricks', 'BigQuery', 'Redshift',
  // Databases
  'PostgreSQL', 'MySQL', 'Redis', 'Elasticsearch', 'MongoDB', 'DynamoDB', 'Cassandra',
  // Frameworks
  'React', 'Node\\.js', 'Django', 'Rails', 'FastAPI', 'GraphQL', 'gRPC',
  // Practices & ML
  'Machine Learning', 'ML', 'LLM', 'AI', 'DevOps', 'CI/CD', 'microservices',
].map(k => new RegExp(`\\b${k}\\b`, 'i'));

// Careers URL paths to probe when no website URL is known
const CAREERS_PATHS = [
  '/careers', '/jobs', '/about/careers', '/about/jobs',
  '/company/careers', '/join-us', '/work-with-us', '/team',
  '/work-here', '/join', '/opportunities',
];

const tlsAgent = new https.Agent({ minVersion: 'TLSv1.2' });

// ─── ATS parsers ─────────────────────────────────────────────────────────────

function parseGreenhouseJobs(data) {
  const jobs = data?.jobs ?? [];
  return jobs.map(j => ({
    title: j.title ?? null,
    department: (j.departments ?? [])[0]?.name ?? null,
    location: j.location?.name ?? null,
    postedAt: j.first_published ?? j.updated_at ?? null,
    descriptionHtml: j.content ?? null,
  }));
}

function parseLeverJobs(data) {
  if (!Array.isArray(data)) return [];
  return data.map(j => ({
    title: j.text ?? null,
    department: j.categories?.team ?? null,
    location: j.categories?.location ?? null,
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    descriptionHtml: j.description ?? (j.descriptionBody ?? null),
  }));
}

function parseWorkableJobs(data) {
  const jobs = data?.results ?? [];
  return jobs.map(j => ({
    title: j.title ?? null,
    department: j.department ?? null,
    location: j.location?.city ?? null,
    postedAt: j.published_on ?? null,
    descriptionHtml: j.description ?? null,
  }));
}

function parseAshbyJobs(data) {
  const jobs = data?.jobPostings ?? [];
  return jobs.map(j => ({
    title: j.title ?? null,
    department: j.department ?? null,
    location: j.locationName ?? null,
    postedAt: j.publishedDate ?? null,
    descriptionHtml: j.descriptionHtml ?? null,
  }));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function safeJsonFetch(url) {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch(url, {
    agent: tlsAgent,
    headers: {
      'User-Agent': `${OUR_USER_AGENT}/1.0`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  return res.json();
}

function stripHtml(html) {
  if (!html) return '';
  return load(html).text().replace(/\s+/g, ' ').trim();
}

function extractTechKeywords(texts) {
  const found = new Set();
  const combined = texts.filter(Boolean).join(' ');
  for (const pattern of TECH_KEYWORD_PATTERNS) {
    const m = combined.match(pattern);
    if (m) found.add(m[0]);
  }
  return [...found].sort();
}

function parseJobPostingSchema(html) {
  const $ = load(html);
  const jobs = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const types = [].concat(item['@type'] ?? []);
        if (!types.some(t => t === 'JobPosting')) continue;
        jobs.push({
          title: item.title ?? null,
          department: null,
          location: item.jobLocation?.address?.addressLocality ?? null,
          postedAt: item.datePosted ?? null,
          descriptionHtml: item.description ?? null,
        });
      }
    } catch { /* malformed JSON-LD */ }
  });

  return jobs;
}

async function fetchCareersPage(baseUrl, fetchFn) {
  for (const path of CAREERS_PATHS) {
    const url = baseUrl.replace(/\/$/, '') + path;
    try {
      const robotsCheck = await checkRobots(url, fetchFn);
      if (!robotsCheck.allowed) continue;

      const res = await fetchFn(url, {
        agent: tlsAgent,
        headers: {
          'User-Agent': `${OUR_USER_AGENT}/1.0`,
          Accept: 'text/html',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('html')) continue;

      const html = await res.text();
      // Verify this actually looks like a careers page
      const lc = html.toLowerCase();
      if (lc.includes('job') || lc.includes('career') || lc.includes('opening') || lc.includes('vacanc')) {
        return { html, url };
      }
    } catch { /* timeout or connection error — try next path */ }
  }
  return null;
}

function detectAts(html) {
  for (const pattern of ATS_PATTERNS) {
    const m = html.match(pattern.regex);
    if (m) return { ...pattern, slug: m[1] };
  }
  return null;
}

async function tryIndeedCmpPage(companyName) {
  // Indeed's company profile page. Requires Apify residential proxy in production;
  // gracefully returns null when blocked locally.
  //
  // On Apify: set APIFY_PROXY_GROUPS=RESIDENTIAL in Actor env vars and call
  // Actor.createProxyConfiguration({ groups: ['RESIDENTIAL'], countryCode: 'GB' })
  // to make this path work. The proxy URL is then passed via APIFY_PROXY_URL env var.
  const proxyUrl = process.env.APIFY_PROXY_URL;
  const { default: fetch } = await import('node-fetch');
  const HttpsProxyAgent = proxyUrl ? (await import('https-proxy-agent')).HttpsProxyAgent : null;

  const slug = companyName
    .toLowerCase()
    .replace(/\s+(limited|ltd|plc|llp|lp|group|holdings?|uk)\b/gi, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const url = `https://uk.indeed.com/cmp/${slug}/jobs`;
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'en-GB,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  };
  if (HttpsProxyAgent && proxyUrl) options.agent = new HttpsProxyAgent(proxyUrl);

  try {
    const res = await fetch(url, options);
    if (!res.ok) return null;
    const html = await res.text();
    // Cloudflare CAPTCHA check — bail if blocked
    if (html.includes('captcha') || html.includes('CLOUDFLARE')) return null;

    // Indeed embeds job count in the page title or meta
    const countMatch = html.match(/(\d[\d,]+)\s+(?:jobs?|vacancies|positions)/i);
    const count = countMatch ? parseInt(countMatch[1].replace(/,/g, ''), 10) : null;

    // Job titles from jobCard components
    const $ = load(html);
    const titles = [];
    $('[data-testid="job-title"], .jobTitle span, h2.jobTitle').each((_, el) => {
      const t = $(el).text().trim();
      if (t) titles.push(t);
    });

    return { source: 'indeed', count, titles };
  } catch {
    return null;
  }
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

/**
 * Get hiring signals for a company.
 *
 * @param {object} opts
 * @param {string} opts.companyName   - Used for ATS slug inference and Indeed fallback
 * @param {string} [opts.websiteUrl]  - The company's website (from website enrichment)
 * @returns {object} hiringSignals result
 */
export async function getHiringSignals({ companyName, websiteUrl }) {
  const cacheKey = `hiring:${companyName.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const result = {
    source: null,
    activeListingCount: null,
    exampleTitles: [],
    techKeywords: [],
    hiringSignalError: null,
  };

  try {
    const { default: fetchFn } = await import('node-fetch');

    // Step 1: Detect ATS from the company's careers page
    let atsJobs = null;
    let careersHtml = null;

    if (websiteUrl) {
      const careersPage = await fetchCareersPage(websiteUrl, fetchFn);
      if (careersPage) {
        careersHtml = careersPage.html;
        const ats = detectAts(careersHtml);

        if (ats) {
          const raw = await safeJsonFetch(ats.apiUrl(ats.slug));
          if (raw) {
            atsJobs = ats.parser(raw);
            result.source = ats.ats;
          }
        }
      }
    }

    // Step 2: If no ATS found, try JobPosting schema on the careers page
    if (!atsJobs && careersHtml) {
      const schemaJobs = parseJobPostingSchema(careersHtml);
      if (schemaJobs.length > 0) {
        atsJobs = schemaJobs;
        result.source = 'jobposting-schema';
      }
    }

    // Step 3: Indeed CMP page (production path via Apify proxy; silently skipped locally)
    if (!atsJobs) {
      const indeedResult = await tryIndeedCmpPage(companyName);
      if (indeedResult && (indeedResult.count || indeedResult.titles.length > 0)) {
        result.source = 'indeed';
        result.activeListingCount = indeedResult.count;
        result.exampleTitles = indeedResult.titles.slice(0, 10);
        // No descriptions available from Indeed page scrape — tech keywords skipped
        cache.set(cacheKey, result);
        return result;
      }
    }

    if (!atsJobs || atsJobs.length === 0) {
      result.hiringSignalError = 'No job listings found via ATS API, JobPosting schema, or Indeed';
      cache.set(cacheKey, result);
      return result;
    }

    // Build the response from ATS data
    result.activeListingCount = atsJobs.length;
    result.exampleTitles = atsJobs
      .slice(0, 10)
      .map(j => j.title)
      .filter(Boolean);

    // Extract tech keywords from all job descriptions
    const descriptionTexts = atsJobs.map(j => stripHtml(j.descriptionHtml));
    result.techKeywords = extractTechKeywords(descriptionTexts);

  } catch (err) {
    result.hiringSignalError = err.message;
  }

  cache.set(cacheKey, result);
  return result;
}
