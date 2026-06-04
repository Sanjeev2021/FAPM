import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Erreur: Variables d\'environnement VITE_SUPABASE_URL et SUPABASE_SERVICE_KEY requises');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface CSVRow {
  support: string;
  slug: string;
  categories: string;
  lectorat: string;
  description: string;
  variant_slug: string;
  canal: string;
  format_name: string;
  tarif_brut: string;
  remise_pourcent: string;
  tarif_net: string;
  cpm_net: string;
  impressions_mois: string;
  visites_mois: string;
  abonnes_total: string;
  periodicite: string;
  disponibilite: string;
  specs_techniques: string;
  format_fichier: string;
  poids_max_mo: string;
  dimensions: string;
  contact_nom: string;
  contact_email: string;
  contact_tel: string;
}

interface PressSupport {
  name: string;
  slug: string;
  provider: string;
  user_id: string;
  lectorat: string | null;
  description: string | null;
  categories: string[];
}

interface PressVariant {
  variant_slug: string;
  canal: 'Print' | 'Web' | 'NL';
  format_name: string;
  tarif_brut: number | null;
  remise_pourcent: number | null;
  tarif_net: number | null;
  cpm_net: number | null;
  impressions_mois: number | null;
  visites_mois: number | null;
  abonnes_total: number | null;
  periodicite: string | null;
  disponibilite: boolean;
  specs_techniques: string | null;
  format_fichier: string | null;
  poids_max_mo: number | null;
  dimensions: string | null;
  contact_nom: string | null;
  contact_email: string | null;
  contact_tel: string | null;
}

function parseCSV(csvContent: string): CSVRow[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',').map(h => h.trim());

  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row: any = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    rows.push(row as CSVRow);
  }

  return rows;
}

function parseNumber(value: string): number | null {
  if (!value || value === '') return null;
  const num = parseFloat(value.replace(/\s/g, '').replace(',', '.'));
  return isNaN(num) ? null : num;
}

function parseBoolean(value: string): boolean {
  const normalized = value.toLowerCase().trim();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'oui';
}

