/**
 * Validation rapide: Vérifier que les supports sages-femmes existent dans la DB
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function validateDatabase() {
  console.log('🔍 VALIDATION BASE DE DONNÉES\n');
  console.log('='.repeat(80));

  // Test 1: Vérifier le mapping
  console.log('\n1️⃣ Test du mapping keyword → catégorie\n');

  const { data: mappings, error: mappingError } = await supabase.rpc(
    'extract_targets_from_brief',
    { brief_text: 'sages-femmes et pharmaciens' }
  );

  if (mappingError) {
    console.error('❌ Erreur mapping:', mappingError);
  } else {
    console.log(`✅ Mappings trouvés: ${mappings?.length || 0}`);
    mappings?.forEach((m: any) => {
      console.log(`   - "${m.target_name}" (keywords: ${m.keywords_matched?.join(', ')})`);
    });
  }

  // Test 2: Vérifier les supports dans la catégorie
  console.log('\n2️⃣ Supports dans la catégorie "Kinésithérapie - Sage-femme"\n');

  const { data: supports, error: supportsError } = await supabase
    .from('new_00_supports_master')
    .select('support, categorie, lectorat, canal')
    .eq('categorie', 'Kinésithérapie - Sage-femme');

  if (supportsError) {
    console.error('❌ Erreur supports:', supportsError);
  } else {
    console.log(`✅ Supports trouvés: ${supports?.length || 0}\n`);
    supports?.forEach((s: any) => {
      console.log(`   �� ${s.support}`);
      console.log(`      Catégorie: ${s.categorie}`);
      console.log(`      Lectorat: ${s.lectorat}`);
      console.log(`      Canal: ${s.canal}\n`);
    });

    // Vérifier APP'INES spécifiquement
    const hasAppInes = supports?.some((s: any) => s.support === "APP'INES");
    const hasProfessionSF = supports?.some((s: any) => s.support === "PROFESSION SAGE-FEMME");

    console.log(`   ${hasAppInes ? '✅' : '❌'} APP'INES présent`);
    console.log(`   ${hasProfessionSF ? '✅' : '❌'} PROFESSION SAGE-FEMME présent`);
  }

  // Test 3: Vérifier les variants avec embeddings
  console.log('\n3️⃣ Variants avec embeddings pour sages-femmes\n');

  const { data: variants, error: variantsError } = await supabase
    .from('new_01_supports_variants')
    .select(`
      variant_slug,
      support,
      canal,
      new_00_supports_master!inner (categorie)
    `)
    .eq('new_00_supports_master.categorie', 'Kinésithérapie - Sage-femme')
    .not('embedding', 'is', null);

  if (variantsError) {
    console.error('❌ Erreur variants:', variantsError);
  } else {
    console.log(`✅ Variants avec embeddings: ${variants?.length || 0}`);

    // Compter par support
    const supportCounts: Record<string, number> = {};
    variants?.forEach((v: any) => {
      supportCounts[v.support] = (supportCounts[v.support] || 0) + 1;
    });

    Object.entries(supportCounts).forEach(([support, count]) => {
      console.log(`   - ${support}: ${count} variant(s)`);
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ VALIDATION TERMINÉE\n');

  if (supports && supports.length > 0 && variants && variants.length > 0) {
    console.log('🎉 La base de données contient bien les supports sages-femmes');
    console.log('   Le fallback SQL direct devrait maintenant les trouver!\n');
  } else {
    console.error('❌ Problème détecté dans la base de données\n');
    process.exit(1);
  }
}

validateDatabase();
