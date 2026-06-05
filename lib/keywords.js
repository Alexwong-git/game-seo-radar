import { createId, nowIso, todayIso } from "./db.js";
import { scoreKeyword } from "./scoring.js";

const ignoredSegments = new Set([
  "",
  "game",
  "games",
  "g",
  "play",
  "online",
  "en",
  "en-us",
  "category",
  "tag",
  "new",
  "popular",
  "featured",
  "html5",
  "index"
]);

export function extractGameNameFromUrl(sourceUrl) {
  const url = new URL(sourceUrl);
  const parts = url.pathname
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  const markerIndex = parts.findIndex((part) => ["game", "games", "g", "play"].includes(part.toLowerCase()));
  const rawSegment = markerIndex >= 0 ? parts[markerIndex + 1] || parts.at(-1) || "" : parts.at(-1) || "";
  const withoutExtension = rawSegment.replace(/\.(html?|php|aspx?)$/i, "");
  const cleaned = decodeURIComponent(withoutExtension)
    .replace(/[_+]+/g, "-")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^0-+/, "")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  if (!cleaned || ignoredSegments.has(cleaned)) return null;

  const gameName = cleaned
    .split("-")
    .filter((part) => part && !ignoredSegments.has(part))
    .join(" ");

  return gameName.length >= 3 ? gameName : null;
}

export function buildKeywordVariants(gameName) {
  return [
    gameName,
    `${gameName} game`,
    `play ${gameName}`,
    `${gameName} online`,
    `${gameName} unblocked`
  ];
}

export function createKeywordCandidates({ sourceSite, sourceUrl, gameName, sourceDiscoveryType = "incremental" }) {
  const variants = buildKeywordVariants(gameName);
  const base = {
    id: createId("kw"),
    first_seen_date: todayIso(),
    source_site: sourceSite,
    source_url: sourceUrl,
    keyword: gameName,
    game_name: gameName,
    variants,
    source_discovery_type: sourceDiscoveryType,
    status: "new",
    notes: "",
    google_trends_status: "unknown",
    production_difficulty: "medium",
    serp_competition: "medium",
    launched_url: "",
    launched_date: "",
    indexed_status: "unknown",
    impressions_7d: 0,
    clicks_7d: 0,
    result_notes: "",
    created_at: nowIso(),
    updated_at: nowIso()
  };

  return [
    {
      ...base,
      ...scoreKeyword(base)
    }
  ];
}

export function backfillKeywordCandidates(db, { discoveryType = "incremental" } = {}) {
  const created = [];
  const skipped = [];
  const existingSourceUrls = new Set(db.keywords.map((keyword) => keyword.source_url));

  for (const urlRecord of db.urls) {
    if (urlRecord.discovery_type !== discoveryType || existingSourceUrls.has(urlRecord.url)) continue;

    const gameName = extractGameNameFromUrl(urlRecord.url);
    if (!gameName) {
      skipped.push(urlRecord);
      continue;
    }

    const candidates = createKeywordCandidates({
      sourceSite: urlRecord.source_site,
      sourceUrl: urlRecord.url,
      gameName,
      sourceDiscoveryType: urlRecord.discovery_type
    });

    for (const candidate of candidates) {
      db.keywords.push(candidate);
      existingSourceUrls.add(candidate.source_url);
      created.push(candidate);
    }
  }

  return { created, skipped };
}

export function repairKeywordCandidates(db, { discoveryType = "incremental" } = {}) {
  const repaired = [];
  const skipped = [];

  for (const keyword of db.keywords) {
    const isPending = ["new", "observing"].includes(keyword.status);
    if (keyword.source_discovery_type !== discoveryType || !isPending) {
      skipped.push(keyword);
      continue;
    }

    const gameName = extractGameNameFromUrl(keyword.source_url);
    if (!gameName) {
      skipped.push(keyword);
      continue;
    }

    const variants = buildKeywordVariants(gameName);
    const changed =
      keyword.game_name !== gameName ||
      keyword.keyword !== gameName ||
      JSON.stringify(keyword.variants || []) !== JSON.stringify(variants);

    if (!changed) continue;

    keyword.game_name = gameName;
    keyword.keyword = gameName;
    keyword.variants = variants;
    keyword.updated_at = nowIso();
    Object.assign(keyword, scoreKeyword(keyword));
    repaired.push(keyword);
  }

  return { repaired, skipped };
}
