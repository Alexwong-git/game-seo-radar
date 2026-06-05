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
  },
  {
    priority: "B",
    domain: "htmlgames.com",
    sitemap_url: "https://www.htmlgames.com/sitemap.xml",
    include_patterns: "/game/*\n/games/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 500,
    incremental_url_limit: 500,
    baseline_url_limit: 50000,
    max_sitemaps_per_run: 500,
    reason: "HTML5 垂直站，轻量休闲和桌面小游戏词比较集中。"
  },
  {
    priority: "B",
    domain: "kiz10.com",
    sitemap_url: "",
    include_patterns: "/game/*\n/games/*\n/play/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 500,
    incremental_url_limit: 500,
    baseline_url_limit: 50000,
    max_sitemaps_per_run: 500,
    reason: "上新密度高，能补充移动端、动作和卡通游戏长尾。"
  },
  {
    priority: "B",
    domain: "gameflare.com",
    sitemap_url: "",
    include_patterns: "/online-game/*\n/game/*\n/games/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 500,
    incremental_url_limit: 500,
    baseline_url_limit: 50000,
    max_sitemaps_per_run: 500,
    reason: "小游戏垂直站，适合发现已经开始传播但竞争还没完全铺开的词。"
  },
  {
    priority: "B",
    domain: "play-games.com",
    sitemap_url: "",
    include_patterns: "/game/*\n/games/*\n/play/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 500,
    incremental_url_limit: 500,
    baseline_url_limit: 50000,
    max_sitemaps_per_run: 500,
    reason: "长尾游戏库丰富，适合补充角色、模拟器、儿童游戏词。"
  },
  {
    priority: "B",
    domain: "freeonlinegames.com",
    sitemap_url: "",
    include_patterns: "/game/*\n/games/*\n/play/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 500,
    incremental_url_limit: 500,
    baseline_url_limit: 50000,
    max_sitemaps_per_run: 500,
    reason: "老牌免费游戏站，覆盖面广，适合做长尾雷达补充。"
  },
  {
    priority: "B",
    domain: "silvergames.com",
    sitemap_url: "",
    include_patterns: "/game/*\n/games/*\n/en/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 500,
    incremental_url_limit: 500,
    baseline_url_limit: 50000,
    max_sitemaps_per_run: 500,
    reason: "休闲和模拟类页面多，适合发现和头部站不同的细分机会。"
  },
  {
    priority: "B",
    domain: "kevin.games",
    sitemap_url: "",
    include_patterns: "/game/*\n/games/*\n/play/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 500,
    incremental_url_limit: 500,
    baseline_url_limit: 50000,
    max_sitemaps_per_run: 500,
    reason: "游戏详情页路径清晰，适合作为扩展信号源。"
  },
  {
    priority: "C",
    domain: "playhop.com",
    sitemap_url: "",
    include_patterns: "/app/*\n/game/*\n/games/*\n/play/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 500,
    incremental_url_limit: 500,
    baseline_url_limit: 50000,
    max_sitemaps_per_run: 500,
    reason: "高流量游戏站，路径和 sitemap 结构可能变动，建议观察后再长期启用。"
  },
  {
    priority: "C",
    domain: "gamesgames.com",
    sitemap_url: "",
    include_patterns: "/game/*\n/games/*\n/play/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 500,
    incremental_url_limit: 500,
    baseline_url_limit: 50000,
    max_sitemaps_per_run: 500,
    reason: "传统休闲游戏站，适合作为实验信号源，需观察过滤噪音。"
  },
  {
    priority: "C",
    domain: "agame.com",
    sitemap_url: "",
    include_patterns: "/game/*\n/games/*\n/play/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 500,
    incremental_url_limit: 500,
    baseline_url_limit: 50000,
    max_sitemaps_per_run: 500,
    reason: "泛休闲游戏覆盖广，适合实验性监控。"
  },
  {
    priority: "C",
    domain: "gamaverse.com",
    sitemap_url: "",
    include_patterns: "/game/*\n/games/*\n/play/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 500,
    incremental_url_limit: 500,
    baseline_url_limit: 50000,
    max_sitemaps_per_run: 500,
    reason: "小游戏聚合站，可作为 C 级补充，先看抓取质量。"
  },
  {
    priority: "C",
    domain: "gamearter.com",
    sitemap_url: "",
    include_patterns: "/game/*\n/games/*\n/play/*",
    max_sitemap_bytes: 52428800,
    max_urls_per_run: 500,
    incremental_url_limit: 500,
    baseline_url_limit: 50000,
    max_sitemaps_per_run: 500,
    reason: "HTML5 游戏发行相关站点，适合实验性补充新游戏信号。"
  }
];

function normalizeDomain(domain = "") {
  return domain.replace(/^www\./, "");
}

export function importRecommendedSites(db) {
  const existingSites = new Map(db.sites.map((site) => [normalizeDomain(site.domain), site]));
  const imported = [];
  const updated = [];

  for (const recommendation of RECOMMENDED_COMPETITOR_SITES) {
    const normalizedDomain = normalizeDomain(recommendation.domain);
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

export function enableRecommendedSitePack(db, priorities = ["A", "B"]) {
  const result = importRecommendedSites(db);
  const recommendationByDomain = new Map(
    RECOMMENDED_COMPETITOR_SITES.map((site) => [normalizeDomain(site.domain), site])
  );
  const enabled = [];

  for (const site of db.sites) {
    const recommendation = recommendationByDomain.get(normalizeDomain(site.domain));
    if (!recommendation || !priorities.includes(recommendation.priority) || site.enabled) continue;

    site.enabled = true;
    site.updated_at = new Date().toISOString();
    enabled.push(site);
  }

  return { ...result, enabled };
}
