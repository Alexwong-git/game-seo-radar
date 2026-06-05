import { createId, nowIso } from "./db.js";
import { KEYWORD_ROOT_SEEDS } from "./keyword-root-seeds.js";

export function normalizeRootTerm(value = "") {
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeMonthlyVolume(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function makeKeywordRoot(seed) {
  const root = normalizeRootTerm(seed.root);
  return {
    id: createId("root"),
    source_order: Number(seed.source_order || 0),
    site_type: seed.site_type || "",
    root,
    raw_root: seed.raw_root || root,
    example_queries: seed.example_queries || [],
    user_intent: seed.user_intent || "",
    opportunity: seed.opportunity || "",
    monthly_volume: normalizeMonthlyVolume(seed.monthly_volume),
    enabled: true,
    last_mined_at: "",
    notes: "",
    created_at: nowIso(),
    updated_at: nowIso()
  };
}

export function importKeywordRootSeeds(db, seeds = KEYWORD_ROOT_SEEDS) {
  db.keyword_roots ||= [];
  const imported = [];
  const updated = [];
  const rootsByTerm = new Map(db.keyword_roots.map((item) => [normalizeRootTerm(item.root), item]));

  for (const seed of seeds) {
    const root = normalizeRootTerm(seed.root);
    if (!root) continue;

    const existing = rootsByTerm.get(root);
    if (existing) {
      existing.source_order = Number(seed.source_order || existing.source_order || 0);
      existing.site_type = seed.site_type || existing.site_type || "";
      existing.raw_root = seed.raw_root || existing.raw_root || root;
      existing.example_queries = seed.example_queries || existing.example_queries || [];
      existing.user_intent = seed.user_intent || existing.user_intent || "";
      existing.opportunity = seed.opportunity || existing.opportunity || "";
      existing.monthly_volume = normalizeMonthlyVolume(seed.monthly_volume);
      existing.updated_at = nowIso();
      updated.push(existing);
      continue;
    }

    const created = makeKeywordRoot(seed);
    db.keyword_roots.push(created);
    rootsByTerm.set(root, created);
    imported.push(created);
  }

  return { imported, updated };
}

export function getKeywordRootStats(roots = []) {
  const enabled = roots.filter((root) => root.enabled).length;
  const withVolume = roots.filter((root) => Number(root.monthly_volume || 0) > 0).length;
  const typeCounts = roots.reduce((acc, root) => {
    const type = root.site_type || "未分类";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  return {
    total: roots.length,
    enabled,
    withVolume,
    typeCounts
  };
}
