# UK Company Intelligence MCP — Business Plan

---

## 1. The Idea

UK Company Intelligence MCP is a UK business intelligence tool that any AI agent can call to instantly look up accurate, enriched information about any UK-registered company. It runs as an MCP server — a plug-in that AI agents use automatically — and charges a small fee per lookup. Once built, it earns without any ongoing human involvement.

---

## 2. The Product

When an AI agent calls UK Company Intelligence MCP with a company name or registration number, it gets back one clean, structured response containing:

- **Legal identity** — verified from Companies House: registered name, company number, directors, incorporation date, industry code, filing status, whether accounts are overdue, any charges registered against the company
- **Website intelligence** — what the company actually does in plain English, contact details
- **Hiring signals** — current job listings, indicating growth and technology used
- **Headcount** — estimated employee count
- **Recent news** — notable mentions and rough sentiment

No other tool combines UK legal verification with live enrichment in one clean package at a developer-accessible price.

---

## 3. The Market

UK Company Intelligence MCP does not sell to fleet managers, HR teams, or any specific industry. It sells to **developers building AI agents** — and those agents span every vertical:

- Sales agents researching prospect companies
- Legal agents doing due diligence
- Finance agents assessing credit risk
- HR agents researching employers
- Compliance agents verifying suppliers

The market is every developer building a B2B AI agent. That market is large and growing fast — the MCP protocol hit 97 million downloads per month by early 2026.

---

## 4. The Competition

**What exists:** Several Companies House scrapers on Apify with 2–16 users. A handful of global company enrichment tools with modest traction. None are UK-first. None combine legal verification with enrichment in a reliable, developer-friendly package.

**Our edge:** Companies House is a government register. Every UK company is legally required to be on it. UK Company Intelligence MCP uses this as a verified legal foundation — something global tools cannot replicate. Our data doesn't guess. It starts from a legal guarantee and builds from there.

---

## 5. Revenue Model

- **Platform:** Published on Apify marketplace (£1/month Creator plan)
- **Pricing:** Pay-per-call — charged per company lookup
- **Revenue share:** 80% to UK Company Intelligence MCP, 20% to Apify
- **Discovery:** Listed on Apify, plus free listings on Smithery, Glama, PulseMCP, and the official MCP Registry

Once consistent user base is established, graduate to own hosted API with monthly subscriptions — keeping 100% of revenue and charging £99–299/month per developer team.

**Revenue milestones:**
- 10 developers, 5,000 calls/month = modest early income
- 50 developers, 50,000 calls/month = meaningful passive income
- Own platform, 50 subscribers at £150/month = £7,500/month

---

## 6. Costs

| Item | Cost |
|------|------|
| Apify Creator Plan | £1/month |
| ICO Registration | £52/year |
| Companies House API | Free |
| Everything else | £0 |

**Total year one cost: approximately £64**

---

## 7. Legal & Compliance

- **Business structure:** Sole trader. No Companies House registration required until profit justifies a limited company (approx. £40,000+)
- **HMRC:** Register as sole trader once income exceeds £1,000 in a tax year. Free, takes 20 minutes on gov.uk
- **ICO:** Register before going live. £52/year. Required because UK Company Intelligence MCP processes personal data (director names) commercially
- **Lawful basis:** Legitimate Interest under UK GDPR — standard basis used by all UK B2B data companies
- **Privacy notice:** Required on any public-facing page before launch
- **Legitimate Interest Assessment:** Document on file before launch
- **What to avoid:** Never include personal residential addresses, personal emails, or personal phone numbers of directors. Stick to publicly available business-role data only
- **Open Government Licence attribution:** Companies House data is Crown Copyright published under the Open Government Licence. Must include the statement "Contains public sector information licensed under the Open Government Licence v3.0" in the Apify listing and any future platform. Legally required.
- **LinkedIn scraping — do not do this:** LinkedIn's Terms of Service explicitly prohibit automated scraping. The Computer Misuse Act could apply in the UK. For hiring signals, use Indeed, Google Jobs, or Glassdoor instead — same intelligence, no legal risk.
- **robots.txt compliance:** When scraping company websites for enrichment, always check and honour the site's robots.txt file. Build this check into the scraper from day one.
- **Terms of Service for UK Company Intelligence MCP:** Before going live, publish a clear T&C document on the Apify listing stating: data is for informational purposes only, UK Company Intelligence MCP is not liable for decisions made based on it, and prohibited uses (e.g. harassment, spam). Free templates are available online. Required before launch.
- **Companies House rate limit:** 600 API requests per 5-minute window. Build caching into the server from day one — store recent lookups temporarily. Exceeding the limit will get your API key banned.

