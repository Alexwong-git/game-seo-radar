import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { createKeywordCandidates, extractGameNameFromUrl } from "../lib/keywords.js";
import { scoreKeyword } from "../lib/scoring.js";
import { crawlSite, makeSite } from "../lib/sitemap.js";

const originalFetch = globalThis.fetch;

function xmlResponse(xml) {
  return new Response(xml, {
    status: 200,
    headers: { "content-type": "application/xml" }
  });
}

function gzipXmlResponse(xml) {
  return new Response(gzipSync(xml), {
    status: 200,
    headers: { "content-type": "application/gzip" }
  });
}

globalThis.fetch = async (url) => {
  if (url === "https://example.com/sitemap.xml") {
    return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
      <sitemapindex>
        <sitemap><loc>https://example.com/game-sitemap.xml</loc></sitemap>
        <sitemap><loc>https://example.com/extra-sitemap.xml.gz</loc></sitemap>
      </sitemapindex>`);
  }

  if (url === "https://example.com/game-sitemap.xml") {
    return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
      <urlset>
        <url><loc>https://example.com/game/banana-cat-run</loc><lastmod>2026-06-03</lastmod></url>
        <url><loc>https://example.com/category/action</loc><lastmod>2026-06-03</lastmod></url>
      </urlset>`);
  }

  if (url === "https://example.com/extra-sitemap.xml.gz") {
    return gzipXmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
      <urlset>
        <url><loc>https://example.com/game/rocket-bike-race</loc><lastmod>2026-06-04</lastmod></url>
      </urlset>`);
  }

  if (url === "https://newest.example.com/sitemap.xml") {
    return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
      <urlset>
        <url><loc>https://newest.example.com/game/old-signal</loc><lastmod>2026-05-01</lastmod></url>
        <url><loc>https://newest.example.com/game/fresh-signal</loc><lastmod>2026-06-04</lastmod></url>
      </urlset>`);
  }

  throw new Error(`Unexpected fetch: ${url}`);
};

try {
  const name = extractGameNameFromUrl("https://example.com/game/banana-cat-run");
  assert.equal(name, "banana cat run");

  const candidates = createKeywordCandidates({
    sourceSite: "example.com",
    sourceUrl: "https://example.com/game/banana-cat-run",
    gameName: name
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].keyword, "banana cat run");
  assert.deepEqual(candidates[0].variants, [
    "banana cat run",
    "banana cat run game",
    "play banana cat run",
    "banana cat run online",
    "banana cat run unblocked"
  ]);

  const scored = scoreKeyword({
    ...candidates[0],
    google_trends_status: "rising",
    production_difficulty: "low",
    serp_competition: "low"
  });
  assert.equal(scored.build_signal, "should_build");

  const db = {
    sites: [],
    urls: [
      {
        id: "url_existing_baseline",
        url: "https://example.com/game/existing-baseline",
        lastmod: null,
        source_site: "example.com",
        sitemap_url: "https://example.com/sitemap.xml",
        first_seen_at: "2026-06-01T00:00:00.000Z",
        last_seen_at: "2026-06-01T00:00:00.000Z",
        fetched_at: "2026-06-01T00:00:00.000Z",
        discovery_type: "baseline",
        is_new: false,
        is_recently_updated: false
      }
    ],
    keywords: [],
    runs: []
  };
  const site = makeSite({
    domain: "example.com",
    sitemap_url: "https://example.com/sitemap.xml",
    include_patterns: "/game/*",
    exclude_patterns: "/category/*",
    request_delay_ms: 1
  });
  const baselineDb = { sites: [], urls: [], keywords: [], runs: [] };
  const baselineResult = await crawlSite(baselineDb, site, { delayMs: 1, timeoutMs: 5000, runType: "baseline" });
  assert.equal(baselineResult.newUrls.length, 2);
  assert.equal(baselineDb.urls.length, 2);
  assert.equal(baselineDb.urls.every((url) => url.discovery_type === "baseline"), true);
  assert.equal(baselineDb.keywords.length, 0);

  const autoBaselineDb = { sites: [], urls: [], keywords: [], runs: [] };
  const autoBaselineResult = await crawlSite(autoBaselineDb, site, { delayMs: 1, timeoutMs: 5000 });
  assert.equal(autoBaselineResult.run.run_type, "baseline");
  assert.equal(autoBaselineDb.keywords.length, 0);

  const result = await crawlSite(db, site, { delayMs: 1, timeoutMs: 5000 });

  assert.equal(result.newUrls.length, 2);
  assert.equal(db.urls.length, 3);
  assert.equal(db.keywords.length, 2);
  assert.equal(db.runs[0].run_type, "incremental");
  assert.equal(db.runs.length, 1);
  assert.equal(db.urls.some((url) => url.url === "https://example.com/game/banana-cat-run"), true);

  const secondResult = await crawlSite(db, site, { delayMs: 1, timeoutMs: 5000 });
  assert.equal(secondResult.newUrls.length, 0);
  assert.equal(db.urls.length, 3);

  const newestDb = {
    sites: [],
    urls: [
      {
        id: "url_old_signal_baseline",
        url: "https://newest.example.com/game/old-signal",
        lastmod: "2026-05-01",
        source_site: "newest.example.com",
        sitemap_url: "https://newest.example.com/sitemap.xml",
        first_seen_at: "2026-06-01T00:00:00.000Z",
        last_seen_at: "2026-06-01T00:00:00.000Z",
        fetched_at: "2026-06-01T00:00:00.000Z",
        discovery_type: "baseline",
        is_new: false,
        is_recently_updated: false
      }
    ],
    keywords: [],
    runs: []
  };
  const newestSite = makeSite({
    domain: "newest.example.com",
    sitemap_url: "https://newest.example.com/sitemap.xml",
    include_patterns: "/game/*",
    incremental_url_limit: 1,
    request_delay_ms: 1
  });
  const newestResult = await crawlSite(newestDb, newestSite, { delayMs: 1, timeoutMs: 5000 });
  assert.equal(newestResult.newUrls.length, 1);
  assert.equal(newestResult.newUrls[0].url, "https://newest.example.com/game/fresh-signal");

  console.log("Smoke test passed.");
} finally {
  globalThis.fetch = originalFetch;
}
