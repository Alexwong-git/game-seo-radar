import { createId, nowIso, todayIso } from "./db.js";
import { createKeywordCandidates, extractGameNameFromUrl } from "./keywords.js";
import { scoreKeyword } from "./scoring.js";
import { gunzipSync } from "node:zlib";

const DEFAULT_DELAY_MS = 1200;
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_SITEMAP_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_URLS_PER_RUN = 300;
const DEFAULT_BASELINE_URL_LIMIT = 100000;
const DEFAULT_INCREMENTAL_URL_LIMIT = 300;
const DEFAULT_MAX_SITEMAPS_PER_RUN = 1000;
const DEFAULT_RETRIES = 2;
const MAX_DEPTH = 4;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function absolutize(url, base) {
  return new URL(url, base).toString();
}

function normalizeSiteUrl(input) {
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withProtocol);
  return `${url.protocol}//${url.host}`;
}

function numberOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function readLimitedText(response, maxBytes, sourceUrl) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  let received = 0;
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      throw new Error(`Sitemap exceeds ${maxBytes} bytes while fetching ${sourceUrl}`);
    }
    chunks.push(value);
  }

  let buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  const contentEncoding = response.headers.get("content-encoding") || "";
  const contentType = response.headers.get("content-type") || "";
  const looksGzipped =
    sourceUrl.toLowerCase().endsWith(".gz") ||
    contentEncoding.toLowerCase().includes("gzip") ||
    contentType.toLowerCase().includes("gzip");

  if (looksGzipped && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    buffer = gunzipSync(buffer);
  }

  return buffer.toString("utf8");
}

