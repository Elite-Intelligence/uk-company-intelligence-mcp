/**
 * Website enrichment test suite.
 * Tests: robots.txt parser, domain inference, page parsing, and full enrichment.
 *
 * Usage: node src/test-website.js
 */

// --- Load .env if present ---
try {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  require('dotenv').config({ path: new URL('../.env', import.meta.url).pathname });
} catch { /* dotenv optional */ }

import { checkRobots } from './robots.js';
import { findWebsite } from './domain-finder.js';
import { parsePage } from './page-parser.js';
import { enrichWebsite } from './website-enrichment.js';

const { default: fetch } = await import('node-fetch');

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// ─── 1. robots.txt parser unit tests ────────────────────────────────────────

console.log('\n[1] robots.txt parser — inline unit tests');

// Build a mock fetch that returns a fixed robots.txt body
function mockFetch(body, status = 200) {
  return async (_url, _opts) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  });
}

const DISALLOW_ALL = `User-agent: *\nDisallow: /`;
const ALLOW_ALL = `User-agent: *\nDisallow:`;
const MIXED = `
User-agent: *
Disallow: /private/
Disallow: /admin/
Allow: /private/press/

User-agent: BusinessX-MCP
Disallow: /blocked-for-businessx/
`;

{
  const r = await checkRobots('https://example.com/page', mockFetch(DISALLOW_ALL));
  assert('Disallow: / blocks root path', !r.allowed);
}
{
  const r = await checkRobots('https://example.com/page', mockFetch(ALLOW_ALL));
  assert('Empty Disallow allows everything', r.allowed);
}
{
  const r = await checkRobots('https://example.com/private/press/release', mockFetch(MIXED));
  assert('Allow: /private/press/ overrides Disallow: /private/', r.allowed);
}
{
  const r = await checkRobots('https://example.com/private/secret', mockFetch(MIXED));
  assert('Disallow: /private/ blocks /private/secret', !r.allowed);
}
{
  const r = await checkRobots('https://example.com/blocked-for-businessx/', mockFetch(MIXED));
  assert('Named agent rule (BusinessX-MCP) takes priority over wildcard', !r.allowed);
}
{
  const r = await checkRobots('https://example.com/page', mockFetch('', 404));
  assert('Missing robots.txt (404) fails open (allowed)', r.allowed);
}

// ─── 2. Domain inference ────────────────────────────────────────────────────

console.log('\n[2] Domain inference — well-known UK companies');

const KNOWN_WEBSITES = [
  { name: 'Monzo Bank Limited',       expected: 'monzo' },
  { name: 'Deliveroo Holdings PLC',   expected: 'deliveroo' },
  { name: 'Rightmove PLC',            expected: 'rightmove' },
];

for (const { name, expected } of KNOWN_WEBSITES) {
  const url = await findWebsite(name, fetch);
  assert(
    `"${name}" resolves to a URL containing "${expected}"`,
    url !== null && url.toLowerCase().includes(expected),
    `got: ${url}`,
  );
}

// ─── 3. Page parser unit tests ───────────────────────────────────────────────

console.log('\n[3] Page parser — synthetic HTML');

{
  const html = `
    <html><head>
      <title>Acme Corp — Industrial widgets</title>
      <meta name="description" content="Acme Corp makes the world's best widgets since 1987.">
      <meta property="og:description" content="We make widgets.">
      <script type="application/ld+json">
        {"@type":"Organization","email":"hello@acme.co.uk","telephone":"020 7946 0123","url":"https://acme.co.uk"}
      </script>
    </head><body>
      <h1>Welcome to Acme</h1>
      <a href="mailto:support@acme.co.uk">Email us</a>
    </body></html>`;

  const p = parsePage(html, 'https://acme.co.uk');
  assert('meta description extracted', p.description?.includes('widgets'));
  assert('email from JSON-LD preferred over mailto', p.contactEmail === 'hello@acme.co.uk');
  assert('phone from JSON-LD', p.contactPhone === '020 7946 0123');
}

{
  // Page with no JSON-LD — falls back to mailto: link
  const html = `
    <html><head><title>Bobs Plumbing</title></head><body>
      <p>Call us: <a href="tel:01234 567890">01234 567890</a></p>
      <a href="mailto:bob@bobs-plumbing.co.uk">bob@bobs-plumbing.co.uk</a>
    </body></html>`;

  const p = parsePage(html, 'https://bobs-plumbing.co.uk');
  assert('phone from tel: link', p.contactPhone?.includes('01234'));
  assert('email from mailto: link', p.contactEmail === 'bob@bobs-plumbing.co.uk');
}

{
  // HTML entities in description should be decoded
  const html = `<html><head>
    <meta name="description" content="Save &amp; invest with us.">
  </head></html>`;

  const p = parsePage(html, 'https://example.co.uk');
  assert('HTML entities decoded in description', p.description === 'Save & invest with us.');
}

// ─── 4. Full enrichment — live site ──────────────────────────────────────────

console.log('\n[4] Full website enrichment — live tests');

{
  // Monzo — known URL provided, should skip discovery
  const r = await enrichWebsite({ companyName: 'Monzo Bank Limited', websiteUrl: 'https://monzo.com' });
  assert('Monzo: websiteFound = true', r.websiteFound);
  assert('Monzo: robotsAllowed = true', r.robotsAllowed === true);
  assert('Monzo: description extracted', typeof r.description === 'string' && r.description.length > 10, r.description);
  console.log(`    description: "${r.description?.slice(0, 100)}"`);
}

{
  // Disallow check — use a company whose robots.txt disallows us (simulate with mock isn't
  // possible in full enrichment easily, so test that a site that allows us gets enriched)
  const r = await enrichWebsite({ companyName: 'Rightmove PLC', websiteUrl: 'https://rightmove.co.uk' });
  assert('Rightmove: websiteFound = true', r.websiteFound);
  assert('Rightmove: robots checked', r.robotsAllowed !== null);
  console.log(`    robots: ${r.robotsAllowed} (${r.robotsReason})`);
  if (r.robotsAllowed) {
    assert('Rightmove: description extracted when allowed', r.description !== null, r.description);
    console.log(`    description: "${r.description?.slice(0, 100)}"`);
  } else {
    assert('Rightmove: enrichmentError explains disallow', r.enrichmentError?.includes('robots'), r.enrichmentError);
  }
}

{
  // Domain inference test — company name only, no URL provided
  const r = await enrichWebsite({ companyName: 'Deliveroo Holdings PLC' });
  assert('Deliveroo: websiteFound via inference', r.websiteFound, `url=${r.websiteUrl}, err=${r.enrichmentError}`);
  console.log(`    url: ${r.websiteUrl}`);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
