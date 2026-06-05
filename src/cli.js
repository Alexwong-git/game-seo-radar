import { readDb, writeDb } from "../lib/db.js";
import { backfillKeywordCandidates } from "../lib/keywords.js";
import {
  enableRecommendedSitePack,
  importRecommendedSites,
  pruneRecommendedSitePack
} from "../lib/recommended-sites.js";
import { crawlEnabledSites } from "../lib/sitemap.js";

const command = process.argv[2];

async function seed() {
  const db = await readDb();
  const { imported, updated } = importRecommendedSites(db);
  await writeDb(db);
  console.log(`Imported ${imported.length} and updated ${updated.length} recommended competitor sites.`);
}

async function enableRadarPack() {
  const db = await readDb();
  const { imported, updated, enabled } = enableRecommendedSitePack(db, ["A", "B"]);
  await writeDb(db);
  console.log(
    `Imported ${imported.length}, updated ${updated.length}, and enabled ${enabled.length} A/B radar sites.`
  );
}

async function pruneRadarPack() {
  const db = await readDb();
  const { imported, updated, disabled } = pruneRecommendedSitePack(db, ["A", "B"]);
  await writeDb(db);
  console.log(
    `Imported ${imported.length}, updated ${updated.length}, and disabled ${disabled.length} C-grade radar sites.`
  );
}

async function backfillKeywords() {
  const db = await readDb();
  const { created, skipped } = backfillKeywordCandidates(db, { discoveryType: "incremental" });
  await writeDb(db);
  console.log(`Backfilled ${created.length} keyword candidates from incremental URLs; skipped ${skipped.length}.`);
}

async function crawl() {
  const db = await readDb();
  const runType = command === "baseline" ? "baseline" : "incremental";
  const results = await crawlEnabledSites(db, { runType });
  await writeDb(db);

  for (const result of results) {
    const summary = `${result.run.site_domain}: ${result.run.run_type} run, ${result.run.fetched_url_count} found, ${result.run.matched_url_count} matched, ${result.run.new_url_count} new, ${result.run.updated_url_count} updated`;
    console.log(result.error ? `${summary}, failed: ${result.error.message}` : summary);
  }
}

if (command === "seed") {
  await seed();
} else if (command === "enable-radar-pack") {
  await enableRadarPack();
} else if (command === "prune-radar-pack") {
  await pruneRadarPack();
} else if (command === "backfill-keywords") {
  await backfillKeywords();
} else if (command === "crawl" || command === "baseline") {
  await crawl();
} else {
  console.log("Usage: npm run seed | npm run enable-radar-pack | npm run prune-radar-pack | npm run backfill-keywords | npm run baseline | npm run crawl | npm run dev");
}
