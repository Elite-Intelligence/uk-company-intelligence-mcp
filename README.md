# UK Company Intelligence MCP

One tool call. Every important fact about any UK-registered company.

**UK Company Intelligence MCP** is an MCP server that gives AI agents instant access to verified, enriched business intelligence for any UK company — sourced from the official Companies House register and public job boards. Pass a company name or registration number; receive a single clean JSON response covering legal identity, people, financial health signals, web presence, and hiring activity.

---

## What you get in one call

| Field | Source | Detail |
|---|---|---|
| Company name & number | Companies House API | Verified legal name |
| Status | Companies House API | Active, Dissolved, In Administration, etc. |
| Type | Companies House API | Ltd, PLC, LLP, CIC, etc. |
| Jurisdiction | Companies House API | England/Wales, Scotland, Northern Ireland |
| Incorporation date | Companies House API | |
| Registered address | Companies House API | Full address |
| SIC codes | Companies House API | Industry classification codes |
| Directors | Companies House API | Active officers only, with roles and appointment dates |
| Accounts overdue | Companies House API | Computed from next due date |
| Registered charges | Companies House API | Security interests over company assets |
| Website description | Company website | Plain-English description of what the company does |
| Contact details | Company website | Email, phone, address from homepage |
| Active job listings | ATS public APIs | Count of open roles |
| Example job titles | ATS public APIs | Up to 10 current role titles |
| Technology keywords | ATS public APIs | Tech stack inferred from job descriptions |

---

## How to use

### As an MCP server (recommended)

Connect your MCP client to:

```
https://mcp.apify.com/actor/Elite_Intelligence~uk-company-intelligence-mcp/mcp
```