---

## 8. SWOT Summary

**Strengths:** Near-zero cost, legal data moat, true A2A passive income, perfect timing, AI-assisted build

**Weaknesses:** No track record, enrichment layer technically challenging, Apify margin squeeze, split attention with uni

**Opportunities:** Early mover in A2A, UK market underserved, expand to other public data sets, graduate to own platform, acquisition potential

**Threats:** UK GDPR if lines crossed, Companies House improving own API, large players entering UK market, copycat risk once proven

---

## 9. Growth Path

**Stage 1 — Apify (Months 1–6):** Build, launch, get first users, validate demand, earn first income

**Stage 2 — Own Platform (Months 6–18):** Build own hosted API, migrate users to monthly subscriptions, dramatically improve margins

**Stage 3 — Expand (Year 2+):** Add more UK public data sources (Land Registry, planning applications), become the definitive UK public data intelligence layer

---

---

# Step-by-Step Action Guide

---

## Phase 0 — Learn the Foundations (Weeks 1–2)

**Step 1 — Understand the Companies House API**
Go to developer.company-information.service.gov.uk and read the documentation. Register for a free API key. It takes 10 minutes. Run a few test searches on companies you know to see what the raw data looks like.

**Step 2 — Understand what an MCP server is in practice**
Go to modelcontextprotocol.io and read the introduction. Then read the Apify MCP documentation at docs.apify.com/platform/integrations/mcp. You need to understand how a developer connects to your server and what they see when they call a tool.

**Step 3 — Install Claude Code**
Claude Code is the command line tool that will help you build this. Install it and spend a few hours getting comfortable using it to write and test code. It will write most of the actual code — your job is to understand what it's doing and direct it correctly.

**Step 4 — Set up your development environment**
Install Node.js on your computer. This is the language you'll build the MCP server in. Claude Code can walk you through this setup step by step.

---

## Phase 1 — Build the Core (Weeks 3–5)

**Step 5 — Build the Companies House lookup tool**
Using Claude Code, build a function that takes a company name or number, calls the Companies House API, and returns the key legal fields as clean JSON. Test it on 20 different companies — big ones, small ones, dissolved ones — to make sure it handles edge cases.

When building this, follow every Companies House developer guideline:

- **Never put your API key in your code.** Store it in an environment variable (a separate config file that never gets shared or uploaded). If you ever make your code public on GitHub, a key in the code gets stolen immediately.
- **Never store your API key inside your project folder.** Keep it in a separate environment file outside the source tree.
- **Restrict your API key by IP address** in your Companies House developer account settings. This means even if someone finds your key, they can't use it from their machine.
- **Regenerate your API key regularly** — at minimum every time you do a major release.
- **Delete any unused or old keys** from your Companies House developer account immediately.
- **Use TLS 1.2 or higher** for all API calls — modern libraries do this by default but confirm it's not being overridden anywhere.
- **Handle enumeration types correctly.** The Companies House API returns codes, not plain English descriptions. For example, company status comes back as "active" or "dissolved" as an enumeration code. Download the enumeration mapping files from their GitHub (github.com/companieshouse/api-enumerations) and use these to translate codes into readable output. Do not hardcode your own descriptions.
- **Build flexibly.** The API may return fields in a different order on different calls, and may return new unexpected fields over time. Your code must not break when this happens — write it to pick out the fields you need rather than assuming a fixed structure.

**Step 6 — Build the website enrichment tool**
Using Claude Code, build a function that takes the company's website URL (which Companies House sometimes provides, or which you find via a search), scrapes the homepage, and extracts what the company does in plain English plus any contact details. This is the technically harder step — Claude Code will help significantly. Critically: build in robots.txt checking from day one. Before scraping any website, your code must fetch and read that site's robots.txt file and skip scraping if it disallows crawlers. Ignoring robots.txt on a commercial product puts you in uncomfortable legal territory under the Computer Misuse Act.

**Step 7 — Build the hiring signals tool**
Using Claude Code, build a function that searches for current job listings associated with the company. Use Indeed, Google Jobs, or Glassdoor — not LinkedIn. LinkedIn explicitly prohibits automated scraping and the Computer Misuse Act could apply in the UK. Indeed and Google Jobs are permissible sources that give you the same signal: is the company growing, what roles are they hiring, what technology do they use.

**Step 8 — Combine into one MCP server**
Wrap all three tools into a single MCP server using the Apify Actor framework. Claude Code can scaffold this structure for you. Your server has one primary tool: look up a company, return everything.

