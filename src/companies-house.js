import https from 'https';
import { cache } from './cache.js';
import { COMPANY_STATUS, COMPANY_TYPE, OFFICER_ROLE, JURISDICTION, resolveEnum } from './enumerations.js';
import { enrichWebsite } from './website-enrichment.js';
import { getHiringSignals } from './hiring-signals.js';

const CH_BASE = 'https://api.company-information.service.gov.uk';

// Enforce TLS 1.2 minimum — Node.js 18+ defaults to TLS 1.3 but this
// guard ensures nothing in the environment downgrades the connection.
const tlsAgent = new https.Agent({ minVersion: 'TLSv1.2' });

function getApiKey() {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) throw new Error('COMPANIES_HOUSE_API_KEY environment variable is not set');
  return key;
}

function authHeader(apiKey) {
  // Companies House uses HTTP Basic auth with the API key as the username and an empty password
  return 'Basic ' + Buffer.from(apiKey + ':').toString('base64');
}

async function chFetch(path) {
  const { default: fetch } = await import('node-fetch');
  const apiKey = getApiKey();
  const url = `${CH_BASE}${path}`;

  const res = await fetch(url, {
    agent: tlsAgent,
    headers: {
      Authorization: authHeader(apiKey),
      Accept: 'application/json',
    },
  });

  if (res.status === 404) return null;
  if (res.status === 429) throw new Error('Companies House rate limit exceeded — please wait before retrying');
  if (!res.ok) throw new Error(`Companies House API error: ${res.status} ${res.statusText} for ${path}`);

  return res.json();
}

/**
 * Resolve a company number from a name or number string.
 * If input looks like a registration number (up to 8 digits / 2-letter prefix + 6 digits),
 * use it directly; otherwise search by name and take the top result.
 */
async function resolveCompanyNumber(query) {
  const trimmed = query.trim();
  // Companies House numbers: 8 digits, or 2 uppercase letters + 6 digits (e.g. SC123456)
  if (/^([A-Z]{2})?\d{6,8}$/i.test(trimmed)) {
    return trimmed.toUpperCase().padStart(8, '0');
  }

  const cacheKey = `search:${trimmed.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const data = await chFetch(`/search/companies?q=${encodeURIComponent(trimmed)}&items_per_page=1`);
  if (!data || !data.items || data.items.length === 0) {
    throw new Error(`No company found matching: ${trimmed}`);
  }
  const number = data.items[0].company_number;
  cache.set(cacheKey, number);
  return number;
}

function formatAddress(addr) {
  if (!addr) return null;
  return [
    addr.care_of,
    addr.premises,
    addr.address_line_1,
    addr.address_line_2,
    addr.locality,
    addr.region,
    addr.postal_code,
    addr.country,
  ].filter(Boolean).join(', ');
}

function parseAccounts(accounts) {
  if (!accounts) return { overdue: false, nextDue: null, lastMadeUpTo: null };
  const nextDue = accounts.next_due ?? accounts.next_accounts?.due_on ?? null;
  const overdue = accounts.overdue === true ||
    (nextDue && new Date(nextDue) < new Date());
  return {
    overdue,
    nextDue: nextDue ?? null,
    lastMadeUpTo: accounts.last_accounts?.made_up_to ?? null,
  };
}

function parseOfficers(items) {
  return items
    .filter(o => !o.resigned_on) // active only
    .map(o => ({
      name: o.name,
      role: resolveEnum(OFFICER_ROLE, o.officer_role),
      appointedOn: o.appointed_on ?? null,
      nationality: o.nationality ?? null,
      countryOfResidence: o.country_of_residence ?? null,
    }));
}

function parseCharges(items) {
  return items.map(c => ({
    chargeCode: c.charge_code ?? null,
    chargeNumber: c.charge_number ?? null,
    status: c.status ?? null,
    createdOn: c.created_on ?? null,
    deliveredOn: c.delivered_on ?? null,
    personsEntitled: (c.persons_entitled ?? []).map(p => p.name),
    description: c.particulars?.description ?? null,
  }));
}

/**
 * Full company intelligence lookup.
 * Returns enriched JSON for a given company name or registration number.
 *
 * @param {string} query           - Company name or CH number
 * @param {string} [websiteUrl]    - Optional known website URL; skips domain inference
 */
export async function lookupCompany(query, websiteUrl) {
  const companyNumber = await resolveCompanyNumber(query);
  const cacheKey = `company:${companyNumber}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  // Parallel fetch: profile + officers + charges
  const [profile, officersData, chargesData] = await Promise.all([
    chFetch(`/company/${companyNumber}`),
    chFetch(`/company/${companyNumber}/officers?items_per_page=50`),
    chFetch(`/company/${companyNumber}/charges?items_per_page=50`),
  ]);

  if (!profile) throw new Error(`Company not found: ${companyNumber}`);

  const accountsInfo = parseAccounts(profile.accounts);

  const result = {
    attribution: 'Contains public sector information licensed under the Open Government Licence v3.0',
    companyName: profile.company_name ?? null,
    companyNumber: profile.company_number ?? companyNumber,
    status: resolveEnum(COMPANY_STATUS, profile.company_status),
    statusCode: profile.company_status ?? null,
    type: resolveEnum(COMPANY_TYPE, profile.type),
    typeCode: profile.type ?? null,
    jurisdiction: resolveEnum(JURISDICTION, profile.jurisdiction),
    incorporationDate: profile.date_of_creation ?? null,
    dissolutionDate: profile.date_of_cessation ?? null,
    registeredAddress: formatAddress(profile.registered_office_address),
    sicCodes: profile.sic_codes ?? [],
    canFile: profile.can_file ?? null,
    hasInsolvencyHistory: profile.has_insolvency_history ?? false,
    hasCharges: profile.has_charges ?? false,
    isOnRegisterOfOverseasEntities: profile.is_on_registers_of_overseas_entities ?? false,
    accounts: {
      overdue: accountsInfo.overdue,
      nextDue: accountsInfo.nextDue,
      lastMadeUpTo: accountsInfo.lastMadeUpTo,
      accountingReferenceDate: profile.accounts?.accounting_reference_date
        ? `${profile.accounts.accounting_reference_date.day}/${profile.accounts.accounting_reference_date.month}`
        : null,
    },
    directors: officersData ? parseOfficers(officersData.items ?? []) : [],
    charges: chargesData ? parseCharges(chargesData.items ?? []) : [],
    website: null,  // populated below
    hiring: null,   // populated below
    lookedUpAt: new Date().toISOString(),
  };

  // Website enrichment and hiring signals run in parallel after CH data is assembled
  const [website, hiring] = await Promise.all([
    enrichWebsite({ companyName: result.companyName, websiteUrl: websiteUrl ?? null }),
    getHiringSignals({ companyName: result.companyName, websiteUrl: websiteUrl ?? null }),
  ]);
  result.website = website;
  result.hiring = hiring;

  cache.set(cacheKey, result);
  return result;
}