With your [Apify API token](https://console.apify.com/account/integrations) as a bearer token.

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "uk-company-intelligence-mcp": {
      "command": "npx",
      "args": ["-y", "@apify/actor-mcp-runner", "Elite_Intelligence~uk-company-intelligence-mcp"],
      "env": { "APIFY_TOKEN": "your_apify_token_here" }
    }
  }
}
```

### Tool: `lookup_uk_company`

**Input:**

| Parameter | Required | Description |
|---|---|---|
| `query` | Yes | Company name or CH number (e.g. `"Monzo Bank Limited"` or `"09446231"`) |
| `websiteUrl` | No | Known website URL. Skips domain inference. |

**Example call:**
```json
{
  "query": "Monzo Bank Limited"
}
```

**Example response (abbreviated):**
```json
{
  "attribution": "Contains public sector information licensed under the Open Government Licence v3.0",
  "companyName": "MONZO BANK LIMITED",
  "companyNumber": "09446231",
  "status": "Active",
  "type": "Private limited company",
  "jurisdiction": "England/Wales",
  "incorporationDate": "2015-02-13",
  "registeredAddress": "Broadwalk House, 5 Appold Street, London, EC2A 2AG",
  "sicCodes": ["6419"],
  "accounts": {
    "overdue": false,
    "nextDue": "2025-09-30",
    "lastMadeUpTo": "2024-02-28"
  },
  "directors": [
    { "name": "TS ANIL", "role": "Director", "appointedOn": "2020-05-14" }
  ],
  "charges": [],
  "website": {
    "websiteFound": true,
    "websiteUrl": "https://monzo.com",
    "robotsAllowed": true,
    "description": "Organise, save & invest with a free UK current account, joint account or business account.",
    "contactEmail": null,
    "contactPhone": null
  },
  "hiring": {
    "source": "greenhouse",
    "activeListingCount": 69,
    "exampleTitles": ["Analytics Engineer", "Backend Engineer III", "Android Engineer"],
    "techKeywords": ["AWS", "BigQuery", "Docker", "GCP", "Go", "Kafka", "Kubernetes", "Python", "React"]
  },
  "lookedUpAt": "2026-06-29T15:00:00.000Z"
}
```

### As a standalone Actor

Pass input via the Apify Console or API:

```json
{ "query": "Tesco PLC" }
```

Results are pushed to the Actor's default dataset.

---

## Pricing

Pay per lookup via Apify's pay-per-event model.

| Event | Price |
|---|---|
| Company lookup | **$0.015** per successful result |
| Actor start | $0.00005 (negligible startup cost) |

You are only charged when a result is successfully returned. Failed lookups (company not found, API error) are not charged. There are no subscription fees or minimum spend.

---

## Data sources

- **Companies House API** — the official UK government company register. All legal identity data is sourced directly from this API. Free, authoritative, updated in real time.
- **Company websites** — the registered company's public homepage, scraped in accordance with each site's `robots.txt`.
- **Greenhouse / Lever ATS APIs** — public job board APIs published by applicant tracking systems. No authentication required; designed to be machine-readable.

**Not used:** LinkedIn (prohibited by their Terms of Service under UK law).

---

## API key setup

This Actor requires a free [Companies House API key](https://developer.company-information.service.gov.uk/).

Set it as an environment variable in your Actor's configuration in the Apify Console:

| Variable | Value |
|---|---|
| `COMPANIES_HOUSE_API_KEY` | Your Companies House API key |

The key is never hardcoded or logged. It is read exclusively from the environment at runtime.

**Security best practice:** Restrict your Companies House API key by IP address in the [Companies House developer portal](https://developer.company-information.service.gov.uk/). Regenerate the key regularly.

---

## Rate limits

- **Companies House API:** 600 requests per 5-minute window per API key. UK Company Intelligence MCP caches results for 5 minutes to stay well within this limit under normal usage.
- **Apify:** Standard platform rate limits apply.

---

## Privacy notice

**Data controller:** Elite Intelligence (sole trader, United Kingdom). Contact: camerocal@esms.org.uk

**ICO registration:** Registered with the UK Information Commissioner's Office under the Data Protection Act 2018.

### What personal data is processed

When you call `lookup_uk_company`, the Actor retrieves director names and appointment details from the Companies House public register. This constitutes personal data under UK GDPR.

The Actor does **not** collect, store, or process any personal data about users of this service. No query terms, API tokens, IP addresses, or usage data are retained by this Actor beyond the duration of the individual request.

### Lawful basis

Processing of director data is carried out under **legitimate interest** (UK GDPR Article 6(1)(f)). The legitimate interest pursued is the provision of B2B company intelligence to users conducting due diligence, credit assessment, supplier verification, and similar commercial research — activities that are standard in the B2B data industry and consistent with reasonable expectations of individuals who hold director roles at registered companies.

A Legitimate Interest Assessment (LIA) has been completed and is held on file.

### What is included — and what is not

Returned data is limited to information held on the public Companies House register: company name, number, status, type, registered address, SIC codes, officer names and roles, and filing/charge information. Director residential addresses are **not** returned even where present in the register. No personal email addresses or personal phone numbers of individuals are returned.

### Data retention

This Actor does not persist any data. Each lookup is a real-time pass-through to the Companies House API and public websites. No results are stored beyond the Apify dataset entry created by a single Actor run, which is subject to Apify's standard data retention policy.

### Attribution

Contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

### robots.txt compliance

UK Company Intelligence MCP checks and honours each website's `robots.txt` file before scraping. Pages that disallow crawlers are skipped.

### Your rights

If you believe this Actor has processed personal data about you unlawfully, contact camerocal@esms.org.uk. You may also lodge a complaint with the [ICO](https://ico.org.uk/make-a-complaint/).

---

## Terms of service

By using UK Company Intelligence MCP you agree to the following terms.

**1. Permitted use.** This service may be used for lawful commercial and research purposes including due diligence, supplier verification, credit assessment, and sales intelligence. It may not be used to facilitate harassment, stalking, discrimination, or any activity unlawful under UK law.

**2. Data accuracy.** Data is sourced from the Companies House public register and company websites. While every effort is made to return accurate information, no warranty is given as to the completeness, accuracy, or fitness for purpose of results. You are responsible for verifying information before acting on it.

**3. No liability.** To the maximum extent permitted by law, Elite Intelligence shall not be liable for any loss or damage arising from use of this service or reliance on data returned by it.

**4. Compliance.** You are responsible for ensuring your use of this service complies with applicable laws, including UK GDPR, and with the terms of any downstream platforms or systems you integrate with.

**5. Fair use.** Automated bulk lookups designed to scrape the entire Companies House register are not permitted. This service is intended for targeted lookups in the course of normal business workflows.

**6. Changes.** These terms may be updated at any time. Continued use of the service constitutes acceptance of the current terms.

**Contact:** camerocal@esms.org.uk

---

## Local development

```bash
# Clone and install
npm install

# Add your Companies House API key
cp .env.example .env
# Edit .env and add: COMPANIES_HOUSE_API_KEY=your_key_here

# Run tests
npm run test:all

# Start as stdio MCP server (for Claude Desktop local testing)
npm run start:stdio

# Single lookup (Actor mode)
npm run start:once
```

---

*Contains public sector information licensed under the Open Government Licence v3.0*
