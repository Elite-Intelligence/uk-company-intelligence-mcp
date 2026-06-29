/**
 * Minimal robots.txt parser.
 * Spec: https://www.rfc-editor.org/rfc/rfc9309
 *
 * Returns true if the given path is allowed for our user-agent.
 * Fails open (returns true) when robots.txt is missing or malformed —
 * better to scrape conservatively than to incorrectly block.
 */

export const OUR_USER_AGENT = 'BusinessX-MCP';

/**
 * Parse a robots.txt body into a list of rule groups.
 * Each group: { agents: string[], rules: { type: 'allow'|'disallow', path: string }[] }
 */
function parseRobotsTxt(text) {
  const groups = [];
  let current = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.split('#')[0].trim();
    if (!line) {
      current = null;
      continue;
    }

    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (!current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (field === 'allow' || field === 'disallow') {
      if (current) current.rules.push({ type: field, path: value });
    } else {
      // crawl-delay, sitemap, etc. — ignore
    }
  }

  return groups;
}

/**
 * Match a robots.txt path pattern against a URL path.
 * Supports * (any sequence) and $ (end of string).
 */
function matchPath(pattern, urlPath) {
  if (!pattern) return false; // empty pattern matches nothing (Disallow: '' = allow all)

  // Convert pattern to regex
  let regexStr = pattern
    .split('*')
    .map(part => part.replace(/[.+?^{}()|[\]\\]/g, '\\$&'))
    .join('.*');

  if (regexStr.endsWith('\\$')) {
    regexStr = regexStr.slice(0, -2) + '$';
  }

  return new RegExp(regexStr).test(urlPath);
}

/**
 * Given a parsed robots.txt and a URL path, return true if our agent may fetch it.
 * Implements priority: specific agent > wildcard; Allow > Disallow on equal path length.
 */
function isAllowed(groups, urlPath, userAgent) {
  const agentLower = userAgent.toLowerCase();

  // Find the most specific matching group (named agent > wildcard)
  const specificGroup = groups.find(g => g.agents.includes(agentLower));
  const wildcardGroup = groups.find(g => g.agents.includes('*'));

  if (!specificGroup && !wildcardGroup) return true; // No matching group — allowed

  // Score one group: returns { bestLen, bestAllowed }
  function scoreGroup(group) {
    let bestLen = -1;
    let bestAllowed = true;
    for (const rule of group.rules) {
      if (!matchPath(rule.path, urlPath)) continue;
      const len = rule.path.replace('$', '').length;
      if (len > bestLen || (len === bestLen && rule.type === 'allow')) {
        bestLen = len;
        bestAllowed = rule.type === 'allow';
      }
    }
    return { bestLen, bestAllowed };
  }

  // If a named group exists and has at least one rule that matches this path,
  // it takes full precedence over the wildcard group.
  // If the named group has no matching rules, fall back to the wildcard group.
  if (specificGroup) {
    const { bestLen, bestAllowed } = scoreGroup(specificGroup);
    if (bestLen >= 0) return bestAllowed;
  }

  if (wildcardGroup) {
    const { bestAllowed } = scoreGroup(wildcardGroup);
    return bestAllowed;
  }

  return true;
}

/**
 * Fetch robots.txt and determine if we may scrape the given URL.
 * Returns { allowed: boolean, reason: string }.
 */
export async function checkRobots(targetUrl, fetchFn) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { allowed: false, reason: 'Invalid URL' };
  }

  const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;

  try {
    const res = await fetchFn(robotsUrl, {
      headers: { 'User-Agent': OUR_USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 404) return { allowed: true, reason: 'No robots.txt found' };
    if (!res.ok) return { allowed: true, reason: `robots.txt fetch returned ${res.status}` };

    const text = await res.text();
    const groups = parseRobotsTxt(text);
    const urlPath = parsed.pathname + (parsed.search || '');
    const allowed = isAllowed(groups, urlPath, OUR_USER_AGENT);

    return {
      allowed,
      reason: allowed ? 'Permitted by robots.txt' : 'Disallowed by robots.txt',
    };
  } catch (err) {
    // Network error fetching robots.txt — fail open
    return { allowed: true, reason: `Could not fetch robots.txt: ${err.message}` };
  }
}
