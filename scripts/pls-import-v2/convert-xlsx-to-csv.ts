import XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = resolve(__dirname, '../..');
const OUT_DIR = resolve(__dirname, '../pls-data');

// ─── Slug remaps ───────────────────────────────────────────
const SLUG_ALIASES: Record<string, string> = {
  'france-snacking': 'snacking',
  'tendances-restauration': 'tendance-restauration',
  // variant references decision-achat but master slug is decision-achats
  'decision-achat': 'decision-achats',
};

const SLUG_RENAMES: Record<string, string> = {
  'architectures-a-vivre': 'architecture-a-vivre',
  'd-architectures': 'd-architecture',
  'gazette-du-palais': 'la-gazette-du-palais',
  'l-eclaireur-des-coiffeurs': 'l-eclaireur-des-coiffeur',
  'terre-net-france-agricole-web-agri-materiel-agricole':
    'terre-net-france-agricole-web-agri-mat-riel-agricole',
  // Long alias in new_02 for tendance-restauration
  'bra-boisson-restauration-actualites-nouveau-nom-tendances-restauration':
    'tendance-restauration',
};

const ALL_REMAPS = { ...SLUG_ALIASES, ...SLUG_RENAMES };

const DELETED_SUPPORTS = new Set([
  'europe-des-transitions',
  'ortho-autrement',
  'pour la science',
  'pour-la-science', // slug form used in new_02 variant_slugs
  'trm',
  'TRM-logistique', // form used in new_02
  'construire-renover-sa-maison',
]);

function remapSlug(slug: string): string {
  return ALL_REMAPS[slug] ?? slug;
}

function remapVariantSlug(variantSlug: string): string {
  // variant_slug format: "support-slug::canal::format" or "support-slug::canal"
  const parts = variantSlug.split('::');
  if (parts.length >= 1) {
    parts[0] = remapSlug(parts[0]);
  }
  return parts.join('::');
}

function isDeletedSupport(supportSlug: string): boolean {
  return DELETED_SUPPORTS.has(supportSlug);
}

function isDeletedVariant(variantSlug: string): boolean {
  const supportSlug = variantSlug.split('::')[0];
  return DELETED_SUPPORTS.has(supportSlug);
}

