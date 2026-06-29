/**
 * Manual test runner — calls the Companies House lookup directly.
 * Usage: node src/test.js
 * Requires COMPANIES_HOUSE_API_KEY in environment or a .env file at project root.
 */

import { lookupCompany } from './companies-house.js';

// Load .env if present
try {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  require('dotenv').config({ path: new URL('../.env', import.meta.url).pathname });
} catch { /* dotenv optional */ }

const TEST_CASES = [
  { label: 'Tesco PLC (by number)',     query: '00445790' },
  { label: 'Apify (by name)',            query: 'Apify' },
  { label: 'A dissolved company',        query: '06045047' },  // Woolworths Group
  { label: 'LLP',                        query: 'PricewaterhouseCoopers LLP' },
  { label: 'Overdue accounts test',      query: '13279500' },
  { label: 'Scottish company (SC prefix)', query: 'SC111290' }, // Scotland Europa Limited
];

let passed = 0;
let failed = 0;

for (const { label, query } of TEST_CASES) {
  process.stdout.write(`\n[${label}] query="${query}"\n`);
  try {
    const result = await lookupCompany(query);
    console.log(`  ✓ ${result.companyName} (${result.companyNumber}) — ${result.status}`);
    console.log(`    Incorporated: ${result.incorporationDate ?? 'n/a'}`);
    console.log(`    Address: ${result.registeredAddress ?? 'n/a'}`);
    console.log(`    SIC codes: ${result.sicCodes.join(', ') || 'none'}`);
    console.log(`    Directors (active): ${result.directors.length}`);
    result.directors.slice(0, 3).forEach(d => console.log(`      - ${d.name} (${d.role})`));
    console.log(`    Charges: ${result.charges.length}`);
    console.log(`    Accounts overdue: ${result.accounts.overdue}`);
    console.log(`    Accounts next due: ${result.accounts.nextDue ?? 'n/a'}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ERROR: ${err.message}`);
    failed++;
  }
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