async function fetchText(url, options = {}) {
  const timeoutMs = numberOrDefault(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const maxBytes = numberOrDefault(options.maxBytes, DEFAULT_MAX_SITEMAP_BYTES);
  const retries = numberOrDefault(options.retries, DEFAULT_RETRIES);
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": "GameSEOKeywordRadar/0.1 (+public sitemap monitor)"
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} while fetching ${url}`);
      }

      return await readLimitedText(response, maxBytes, url);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await sleep(500 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

function parseRobotsSitemaps(robotsText, siteBaseUrl) {
  return robotsText
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*sitemap:\s*(.+)\s*$/i)?.[1])
    .filter(Boolean)
    .map((value) => absolutize(value.trim(), siteBaseUrl));
}

function decodeXmlText(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function isSitemapLikeUrl(value = "") {
  return /\.xml(\.gz)?($|\?)/i.test(value) || /\/sitemap/i.test(value);
}

async function discoverSitemaps(site, options = {}) {
  if (site.sitemap_url) return [site.sitemap_url];

  const siteBaseUrl = normalizeSiteUrl(site.domain);
  try {
    const robotsText = await fetchText(`${siteBaseUrl}/robots.txt`, options);
    const sitemaps = parseRobotsSitemaps(robotsText, siteBaseUrl);
    if (sitemaps.length > 0) return sitemaps;
  } catch {
    // Fall back to the common sitemap path below.
  }

  return [`${siteBaseUrl}/sitemap.xml`];
}

function parseSitemapXml(xml) {
  const trimmed = xml.trim();
  const textLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^https?:\/\//i.test(line));

  if (!trimmed.startsWith("<") && textLines.length > 0) {
    const looksLikeSitemapList = textLines.some((line) => isSitemapLikeUrl(line));
    return {
      type: looksLikeSitemapList ? "index" : "urlset",
      entries: textLines.map((line) => ({
        loc: line,
        lastmod: null
      }))
    };
  }

  const sitemapMatches = [...xml.matchAll(/<sitemap\b[\s\S]*?<\/sitemap>/gi)];
  if (sitemapMatches.length > 0) {
    return {
      type: "index",
      entries: sitemapMatches
        .map((match) => ({
          loc: decodeXmlText(match[0].match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i)?.[1]?.trim() || ""),
          lastmod: match[0].match(/<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i)?.[1]?.trim() || null
        }))
        .filter((entry) => entry.loc)
    };
  }

  const urlEntries = [...xml.matchAll(/<url\b[\s\S]*?<\/url>/gi)]
    .map((match) => ({
        loc: decodeXmlText(match[0].match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i)?.[1]?.trim() || ""),
        lastmod: match[0].match(/<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i)?.[1]?.trim() || null
      }))
    .filter((entry) => entry.loc);

  const sitemapLikeCount = urlEntries.filter((entry) => isSitemapLikeUrl(entry.loc)).length;

  return {
    type: urlEntries.length > 0 && sitemapLikeCount / urlEntries.length > 0.5 ? "index" : "urlset",
    entries: urlEntries
  };
}

function scoreSitemapCandidate(entry) {
  const loc = entry.loc.toLowerCase();
  let score = 0;
  if (/\b(en|en-us|english)\b/.test(loc)) score += 8;
  if (loc.includes("game")) score += 6;
  if (loc.includes("play")) score += 4;
  if (loc.includes("html5")) score += 3;
  if (loc.includes("category") || loc.includes("tag") || loc.includes("blog") || loc.includes("news")) score -= 5;
  return score;
}

function timestampFromLastmod(lastmod) {
  if (!lastmod) return 0;
  const timestamp = Date.parse(lastmod);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareNewestEntries(first, second) {
  return timestampFromLastmod(second.lastmod) - timestampFromLastmod(first.lastmod);
}

function splitPatterns(value = "") {
  return String(value)
    .split(/\r?\n|,/)
    .map((pattern) => pattern.trim())
    .filter(Boolean);
}

function patternMatches(pattern, target) {
  if (pattern.includes("*")) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
    const source = pattern.startsWith("/") ? `^${escaped}` : escaped;
    return new RegExp(source, "i").test(target);
  }

  if (pattern.startsWith("/")) {
    return target.toLowerCase().startsWith(pattern.toLowerCase());
  }

  return target.toLowerCase().includes(pattern.toLowerCase());
}

function urlPassesSiteFilters(sourceUrl, site) {
  const includePatterns = splitPatterns(site.include_patterns);
  const excludePatterns = splitPatterns(site.exclude_patterns);
  const parsed = new URL(sourceUrl);
  const target = `${parsed.pathname}${parsed.search}`;

  const included =
    includePatterns.length === 0 ||
    includePatterns.some((pattern) =>
      pattern.startsWith("/") ? patternMatches(pattern, target) : patternMatches(pattern, sourceUrl)
    );
  const excluded = excludePatterns.some(
    (pattern) => pattern.startsWith("/") ? patternMatches(pattern, target) : patternMatches(pattern, sourceUrl)
  );

  return included && !excluded;
}

async function crawlSitemapUrl(sitemapUrl, depth = 0, options = {}) {
  if (depth > MAX_DEPTH) return [];

  const delayMs = numberOrDefault(options.delayMs, DEFAULT_DELAY_MS);
  const maxUrls = numberOrDefault(options.maxUrls, DEFAULT_MAX_URLS_PER_RUN);
  const maxSitemaps = numberOrDefault(options.maxSitemaps, DEFAULT_MAX_SITEMAPS_PER_RUN);
  const xml = await fetchText(sitemapUrl, options);
  const parsed = parseSitemapXml(xml);

  if (parsed.type === "urlset") {
    return [...parsed.entries]
      .sort(compareNewestEntries)
      .slice(0, maxUrls)
      .map((entry) => ({
        url: entry.loc,
        lastmod: entry.lastmod,
        sitemap_url: sitemapUrl
      }));
  }

  const collected = [];
  const sitemapEntries = [...parsed.entries].sort((a, b) => {
    const scoreDiff = scoreSitemapCandidate(b) - scoreSitemapCandidate(a);
    return scoreDiff || compareNewestEntries(a, b);
  });
  for (const sitemap of sitemapEntries) {
    if (collected.length >= maxUrls) break;
    if ((options.sitemapsVisited ?? 0) >= maxSitemaps) break;
    options.sitemapsVisited = (options.sitemapsVisited ?? 0) + 1;
    await sleep(delayMs);
    const childUrl = absolutize(sitemap.loc, sitemapUrl);
    try {
      const childEntries = await crawlSitemapUrl(childUrl, depth + 1, {
        ...options,
        maxUrls: maxUrls - collected.length
      });
      collected.push(...childEntries);
    } catch (error) {
      options.errors?.push(`${childUrl}: ${error.message}`);
    }
  }

  return collected;
}

export async function crawlSite(db, site, options = {}) {
  const requestedRunType = options.runType === "baseline" ? "baseline" : "incremental";
  const hasBaselineForSite = db.urls.some((url) => url.source_site === site.domain && url.discovery_type === "baseline");
  const runType = requestedRunType === "baseline" || !hasBaselineForSite ? "baseline" : "incremental";
  const delayMs = numberOrDefault(options.delayMs || site.request_delay_ms, DEFAULT_DELAY_MS);
  const timeoutMs = numberOrDefault(options.timeoutMs || site.timeout_ms, DEFAULT_TIMEOUT_MS);
  const maxBytes = numberOrDefault(options.maxBytes || site.max_sitemap_bytes, DEFAULT_MAX_SITEMAP_BYTES);
  const siteUrlLimit =
    runType === "baseline"
      ? site.baseline_url_limit || site.max_urls_per_run || DEFAULT_BASELINE_URL_LIMIT
      : site.incremental_url_limit || site.max_urls_per_run || DEFAULT_INCREMENTAL_URL_LIMIT;
  const maxUrls = numberOrDefault(options.maxUrls || siteUrlLimit, DEFAULT_MAX_URLS_PER_RUN);
  const maxSitemaps = numberOrDefault(
    options.maxSitemaps || site.max_sitemaps_per_run,
    DEFAULT_MAX_SITEMAPS_PER_RUN
  );
  const retries = numberOrDefault(options.retries, DEFAULT_RETRIES);
  const crawlOptions = { delayMs, timeoutMs, maxBytes, maxUrls, maxSitemaps, retries, errors: [], sitemapsVisited: 0 };
  const crawlStartedAt = nowIso();
  const sitemaps = await discoverSitemaps(site, crawlOptions);
  const fetchedUrls = [];

  for (const sitemapUrl of sitemaps) {
    if (fetchedUrls.length >= maxUrls) break;
    await sleep(delayMs);
    const entries = await crawlSitemapUrl(sitemapUrl, 0, {
      ...crawlOptions,
      maxUrls: maxUrls - fetchedUrls.length
    });
    fetchedUrls.push(...entries);
  }

  const seenThisRun = new Set();
  const newUrls = [];
  const updatedUrls = [];
  let filteredUrlCount = 0;

  for (const entry of fetchedUrls) {
    if (seenThisRun.has(entry.url)) continue;
    seenThisRun.add(entry.url);
    if (!urlPassesSiteFilters(entry.url, site)) {
      filteredUrlCount += 1;
      continue;
    }

    const existing = db.urls.find((item) => item.url === entry.url && item.source_site === site.domain);
    if (!existing) {
      const record = {
        id: createId("url"),
        url: entry.url,
        lastmod: entry.lastmod,
        source_site: site.domain,
        sitemap_url: entry.sitemap_url,
        first_seen_at: crawlStartedAt,
        last_seen_at: crawlStartedAt,
        fetched_at: crawlStartedAt,
        discovery_type: runType,
        is_new: runType === "incremental",
        is_recently_updated: false
      };
      db.urls.push(record);
      newUrls.push(record);

      const gameName = runType === "incremental" ? extractGameNameFromUrl(entry.url) : null;
      if (gameName) {
        const candidates = createKeywordCandidates({
          sourceSite: site.domain,
          sourceUrl: entry.url,
          gameName,
          sourceDiscoveryType: runType
        });

        for (const candidate of candidates) {
          const duplicate = db.keywords.some(
            (keyword) => keyword.keyword === candidate.keyword && keyword.source_url === candidate.source_url
          );
          if (!duplicate) db.keywords.push(candidate);
        }
      }
    } else {
      const wasUpdated = Boolean(entry.lastmod && existing.lastmod && entry.lastmod !== existing.lastmod);
      existing.last_seen_at = crawlStartedAt;
      existing.fetched_at = crawlStartedAt;
      existing.is_new = false;
      existing.is_recently_updated = wasUpdated;
      if (entry.lastmod) existing.lastmod = entry.lastmod;
      if (wasUpdated) updatedUrls.push(existing);
    }
  }

  for (const keyword of db.keywords) {
    Object.assign(keyword, scoreKeyword(keyword), { updated_at: nowIso() });
  }

  const run = {
    id: createId("run"),
    site_id: site.id,
    site_domain: site.domain,
    started_at: crawlStartedAt,
    finished_at: nowIso(),
    fetched_url_count: seenThisRun.size,
    matched_url_count: seenThisRun.size - filteredUrlCount,
    filtered_url_count: filteredUrlCount,
    new_url_count: newUrls.length,
    updated_url_count: updatedUrls.length,
    run_date: todayIso(),
    run_type: runType,
    error: crawlOptions.errors.slice(0, 3).join(" | ")
  };
  if (runType === "baseline" && (run.matched_url_count > 0 || !run.error)) {
    site.baseline_completed_at = run.finished_at;
  }
  db.runs.push(run);

  return { run, newUrls, updatedUrls };
}

export async function crawlEnabledSites(db, options = {}) {
  const results = [];
  for (const site of db.sites.filter((item) => item.enabled)) {
    try {
      results.push(await crawlSite(db, site, options));
    } catch (error) {
      const run = {
        id: createId("run"),
        site_id: site.id,
        site_domain: site.domain,
        started_at: nowIso(),
        finished_at: nowIso(),
        fetched_url_count: 0,
        matched_url_count: 0,
        filtered_url_count: 0,
        new_url_count: 0,
        updated_url_count: 0,
        run_date: todayIso(),
        run_type: options.runType === "baseline" ? "baseline" : "incremental",
        error: error.message
      };
      db.runs.push(run);
      results.push({ run, newUrls: [], updatedUrls: [], error });
    }
  }
  return results;
}

export function makeSite({
  domain,
  sitemap_url = "",
  include_patterns = "",
  exclude_patterns = "",
  request_delay_ms = DEFAULT_DELAY_MS,
  timeout_ms = DEFAULT_TIMEOUT_MS,
  max_sitemap_bytes = DEFAULT_MAX_SITEMAP_BYTES,
  max_urls_per_run = DEFAULT_MAX_URLS_PER_RUN,
  incremental_url_limit = DEFAULT_INCREMENTAL_URL_LIMIT,
  baseline_url_limit = DEFAULT_BASELINE_URL_LIMIT,
  max_sitemaps_per_run = DEFAULT_MAX_SITEMAPS_PER_RUN,
  enabled = true,
  notes = ""
}) {
  return {
    id: createId("site"),
    domain: normalizeSiteUrl(domain).replace(/^https?:\/\//, ""),
    sitemap_url: sitemap_url ? sitemap_url.trim() : "",
    include_patterns: include_patterns || "",
    exclude_patterns: exclude_patterns || "",
    request_delay_ms: numberOrDefault(request_delay_ms, DEFAULT_DELAY_MS),
    timeout_ms: numberOrDefault(timeout_ms, DEFAULT_TIMEOUT_MS),
    max_sitemap_bytes: numberOrDefault(max_sitemap_bytes, DEFAULT_MAX_SITEMAP_BYTES),
    max_urls_per_run: numberOrDefault(max_urls_per_run, DEFAULT_MAX_URLS_PER_RUN),
    incremental_url_limit: numberOrDefault(incremental_url_limit, DEFAULT_INCREMENTAL_URL_LIMIT),
    baseline_url_limit: numberOrDefault(baseline_url_limit, DEFAULT_BASELINE_URL_LIMIT),
    max_sitemaps_per_run: numberOrDefault(max_sitemaps_per_run, DEFAULT_MAX_SITEMAPS_PER_RUN),
    baseline_completed_at: "",
    enabled,
    notes,
    created_at: nowIso(),
    updated_at: nowIso()
  };
}
