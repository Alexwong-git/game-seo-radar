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
