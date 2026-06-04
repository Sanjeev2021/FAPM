import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface TestCase {
  name: string;
  brief: string;
  expectedTargets: string[];
  expectedBehavior: string;
}

const testCases: TestCase[] = [
  {
    name: "RÈGLE 1 - Cible explicite unique",
    brief: "Donne-moi les titres ciblant les collectivités locales",
    expectedTargets: ["Collectivités locales"],
    expectedBehavior: "Doit détecter UNIQUEMENT 'Collectivités locales' (pas de cibles inventées)"
  },
  {
    name: "RÈGLE 2 - Hiérarchie sémantique",
    brief: "Je cherche des supports pour les collectivités locales",
    expectedTargets: ["Collectivités locales"],
    expectedBehavior: "Ne doit PAS afficher 'Collectivités' ET 'Collectivités locales' (éliminer le générique)"
  },
  {
    name: "RÈGLE 1 + 2 - Multi-cibles explicites",
    brief: "Supports pour médecins généralistes et pharmaciens d'officine",
    expectedTargets: ["Médecins généralistes", "Pharmaciens d'officine"],
    expectedBehavior: "2 cibles spécifiques, pas 'Médecins' ou 'Pharmaciens' génériques"
  },
  {
    name: "RÈGLE 3 - Affichage obligatoire",
    brief: "Titres pour collectivités locales",
    expectedTargets: ["Collectivités locales"],
    expectedBehavior: "Si résultats > 0, DOIT les afficher (jamais dire 'aucun titre trouvé')"
  },
  {
    name: "RÈGLE 5 - Ton professionnel",
    brief: "Supports collectivités locales",
    expectedTargets: ["Collectivités locales"],
    expectedBehavior: "Ton assuré, propose devis ou présentation (pas 'contactez-nous' par défaut)"
  }
];

async function testBusinessRule(testCase: TestCase) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TEST: ${testCase.name}`);
  console.log(`Brief: "${testCase.brief}"`);
  console.log(`Comportement attendu: ${testCase.expectedBehavior}`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    const { data, error } = await supabase.functions.invoke('chat-ai', {
      body: {
        messages: [
          {
            role: 'user',
            content: testCase.brief
          }
        ]
      }
    });

    if (error) {
      console.error('❌ Erreur Edge Function:', error);
      return false;
    }

    console.log('📊 RÉSULTATS:\n');

    const message = data?.message?.content || '';
    const toolCalls = data?.message?.tool_calls || [];
    const totalMatches = data?.totalMatches || 0;

    console.log(`Total supports trouvés: ${totalMatches}`);
    console.log(`\nRéponse de LÉO:\n${'-'.repeat(80)}`);
    console.log(message.substring(0, 500) + (message.length > 500 ? '...' : ''));
    console.log(`${'-'.repeat(80)}\n`);

    // Analyse des cibles détectées
    const targetsInResponse = extractTargetsFromResponse(message);
    console.log(`\n🎯 Cibles détectées dans la réponse:`);
    targetsInResponse.forEach(target => console.log(`  - ${target}`));

    // Vérifications
    const checks = {
      targetCount: targetsInResponse.length === testCase.expectedTargets.length,
      noGenericDuplicates: !hasGenericDuplicates(targetsInResponse),
      resultsDisplayed: totalMatches > 0 ? !message.toLowerCase().includes('aucun titre trouvé') : true,
      professionalTone: !hasPoorTone(message)
    };

    console.log(`\n✅ Vérifications:`);
    console.log(`  Nombre de cibles correct: ${checks.targetCount ? '✅' : '❌'}`);
    console.log(`  Pas de doublons génériques: ${checks.noGenericDuplicates ? '✅' : '❌'}`);
    console.log(`  Résultats affichés (si > 0): ${checks.resultsDisplayed ? '✅' : '❌'}`);
    console.log(`  Ton professionnel: ${checks.professionalTone ? '✅' : '❌'}`);

    const success = Object.values(checks).every(v => v);
    console.log(`\n${success ? '✅ TEST RÉUSSI' : '❌ TEST ÉCHOUÉ'}\n`);

    return success;

  } catch (error) {
    console.error('❌ Erreur:', error);
    return false;
  }
}

function extractTargetsFromResponse(message: string): string[] {
  const targets: string[] = [];
  const cibleRegex = /(?:CIBLE\s*:\s*|Cible\s*\d+\s*:\s*)([^\n]+)/gi;
  let match;

  while ((match = cibleRegex.exec(message)) !== null) {
    const target = match[1].trim().toLowerCase();
    if (!targets.includes(target)) {
      targets.push(target);
    }
  }

  return targets;
}

function hasGenericDuplicates(targets: string[]): boolean {
  const hierarchy: { [key: string]: string[] } = {
    "collectivités locales": ["collectivités", "collectivité"],
    "médecins généralistes": ["médecins", "médecin"],
    "pharmaciens d'officine": ["pharmaciens", "pharmacien"],
  };

  for (const [specific, generics] of Object.entries(hierarchy)) {
    if (targets.includes(specific)) {
      for (const generic of generics) {
        if (targets.includes(generic)) {
          console.log(`⚠️ Doublon détecté: "${generic}" et "${specific}"`);
          return true;
        }
      }
    }
  }

  return false;
}

function hasPoorTone(message: string): boolean {
  const poorPhrases = [
    'je ne suis pas sûr',
    'peut-être',
    'il se peut que',
    'je pense que',
    'contactez-nous pour',
    'recherche manuelle',
    'je suis désolé',
    'je n\'ai pas assez'
  ];

  for (const phrase of poorPhrases) {
    if (message.toLowerCase().includes(phrase)) {
      console.log(`⚠️ Phrase non professionnelle détectée: "${phrase}"`);
      return true;
    }
  }

  return false;
}

async function runAllTests() {
  console.log('\n🚀 LANCEMENT DES TESTS DES RÈGLES MÉTIER\n');

  const results: boolean[] = [];

  for (const testCase of testCases) {
    const success = await testBusinessRule(testCase);
    results.push(success);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Pause entre les tests
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 RÉSUMÉ FINAL');
  console.log('='.repeat(80));
  console.log(`Tests réussis: ${results.filter(r => r).length}/${results.length}`);
  console.log(`Taux de réussite: ${Math.round((results.filter(r => r).length / results.length) * 100)}%`);
  console.log('='.repeat(80) + '\n');
}

runAllTests().catch(console.error);
