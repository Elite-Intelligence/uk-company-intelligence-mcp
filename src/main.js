/**
 * Business X — UK Company Intelligence MCP
 * Apify Actor entry point.
 *
 * Three execution modes:
 *   1. HTTP server (default on Apify)  — StreamableHTTPServerTransport on APIFY_CONTAINER_PORT.
 *      Apify routes MCP traffic to /mcp. usesStandbyMode keeps the Actor alive across calls.
 *   2. Stdio (local dev)               — pass --stdio flag; used when running with Claude Desktop.
 *   3. Single-run Actor                — pass --once flag; reads input, pushes dataset, exits.
 *
 * The COMPANIES_HOUSE_API_KEY environment variable must be set.
 * On Apify: set it in the Actor's Environment Variables tab in the Console.
 * Locally:  copy .env.example to .env and fill it in.
 *
 * Contains public sector information licensed under the Open Government Licence v3.0
 */

import express from 'express';
import cors from 'cors';
import { Actor } from 'apify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { lookupCompany } from './companies-house.js';

// Load .env locally; Apify injects env vars automatically in production
if (!process.env.APIFY_IS_AT_HOME) {
  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    require('dotenv').config();
  } catch { /* dotenv optional — not listed as a prod dependency */ }
}

const TOOL_NAME = 'lookup_uk_company';

const TOOL_DESCRIPTION =
  'Look up a UK-registered company by name or Companies House registration number. ' +
  'Returns verified legal identity, directors, incorporation date, SIC codes, registered address, ' +
  'accounts status (including whether accounts are overdue), registered charges, ' +
  'website enrichment (plain-English description, contact details), ' +
  'and hiring signals (active job listings, example titles, technology keywords). ' +
  'Data sourced from the official Companies House API and publicly accessible ATS job boards. ' +
  'Contains public sector information licensed under the Open Government Licence v3.0.';

const INPUT_SCHEMA = {
  query: z.string().describe(
    'Company name (e.g. "Tesco PLC") or Companies House registration number ' +
    '(e.g. "00445790" or "SC123456"). Names are searched; numbers are looked up directly.',
  ),
  websiteUrl: z.string().optional().describe(
    'Optional. Known website URL (e.g. "https://tesco.com"). ' +
    'Skips domain inference; robots.txt is still checked before scraping.',
  ),
};

function buildMcpServer() {
  const server = new McpServer(
    { name: 'business-x-mcp', version: '1.0.0' },
    { capabilities: { logging: {} } },
  );

  server.registerTool(TOOL_NAME, { description: TOOL_DESCRIPTION, inputSchema: INPUT_SCHEMA },
    async ({ query, websiteUrl }) => {
      // Charge per lookup — maps to pay-per-event pricing set in Apify Console
      try { await Actor.charge({ eventName: 'tool-call' }); } catch { /* not fatal locally */ }

      try {
        const result = await lookupCompany(query.trim(), websiteUrl);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }, null, 2) }],
          isError: true,
        };
      }
    },
  );

  return server;
}

// ─── Mode: HTTP server (Apify standby — default) ─────────────────────────────

async function runHttpServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check endpoint — Apify uses this to confirm the Actor is ready
  app.get('/', (_req, res) => res.json({ status: 'ok', name: 'business-x-mcp' }));

  // MCP endpoint — Apify routes traffic here based on webServerMcpPath in actor.json
  app.post('/mcp', async (req, res) => {
    const server = buildMcpServer();
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => { transport.close(); server.close(); });
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  });

  app.get('/mcp', (_req, res) => res.status(405).json(
    { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null },
  ));

  app.delete('/mcp', (_req, res) => res.status(405).json(
    { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null },
  ));

  const port = process.env.APIFY_CONTAINER_PORT ? parseInt(process.env.APIFY_CONTAINER_PORT) : 3000;
  app.listen(port, () => {
    Actor.setStatusMessage(`MCP server ready — listening on port ${port}`);
    console.error(`Business X MCP server listening on port ${port}`);
  });

  process.on('SIGINT', () => { console.error('Shutting down.'); process.exit(0); });
}

// ─── Mode: stdio (local dev / Claude Desktop) ────────────────────────────────

async function runStdioServer() {
  const server = buildMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Business X MCP server running on stdio');
}

// ─── Mode: single Actor run (--once flag or no standby mode) ─────────────────

async function runOnce() {
  const input = await Actor.getInput();
  const query = input?.query;
  if (!query) throw new Error('Input must include a "query" field (company name or number)');
  const result = await lookupCompany(query.trim(), input?.websiteUrl ?? undefined);
  await Actor.pushData(result);
  console.log(JSON.stringify(result, null, 2));
  await Actor.exit();
}

// ─── Entry point ─────────────────────────────────────────────────────────────

await Actor.init();

if (process.argv.includes('--stdio')) {
  await runStdioServer();
} else if (process.argv.includes('--once')) {
  await runOnce();
} else {
  // Default: HTTP server (Apify standby mode)
  await runHttpServer();
}
