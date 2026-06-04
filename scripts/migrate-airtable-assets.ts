/**
 * Migrate Airtable assets to Supabase:
 * 1. Download images from Airtable → upload to Supabase Storage → set url_visuel
 * 2. Backfill website URLs from Airtable Nom URL → new_01_supports_variants.url
 *
 * Usage:
 *   npx tsx scripts/migrate-airtable-assets.ts
 *   npx tsx scripts/migrate-airtable-assets.ts --dry-run
 *   npx tsx scripts/migrate-airtable-assets.ts --urls-only
 *   npx tsx scripts/migrate-airtable-assets.ts --images-only
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
const TABLE_VISUELS = "tblb22B0ZnCZcXpRB";
const TABLE_VARIANTS = "tblT5e0eEphk2H0s5";

const STORAGE_BUCKET = "support-visuels";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
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

// ─── Airtable helpers ───────────────────────────────────────────────────────

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

async function fetchAllRecords(
  tableId: string,
  fields: string[]
): Promise<AirtableRecord[]> {
  const all: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    for (const f of fields) params.append("fields[]", f);
    if (offset) params.set("offset", offset);

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });

    if (!res.ok) {
      throw new Error(`Airtable ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    all.push(...data.records);
    offset = data.offset;
  } while (offset);

  return all;
}

// ─── Image migration ────────────────────────────────────────────────────────

interface Attachment {
  url: string;
  filename: string;
  type: string;
  size: number;
}

async function migrateImages(dryRun: boolean) {
  console.log("\n📷 MIGRATING IMAGES\n");

  const records = await fetchAllRecords(TABLE_VISUELS, [
    "variant_slug",
    "fichier_integre",
  ]);

  const withAttachments = records.filter(
    (r) =>
      Array.isArray(r.fields.fichier_integre) &&
      (r.fields.fichier_integre as Attachment[]).length > 0
  );

  console.log(
    `Found ${withAttachments.length} visuels with attachments (out of ${records.length} total)\n`
  );

  if (dryRun) {
    console.log("DRY RUN — first 3:");
    for (const r of withAttachments.slice(0, 3)) {
      const slug = r.fields.variant_slug as string;
      const att = (r.fields.fichier_integre as Attachment[])[0];
      console.log(`  ${slug} → ${att.filename} (${att.type}, ${att.size}b)`);
    }
    console.log(`\n  ... would process ${withAttachments.length} total`);
    return;
  }

  let success = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < withAttachments.length; i++) {
    const r = withAttachments[i];
    const slug = r.fields.variant_slug as string;
    const att = (r.fields.fichier_integre as Attachment[])[0];

    if (!slug || !att?.url) {
      skipped++;
      continue;
    }

    try {
      // Sanitize filename: variant_slug + extension
      const ext = att.filename.split(".").pop()?.toLowerCase() || "png";
      const storagePath = `${slug.replace(/::/g, "/")}.${ext}`;

      // Download from Airtable
      const imgRes = await fetch(att.url);
      if (!imgRes.ok) {
        console.log(`  ❌ [${i + 1}] ${slug}: download failed (${imgRes.status})`);
        errors++;
        continue;
      }

      const blob = await imgRes.arrayBuffer();

      // Upload to Supabase Storage (upsert)
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, blob, {
          contentType: att.type || "image/png",
          upsert: true,
        });

      if (uploadError) {
        console.log(`  ❌ [${i + 1}] ${slug}: upload failed: ${uploadError.message}`);
        errors++;
        continue;
      }

      // Build public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

      // Update url_visuel in new_03_visuels
      const { error: updateError } = await supabase
        .from("new_03_visuels")
        .update({ url_visuel: publicUrl })
        .eq("variant_slug", slug);

      if (updateError) {
        console.log(`  ❌ [${i + 1}] ${slug}: DB update failed: ${updateError.message}`);
        errors++;
        continue;
      }

      success++;
      if (success % 25 === 0 || i === withAttachments.length - 1) {
        console.log(
          `  ✅ ${success}/${withAttachments.length} uploaded (${errors} errors, ${skipped} skipped)`
        );
      }
    } catch (err) {
      console.log(`  ❌ [${i + 1}] ${slug}: ${(err as Error).message}`);
      errors++;
    }
  }

  console.log(`\n📷 Images done: ${success} uploaded, ${errors} errors, ${skipped} skipped\n`);
}

// ─── URL backfill ───────────────────────────────────────────────────────────

async function backfillUrls(dryRun: boolean) {
  console.log("\n🔗 BACKFILLING WEBSITE URLs\n");

  const records = await fetchAllRecords(TABLE_VARIANTS, [
    "variant_slug",
    "Nom URL",
  ]);

  const withUrl = records.filter(
    (r) => r.fields["Nom URL"] && (r.fields["Nom URL"] as string).trim()
  );

  console.log(
    `Found ${withUrl.length} variants with URLs (out of ${records.length} total)\n`
  );

  if (dryRun) {
    console.log("DRY RUN — first 10:");
    for (const r of withUrl.slice(0, 10)) {
      console.log(
        `  ${r.fields.variant_slug} → ${r.fields["Nom URL"]}`
      );
    }
    console.log(`\n  ... would update ${withUrl.length} total`);
    return;
  }

  let success = 0;
  let errors = 0;

  for (const r of withUrl) {
    const slug = r.fields.variant_slug as string;
    const url = (r.fields["Nom URL"] as string).trim();

    if (!slug) continue;

    const { error } = await supabase
      .from("new_01_supports_variants")
      .update({ url })
      .eq("variant_slug", slug);

    if (error) {
      console.log(`  ❌ ${slug}: ${error.message}`);
      errors++;
    } else {
      success++;
    }
  }

  console.log(`\n🔗 URLs done: ${success} updated, ${errors} errors\n`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const urlsOnly = args.includes("--urls-only");
const imagesOnly = args.includes("--images-only");

if (dryRun) console.log("🔍 DRY RUN MODE\n");

(async () => {
  try {
    if (!imagesOnly) await backfillUrls(dryRun);
    if (!urlsOnly) await migrateImages(dryRun);
    console.log("✅ All done!");
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
})();
