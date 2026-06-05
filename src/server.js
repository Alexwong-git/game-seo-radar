import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readDb, writeDb, nowIso, todayIso } from "../lib/db.js";
import { isAuthConfigured, requirePrivateAccess } from "../lib/auth.js";
import {
  enableRecommendedSitePack,
  importRecommendedSites,
  RECOMMENDED_COMPETITOR_SITES
} from "../lib/recommended-sites.js";
import { extractGameNameFromUrl } from "../lib/keywords.js";
import { crawlEnabledSites, makeSite } from "../lib/sitemap.js";
import { scoreKeyword } from "../lib/scoring.js";
import { formatBeijingDateTime } from "../lib/time.js";

const PORT = Number(process.env.PORT || 3002);
const HOST = process.env.HOST || "127.0.0.1";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function redirect(response, location) {
  response.writeHead(303, { location });
  response.end();
}

async function parseBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function uniqueGameRows(keywords) {
  const rowsByGame = new Map();

  for (const keyword of keywords) {
    const key = `${keyword.source_site}::${keyword.source_url}::${keyword.game_name}`;
    const existing = rowsByGame.get(key);
    const isPrimary = keyword.keyword === keyword.game_name;

    if (!existing || isPrimary || keyword.priority_score > existing.priority_score) {
      rowsByGame.set(key, keyword);
    }
  }

  return [...rowsByGame.values()];
}