async function importSupports(csvFilePath: string, userId: string, provider: string = 'PLS', dryRun: boolean = false) {
  console.log('Lecture du fichier CSV...');

  const csvContent = fs.readFileSync(csvFilePath, 'utf-8');
  const rows = parseCSV(csvContent);

  console.log(`${rows.length} lignes trouvees dans le CSV\n`);

  const supportsMap = new Map<string, { support: PressSupport; variants: PressVariant[] }>();
  const categoriesSet = new Set<string>();

  for (const row of rows) {
    const slug = row.slug;
    const categories = row.categories.split(';').map(c => c.trim()).filter(Boolean);

    categories.forEach(cat => categoriesSet.add(cat));

    if (!supportsMap.has(slug)) {
      supportsMap.set(slug, {
        support: {
          name: row.support,
          slug: slug,
          provider: provider,
          user_id: userId,
          lectorat: row.lectorat || null,
          description: row.description || null,
          categories: []
        },
        variants: []
      });
    }

    const supportData = supportsMap.get(slug)!;
    supportData.support.categories.push(...categories);

    supportData.variants.push({
      variant_slug: row.variant_slug,
      canal: row.canal as 'Print' | 'Web' | 'NL',
      format_name: row.format_name,
      tarif_brut: parseNumber(row.tarif_brut),
      remise_pourcent: parseNumber(row.remise_pourcent),
      tarif_net: parseNumber(row.tarif_net),
      cpm_net: parseNumber(row.cpm_net),
      impressions_mois: parseNumber(row.impressions_mois),
      visites_mois: parseNumber(row.visites_mois),
      abonnes_total: parseNumber(row.abonnes_total),
      periodicite: row.periodicite || null,
      disponibilite: row.disponibilite ? parseBoolean(row.disponibilite) : true,
      specs_techniques: row.specs_techniques || null,
      format_fichier: row.format_fichier || null,
      poids_max_mo: parseNumber(row.poids_max_mo),
      dimensions: row.dimensions || null,
      contact_nom: row.contact_nom || null,
      contact_email: row.contact_email || null,
      contact_tel: row.contact_tel || null
    });
  }

  const supports = Array.from(supportsMap.values());
  const totalVariants = supports.reduce((sum, s) => sum + s.variants.length, 0);

  console.log(`Statistiques:`);
  console.log(`   - ${supports.length} supports uniques`);
  console.log(`   - ${categoriesSet.size} categories uniques`);
  console.log(`   - ${totalVariants} variantes au total\n`);

  if (dryRun) {
    console.log('MODE DRY-RUN: Apercu des donnees (pas d\'insertion reelle)\n');
    console.log('Categories:', Array.from(categoriesSet).join(', '));
    console.log('\nPremier support:', JSON.stringify(supports[0], null, 2));
    return;
  }

  console.log('Import des categories...');
  const categoryMap = new Map<string, string>();

  for (const catName of Array.from(categoriesSet)) {
    const slug = catName.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const { data, error } = await supabase
      .from('press_categories')
      .upsert({ name: catName, slug }, { onConflict: 'slug' })
      .select()
      .single();

    if (error) {
      console.error(`Erreur lors de l'insertion de la categorie "${catName}":`, error);
    } else if (data) {
      categoryMap.set(catName, data.id);
    }
  }

  console.log(`${categoryMap.size} categories inserees\n`);

  console.log('Import des supports et variants...');
  let successCount = 0;
  let errorCount = 0;

  for (const item of supports) {
    const { support, variants } = item;
    const { categories, ...supportData } = support;

    const { data: insertedSupport, error: supportError } = await supabase
      .from('press_supports')
      .upsert(supportData, { onConflict: 'user_id,slug' })
      .select()
      .single();

    if (supportError) {
      console.error(`Erreur support "${support.name}":`, supportError.message);
      errorCount++;
      continue;
    }

    if (!insertedSupport) continue;

    const uniqueCategories = Array.from(new Set(categories));
    for (const catName of uniqueCategories) {
      const categoryId = categoryMap.get(catName);
      if (!categoryId) continue;

      await supabase
        .from('press_supports_categories')
        .upsert({
          press_support_id: insertedSupport.id,
          press_category_id: categoryId
        }, { onConflict: 'press_support_id,press_category_id' });
    }

    for (const variant of variants) {
      const { error: variantError } = await supabase
        .from('press_support_variants')
        .upsert({
          press_support_id: insertedSupport.id,
          ...variant
        }, { onConflict: 'press_support_id,canal,variant_slug' });

      if (variantError) {
        console.error(`Erreur variante "${variant.variant_slug}":`, variantError.message);
      }
    }

    successCount++;
    console.log(`  Importe: ${support.name} (${variants.length} variants)`);
  }

  console.log(`\nImport termine:`);
  console.log(`   - ${successCount} supports importes avec succes`);
  console.log(`   - ${errorCount} erreurs`);
}

const args = process.argv.slice(2);
const csvFilePath = args[0];
const userId = args[1];
const provider = args[2] || 'PLS';
const dryRun = args.includes('--dry-run');

if (!csvFilePath || !userId) {
  console.log('Usage: ts-node import-press-supports-v2.ts <chemin-csv> <user-id> [provider] [--dry-run]');
  console.log('\nExemples:');
  console.log('  ts-node import-press-supports-v2.ts ./example_supports.csv abc-123 PLS --dry-run');
  console.log('  ts-node import-press-supports-v2.ts ./supports.csv abc-123 PLS');
  console.log('  ts-node import-press-supports-v2.ts ./supports.csv abc-123 AUTRE_REGIE');
  process.exit(1);
}

importSupports(csvFilePath, userId, provider, dryRun)
  .then(() => console.log('\nImport termine avec succes!'))
  .catch((error) => {
    console.error('\nErreur fatale:', error);
    process.exit(1);
  });
