/**
 * Validation script for complete multi-target flow
 *
 * Tests the entire pipeline:
 * 1. Explicit target extraction
 * 2. Vector-based target detection
 * 3. Target merging
 * 4. Multi-level fallback
 * 5. Result formatting
 */

import { config } from 'https://deno.land/x/dotenv@v3.2.2/mod.ts';

// Load environment variables
const env = config();

const supabaseUrl = Deno.env.get('VITE_SUPABASE_URL') || env.VITE_SUPABASE_URL;
const supabaseAnonKey = Deno.env.get('VITE_SUPABASE_ANON_KEY') || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials');
  Deno.exit(1);
}

interface TestScenario {
  name: string;
  brief: string;
  expectedTargetCount: number;
  expectedExplicitTargets: string[];
  shouldHaveResults: boolean;
}

const scenarios: TestScenario[] = [
  {
    name: 'Critical Case: Pharmaciens + Infirmiers + Sages-femmes',
    brief: 'Sélection de titres ciblant les pharmaciens, les infirmiers et les sages-femmes sur décembre',
    expectedTargetCount: 3,
    expectedExplicitTargets: ['Pharmaciens', 'Soins Infirmiers', 'Kinésithérapie - Sage-femme'],
    shouldHaveResults: true
  },
  {
    name: 'Single Healthcare Target',
    brief: 'Je cherche des supports pour les dentistes',
    expectedTargetCount: 1,
    expectedExplicitTargets: ['Dentistes'],
    shouldHaveResults: true
  },
  {
    name: 'Multi-Specialty Healthcare',
    brief: 'Campagne pour cardiologues, neurologues et radiologues',
    expectedTargetCount: 3,
    expectedExplicitTargets: ['Cardiologie', 'Neurologie', 'Radiologue'],
    shouldHaveResults: true
  }
];

async function testCompleteFlow(scenario: TestScenario): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📋 SCENARIO: ${scenario.name}`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Brief: "${scenario.brief}"\n`);

  try {
    // Call the Edge Function
    const response = await fetch(`${supabaseUrl}/functions/v1/chat-ai`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: scenario.brief }
        ]
      })
    });

    if (!response.ok) {
      console.error(`❌ Edge Function call failed: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return;
    }

    const result = await response.json();
    console.log('✅ Edge Function responded successfully\n');

    // Parse the AI response
    const aiMessage = result.message || result.content || '';

    console.log('📊 Analysis:\n');

    // Check if all expected targets are mentioned
    let allTargetsFound = true;
    for (const expectedTarget of scenario.expectedExplicitTargets) {
      const mentioned = aiMessage.includes(expectedTarget);
      if (mentioned) {
        console.log(`✅ Target mentioned: ${expectedTarget}`);
      } else {
        console.error(`❌ Target NOT mentioned: ${expectedTarget}`);
        allTargetsFound = false;
      }
    }

    // Check for zero result messages
    const hasZeroResultWarning = aiMessage.toLowerCase().includes('aucun titre') ||
                                  aiMessage.toLowerCase().includes('pas de titre');

    if (hasZeroResultWarning) {
      console.log('\n⚠️ Some targets have zero results (as expected for rare categories)');
    }

    // Count the number of target blocks in response
    const targetBlockCount = (aiMessage.match(/###.*CIBLE.*:/gi) || []).length;
    console.log(`\n📈 Target blocks in response: ${targetBlockCount}`);
    console.log(`   Expected: ${scenario.expectedTargetCount}`);

    if (targetBlockCount >= scenario.expectedTargetCount) {
      console.log('✅ All expected target blocks present');
    } else {
      console.error('❌ Missing target blocks');
    }

    // Display summary
    console.log('\n' + '─'.repeat(80));
    if (allTargetsFound && targetBlockCount >= scenario.expectedTargetCount) {
      console.log('✅ SCENARIO PASSED');
    } else {
      console.error('❌ SCENARIO FAILED');
    }
    console.log('─'.repeat(80));

    // Show first 500 chars of response
    console.log('\n📄 Response Preview (first 500 chars):');
    console.log(aiMessage.substring(0, 500) + '...\n');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

async function runValidation(): Promise<void> {
  console.log('🚀 Starting Complete Flow Validation\n');
  console.log(`Testing against: ${supabaseUrl}\n`);

  for (const scenario of scenarios) {
    await testCompleteFlow(scenario);
    // Wait a bit between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ VALIDATION COMPLETE');
  console.log('='.repeat(80) + '\n');
}

// Run validation
await runValidation();