**Step 9 — Test thoroughly**
Run 50 company lookups. Check accuracy. Check speed. Fix anything that breaks or returns empty results. This is not glamorous but it is the difference between something developers trust and something they abandon after one failed call.

---

## Phase 2 — Launch (Weeks 6–8)

**Step 10 — Register with the ICO**
Go to ico.org.uk before you launch. Complete the self-assessment, pay £52, and keep the confirmation. This is legally required before you go live as you are processing personal data (director names) commercially.

**Step 11 — Write your privacy notice**
One page. Use the ICO's free template at ico.org.uk. State what data you process (UK company and director data from Companies House), why you process it (legitimate interest for B2B intelligence purposes), how long you keep it, and how someone can contact you if they have concerns. This must be publicly visible — put it in your Apify listing description.

**Step 12 — Complete your Legitimate Interest Assessment**
Download the ICO's free LIA template from ico.org.uk. Fill it in — it takes an hour. Confirm that: (1) your purpose is legitimate B2B intelligence, (2) processing this data is necessary for that purpose, and (3) the individual's rights don't override your legitimate interest given the data is from a public register. Keep it saved somewhere safe. You may never need it again, but it proves you thought about compliance properly if anyone ever questions you.

**Step 13 — Add the Open Government Licence attribution**
Companies House data is Crown Copyright published under the Open Government Licence. You are legally required to include this exact statement wherever your data is presented: "Contains public sector information licensed under the Open Government Licence v3.0." Add it to your Apify listing description and any future platform or website.

**Step 14 — Write your Terms of Service**
Before going live you need a T&C document in your Apify listing. Use a free template (search "B2B data API terms of service template UK"). It must include: (1) data is provided for informational purposes only, (2) UK Company Intelligence MCP is not liable for any decisions made based on the data, (3) prohibited uses — no harassment, no spam, no reselling as-is without attribution. This protects you if someone misuses your data or blames you for an inaccurate result.

**Step 15 — Register on Apify**
Sign up for the £1/month Creator Plan. Follow Apify's documentation to publish your Actor. Set pay-per-event pricing. Write a clear, specific description of what your tool does and who it's for. Good descriptions get found; vague ones don't.

**Step 16 — List on all the free directories**
Submit to: registry.modelcontextprotocol.io, Smithery, Glama, and PulseMCP. Each one is a different pool of developers. Submitting takes about 30 minutes total. This is your entire marketing effort.

---

## Phase 3 — Improve and Grow (Months 3–6)

**Step 15 — Monitor and fix**
Check Apify's dashboard weekly. Look at which calls succeed and which fail. Fix failures immediately — reliability is everything. A tool that works 99% of the time gets recommended. One that fails 10% of the time gets abandoned.

**Step 16 — Register as sole trader with HMRC**
The moment your Apify earnings cross £1,000 in a tax year, go to gov.uk and register as a sole trader. Free, 20 minutes. Keep a simple record of all income received and the exchange rate on each payment date (Apify pays in dollars).

**Step 17 — Add depth to the enrichment layer**
Once the core is stable, improve what you return. Add LinkedIn headcount. Add news mentions. Add financial health signals derived from filing patterns. Each improvement makes UK Company Intelligence MCP more valuable and harder to copy.

**Step 18 — Build your own API**
When you have 20+ consistent users on Apify, start building your own hosted version. Use a simple cloud host (Railway or Render are cheap and beginner-friendly). Migrate users to a monthly subscription model. This is where margins become genuinely good.

**Step 19 — Expand the data sources**
Once the core UK company intelligence is solid, consider adding: Land Registry transaction data, planning application data, or Scottish-specific data sources. Each addition makes UK Company Intelligence MCP more comprehensive and more defensible.

---

## Key Numbers to Remember

| Threshold | Action Required |
|-----------|----------------|
| Before building | Read Companies House API developer guidelines |
| During build | robots.txt checking built into scraper |
| During build | Use Indeed/Google Jobs only — never LinkedIn |
| Before going live | ICO registration (£52) |
| Before going live | Privacy notice published |
| Before going live | Legitimate Interest Assessment completed and saved |
| Before going live | Open Government Licence attribution added |
| Before going live | Terms of Service published on Apify listing |
| £1,000 annual income | Register as sole trader with HMRC |
| 20+ consistent users | Start building own platform |
| £40,000+ annual profit | Consider limited company structure |

---

*UK Company Intelligence MCP — Confidential. Prepared June 2026.*
