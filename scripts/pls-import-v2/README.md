# PLS Data Import Scripts

This directory contains all TypeScript import scripts for the PLS (Press Support) database migration.

## Overview

These scripts import 5 CSV files from `scripts/pls-data/` into the Supabase database:

1. **new_00_supports_master-vue_leo.csv** → `new_00_supports_master` table
2. **new_01_supports_variants-vue_leo.csv** → `new_01_supports_variants` table
3. **new_02_planning_kits_media-vue_leo.csv** → `new_02_planning_kits_media` table
4. **new_03_visuels-vue_leo.csv** → `new_03_visuels` table
5. **new_04_contacts-vue_leo.csv** → `new_04_contacts` table

## Prerequisites

1. Ensure `.env` file exists at project root with:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```

2. Verify database migrations have been applied (5 tables created)

3. CSV files must be in `scripts/pls-data/` directory

## Usage

### Option 1: Import All Data (Recommended)

```bash
npx tsx scripts/pls-import-v2/import-all.ts
```

This will:
- Import all 5 CSV files sequentially
- Show progress for each import
- Display a summary report at the end
- Exit with error code if any import fails

### Option 2: Import Individual Files

```bash
# Import supports master (434 records)
npx tsx scripts/pls-import-v2/import-00-supports-master.ts

# Import variants (653 records)
npx tsx scripts/pls-import-v2/import-01-supports-variants.ts

# Import planning kits (3,632 records)
npx tsx scripts/pls-import-v2/import-02-planning-kits.ts

# Import visuels (653 records)
npx tsx scripts/pls-import-v2/import-03-visuels.ts

# Import contacts (655 records)
npx tsx scripts/pls-import-v2/import-04-contacts.ts
```

### Dry Run Mode

Test the import without writing to database:

```bash
npx tsx scripts/pls-import-v2/import-00-supports-master.ts --dry-run
npx tsx scripts/pls-import-v2/import-01-supports-variants.ts --dry-run
# etc...
```

Dry run will:
- Parse the CSV file
- Show the first 3 records
- NOT write anything to the database

## Import Order

⚠️ **IMPORTANT**: Import files in this exact order due to foreign key dependencies:

1. `import-00-supports-master.ts` (no dependencies)
2. `import-01-supports-variants.ts` (depends on supports_master)
3. `import-02-planning-kits.ts` (depends on variants)
4. `import-03-visuels.ts` (depends on variants)
5. `import-04-contacts.ts` (depends on variants)

The `import-all.ts` script handles this order automatically.

## Expected Results

After successful import, you should have:

```
✅ new_00_supports_master: ~434 records
✅ new_01_supports_variants: ~653 records
✅ new_02_planning_kits_media: ~3,632 records
✅ new_03_visuels: ~653 records
✅ new_04_contacts: ~655 records
───────────────────────────────────────
   TOTAL: ~6,027 records
```

## Verifying Import

After import, verify data in Supabase:

```sql
-- Check record counts
SELECT 'supports_master' as table_name, COUNT(*) FROM new_00_supports_master
UNION ALL
SELECT 'variants', COUNT(*) FROM new_01_supports_variants
UNION ALL
SELECT 'planning', COUNT(*) FROM new_02_planning_kits_media
UNION ALL
SELECT 'visuels', COUNT(*) FROM new_03_visuels
UNION ALL
SELECT 'contacts', COUNT(*) FROM new_04_contacts;

-- Check sample data
SELECT * FROM new_01_supports_variants LIMIT 5;

-- Check foreign key integrity
SELECT
  v.variant_slug,
  v.support,
  m.support
FROM new_01_supports_variants v
LEFT JOIN new_00_supports_master m ON v.support_slug = m.support_slug
WHERE v.support_slug IS NOT NULL
LIMIT 10;
```

## Troubleshooting

### Error: "Missing Supabase credentials"
- Check `.env` file exists
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set

### Error: "violates foreign key constraint"
- Ensure you imported files in the correct order
- Run supports_master before variants
- Run variants before planning/visuels/contacts

### Error: "violates row-level security policy"
- You need to be authenticated or use service role key
- Update scripts to use `SUPABASE_SERVICE_KEY` if needed

### Error: "duplicate key value violates unique constraint"
- The script already imported data
- Scripts use `upsert` for master/variants (safe to re-run)
- Planning/visuels/contacts use `insert` (will error on duplicate)

## CSV Format

All CSV files use:
- **Delimiter**: Comma (`,`)
- **Encoding**: UTF-8
- **Quote character**: Double quote (`"`)
- **Header row**: First line contains column names

The scripts handle:
- Quoted values with commas inside
- Empty/null values
- Special characters in French text
- Multiple columns with spaces in names

## Scripts Architecture

Each import script:
1. Loads environment variables from `.env`
2. Creates Supabase client
3. Reads and parses CSV file
4. Maps CSV columns to database columns
5. Inserts/upserts data with error handling
6. Shows progress every N records
7. Displays final summary

## Notes

- All CSV column names are preserved exactly
- Text fields stored as text (including prices)
- Foreign keys enforce data integrity
- Scripts show detailed progress and errors
- Safe to re-run with `--dry-run` flag
