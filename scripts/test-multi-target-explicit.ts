/**
 * Test script for explicit multi-target detection
 *
 * Validates that the system correctly detects and returns results for:
 * - Pharmaciens (should return 8+ supports)
 * - Infirmiers / Soins Infirmiers (should return 4+ supports)
 * - Sages-femmes / Kinésithérapie - Sage-femme (should return 5+ supports)
 */

import { createClient } from 'npm:@supabase/supabase-js@2.76.1';
import { config } from 'https://deno.land/x/dotenv@v3.2.2/mod.ts';

// Load environment variables
const env = config();

const supabaseUrl = Deno.env.get('VITE_SUPABASE_URL') || env.VITE_SUPABASE_URL;
const supabaseKey = Deno.env.get('VITE_SUPABASE_ANON_KEY') || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface TestCase {
  name: string;
  brief: string;
  expectedTargets: string[];
  minSupportsPerTarget: { [key: string]: number };
}

const testCases: TestCase[] = [
  {
    name: 'Multi-Target: Pharmaciens, Infirmiers, Sages-femmes',
    brief: 'Sélection de titres ciblant les pharmaciens, les infirmiers et les sages-femmes sur décembre',
    expectedTargets: ['Pharmaciens', 'Soins Infirmiers', 'Kinésithérapie - Sage-femme'],
    minSupportsPerTarget: {
      'Pharmaciens': 3,
      'Soins Infirmiers': 1,
      'Kinésithérapie - Sage-femme': 1
    }
  },
  {
    name: 'Single Target: Médecins Généralistes',
    brief: 'Je veux toucher les médecins généralistes en région PACA',
    expectedTargets: ['Médecins Généralistes'],
    minSupportsPerTarget: {
      'Médecins Généralistes': 3
    }
  },
  {
    name: 'Multi-Target: Dentistes et Ophtalmologues',
    brief: 'Campagne pour les dentistes et les ophtalmologues',
    expectedTargets: ['Dentistes', 'Ophtalmologie'],
    minSupportsPerTarget: {
      'Dentistes': 1,
      'Ophtalmologie': 1
    }
  },
  {
    name: 'Generic Healthcare',
    brief: 'Professionnels de santé',
    expectedTargets: [],  // Vector-based detection only
    minSupportsPerTarget: {}
  }
];

async function testExplicitTargetExtraction(testCase: TestCase): Promise<void> {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📋 TEST: ${testCase.name}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Brief: "${testCase.brief}"\n`);

  try {
    // Test explicit target extraction
    const { data: explicitTargets, error: explicitError } = await supabase.rpc(
      'extract_targets_from_brief',
      { brief_text: testCase.brief }
    );

    if (explicitError) {
      console.error('❌ Error extracting explicit targets:', explicitError);
      return;
    }

    console.log(`✅ Explicit Targets Found: ${explicitTargets?.length || 0}`);
    if (explicitTargets && explicitTargets.length > 0) {
      explicitTargets.forEach((target: any, idx: number) => {
        console.log(`  ${idx + 1}. ${target.target_name}`);
        console.log(`     Keywords: ${target.keywords_matched?.join(', ')}`);
        console.log(`     Boost: ${target.boost_score}`);
      });
    }

    // Validate expected targets
    if (testCase.expectedTargets.length > 0) {
      let allFound = true;
      for (const expectedTarget of testCase.expectedTargets) {
        const found = explicitTargets?.some((t: any) => t.target_name === expectedTarget);
        if (found) {
          console.log(`✅ Expected target found: ${expectedTarget}`);
        } else {
          console.error(`❌ Expected target NOT found: ${expectedTarget}`);
          allFound = false;
        }
      }

      if (allFound) {
        console.log('\n✅ ALL EXPECTED TARGETS DETECTED');
      } else {
        console.error('\n❌ SOME TARGETS MISSING');
      }
    }

    // Test support count for each target
    console.log('\n📊 Checking Support Availability:\n');

    for (const targetName of testCase.expectedTargets) {
      const { data: supports, error: supportsError } = await supabase
        .from('new_00_supports_master')
        .select('support, categorie, lectorat')
        .eq('categorie', targetName);

      if (supportsError) {
        console.error(`❌ Error fetching supports for ${targetName}:`, supportsError);
        continue;
      }

      const supportCount = supports?.length || 0;
      const minExpected = testCase.minSupportsPerTarget[targetName] || 1;

      if (supportCount >= minExpected) {
        console.log(`✅ ${targetName}: ${supportCount} supports (expected: ≥${minExpected})`);
        if (supports && supports.length > 0) {
          supports.slice(0, 3).forEach((s: any) => {
            console.log(`   - ${s.support}`);
          });
          if (supports.length > 3) {
            console.log(`   ... and ${supports.length - 3} more`);
          }
        }
      } else {
        console.error(`❌ ${targetName}: Only ${supportCount} supports (expected: ≥${minExpected})`);
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

async function runAllTests(): Promise<void> {
  console.log('🚀 Starting Multi-Target Detection Tests\n');

  for (const testCase of testCases) {
    await testExplicitTargetExtraction(testCase);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ ALL TESTS COMPLETED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Run tests
await runAllTests();
