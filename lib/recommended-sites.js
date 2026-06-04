import { makeSite } from "./sitemap.js";

export const COMMON_EXCLUDE_PATTERNS = `/category/*
/categories/*
/tag/*
/tags/*
/search*
/profile/*
/user/*
/users/*
/blog/*
/news/*
/cdn-cgi/*`;

export const RECOMMENDED_COMPETITOR_SITES = [
  {
    priority: "A",
    domain: "crazygames.com",
    sitemap_url: "https://www.crazygames.com/sitemap-index.xml",
    include_patterns: "/game/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 300,
    incremental_url_limit: 300,
    baseline_url_limit: 100000,
    max_sitemaps_per_run: 1000,
    reason: "头部 HTML5 游戏站，上新频繁，游戏详情 URL 结构清晰。"
  },
  {
    priority: "A",
    domain: "poki.com",
    sitemap_url: "https://poki.com/en/sitemaps/index.xml",
    include_patterns: "/en/g/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 300,
    incremental_url_limit: 300,
    baseline_url_limit: 100000,
    max_sitemaps_per_run: 1000,
    reason: "全球小游戏头部站，多语言 sitemap 完整，适合发现全球新游戏名。"
  },
  {
    priority: "A",
    domain: "y8.com",
    sitemap_url: "https://www.y8.com/sitemaps/y8/en/sitemap.xml.gz",
    include_patterns: "/games/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 300,
    incremental_url_limit: 300,
    baseline_url_limit: 100000,
    max_sitemaps_per_run: 1000,
    reason: "老牌游戏站，游戏库大，适合补充长尾和新上架游戏信号。"
  },
  {
    priority: "A",
    domain: "gamepix.com",
    sitemap_url: "https://www.gamepix.com/sitemaps/index.xml",
    include_patterns: "/play/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 300,
    incremental_url_limit: 300,
    baseline_url_limit: 100000,
    max_sitemaps_per_run: 1000,
    reason: "HTML5 游戏分发平台，适合发现被多站分发的新游戏。"
  },
  {
    priority: "A",
    domain: "lagged.com",
    sitemap_url: "https://lagged.com/sitemap.txt",
    include_patterns: "/en/g/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 300,
    incremental_url_limit: 300,
    baseline_url_limit: 100000,
    max_sitemaps_per_run: 1000,
    reason: "免费小游戏站，上新节奏快，适合观察休闲和移动端小游戏词。"
  },
  {
    priority: "B",
    domain: "miniplay.com",
    sitemap_url: "http://www.miniplay.com/sitemap.xml",
    include_patterns: "/game/*\n/games/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 300,
    incremental_url_limit: 300,
    baseline_url_limit: 100000,
    max_sitemaps_per_run: 1000,
    reason: "老牌小游戏站，有新游戏栏目，适合作为第二批信号源。"
  },
  {
    priority: "B",
    domain: "coolmathgames.com",
    sitemap_url: "http://www.coolmathgames.com/sitemap.xml",
    include_patterns: "/0-*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 300,
    incremental_url_limit: 300,
    baseline_url_limit: 100000,
    max_sitemaps_per_run: 1000,
    reason: "益智、休闲、教育向较强，能发现和泛娱乐站不同的机会词。"
  },
  {
    priority: "B",
    domain: "kizi.com",
    sitemap_url: "",
    include_patterns: "/game/*\n/games/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 300,
    incremental_url_limit: 300,
    baseline_url_limit: 100000,
    max_sitemaps_per_run: 1000,
    reason: "儿童和家庭向小游戏站，适合补充轻量休闲游戏词。"
  },
  {
    priority: "B",
    domain: "twoplayergames.org",
    sitemap_url: "",
    include_patterns: "/game/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 300,
    incremental_url_limit: 300,
    baseline_url_limit: 100000,
    max_sitemaps_per_run: 1000,
    reason: "双人游戏垂直站，适合挖 2 player、co-op、local multiplayer 机会。"
  },
  {
    priority: "B",
    domain: "1001games.com",
    sitemap_url: "",
    include_patterns: "/game/*\n/games/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 300,
    incremental_url_limit: 300,
    baseline_url_limit: 100000,
    max_sitemaps_per_run: 1000,
    reason: "大游戏库长尾站，适合作为覆盖面补充。"
  }
];

export function importRecommendedSites(db) {
  const existingSites = new Map(db.sites.map((site) => [site.domain.replace(/^www\./, ""), site]));
  const imported = [];
  const updated = [];

  for (const recommendation of RECOMMENDED_COMPETITOR_SITES) {
    const normalizedDomain = recommendation.domain.replace(/^www\./, "");
    const existing = existingSites.get(normalizedDomain);

    if (existing) {
      if (recommendation.sitemap_url) existing.sitemap_url = recommendation.sitemap_url;
      existing.include_patterns = recommendation.include_patterns;
      existing.exclude_patterns = existing.exclude_patterns || COMMON_EXCLUDE_PATTERNS;
      existing.max_sitemap_bytes = recommendation.max_sitemap_bytes || existing.max_sitemap_bytes || 52428800;
      existing.max_urls_per_run = recommendation.max_urls_per_run || existing.max_urls_per_run || 300;
      existing.incremental_url_limit = recommendation.incremental_url_limit || existing.incremental_url_limit || 300;
      existing.baseline_url_limit = recommendation.baseline_url_limit || existing.baseline_url_limit || 100000;
      existing.max_sitemaps_per_run = recommendation.max_sitemaps_per_run || existing.max_sitemaps_per_run || 1000;
      existing.notes = existing.notes?.startsWith("[")
        ? existing.notes
        : `[${recommendation.priority}] ${recommendation.reason}`;
      updated.push(existing);
      continue;
    }

    const site = makeSite({
      domain: recommendation.domain,
      sitemap_url: recommendation.sitemap_url,
      include_patterns: recommendation.include_patterns,
      exclude_patterns: COMMON_EXCLUDE_PATTERNS,
      max_sitemap_bytes: recommendation.max_sitemap_bytes,
      max_urls_per_run: recommendation.max_urls_per_run,
      incremental_url_limit: recommendation.incremental_url_limit,
      baseline_url_limit: recommendation.baseline_url_limit,
      max_sitemaps_per_run: recommendation.max_sitemaps_per_run,
      enabled: recommendation.priority === "A",
      notes: `[${recommendation.priority}] ${recommendation.reason}`
    });

    db.sites.push(site);
    existingSites.set(normalizedDomain, site);
    imported.push(site);
  }

  return { imported, updated };
}
