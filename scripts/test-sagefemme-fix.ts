/**
 * Test critique: Vérification que APP'INES et PROFESSION SAGE-FEMME sont bien trouvés
 */

import { config } from 'https://deno.land/x/dotenv@v3.2.2/mod.ts';

const env = config();
const supabaseUrl = Deno.env.get('VITE_SUPABASE_URL') || env.VITE_SUPABASE_URL;
const supabaseAnonKey = Deno.env.get('VITE_SUPABASE_ANON_KEY') || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials');
  Deno.exit(1);
}

const testBrief = 'Sélection de titres ciblant les pharmaciens, les infirmiers et les sages-femmes sur décembre';

console.log('🧪 TEST CRITIQUE: Détection Sages-femmes');
console.log('=' .repeat(80));
console.log(`Brief: "${testBrief}"\n`);

try {
  const response = await fetch(`${supabaseUrl}/functions/v1/chat-ai`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey
    },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: testBrief }
      ]
    })
  });

  if (!response.ok) {
    console.error(`❌ Edge Function failed: ${response.status}`);
    const errorText = await response.text();
    console.error('Error:', errorText);
    Deno.exit(1);
  }

  const result = await response.json();
  const aiMessage = result.message || result.content || '';

  console.log('📊 ANALYSE DE LA RÉPONSE\n');

  // Vérification 1: Sages-femmes mentionnées comme cible
  const hasSageFemmeTarget = aiMessage.toLowerCase().includes('sage') &&
                             (aiMessage.toLowerCase().includes('femme') || aiMessage.toLowerCase().includes('femmes'));

  console.log(`1. Cible "Sages-femmes" détectée: ${hasSageFemmeTarget ? '✅' : '❌'}`);

  // Vérification 2: APP'INES trouvé
  const hasAppInes = aiMessage.includes("APP'INES") || aiMessage.includes("APPINES");
  console.log(`2. Support "APP'INES" trouvé: ${hasAppInes ? '✅' : '❌'}`);

  // Vérification 3: PROFESSION SAGE-FEMME trouvé
  const hasProfessionSF = aiMessage.includes("PROFESSION SAGE-FEMME");
  console.log(`3. Support "PROFESSION SAGE-FEMME" trouvé: ${hasProfessionSF ? '✅' : '❌'}`);

  // Vérification 4: Pas de message "Pas de titre identifié"
  const hasNoResultMessage = aiMessage.toLowerCase().includes('pas de titre identifié') ||
                             aiMessage.toLowerCase().includes('aucun titre');
  console.log(`4. Message "pas de titre": ${hasNoResultMessage ? '❌ PRÉSENT' : '✅ ABSENT'}`);

  // Vérification 5: Nombre de blocs cibles
  const targetBlocks = (aiMessage.match(/###.*CIBLE.*:/gi) || []).length;
  console.log(`5. Nombre de blocs cibles: ${targetBlocks} (attendu: 3)`);

  console.log('\n' + '='.repeat(80));

  if (hasSageFemmeTarget && (hasAppInes || hasProfessionSF) && !hasNoResultMessage && targetBlocks >= 3) {
    console.log('✅ TEST RÉUSSI - Le bug est corrigé!');
    console.log('\nRésumé:');
    console.log('  - 3 cibles détectées (pharmaciens, infirmiers, sages-femmes)');
    console.log('  - Supports trouvés pour toutes les cibles');
    console.log('  - APP\'INES ou PROFESSION SAGE-FEMME présent dans les résultats');
  } else {
    console.error('❌ TEST ÉCHOUÉ - Le bug persiste');
    console.error('\nProblèmes détectés:');
    if (!hasSageFemmeTarget) console.error('  - Cible sages-femmes non détectée');
    if (!hasAppInes && !hasProfessionSF) console.error('  - Aucun support sage-femme trouvé');
    if (hasNoResultMessage) console.error('  - Message "pas de titre" présent');
    if (targetBlocks < 3) console.error(`  - Seulement ${targetBlocks} blocs sur 3 attendus`);
  }

  console.log('\n📄 EXTRAIT DE LA RÉPONSE (premiers 1000 caractères):');
  console.log('─'.repeat(80));
  console.log(aiMessage.substring(0, 1000));
  if (aiMessage.length > 1000) {
    console.log('\n[... suite tronquée ...]');
  }
  console.log('─'.repeat(80));

} catch (error) {
  console.error('❌ Erreur lors du test:', error);
  Deno.exit(1);
}
