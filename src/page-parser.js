/**
 * Extract business description and contact details from a fetched HTML page.
 * Uses cheerio for DOM traversal. Falls back to regex where cheerio isn't reliable
 * (e.g. inline JSON-LD in script tags).
 */

import { load } from 'cheerio';

// These domains commonly appear in HTML source but are not real company emails
const EMAIL_BLOCKLIST = [
  'example.com', 'w3.org', 'schema.org', 'sentry.io', 'mixpanel.com',
  'google.com', 'facebook.com', 'twitter.com', 'apple.com',
  'openid.net', 'cloudflare.com', 'amazonaws.com',
];

// These local parts are placeholder/dummy emails (e.g. example@server.co.uk)
const EMAIL_LOCAL_BLOCKLIST = [
  'example', 'test', 'user', 'name', 'email', 'youremail', 'yourname',
  'placeholder', 'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'username', 'emailaddress', 'youraddress',
];

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function extractMeta($, name) {
  return (
    $(`meta[name="${name}"]`).attr('content') ||
    $(`meta[property="${name}"]`).attr('content') ||
    null
  );
}

function extractDescription($) {
  const candidates = [
    extractMeta($, 'description'),
    extractMeta($, 'og:description'),
    extractMeta($, 'twitter:description'),
  ];
  const found = candidates.find(s => s && s.trim().length > 20);
  return found ? decodeHtmlEntities(found.trim()) : null;
}

function extractJsonLd(html) {
  const results = [];
  // Avoid loading cheerio again — just regex for script blocks
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      results.push(...items);
    } catch { /* malformed JSON-LD — skip */ }
  }
  return results;
}

function extractContactFromJsonLd(jsonLdItems) {
  const orgTypes = [
    'Organization', 'LocalBusiness', 'Corporation', 'Company',
    'ProfessionalService', 'Store', 'Restaurant',
  ];

  for (const item of jsonLdItems) {
    if (!item || typeof item !== 'object') continue;
    const type = item['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (!types.some(t => orgTypes.includes(t))) continue;

    return {
      email: item.email || item.contactPoint?.email || null,
      phone: item.telephone || item.contactPoint?.telephone || null,
      address: item.address
        ? [
            item.address.streetAddress,
            item.address.addressLocality,
            item.address.postalCode,
            item.address.addressCountry,
          ].filter(Boolean).join(', ')
        : null,
      websiteFromData: item.url || item.sameAs || null,
    };
  }
  return {};
}

function cleanEmail(raw) {
  // Strip JSON unicode escape fragments (e.g. > -> >) that appear at the
  // start of the local part when scraped from inline JS strings in HTML.
  // Also strip HTML entity fragments (amp;, gt;, lt;, quot;).
  return raw.replace(/^(?:u[0-9a-f]{3,4}|amp;?|lt;?|gt;?|quot;?)/i, '');
}

function extractEmails(html) {
  const emails = new Set();
  // Match mailto: links first (most reliable)
  const mailtoRe = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g;
  let m;
  while ((m = mailtoRe.exec(html)) !== null) {
    const addr = cleanEmail(m[1].toLowerCase());
    if (!addr.includes('@')) continue;
    const local = addr.split('@')[0];
    if (!EMAIL_LOCAL_BLOCKLIST.includes(local)) emails.add(addr);
  }

  // Fall back to plain text email pattern, filtered more aggressively
  if (emails.size === 0) {
    const plainRe = /\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/g;
    while ((m = plainRe.exec(html)) !== null) {
      const addr = cleanEmail(m[1].toLowerCase());
      if (!addr.includes('@')) continue;
      const [local, domain] = addr.split('@');
      if (EMAIL_LOCAL_BLOCKLIST.includes(local)) continue;
      if (!EMAIL_BLOCKLIST.some(b => domain === b || domain.endsWith('.' + b))) {
        emails.add(addr);
      }
    }
  }

  return [...emails].slice(0, 3);
}

function normalizePhone(raw) {
  // Strip everything except digits and leading +
  const digits = raw.replace(/[^\d+]/g, '');
  // UK numbers: 10-11 digits (or 12-13 with +44/0044 prefix)
  if (digits.length < 10 || digits.length > 13) return null;

  // Normalise to domestic digits (no country code)
  let domestic;
  if (digits.startsWith('+44')) domestic = '0' + digits.slice(3);
  else if (digits.startsWith('0044')) domestic = '0' + digits.slice(4);
  else domestic = digits;

  if (!domestic.startsWith('0')) return null;

  // London 020 numbers: 020 XXXX XXXX
  if (domestic.startsWith('020') && domestic.length === 11)
    return '+44 20 ' + domestic.slice(3, 7) + ' ' + domestic.slice(7);
  // 03/07/08 and other 5-digit area codes: 0XXXX XXXXXX
  if (domestic.length === 11)
    return '+44 ' + domestic.slice(1, 5) + ' ' + domestic.slice(5, 8) + ' ' + domestic.slice(8);
  // 10-digit: 01/02 area codes with 4-digit prefix
  if (domestic.length === 10)
    return '+44 ' + domestic.slice(1, 4) + ' ' + domestic.slice(4, 7) + ' ' + domestic.slice(7);

  return domestic;
}

function extractPhones(html) {
  const phones = new Set();

  // tel: links are most reliable — dots not valid in tel: URIs so exclude them
  const telRe = /href=["']tel:([+\d\s\-()]{7,20})["']/g;
  let m;
  while ((m = telRe.exec(html)) !== null) {
    const normalized = normalizePhone(m[1]);
    if (normalized) phones.add(normalized);
  }

  // UK number patterns if no tel: links found
  // Exclude dots from pattern — UK numbers never use dots as separators
  if (phones.size === 0) {
    const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    const ukRe = /\b((?:\+44|0044|0)[\s\d\-()]{9,15})\b/g;
    while ((m = ukRe.exec(noScript)) !== null) {
      const normalized = normalizePhone(m[1]);
      if (normalized) phones.add(normalized);
    }
  }

  return [...phones].slice(0, 2);
}

/**
 * Parse an HTML page and return structured contact + description data.
 */
export function parsePage(html, pageUrl) {
  const $ = load(html);

  // Remove noise elements before text extraction
  $('script, style, noscript, nav, footer, header, [aria-hidden="true"]').remove();

  const description = extractDescription($);
  const title = $('title').first().text().trim() || null;
  const h1 = $('h1').first().text().trim() || null;

  const jsonLdItems = extractJsonLd(html);
  const fromJsonLd = extractContactFromJsonLd(jsonLdItems);

  const emails = fromJsonLd.email
    ? [fromJsonLd.email]
    : extractEmails(html);

  const phones = fromJsonLd.phone
    ? [fromJsonLd.phone]
    : extractPhones(html);

  return {
    pageUrl,
    description: description || (h1 && h1.length > 15 ? h1 : null),
    pageTitle: title,
    contactEmail: emails[0] || null,
    contactPhone: phones[0] || null,
    contactAddress: fromJsonLd.address || null,
    allEmailsFound: emails,
    allPhonesFound: phones,
  };
}
