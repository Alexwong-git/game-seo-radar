import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { nowIso, todayIso } from "./time.js";

const SQLITE_PATH = path.resolve(process.env.DATABASE_PATH || path.join("data", "radar.sqlite"));
const DATA_DIR = path.dirname(SQLITE_PATH);
const JSON_PATH = path.join(DATA_DIR, "db.json");

const emptyDb = {
  sites: [],
  urls: [],
  keywords: [],
  keyword_roots: [],
  runs: []
};

let initialized = false;

function openDatabase() {
  mkdirSync(DATA_DIR, { recursive: true });
  const database = new DatabaseSync(SQLITE_PATH);
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  return database;
}

function ensureSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL UNIQUE,
      sitemap_url TEXT DEFAULT '',
      include_patterns TEXT DEFAULT '',
      exclude_patterns TEXT DEFAULT '',
      request_delay_ms INTEGER NOT NULL DEFAULT 1200,
      timeout_ms INTEGER NOT NULL DEFAULT 20000,
      max_sitemap_bytes INTEGER NOT NULL DEFAULT 10485760,
      incremental_url_limit INTEGER NOT NULL DEFAULT 300,
      baseline_url_limit INTEGER NOT NULL DEFAULT 100000,
      max_urls_per_run INTEGER NOT NULL DEFAULT 300,
      max_sitemaps_per_run INTEGER NOT NULL DEFAULT 1000,
      baseline_completed_at TEXT DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS urls (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      lastmod TEXT,
      source_site TEXT NOT NULL,
      sitemap_url TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      discovery_type TEXT NOT NULL DEFAULT 'incremental',
      is_new INTEGER NOT NULL DEFAULT 0,
      is_recently_updated INTEGER NOT NULL DEFAULT 0,
      UNIQUE(url, source_site)
    );

    CREATE TABLE IF NOT EXISTS keywords (
      id TEXT PRIMARY KEY,
      first_seen_date TEXT NOT NULL,
      source_site TEXT NOT NULL,
      source_url TEXT NOT NULL,
      keyword TEXT NOT NULL,
      game_name TEXT NOT NULL,
      variants TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      notes TEXT DEFAULT '',
      google_trends_status TEXT NOT NULL DEFAULT 'unknown',
      production_difficulty TEXT NOT NULL DEFAULT 'medium',
      serp_competition TEXT NOT NULL DEFAULT 'medium',
      priority_score INTEGER NOT NULL DEFAULT 0,
      build_signal TEXT NOT NULL DEFAULT 'observe',
      score_breakdown TEXT NOT NULL DEFAULT '{}',
      source_discovery_type TEXT NOT NULL DEFAULT 'incremental',
      launched_url TEXT DEFAULT '',
      launched_date TEXT DEFAULT '',
      indexed_status TEXT NOT NULL DEFAULT 'unknown',
      impressions_7d INTEGER NOT NULL DEFAULT 0,
      clicks_7d INTEGER NOT NULL DEFAULT 0,
      result_notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(keyword, source_url)
    );

    CREATE TABLE IF NOT EXISTS keyword_roots (
      id TEXT PRIMARY KEY,
      source_order INTEGER NOT NULL DEFAULT 0,
      site_type TEXT DEFAULT '',
      root TEXT NOT NULL UNIQUE,
      raw_root TEXT DEFAULT '',
      example_queries TEXT NOT NULL DEFAULT '[]',
      user_intent TEXT DEFAULT '',
      opportunity TEXT DEFAULT '',
      monthly_volume INTEGER,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_mined_at TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      site_domain TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      fetched_url_count INTEGER NOT NULL DEFAULT 0,
      matched_url_count INTEGER NOT NULL DEFAULT 0,
      filtered_url_count INTEGER NOT NULL DEFAULT 0,
      new_url_count INTEGER NOT NULL DEFAULT 0,
      updated_url_count INTEGER NOT NULL DEFAULT 0,
      run_date TEXT NOT NULL,
      run_type TEXT NOT NULL DEFAULT 'incremental',
      error TEXT DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_urls_source_site ON urls(source_site);
    CREATE INDEX IF NOT EXISTS idx_keywords_score ON keywords(priority_score DESC);
    CREATE INDEX IF NOT EXISTS idx_keyword_roots_volume ON keyword_roots(monthly_volume DESC);
    CREATE INDEX IF NOT EXISTS idx_runs_finished ON runs(finished_at DESC);
  `);
  ensureColumn(database, "sites", "include_patterns", "TEXT DEFAULT ''");
  ensureColumn(database, "sites", "exclude_patterns", "TEXT DEFAULT ''");
  ensureColumn(database, "sites", "request_delay_ms", "INTEGER NOT NULL DEFAULT 1200");
  ensureColumn(database, "sites", "timeout_ms", "INTEGER NOT NULL DEFAULT 20000");
  ensureColumn(database, "sites", "max_sitemap_bytes", "INTEGER NOT NULL DEFAULT 10485760");
  ensureColumn(database, "sites", "max_urls_per_run", "INTEGER NOT NULL DEFAULT 300");
  ensureColumn(database, "sites", "max_sitemaps_per_run", "INTEGER NOT NULL DEFAULT 1000");
  ensureColumn(database, "sites", "incremental_url_limit", "INTEGER NOT NULL DEFAULT 300");
  ensureColumn(database, "sites", "baseline_url_limit", "INTEGER NOT NULL DEFAULT 100000");
  ensureColumn(database, "sites", "baseline_completed_at", "TEXT DEFAULT ''");
  ensureColumn(database, "keywords", "launched_url", "TEXT DEFAULT ''");
  ensureColumn(database, "keywords", "source_discovery_type", "TEXT NOT NULL DEFAULT 'incremental'");
  ensureColumn(database, "keywords", "launched_date", "TEXT DEFAULT ''");
  ensureColumn(database, "keywords", "indexed_status", "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(database, "keywords", "impressions_7d", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "keywords", "clicks_7d", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "keywords", "result_notes", "TEXT DEFAULT ''");
  ensureColumn(database, "runs", "error", "TEXT DEFAULT ''");
  ensureColumn(database, "runs", "matched_url_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "runs", "filtered_url_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "runs", "run_type", "TEXT NOT NULL DEFAULT 'incremental'");
  ensureColumn(database, "urls", "discovery_type", "TEXT NOT NULL DEFAULT 'incremental'");
}

function ensureColumn(database, tableName, columnName, definition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  }
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeDb(db) {
  return {
    sites: (db.sites || []).map((site) => ({
      include_patterns: "",
      exclude_patterns: "",
      request_delay_ms: 1200,
      timeout_ms: 20000,
      max_sitemap_bytes: 10485760,
      max_urls_per_run: 300,
      max_sitemaps_per_run: 1000,
      incremental_url_limit: 300,
      baseline_url_limit: 100000,
      baseline_completed_at: "",
      ...site,
      sitemap_url: site.sitemap_url || "",
      enabled: Boolean(site.enabled),
      notes: site.notes || ""
    })),
    urls: (db.urls || []).map((url) => ({
      discovery_type: "incremental",
      ...url
    })),
    keywords: (db.keywords || []).map((keyword) => ({
      source_discovery_type: "incremental",
      launched_url: "",
      launched_date: "",
      indexed_status: "unknown",
      impressions_7d: 0,
      clicks_7d: 0,
      result_notes: "",
      ...keyword,
      variants: keyword.variants || [],
      score_breakdown: keyword.score_breakdown || {}
    })),
    keyword_roots: (db.keyword_roots || []).map((root) => ({
      source_order: 0,
      site_type: "",
      raw_root: "",
      example_queries: [],
      user_intent: "",
      opportunity: "",
      monthly_volume: null,
      enabled: true,
      last_mined_at: "",
      notes: "",
      ...root,
      example_queries: root.example_queries || []
    })),
    runs: (db.runs || []).map((run) => ({
      error: "",
      matched_url_count: 0,
      filtered_url_count: 0,
      run_type: "incremental",
      ...run
    }))
  };
}

function hasRows(database, tableName) {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
  return row.count > 0;
}

function readJsonSeed() {
  if (!existsSync(JSON_PATH)) return null;
  return JSON.parse(readFileSync(JSON_PATH, "utf8"));
}

function initialize() {
  if (initialized) return;

  const database = openDatabase();
  try {
    ensureSchema(database);
    if (!hasRows(database, "sites")) {
      const seed = readJsonSeed();
      if (seed) writeDbToOpenDatabase(database, normalizeDb(seed));
    }
    initialized = true;
  } finally {
    database.close();
  }
}

function readDbFromOpenDatabase(database) {
  const sites = database
    .prepare("SELECT * FROM sites ORDER BY created_at ASC")
    .all()
    .map((site) => ({
      ...site,
      enabled: Boolean(site.enabled)
    }));

  const urls = database
    .prepare("SELECT * FROM urls ORDER BY first_seen_at DESC")
    .all()
    .map((url) => ({
      ...url,
      discovery_type: url.discovery_type || "incremental",
      is_new: Boolean(url.is_new),
      is_recently_updated: Boolean(url.is_recently_updated)
    }));

  const keywords = database
    .prepare("SELECT * FROM keywords ORDER BY priority_score DESC, first_seen_date DESC")
    .all()
    .map((keyword) => ({
      ...keyword,
      source_discovery_type: keyword.source_discovery_type || "incremental",
      variants: parseJson(keyword.variants, []),
      score_breakdown: parseJson(keyword.score_breakdown, {}),
      impressions_7d: Number(keyword.impressions_7d || 0),
      clicks_7d: Number(keyword.clicks_7d || 0)
    }));

  const keyword_roots = database
    .prepare("SELECT * FROM keyword_roots ORDER BY source_order ASC, root ASC")
    .all()
    .map((root) => ({
      ...root,
      example_queries: parseJson(root.example_queries, []),
      enabled: Boolean(root.enabled),
      monthly_volume: root.monthly_volume === null || root.monthly_volume === undefined ? null : Number(root.monthly_volume)
    }));

  const runs = database.prepare("SELECT * FROM runs ORDER BY finished_at DESC").all();

  return { sites, urls, keywords, keyword_roots, runs };
}

function writeDbToOpenDatabase(database, db) {
  const normalized = normalizeDb(db);

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec("DELETE FROM runs; DELETE FROM keywords; DELETE FROM urls; DELETE FROM sites; DELETE FROM keyword_roots;");

    const insertSite = database.prepare(`
      INSERT INTO sites (
        id, domain, sitemap_url, include_patterns, exclude_patterns, request_delay_ms, timeout_ms,
        max_sitemap_bytes, max_urls_per_run, max_sitemaps_per_run, incremental_url_limit,
        baseline_url_limit, baseline_completed_at, enabled, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const site of normalized.sites) {
      insertSite.run(
        site.id,
        site.domain,
        site.sitemap_url || "",
        site.include_patterns || "",
        site.exclude_patterns || "",
        Number(site.request_delay_ms || 1200),
        Number(site.timeout_ms || 20000),
        Number(site.max_sitemap_bytes || 10485760),
        Number(site.max_urls_per_run || 300),
        Number(site.max_sitemaps_per_run || 1000),
        Number(site.incremental_url_limit || 300),
        Number(site.baseline_url_limit || 100000),
        site.baseline_completed_at || "",
        site.enabled ? 1 : 0,
        site.notes || "",
        site.created_at || nowIso(),
        site.updated_at || nowIso()
      );
    }

    const insertUrl = database.prepare(`
      INSERT INTO urls (
        id, url, lastmod, source_site, sitemap_url, first_seen_at, last_seen_at, fetched_at,
        discovery_type, is_new, is_recently_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const url of normalized.urls) {
      insertUrl.run(
        url.id,
        url.url,
        url.lastmod || null,
        url.source_site,
        url.sitemap_url || "",
        url.first_seen_at,
        url.last_seen_at,
        url.fetched_at,
        url.discovery_type || "incremental",
        url.is_new ? 1 : 0,
        url.is_recently_updated ? 1 : 0
      );
    }

    const insertKeyword = database.prepare(`
      INSERT INTO keywords (
        id, first_seen_date, source_site, source_url, keyword, game_name, variants, status, notes,
        google_trends_status, production_difficulty, serp_competition, priority_score, build_signal,
        score_breakdown, source_discovery_type, launched_url, launched_date, indexed_status, impressions_7d, clicks_7d,
        result_notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const keyword of normalized.keywords) {
      insertKeyword.run(
        keyword.id,
        keyword.first_seen_date,
        keyword.source_site,
        keyword.source_url,
        keyword.keyword,
        keyword.game_name,
        JSON.stringify(keyword.variants || []),
        keyword.status || "new",
        keyword.notes || "",
        keyword.google_trends_status || "unknown",
        keyword.production_difficulty || "medium",
        keyword.serp_competition || "medium",
        Number(keyword.priority_score || 0),
        keyword.build_signal || "observe",
        JSON.stringify(keyword.score_breakdown || {}),
        keyword.source_discovery_type || "incremental",
        keyword.launched_url || "",
        keyword.launched_date || "",
        keyword.indexed_status || "unknown",
        Number(keyword.impressions_7d || 0),
        Number(keyword.clicks_7d || 0),
        keyword.result_notes || "",
        keyword.created_at || nowIso(),
        keyword.updated_at || nowIso()
      );
    }

    const insertKeywordRoot = database.prepare(`
      INSERT INTO keyword_roots (
        id, source_order, site_type, root, raw_root, example_queries, user_intent, opportunity,
        monthly_volume, enabled, last_mined_at, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const root of normalized.keyword_roots) {
      insertKeywordRoot.run(
        root.id,
        Number(root.source_order || 0),
        root.site_type || "",
        root.root,
        root.raw_root || root.root,
        JSON.stringify(root.example_queries || []),
        root.user_intent || "",
        root.opportunity || "",
        root.monthly_volume === null || root.monthly_volume === undefined ? null : Number(root.monthly_volume),
        root.enabled ? 1 : 0,
        root.last_mined_at || "",
        root.notes || "",
        root.created_at || nowIso(),
        root.updated_at || nowIso()
      );
    }

    const insertRun = database.prepare(`
      INSERT INTO runs (
        id, site_id, site_domain, started_at, finished_at, fetched_url_count,
        matched_url_count, filtered_url_count, new_url_count, updated_url_count, run_date, run_type, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const run of normalized.runs) {
      insertRun.run(
        run.id,
        run.site_id,
        run.site_domain,
        run.started_at,
        run.finished_at,
        Number(run.fetched_url_count || 0),
        Number(run.matched_url_count || 0),
        Number(run.filtered_url_count || 0),
        Number(run.new_url_count || 0),
        Number(run.updated_url_count || 0),
        run.run_date,
        run.run_type || "incremental",
        run.error || ""
      );
    }

    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

export async function readDb() {
  initialize();
  const database = openDatabase();
  try {
    return readDbFromOpenDatabase(database);
  } finally {
    database.close();
  }
}

export async function writeDb(db) {
  initialize();
  const database = openDatabase();
  try {
    ensureSchema(database);
    writeDbToOpenDatabase(database, db);
  } finally {
    database.close();
  }
}

export function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export { nowIso, todayIso };