// ─── Excel serial date → DD/MM/YYYY ───────────────────────
function excelSerialToDate(serial: number): string {
  // Excel epoch is 1900-01-01, but has a leap year bug (day 60 = Feb 29 1900 doesn't exist)
  const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
  const ms = excelEpoch.getTime() + serial * 86400000;
  const d = new Date(ms);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// ─── CSV writer ────────────────────────────────────────────
function toCSV(headers: string[], rows: Record<string, any>[]): string {
  const escape = (val: any): string => {
    if (val === null || val === undefined) return '';
    // Normalize embedded newlines to a space so simple line-splitting CSV parsers work
    let s = String(val).replace(/\r\n/g, ' ').replace(/\r|\n/g, ' ').trim();
    if (s.includes(',') || s.includes('"')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

// ─── NEW_00: Supports Master ──────────────────────────────
function convertNew00() {
  console.log('\n── NEW_00: Supports Master ──');
  const wb = XLSX.readFile(resolve(ROOT, 'NEW_00_Supports_Master-Vue_LEO_17_mars florent.xlsx'));
  const data: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  console.log(`  Raw rows: ${data.length}`);

  // Fix Tendance-restauration → tendance-restauration
  for (const row of data) {
    if (row.support_slug === 'Tendance-restauration') {
      row.support_slug = 'tendance-restauration';
    }
  }

  // Fix decision-achat duplicate: keep decision-achats, remove the malformed one
  const filtered = data.filter((row) => {
    if (row.support_slug === 'decision-achat' && row.support === 'decision-achat') {
      console.log('  Dropping malformed decision-achat row');
      return false;
    }
    return true;
  });

  // Deduplicate: keep first row per support_slug
  const seen = new Set<string>();
  const deduped: any[] = [];
  for (const row of filtered) {
    if (!seen.has(row.support_slug)) {
      seen.add(row.support_slug);
      deduped.push(row);
    } else {
      console.log(`  Dedup: skipping duplicate ${row.support_slug}`);
    }
  }

  const headers = ['support', 'support_slug', 'categorie', 'lectorat', 'canal', 'NEW_01_Supports_Variants 2'];
  const outPath = resolve(OUT_DIR, 'new_00_supports_master-vue_leo.csv');
  writeFileSync(outPath, toCSV(headers, deduped));
  console.log(`  Output: ${deduped.length} rows → ${outPath}`);
}

// ─── NEW_01: Supports Variants ────────────────────────────
function convertNew01() {
  console.log('\n── NEW_01: Supports Variants ──');
  const wb = XLSX.readFile(resolve(ROOT, 'NEW_01_Supports_Variants-Vue_LEO - 18nov25 (1).xlsx'));
  const data: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  console.log(`  Raw rows: ${data.length}`);

  // Rename column xf → variant_slug
  for (const row of data) {
    if (row.xf !== undefined) {
      row.variant_slug = row.xf;
      delete row.xf;
    }
  }

  // Strip deleted supports
  let rows = data.filter((row) => {
    if (isDeletedSupport(row.support_slug) || isDeletedVariant(row.variant_slug)) {
      return false;
    }
    return true;
  });
  console.log(`  After stripping deleted: ${rows.length} rows`);

  // Remap slugs
  for (const row of rows) {
    if (row.support_slug) row.support_slug = remapSlug(row.support_slug);
    if (row.variant_slug) row.variant_slug = remapVariantSlug(row.variant_slug);
  }

  const headers = [
    'variant_slug', 'support', 'support_slug', 'Canal',
    'periodicite_print', 'diffusion_print', 'format_print',
    'Visites par mois Web', 'Pages vues par mois Web',
    "Nombre d'envois NL", 'tarif_brut', 'tarif_net',
  ];

  const outPath = resolve(OUT_DIR, 'new_01_supports_variants-vue_leo.csv');
  writeFileSync(outPath, toCSV(headers, rows));
  console.log(`  Output: ${rows.length} rows → ${outPath}`);
}

// ─── NEW_02: Planning Kits Media ──────────────────────────
function convertNew02() {
  console.log('\n── NEW_02: Planning Kits Media ──');
  const wb = XLSX.readFile(resolve(ROOT, 'NEW_02_Planning_Kits_Media-Vue_LEO - 18nov25 (1).xlsx'));
  const data: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  console.log(`  Raw rows: ${data.length}`);

  // Strip deleted supports
  let rows = data.filter((row) => {
    const supportSlug = row.variant_slug?.split('::')[0];
    if (supportSlug && DELETED_SUPPORTS.has(supportSlug)) return false;
    return true;
  });
  console.log(`  After stripping deleted: ${rows.length} rows`);

  // Convert dates and remap slugs, trim type
  for (const row of rows) {
    if (typeof row.date === 'number') {
      row.date = excelSerialToDate(row.date);
    }
    if (row.type) row.type = row.type.trim();
    if (row.variant_slug) row.variant_slug = remapVariantSlug(row.variant_slug);
  }

  const headers = ['variant_slug', 'support', 'canal', 'type', 'date', 'periodicite', 'specs_techniques', 'notes'];

  const outPath = resolve(OUT_DIR, 'new_02_planning_kits_media-vue_leo.csv');
  writeFileSync(outPath, toCSV(headers, rows));
  console.log(`  Output: ${rows.length} rows → ${outPath}`);
}

// ─── NEW_03: Visuels ──────────────────────────────────────
function convertNew03() {
  console.log('\n── NEW_03: Visuels ──');
  const srcPath = resolve(ROOT, 'NEW_03_Visuels-Vue_LEO_18-mars.csv');
  let content = readFileSync(srcPath, 'utf-8');

  // Strip BOM
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
    console.log('  Stripped BOM');
  }

  const outPath = resolve(OUT_DIR, 'new_03_visuels-vue_leo.csv');
  writeFileSync(outPath, content);

  const lineCount = content.split('\n').filter((l) => l.trim()).length - 1;
  console.log(`  Output: ${lineCount} rows → ${outPath}`);
}

// ─── Main ─────────────────────────────────────────────────
console.log('=== XLSX → CSV Conversion ===');
convertNew00();
convertNew01();
convertNew02();
convertNew03();
console.log('\n✅ All conversions complete');
