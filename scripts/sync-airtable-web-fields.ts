/**
 * Sync web-specific fields from Airtable into the DB:
 * 1. new_01_supports_variants: specs_technique + format_web (Web canal only)
 * 2. new_02_planning_kits_media: bouclage/parution dates (all canals)
 *
 * Safe to re-run — never deletes rows, only upserts/updates.
 *
 * Usage:
 *   npx tsx scripts/sync-airtable-web-fields.ts
 *   npx tsx scripts/sync-airtable-web-fields.ts --dry-run
 *   npx tsx scripts/sync-airtable-web-fields.ts --web-only
 *   npx tsx scripts/sync-airtable-web-fields.ts --planning-only
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN!;
const AIRTABLE_BASE = process.env.AIRTABLE_BASE!;

const TABLE_VARIANTS  = "tblT5e0eEphk2H0s5"; // NEW_01_Supports_Variants
const TABLE_PLANNING  = "tbllDWpTbHp3z8fO3"; // NEW_02_Planning_Kits_Media

const DRY_RUN     = process.argv.includes("--dry-run");
const WEB_ONLY    = process.argv.includes("--web-only");
const PLAN_ONLY   = process.argv.includes("--planning-only");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}
if (!AIRTABLE_TOKEN) {
  console.error("Missing AIRTABLE_TOKEN in .env");
  process.exit(1);
}
if (!AIRTABLE_BASE) {
  console.error("Missing AIRTABLE_BASE in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ─── Airtable helpers ──────────────────────────────────────────────────────

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

async function fetchAllRecords(
  tableId: string,
  fields: string[],
  filterFormula?: string,
): Promise<AirtableRecord[]> {
  const all: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    for (const f of fields) params.append("fields[]", f);
    if (filterFormula) params.set("filterByFormula", filterFormula);
    if (offset) params.set("offset", offset);

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });

    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);

    const data = await res.json();
    all.push(...data.records);
    offset = data.offset;
  } while (offset);

  return all;
}

// ─── Sync: specs_technique + format_web (Web variants) ────────────────────

async function syncWebVariantFields() {
  console.log("\n=== Syncing web variant fields (specs_technique, format_web) ===");

  const records = await fetchAllRecords(
    TABLE_VARIANTS,
    ["variant_slug", "Specs technique", "Format Web"],
    "Canal='Web'",
  );

  console.log(`Fetched ${records.length} web variant records from Airtable`);

  let updated = 0;
  let skipped = 0;

  for (const rec of records) {
    const slug = rec.fields["variant_slug"] as string | undefined;
    if (!slug) { skipped++; continue; }

    const specsRaw = rec.fields["Specs technique"] as string | undefined;
    const formatRaw = rec.fields["Format Web"] as string[] | undefined;

    const specs_technique = specsRaw?.trim() || null;
    // Format Web is a multipleSelects array — join with " / "
    const format_web = formatRaw && formatRaw.length > 0
      ? formatRaw.join(" / ")
      : null;

    if (!specs_technique && !format_web) { skipped++; continue; }

    if (DRY_RUN) {
      console.log(`  [dry-run] ${slug} → specs="${specs_technique}" format="${format_web}"`);
      updated++;
      continue;
    }

    const update: Record<string, string | null> = {};
    if (specs_technique !== null) update.specs_technique = specs_technique;
    if (format_web !== null) update.format_web = format_web;

    const { error } = await supabase
      .from("new_01_supports_variants")
      .update(update)
      .eq("variant_slug", slug);

    if (error) {
      console.error(`  ERROR updating ${slug}: ${error.message}`);
    } else {
      updated++;
    }
  }

  console.log(`Web fields: ${updated} updated, ${skipped} skipped`);
}

// ─── Sync: planning dates (bouclage + parution) ───────────────────────────

async function syncPlanningDates() {
  console.log("\n=== Syncing planning dates (bouclage/parution) ===");

  const records = await fetchAllRecords(
    TABLE_PLANNING,
    ["variant_slug", "support", "canal", "type", "date", "periodicite", "specs_techniques"],
  );

  console.log(`Fetched ${records.length} planning records from Airtable`);

  // Only process records that have an actual date
  const withDate = records.filter((r) => r.fields["date"]);
  const withoutDate = records.length - withDate.length;
  console.log(`  With date: ${withDate.length} | Without date (skipped): ${withoutDate}`);

  // Fetch all existing (variant_slug, type, date_supabase) combos to avoid duplicates
  const { data: existing } = await supabase
    .from("new_02_planning_kits_media")
    .select("variant_slug, type, date_supabase");

  const existingSet = new Set<string>(
    (existing ?? []).map((r: { variant_slug: string; type: string; date_supabase: string | null }) =>
      `${r.variant_slug}|${r.type}|${r.date_supabase}`
    ),
  );
  console.log(`  Existing rows in DB: ${existingSet.size}`);

  const toInsert: Record<string, unknown>[] = [];

  for (const rec of withDate) {
    const slug       = rec.fields["variant_slug"] as string | undefined;
    const type       = rec.fields["type"] as string | undefined;
    const date       = rec.fields["date"] as string | undefined;
    const supportRaw = rec.fields["support"] as string[] | string | undefined;
    const canalRaw   = rec.fields["canal"] as string[] | string | undefined;
    const periodicite = rec.fields["periodicite"] as string[] | string | undefined;
    const specs      = rec.fields["specs_techniques"] as string | undefined;

    if (!slug || !type || !date) continue;

    const key = `${slug}|${type}|${date}`;
    if (existingSet.has(key)) continue; // already in DB

    const supportStr = Array.isArray(supportRaw) ? supportRaw[0] : supportRaw ?? slug.split("::")[0];
    const canalStr   = Array.isArray(canalRaw)   ? canalRaw[0]   : canalRaw   ?? null;
    const periodiciteStr = Array.isArray(periodicite)
      ? periodicite.join(", ")
      : periodicite ?? null;

    toInsert.push({
      variant_slug:     slug,
      support:          supportStr,
      canal:            canalStr,
      type:             type,
      date_supabase:    date,
      periodicite:      periodiciteStr,
      specs_techniques: specs ?? null,
    });
  }

  console.log(`  New rows to insert: ${toInsert.length}`);

  let inserted = 0;
  let errors = 0;

  if (!DRY_RUN && toInsert.length > 0) {
    // Insert in batches of 200
    for (let i = 0; i < toInsert.length; i += 200) {
      const batch = toInsert.slice(i, i + 200);
      const { error } = await supabase
        .from("new_02_planning_kits_media")
        .insert(batch);
      if (error) {
        console.error(`  ERROR inserting batch ${i}–${i + batch.length}: ${error.message}`);
        errors++;
      } else {
        inserted += batch.length;
      }
    }
  } else if (DRY_RUN) {
    console.log(`  [dry-run] would insert ${toInsert.length} rows`);
    inserted = toInsert.length;
  }

  console.log(`Planning dates: ${inserted} inserted, ${errors} batch errors`);
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  if (!PLAN_ONLY) await syncWebVariantFields();
  if (!WEB_ONLY)  await syncPlanningDates();

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