function layout(title, body) {
  const nav = [
    ["/", "Dashboard"],
    ["/sites", "Sites"],
    ["/new-urls", "New URLs"],
    ["/keywords", "Keywords"]
  ];

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Game SEO Radar</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <aside class="sidebar">
    <div class="brand">Game SEO Radar</div>
    <nav>${nav.map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}</nav>
    <form class="nav-action" method="post" action="/api/crawl"><button class="primary" type="submit">Run Incremental</button></form>
    <form class="nav-action" method="post" action="/api/baseline"><button type="submit">Run Baseline</button></form>
  </aside>
  <main class="main">${body}</main>
</body>
</html>`;
}

function statCard(label, value) {
  return `<section class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></section>`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function formatPercent(part, total) {
  if (!total) return "0%";
  return `${Math.round((Number(part || 0) / Number(total)) * 100)}%`;
}

function normalizeDomain(domain = "") {
  return String(domain).replace(/^www\./, "");
}

function getBaselineCounts(urls) {
  return urls.reduce((acc, url) => {
    if (url.discovery_type === "baseline") acc[url.source_site] = (acc[url.source_site] || 0) + 1;
    return acc;
  }, {});
}

function getRunStatus(run) {
  if (!run) return `<span class="badge muted">pending</span>`;
  if (run.error) {
    return `<span class="badge ${run.fetched_url_count > 0 ? "warn" : "bad"}">${run.fetched_url_count > 0 ? "partial" : "failed"}</span>`;
  }
  return `<span class="badge good">ok</span>`;
}

function getLatestRunsBySite(runs) {
  const latestBySite = new Map();
  for (const run of runs) {
    if (!latestBySite.has(run.site_domain)) latestBySite.set(run.site_domain, run);
  }
  return [...latestBySite.values()];
}

function getRecommendedRadarRows(db) {
  const sitesByDomain = new Map(db.sites.map((site) => [normalizeDomain(site.domain), site]));
  const latestRunsByDomain = new Map(getLatestRunsBySite(db.runs).map((run) => [normalizeDomain(run.site_domain), run]));
  const baselineCounts = getBaselineCounts(db.urls);

  return RECOMMENDED_COMPETITOR_SITES.map((recommendation) => {
    const site = sitesByDomain.get(normalizeDomain(recommendation.domain));
    const run = site ? latestRunsByDomain.get(normalizeDomain(site.domain)) : null;
    const baselineCount = site ? baselineCounts[site.domain] || 0 : 0;

    return {
      recommendation,
      site,
      run,
      baselineCount,
      hasBaseline: Boolean(site?.baseline_completed_at || baselineCount)
    };
  });
}

function renderDashboard(db) {
  const today = todayIso();
  const baselineUrls = db.urls.filter((url) => url.discovery_type === "baseline").length;
  const incrementalUrls = db.urls.filter((url) => url.discovery_type === "incremental");
  const todayUrls = incrementalUrls.filter(
    (url) => url.discovery_type === "incremental" && url.first_seen_at?.startsWith(today)
  );
  const incrementalKeywords = db.keywords.filter((keyword) => keyword.source_discovery_type === "incremental");
  const todayKeywords = incrementalKeywords.filter(
    (keyword) => keyword.source_discovery_type === "incremental" && keyword.first_seen_date === today
  );
  const highPriority = incrementalKeywords.filter((keyword) => keyword.priority_score >= 70).length;
  const pendingReview = incrementalKeywords.filter((keyword) => ["new", "observing"].includes(keyword.status)).length;
  const latestRuns = getLatestRunsBySite(db.runs).slice(0, 10);
  const failedSites = latestRuns.filter((run) => run.error && run.fetched_url_count === 0).length;
  const enabledSites = db.sites.filter((site) => site.enabled).length;
  const latestFinishedAt = db.runs[0]?.finished_at || "";
  const radarRows = getRecommendedRadarRows(db);
  const coreRadarRows = radarRows.filter((row) => ["A", "B"].includes(row.recommendation.priority));
  const activeRecommended = radarRows.filter((row) => row.site?.enabled).length;
  const corePendingEnable = coreRadarRows.filter((row) => !row.site || !row.site.enabled).length;
  const enabledNeedsBaseline = radarRows.filter((row) => row.site?.enabled && !row.hasBaseline).length;
  const radarPreviewRows = [...radarRows]
    .sort((a, b) => {
      const priorityRank = { A: 0, B: 1, C: 2 };
      const stateRank = (row) => (!row.site ? 0 : !row.site.enabled ? 1 : !row.hasBaseline ? 2 : 3);
      return (
        stateRank(a) - stateRank(b) ||
        priorityRank[a.recommendation.priority] - priorityRank[b.recommendation.priority] ||
        a.recommendation.domain.localeCompare(b.recommendation.domain)
      );
    })
    .slice(0, 8);
  const opportunityRows = todayUrls
    .slice(0, 8)
    .map((row) => ({
      ...row,
      game_name: extractGameNameFromUrl(row.url) || "-"
    }));
  const signalText =
    baselineUrls === 0
      ? "还没有建立基线。先跑 Baseline，把历史库存和真实新增分开。"
      : incrementalUrls.length === 0
        ? `已建立 ${formatNumber(baselineUrls)} 条基线 URL。当前还没有真实增量机会，等待下一次 Incremental 扫描。`
        : `已累计发现 ${formatNumber(incrementalUrls.length)} 条真实增量 URL，优先处理 should_build 和待人工判断词。`;

  return layout(
    "Dashboard",
    `<header class="page-head"><div><h1>Dashboard</h1><p>公开 sitemap 信号监控和候选游戏关键词雷达。</p></div></header>
    <div class="stats">
      ${statCard("今日真实新增 URL", formatNumber(todayUrls.length))}
      ${statCard("今日新增机会词", formatNumber(todayKeywords.length))}
      ${statCard("待人工判断关键词", formatNumber(pendingReview))}
      ${statCard("should_build 关键词", formatNumber(highPriority))}
    </div>
    <section class="signal-panel">
      <div>
        <span>当前信号状态</span>
        <strong>${escapeHtml(signalText)}</strong>
      </div>
      <div class="signal-metrics">
        <span>基线 ${formatNumber(baselineUrls)}</span>
        <span>监控站点 ${formatNumber(enabledSites)}</span>
        <span>异常站点 ${formatNumber(failedSites)}</span>
        <span>最近抓取 ${escapeHtml(formatBeijingDateTime(latestFinishedAt) || "-")}</span>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>网站雷达</h2>
          <p>A/B 站点先作为主信号源，C 站点先观察噪音。</p>
        </div>
        <div class="toolbar">
          <form method="post" action="/api/sites/enable-radar-pack">
            <button class="primary compact-button" type="submit" ${corePendingEnable === 0 ? "disabled" : ""}>Enable A+B (${corePendingEnable})</button>
          </form>
          <a class="button-link" href="/sites">Manage Sites</a>
        </div>
      </div>
      <div class="radar-stats">
        <span>推荐源 <strong>${formatNumber(RECOMMENDED_COMPETITOR_SITES.length)}</strong></span>
        <span>已启用 <strong>${formatNumber(activeRecommended)}</strong></span>
        <span>A/B 待启用 <strong>${formatNumber(corePendingEnable)}</strong></span>
        <span>待 Baseline <strong>${formatNumber(enabledNeedsBaseline)}</strong></span>
      </div>
      <table>
        <thead><tr><th>级别</th><th>站点</th><th>状态</th><th>最近发现</th><th>建议</th></tr></thead>
        <tbody>${radarPreviewRows
          .map((row) => {
            const status = !row.site
              ? `<span class="badge muted">not imported</span>`
              : !row.site.enabled
                ? `<span class="badge muted">disabled</span>`
                : !row.hasBaseline
                  ? `<span class="badge warn">needs baseline</span>`
                  : row.run?.error
                    ? getRunStatus(row.run)
                    : `<span class="badge good">monitoring</span>`;
            return `<tr>
              <td><span class="badge ${row.recommendation.priority === "A" ? "good" : row.recommendation.priority === "B" ? "warn" : "muted"}">${row.recommendation.priority}</span></td>
              <td>${escapeHtml(row.recommendation.domain)}</td>
              <td>${status}</td>
              <td>${
                row.run
                  ? `${formatNumber(row.run.new_url_count)} new / ${formatNumber(row.run.updated_url_count)} updated<div class="cell-note">${escapeHtml(formatBeijingDateTime(row.run.finished_at))}</div>`
                  : `<span class="cell-note">-</span>`
              }</td>
              <td>${escapeHtml(row.recommendation.reason)}</td>
            </tr>`;
          })
          .join("")}</tbody>
      </table>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>今日机会</h2>
          <p>只展示真实增量 URL，基线库存不会进入这里。</p>
        </div>
        <a class="button-link" href="/new-urls">View Incremental</a>
      </div>
      <table>
        <thead><tr><th>游戏名</th><th>来源站点</th><th>URL</th><th>发现时间</th></tr></thead>
        <tbody>${opportunityRows
          .map(
            (row) => `<tr>
              <td><strong>${escapeHtml(row.game_name)}</strong></td>
              <td>${escapeHtml(row.source_site)}</td>
              <td><a href="${escapeHtml(row.url)}">${escapeHtml(row.url)}</a></td>
              <td>${escapeHtml(formatBeijingDateTime(row.first_seen_at))}</td>
            </tr>`
          )
          .join("") || `<tr><td colspan="4" class="empty">今天还没有真实增量 URL。</td></tr>`}</tbody>
      </table>
    </section>
    <section class="panel">
      <h2>站点健康</h2>
      <table>
        <thead><tr><th>站点</th><th>最近类型</th><th>发现 URL</th><th>匹配率</th><th>过滤率</th><th>新增</th><th>更新</th><th>状态</th><th>最后抓取</th></tr></thead>
        <tbody>${latestRuns
          .map(
            (run) => `<tr>
              <td>${escapeHtml(run.site_domain)}</td>
              <td><span class="badge ${run.run_type === "baseline" ? "muted" : "good"}">${escapeHtml(run.run_type || "incremental")}</span></td>
              <td>${formatNumber(run.fetched_url_count)}</td>
              <td><strong>${formatPercent(run.matched_url_count, run.fetched_url_count)}</strong><div class="cell-note">${formatNumber(run.matched_url_count || 0)} matched</div></td>
              <td><strong>${formatPercent(run.filtered_url_count, run.fetched_url_count)}</strong><div class="cell-note">${formatNumber(run.filtered_url_count || 0)} filtered</div></td>
              <td>${run.new_url_count}</td>
              <td>${run.updated_url_count}</td>
              <td>${getRunStatus(run)}${run.error ? `<div class="cell-note">${escapeHtml(run.error)}</div>` : ""}</td>
              <td>${escapeHtml(formatBeijingDateTime(run.finished_at))}</td>
            </tr>`
          )
          .join("") || `<tr><td colspan="9" class="empty">还没有站点抓取记录。</td></tr>`}</tbody>
      </table>
    </section>`
  );
}

function renderSites(db) {
  const siteDomains = new Set(db.sites.map((site) => normalizeDomain(site.domain)));
  const baselineCounts = getBaselineCounts(db.urls);
  const missingCount = RECOMMENDED_COMPETITOR_SITES.filter(
    (site) => !siteDomains.has(normalizeDomain(site.domain))
  ).length;
  const corePendingEnable = getRecommendedRadarRows(db).filter(
    (row) => ["A", "B"].includes(row.recommendation.priority) && (!row.site || !row.site.enabled)
  ).length;

  return layout(
    "Sites",
    `<header class="page-head"><div><h1>Sites</h1><p>配置要监控的游戏站域名和 sitemap 地址。</p></div></header>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>推荐竞品站</h2>
          <p>A/B 站点作为主雷达包，C 级站点保留给实验监控。</p>
        </div>
        <div class="toolbar">
          <form method="post" action="/api/sites/enable-radar-pack">
            <button class="primary compact-button" type="submit" ${corePendingEnable === 0 ? "disabled" : ""}>Enable A+B (${corePendingEnable})</button>
          </form>
          <form method="post" action="/api/sites/import-recommended">
            <button class="compact-button" type="submit" ${missingCount === 0 ? "disabled" : ""}>Import Missing (${missingCount})</button>
          </form>
        </div>
      </div>
      <table>
        <thead><tr><th>优先级</th><th>站点</th><th>Sitemap</th><th>Include</th><th>建议</th><th>状态</th></tr></thead>
        <tbody>${RECOMMENDED_COMPETITOR_SITES.map((site) => {
          const exists = siteDomains.has(normalizeDomain(site.domain));
          return `<tr>
            <td><span class="badge ${site.priority === "A" ? "good" : "warn"}">${site.priority}</span></td>
            <td>${escapeHtml(site.domain)}</td>
            <td>${site.sitemap_url ? `<a href="${escapeHtml(site.sitemap_url)}">${escapeHtml(site.sitemap_url)}</a>` : "robots.txt 自动发现"}</td>
            <td><pre class="pattern-preview">${escapeHtml(site.include_patterns)}</pre></td>
            <td>${escapeHtml(site.reason)}</td>
            <td><span class="badge ${exists ? "good" : "muted"}">${exists ? "imported" : "not imported"}</span></td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </section>
    <section class="panel">
      <h2>新增站点</h2>
      <form class="grid-form" method="post" action="/api/sites">
        <label>Domain<input name="domain" placeholder="example.com" required></label>
        <label>Sitemap URL<input name="sitemap_url" placeholder="https://example.com/sitemap.xml"></label>
        <label>Include Patterns<textarea name="include_patterns" rows="3" placeholder="/game/*"></textarea></label>
        <label>Exclude Patterns<textarea name="exclude_patterns" rows="3" placeholder="/category/*
/blog/*"></textarea></label>
        <label>Delay ms<input name="request_delay_ms" type="number" min="500" value="1200"></label>
        <label>Timeout ms<input name="timeout_ms" type="number" min="3000" value="20000"></label>
        <label>Max Sitemap Bytes<input name="max_sitemap_bytes" type="number" min="100000" value="10485760"></label>
        <label>Baseline URL Limit<input name="baseline_url_limit" type="number" min="1000" value="100000"></label>
        <label>Incremental URL Limit<input name="incremental_url_limit" type="number" min="50" value="300"></label>
        <label>Max Sitemaps / Run<input name="max_sitemaps_per_run" type="number" min="1" value="1000"></label>
        <label>Notes<input name="notes" placeholder="可选备注"></label>
        <label class="check"><input type="checkbox" name="enabled" checked> Enabled</label>
        <button class="primary" type="submit">Add Site</button>
      </form>
    </section>
    <section class="panel">
      <h2>监控列表</h2>
      <table>
        <thead><tr><th>站点</th><th>Sitemap</th><th>抓取设置</th><th>过滤规则</th><th>状态</th><th>基线</th><th>备注</th><th>操作</th></tr></thead>
        <tbody>${db.sites
          .map(
            (site) => `<tr>
              <td>${escapeHtml(site.domain)}</td>
              <td>${site.sitemap_url ? `<a href="${escapeHtml(site.sitemap_url)}">${escapeHtml(site.sitemap_url)}</a>` : "robots.txt 自动发现"}</td>
              <td>
                <form class="inline-edit" method="post" action="/api/sites/update">
                  <input type="hidden" name="id" value="${site.id}">
                  <label>Delay<input name="request_delay_ms" type="number" min="500" value="${Number(site.request_delay_ms || 1200)}"></label>
                  <label>Timeout<input name="timeout_ms" type="number" min="3000" value="${Number(site.timeout_ms || 20000)}"></label>
                  <label>Max Bytes<input name="max_sitemap_bytes" type="number" min="100000" value="${Number(site.max_sitemap_bytes || 10485760)}"></label>
                  <label>Baseline URLs<input name="baseline_url_limit" type="number" min="1000" value="${Number(site.baseline_url_limit || 100000)}"></label>
                  <label>Incremental URLs<input name="incremental_url_limit" type="number" min="50" value="${Number(site.incremental_url_limit || 300)}"></label>
                  <label>Max Sitemaps<input name="max_sitemaps_per_run" type="number" min="1" value="${Number(site.max_sitemaps_per_run || 1000)}"></label>
                  <button type="submit">Save</button>
                </form>
              </td>
              <td>
                <form class="inline-edit" method="post" action="/api/sites/update">
                  <input type="hidden" name="id" value="${site.id}">
                  <label>Include<textarea name="include_patterns" rows="3">${escapeHtml(site.include_patterns || "")}</textarea></label>
                  <label>Exclude<textarea name="exclude_patterns" rows="3">${escapeHtml(site.exclude_patterns || "")}</textarea></label>
                  <input type="hidden" name="request_delay_ms" value="${Number(site.request_delay_ms || 1200)}">
                  <input type="hidden" name="timeout_ms" value="${Number(site.timeout_ms || 20000)}">
                  <input type="hidden" name="max_sitemap_bytes" value="${Number(site.max_sitemap_bytes || 10485760)}">
                  <input type="hidden" name="baseline_url_limit" value="${Number(site.baseline_url_limit || 100000)}">
                  <input type="hidden" name="incremental_url_limit" value="${Number(site.incremental_url_limit || 300)}">
                  <input type="hidden" name="max_sitemaps_per_run" value="${Number(site.max_sitemaps_per_run || 1000)}">
                  <button type="submit">Save</button>
                </form>
              </td>
              <td><span class="badge ${site.enabled ? "good" : "muted"}">${site.enabled ? "enabled" : "disabled"}</span></td>
              <td>${
                site.baseline_completed_at
                  ? `<span class="badge good">done</span><br>${escapeHtml(formatBeijingDateTime(site.baseline_completed_at))}`
                  : baselineCounts[site.domain]
                    ? `<span class="badge warn">partial</span><br>${baselineCounts[site.domain]} URLs`
                    : `<span class="badge muted">pending</span>`
              }</td>
              <td>${escapeHtml(site.notes)}</td>
              <td>
                <form method="post" action="/api/sites/toggle"><input type="hidden" name="id" value="${site.id}"><button type="submit">${site.enabled ? "Disable" : "Enable"}</button></form>
              </td>
            </tr>`
          )
          .join("") || `<tr><td colspan="8" class="empty">还没有站点。</td></tr>`}</tbody>
      </table>
    </section>`
  );
}

function renderNewUrls(db, url) {
  const view = url.searchParams.get("view") || "incremental";
  const filteredRows = db.urls.filter((row) => {
    if (view === "all") return true;
    return row.discovery_type === view;
  });
  const rows = [...filteredRows]
    .sort((a, b) => (b.first_seen_at || "").localeCompare(a.first_seen_at || ""))
    .slice(0, 200);

  return layout(
    "New URLs",
    `<header class="page-head"><div><h1>New URLs</h1><p>默认只看真实增量 URL；基线 URL 只是历史库存。</p></div>
      <div class="toolbar">
        <a class="button-link ${view === "incremental" ? "active" : ""}" href="/new-urls">Incremental</a>
        <a class="button-link ${view === "baseline" ? "active" : ""}" href="/new-urls?view=baseline">Baseline</a>
        <a class="button-link ${view === "all" ? "active" : ""}" href="/new-urls?view=all">All</a>
      </div>
    </header>
    <section class="panel">
      <table>
        <thead><tr><th>URL</th><th>来源</th><th>类型</th><th>lastmod</th><th>首次发现</th><th>标记</th></tr></thead>
        <tbody>${rows
          .map(
            (row) => `<tr>
              <td><a href="${escapeHtml(row.url)}">${escapeHtml(row.url)}</a></td>
              <td>${escapeHtml(row.source_site)}</td>
              <td><span class="badge ${row.discovery_type === "baseline" ? "muted" : "good"}">${escapeHtml(row.discovery_type || "incremental")}</span></td>
              <td>${escapeHtml(row.lastmod || "-")}</td>
              <td>${escapeHtml(formatBeijingDateTime(row.first_seen_at))}</td>
              <td>${
                row.is_recently_updated
                  ? `<span class="badge warn">updated</span>`
                  : row.is_new
                    ? `<span class="badge good">new</span>`
                    : `<span class="badge muted">seen</span>`
              }</td>
            </tr>`
          )
          .join("") || `<tr><td colspan="6" class="empty">还没有 URL。</td></tr>`}</tbody>
      </table>
    </section>`
  );
}

function renderKeywords(db, url) {
  const showVariants = url.searchParams.get("view") === "variants";
  const filter = url.searchParams.get("filter") || "review";
  const opportunityKeywords = db.keywords.filter((keyword) => keyword.source_discovery_type === "incremental");
  const gameRows = uniqueGameRows(opportunityKeywords);
  const baseRows = showVariants ? [...opportunityKeywords] : gameRows;
  const filteredRows = baseRows.filter((keyword) => {
    if (filter === "all") return true;
    if (filter === "review") return ["new", "observing"].includes(keyword.status);
    if (filter === "should_build" || filter === "observe" || filter === "reject") return keyword.build_signal === filter;
    return keyword.status === filter;
  });
  const filterHref = (nextFilter, variantView = showVariants) =>
    `/keywords?filter=${nextFilter}${variantView ? "&view=variants" : ""}`;
  const visibleRows = filteredRows.sort((a, b) => b.priority_score - a.priority_score).slice(0, showVariants ? 300 : 100);
  const totalGames = gameRows.length;
  const reviewCount = gameRows.filter((keyword) => ["new", "observing"].includes(keyword.status)).length;
  const shouldBuildCount = gameRows.filter((keyword) => keyword.build_signal === "should_build").length;
  const observeCount = gameRows.filter((keyword) => keyword.build_signal === "observe").length;
  const launchedCount = gameRows.filter((keyword) => keyword.status === "launched").length;

  return layout(
    "Keywords",
    `<header class="page-head"><div><h1>Keywords</h1><p>人工判断队列：先补趋势、竞争和制作难度，再把好词推到 should_build。</p></div>
      <div class="toolbar">
        <a class="button-link ${filter === "review" && !showVariants ? "active" : ""}" href="/keywords">Review (${reviewCount})</a>
        <a class="button-link ${filter === "should_build" ? "active" : ""}" href="${filterHref("should_build", false)}">Should Build (${shouldBuildCount})</a>
        <a class="button-link ${filter === "observe" ? "active" : ""}" href="${filterHref("observe", false)}">Observe (${observeCount})</a>
        <a class="button-link ${filter === "launched" ? "active" : ""}" href="${filterHref("launched", false)}">Launched (${launchedCount})</a>
        <a class="button-link ${filter === "all" && !showVariants ? "active" : ""}" href="${filterHref("all", false)}">All (${totalGames})</a>
        <a class="button-link ${showVariants ? "active" : ""}" href="${filterHref(filter, true)}">Raw rows (${opportunityKeywords.length})</a>
      </div>
    </header>
    <div class="stats">
      ${statCard("待判断游戏", formatNumber(reviewCount))}
      ${statCard("should_build", formatNumber(shouldBuildCount))}
      ${statCard("observe", formatNumber(observeCount))}
      ${statCard("已上线", formatNumber(launchedCount))}
    </div>
    <section class="panel">
      <table>
        <thead><tr><th>关键词</th><th>游戏 / 变体</th><th>来源</th><th>首见</th><th>人工状态</th><th>判断因子</th><th>分数</th><th>建议</th></tr></thead>
        <tbody>${visibleRows
          .map(
            (keyword) => `<tr>
              <td><a href="/keywords/${keyword.id}"><strong>${escapeHtml(keyword.keyword)}</strong></a></td>
              <td>
                ${escapeHtml(keyword.game_name)}
                <div class="keyword-variants">${(keyword.variants || []).slice(0, 4).map((variant) => `<span>${escapeHtml(variant)}</span>`).join("")}</div>
              </td>
              <td>
                ${escapeHtml(keyword.source_site)}
                <div><a class="minor-link" href="${escapeHtml(keyword.source_url)}">source URL</a></div>
              </td>
              <td>${escapeHtml(keyword.first_seen_date)}</td>
              <td><span class="badge">${escapeHtml(keyword.status)}</span></td>
              <td>
                <div class="factor-list">
                  <span>Trend: ${escapeHtml(keyword.google_trends_status)}</span>
                  <span>Build: ${escapeHtml(keyword.production_difficulty)}</span>
                  <span>SERP: ${escapeHtml(keyword.serp_competition)}</span>
                </div>
              </td>
              <td><strong>${keyword.priority_score}</strong></td>
              <td><span class="badge ${keyword.build_signal === "should_build" ? "good" : keyword.build_signal === "observe" ? "warn" : "muted"}">${escapeHtml(keyword.build_signal)}</span></td>
            </tr>`
          )
          .join("") || `<tr><td colspan="8" class="empty">当前筛选下还没有候选词。</td></tr>`}</tbody>
      </table>
    </section>`
  );
}

function select(name, current, options) {
  return `<select name="${name}">${options
    .map((option) => `<option value="${option}" ${option === current ? "selected" : ""}>${option}</option>`)
    .join("")}</select>`;
}

function renderKeywordDetail(db, id) {
  const keyword = db.keywords.find((item) => item.id === id);
  if (!keyword) return layout("Not Found", `<section class="panel"><h1>Keyword not found</h1></section>`);

  const breakdown = keyword.score_breakdown || {};

  return layout(
    keyword.keyword,
    `<header class="page-head"><div><h1>${escapeHtml(keyword.keyword)}</h1><p>${escapeHtml(keyword.game_name)} · ${escapeHtml(keyword.source_site)}</p></div></header>
    <div class="detail-grid">
      <section class="panel">
        <h2>来源</h2>
        <dl>
          <dt>Source URL</dt><dd><a href="${escapeHtml(keyword.source_url)}">${escapeHtml(keyword.source_url)}</a></dd>
          <dt>First Seen</dt><dd>${escapeHtml(keyword.first_seen_date)}</dd>
          <dt>Variants</dt><dd>${keyword.variants.map(escapeHtml).join(", ")}</dd>
        </dl>
      </section>
      <section class="panel">
        <h2>评分</h2>
        <div class="score">${keyword.priority_score}<span>${escapeHtml(keyword.build_signal)}</span></div>
        <dl class="compact">
          ${Object.entries(breakdown).map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${value}</dd>`).join("")}
        </dl>
      </section>
    </div>
    <section class="panel">
      <h2>人工判断</h2>
      <form class="grid-form" method="post" action="/api/keywords/update">
        <input type="hidden" name="id" value="${keyword.id}">
        <label>Keyword<input name="keyword" value="${escapeHtml(keyword.keyword)}"></label>
        <label>Status${select("status", keyword.status, ["new", "observing", "selected", "rejected", "launched"])}</label>
        <label>Google Trends${select("google_trends_status", keyword.google_trends_status, ["unknown", "rising", "stable", "declining"])}</label>
        <label>Production Difficulty${select("production_difficulty", keyword.production_difficulty, ["low", "medium", "high"])}</label>
        <label>SERP Competition${select("serp_competition", keyword.serp_competition, ["low", "medium", "high"])}</label>
        <label class="wide">Notes<textarea name="notes" rows="5">${escapeHtml(keyword.notes)}</textarea></label>
        <label>Launched URL<input name="launched_url" value="${escapeHtml(keyword.launched_url || "")}" placeholder="https://your-site.com/game-name"></label>
        <label>Launched Date<input name="launched_date" value="${escapeHtml(keyword.launched_date || "")}" placeholder="2026-06-03"></label>
        <label>Indexed Status${select("indexed_status", keyword.indexed_status || "unknown", ["unknown", "not_checked", "indexed", "not_indexed"])}</label>
        <label>Impressions 7d<input name="impressions_7d" type="number" min="0" value="${Number(keyword.impressions_7d || 0)}"></label>
        <label>Clicks 7d<input name="clicks_7d" type="number" min="0" value="${Number(keyword.clicks_7d || 0)}"></label>
        <label class="wide">Result Notes<textarea name="result_notes" rows="4">${escapeHtml(keyword.result_notes || "")}</textarea></label>
        <button class="primary" type="submit">Save Keyword</button>
      </form>
    </section>`
  );
}

async function handlePost(request, response) {
  const db = await readDb();
  const body = await parseBody(request);

  if (request.url === "/api/sites") {
    db.sites.push(
      makeSite({
        domain: body.get("domain"),
        sitemap_url: body.get("sitemap_url"),
        include_patterns: body.get("include_patterns") || "",
        exclude_patterns: body.get("exclude_patterns") || "",
        request_delay_ms: body.get("request_delay_ms") || 1200,
        timeout_ms: body.get("timeout_ms") || 20000,
        max_sitemap_bytes: body.get("max_sitemap_bytes") || 10485760,
        baseline_url_limit: body.get("baseline_url_limit") || 100000,
        incremental_url_limit: body.get("incremental_url_limit") || 300,
        max_sitemaps_per_run: body.get("max_sitemaps_per_run") || 1000,
        enabled: body.get("enabled") === "on",
        notes: body.get("notes") || ""
      })
    );
    await writeDb(db);
    return redirect(response, "/sites");
  }

  if (request.url === "/api/sites/import-recommended") {
    importRecommendedSites(db);
    await writeDb(db);
    return redirect(response, "/sites");
  }

  if (request.url === "/api/sites/enable-radar-pack") {
    enableRecommendedSitePack(db, ["A", "B"]);
    await writeDb(db);
    return redirect(response, "/sites");
  }

  if (request.url === "/api/sites/update") {
    const site = db.sites.find((item) => item.id === body.get("id"));
    if (site) {
      if (body.has("include_patterns")) site.include_patterns = body.get("include_patterns") || "";
      if (body.has("exclude_patterns")) site.exclude_patterns = body.get("exclude_patterns") || "";
      if (body.has("request_delay_ms")) site.request_delay_ms = Number(body.get("request_delay_ms") || 1200);
      if (body.has("timeout_ms")) site.timeout_ms = Number(body.get("timeout_ms") || 20000);
      if (body.has("max_sitemap_bytes")) site.max_sitemap_bytes = Number(body.get("max_sitemap_bytes") || 10485760);
      if (body.has("baseline_url_limit")) site.baseline_url_limit = Number(body.get("baseline_url_limit") || 100000);
      if (body.has("incremental_url_limit")) site.incremental_url_limit = Number(body.get("incremental_url_limit") || 300);
      if (body.has("max_sitemaps_per_run")) site.max_sitemaps_per_run = Number(body.get("max_sitemaps_per_run") || 1000);
      site.updated_at = nowIso();
    }
    await writeDb(db);
    return redirect(response, "/sites");
  }

  if (request.url === "/api/sites/toggle") {
    const site = db.sites.find((item) => item.id === body.get("id"));
    if (site) {
      site.enabled = !site.enabled;
      site.updated_at = nowIso();
    }
    await writeDb(db);
    return redirect(response, "/sites");
  }

  if (request.url === "/api/keywords/update") {
    const keyword = db.keywords.find((item) => item.id === body.get("id"));
    if (keyword) {
      keyword.keyword = body.get("keyword") || keyword.keyword;
      keyword.status = body.get("status") || keyword.status;
      keyword.google_trends_status = body.get("google_trends_status") || keyword.google_trends_status;
      keyword.production_difficulty = body.get("production_difficulty") || keyword.production_difficulty;
      keyword.serp_competition = body.get("serp_competition") || keyword.serp_competition;
      keyword.notes = body.get("notes") || "";
      keyword.launched_url = body.get("launched_url") || "";
      keyword.launched_date = body.get("launched_date") || "";
      keyword.indexed_status = body.get("indexed_status") || "unknown";
      keyword.impressions_7d = Number(body.get("impressions_7d") || 0);
      keyword.clicks_7d = Number(body.get("clicks_7d") || 0);
      keyword.result_notes = body.get("result_notes") || "";
      keyword.updated_at = nowIso();
      Object.assign(keyword, scoreKeyword(keyword));
    }
    await writeDb(db);
    return redirect(response, `/keywords/${body.get("id")}`);
  }

  if (request.url === "/api/crawl") {
    await crawlEnabledSites(db, { runType: "incremental" });
    await writeDb(db);
    return redirect(response, "/new-urls");
  }

  if (request.url === "/api/baseline") {
    await crawlEnabledSites(db, { runType: "baseline" });
    await writeDb(db);
    return redirect(response, "/new-urls?view=baseline");
  }

  response.writeHead(404);
  response.end("Not found");
}

async function handleGet(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/styles.css") {
    const css = await readFile(path.resolve("public/styles.css"), "utf8");
    response.writeHead(200, { "content-type": "text/css; charset=utf-8" });
    response.end(css);
    return;
  }

  const db = await readDb();
  const html =
    url.pathname === "/"
      ? renderDashboard(db)
      : url.pathname === "/sites"
        ? renderSites(db)
        : url.pathname === "/new-urls"
          ? renderNewUrls(db, url)
          : url.pathname === "/keywords"
            ? renderKeywords(db, url)
            : url.pathname.startsWith("/keywords/")
              ? renderKeywordDetail(db, url.pathname.split("/").at(-1))
              : layout("Not Found", `<section class="panel"><h1>Not found</h1></section>`);

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

const server = http.createServer(async (request, response) => {
  try {
    if (!requirePrivateAccess(request, response)) return;
    if (request.method === "POST") return await handlePost(request, response);
    return await handleGet(request, response);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error.stack || error.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Game SEO Radar running at http://${HOST}:${PORT}`);
  console.log(isAuthConfigured() ? "Private access is enabled." : "Private access is disabled. Set RADAR_PASSWORD to enable it.");
});
