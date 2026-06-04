# Quick Start: Import PLS Data

## Step 1: Verify Prerequisites

```bash
# Check that .env file exists
cat .env

# You should see:
# VITE_SUPABASE_URL=https://...
# VITE_SUPABASE_ANON_KEY=...
```

## Step 2: Verify Database Tables

The 5 tables should already be created. You can verify in Supabase UI or:

```sql
-- In Supabase SQL Editor
SELECT table_name
FROM information_schema.tables
WHERE table_name LIKE 'new_%'
ORDER BY table_name;

-- Expected output:
-- new_00_supports_master
-- new_01_supports_variants
-- new_02_planning_kits_media
-- new_03_visuels
-- new_04_contacts
```

## Step 3: Run Dry Run (Optional but Recommended)

Test the import without writing to database:

```bash
npx tsx scripts/pls-import-v2/import-00-supports-master.ts --dry-run
```

This will show you the first 3 records that would be imported.

## Step 4: Import All Data

```bash
npx tsx scripts/pls-import-v2/import-all.ts
```

This will import all 5 CSV files in the correct order.

Expected output:
```
🚀 PLS Data Import - Full Pipeline
═══════════════════════════════════════════════════════════════

▶️  Running import-00-supports-master.ts...
─────────────────────────────────────────────────────────────
📊 Found 434 supports master records
✅ Imported 50/434 records...
✅ Imported 100/434 records...
...
✅ Import complete: 434 records imported successfully

▶️  Running import-01-supports-variants.ts...
...

═══════════════════════════════════════════════════════════════
📊 IMPORT SUMMARY

   Total scripts: 5
   Successful: 5
   Failed: 0
   Duration: XX.XXs
═══════════════════════════════════════════════════════════════

🎉 All imports completed successfully!
```

## Step 5: Verify Data

```bash
# Open Supabase UI and run:
SELECT COUNT(*) FROM new_00_supports_master;  -- Should be ~434
SELECT COUNT(*) FROM new_01_supports_variants; -- Should be ~653
SELECT COUNT(*) FROM new_02_planning_kits_media; -- Should be ~3,632
SELECT COUNT(*) FROM new_03_visuels; -- Should be ~653
SELECT COUNT(*) FROM new_04_contacts; -- Should be ~655
```

## Step 6: Test ChatBox Connection

1. Open the application
2. Navigate to the Chat/Brief creation page
3. The ChatBox should now report the actual number of supports from the database
4. Try asking: "Montre-moi des supports print pour les dentistes"

## Troubleshooting

If you see errors during import:

1. **Foreign key violation**: You may need to import in order. Use `import-all.ts` instead of individual scripts.

2. **RLS policy violation**: The scripts need proper authentication. Check your Supabase keys.

3. **File not found**: Ensure CSV files are in `scripts/pls-data/` directory.

4. **Duplicate key error**: Data already imported. Safe for master/variants (uses upsert), but planning/visuels/contacts will error.

## What's Next?

After successful import:

- ✅ ChatBox is now connected to real PLS data
- ✅ AI can search and recommend actual press supports
- ✅ All 6,027+ records are queryable
- 🔜 Next: Add PGVector for semantic search
- 🔜 Next: Add advanced filtering UI
- 🔜 Next: Add support detail pages

## Need Help?

See full documentation in:
- `scripts/pls-import-v2/README.md` - Detailed script documentation
- `PLS_MIGRATION_COMPLETE.md` - Complete architecture documentation
- `src/types/pls-database.ts` - TypeScript interfaces
- `src/lib/plsService.ts` - Query helper functions
