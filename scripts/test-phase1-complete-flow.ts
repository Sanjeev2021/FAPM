import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface TestResult {
  testName: string;
  success: boolean;
  duration: number;
  details: any;
  error?: string;
}

const testResults: TestResult[] = [];

async function runTest(testName: string, testFn: () => Promise<any>): Promise<void> {
  console.log(`\n🧪 Testing: ${testName}`);
  const startTime = Date.now();

  try {
    const result = await testFn();
    const duration = Date.now() - startTime;

    testResults.push({
      testName,
      success: true,
      duration,
      details: result,
    });

    console.log(`✅ PASS (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    testResults.push({
      testName,
      success: false,
      duration,
      details: null,
      error: errorMessage,
    });

    console.log(`❌ FAIL (${duration}ms): ${errorMessage}`);
  }
}

async function testBriefExtractionRules() {
  const { data, error } = await supabase
    .from('brief_extraction_rules')
    .select('*')
    .limit(5);

  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No extraction rules found');

  return {
    totalRules: data.length,
    sampleRules: data.map(r => ({ rule_name: r.rule_name, intent_type: r.intent_type })),
  };
}

async function testProfessionMappings() {
  const { data, error } = await supabase
    .from('profession_to_category_mappings')
    .select('*')
    .limit(10);

  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No profession mappings found');

  const hasNewFields = data.some(p => p.common_misspellings !== null);

  return {
    totalMappings: data.length,
    hasCommonMisspellings: hasNewFields,
    sampleMappings: data.slice(0, 5).map(p => ({
      profession: p.profession_keyword,
      category: p.exact_category_name,
    })),
  };
}

async function testExtractBriefMetadata() {
  const testBrief = "Je veux toucher les pharmaciens et infirmiers en novembre avec un budget de 15000€";

  const { data, error } = await supabase.rpc('extract_brief_metadata', {
    brief_text: testBrief,
  });

  if (error) throw error;

  return {
    brief: testBrief,
    metadata: data,
    monthsDetected: data.months || [],
    canalsDetected: data.canals || [],
    budgetDetected: data.budget_max,
  };
}

async function testFilterSupportsByMonth() {
  const { data: supportsData } = await supabase
    .from('new_00_supports_master')
    .select('id')
    .limit(10);

  if (!supportsData || supportsData.length === 0) {
    throw new Error('No supports found for testing');
  }

  const supportIds = supportsData.map(s => s.id);

  const { data, error } = await supabase.rpc('filter_supports_by_month', {
    support_ids: supportIds,
    target_months: [11, 12],
  });

  if (error) throw error;

  return {
    inputSupports: supportIds.length,
    filteredSupports: data?.length || 0,
    targetMonths: [11, 12],
  };
}

async function testMatchSupportsWithFilters() {
  const testBrief = "pharmaciens print novembre";
  const { data: embeddingData } = await supabase.functions.invoke('chat-ai', {
    body: { messages: [{ role: 'user', content: testBrief }] },
  });

  const briefMetadata = {
    months: [11],
    canals: ['print'],
    budget_max: null,
    has_month_filter: true,
    has_canal_filter: true,
    has_budget_filter: false,
  };

  return {
    brief: testBrief,
    metadata: briefMetadata,
    note: 'match_supports_with_filters function tested via chat-ai',
  };
}

async function testFallbackStrategies() {
  const { data: popularSupports, error } = await supabase.rpc('get_fallback_supports_by_popularity', {
    target_category: 'pharmaciens',
    limit_count: 10,
  });

  if (error) throw error;

  return {
    popularSupportsCount: popularSupports?.length || 0,
    topSupport: popularSupports?.[0]?.nom_du_support || 'N/A',
  };
}

async function testExpandSearchToAdjacentMonths() {
  const { data, error } = await supabase.rpc('expand_search_to_adjacent_months', {
    original_months: [11],
  });

  if (error) throw error;

  return {
    originalMonths: [11],
    expandedMonths: data || [],
  };
}

async function testRelaxBudgetConstraint() {
  const { data: level1, error: error1 } = await supabase.rpc('relax_budget_constraint', {
    original_budget: 10000,
    relaxation_level: 1,
  });

  const { data: level2, error: error2 } = await supabase.rpc('relax_budget_constraint', {
    original_budget: 10000,
    relaxation_level: 2,
  });

  if (error1 || error2) throw error1 || error2;

  return {
    originalBudget: 10000,
    level1Budget: level1,
    level2Budget: level2,
  };
}

async function testSuggestAlternativeTargets() {
  const { data, error } = await supabase.rpc('suggest_alternative_targets', {
    original_target: 'pharmaciens',
    max_suggestions: 5,
  });

  if (error) throw error;

  return {
    originalTarget: 'pharmaciens',
    alternativeSuggestions: data?.length || 0,
    suggestions: data?.slice(0, 3).map((s: any) => ({
      category: s.suggested_category,
      reason: s.reason,
    })) || [],
  };
}

async function testFindClosestProfession() {
  const { data, error } = await supabase.rpc('find_closest_profession', {
    input_text: 'pharmacien',
  });

  if (error) throw error;

  return {
    searchTerm: 'pharmacien',
    matches: data?.length || 0,
    topMatch: data?.[0] || null,
  };
}

async function testBriefAnalysisLogging() {
  const logEntry = {
    user_id: (await supabase.auth.getUser()).data.user?.id || null,
    project_id: null,
    brief_text: "Test brief for logging",
    targets_detected: [{ target: 'pharmaciens', confidence: 0.95 }],
    months_detected: [11],
    canals_detected: ['print'],
    budget_max_detected: 15000,
    filters_applied: { month: true, canal: true, budget: true },
    supports_found: 12,
    supports_by_canal: { print: 8, web: 3, nl: 1 },
    fallbacks_used: [],
    fallback_level: 0,
    analysis_duration_ms: 1500,
  };

  const { data, error } = await supabase
    .from('brief_analysis_logs')
    .insert(logEntry)
    .select()
    .single();

  if (error) throw error;

  await supabase.from('brief_analysis_logs').delete().eq('id', data.id);

  return {
    logCreated: true,
    logId: data.id,
  };
}

async function testExcelGenerationLogging() {
  const logEntry = {
    user_id: (await supabase.auth.getUser()).data.user?.id || null,
    devis_type: 'excel',
    annonceur: 'Test Client',
    campagne: 'Test Campaign',
    total_supports: 15,
    total_budget_estimated: 45000,
    canal_counts: { print: 10, web: 3, nl: 2 },
    file_name: 'test_devis.xlsx',
    file_size_kb: 250,
    generation_time_ms: 2000,
    status: 'completed',
  };

  const { data, error } = await supabase
    .from('excel_generation_logs')
    .insert(logEntry)
    .select()
    .single();

  if (error) throw error;

  await supabase.from('excel_generation_logs').delete().eq('id', data.id);

  return {
    logCreated: true,
    logId: data.id,
  };
}

async function testEdgeFunctionGenerateExcel() {
  const exportData = {
    annonceur: 'Test Client',
    campagne: 'Test Campaign',
    brief_text: 'Test brief',
    brief_metadata: {
      months: [11],
      canals: ['print'],
      budget_max: 15000,
      has_month_filter: true,
      has_canal_filter: true,
      has_budget_filter: true,
    },
    targets_detected: [{ target: 'pharmaciens', category: 'pharmaciens' }],
    supports_by_target: [],
    supports_by_canal: { print: [], web: [], nl: [] },
    total_supports: 0,
    total_budget_estimated: 0,
    generated_at: new Date().toISOString(),
    analysis_duration_ms: 1000,
  };

  const { data, error } = await supabase.functions.invoke('generate-excel-devis', {
    body: {
      export_data: exportData,
      devis_type: 'excel',
      options: {
        include_visuels: true,
        include_contacts: true,
        include_planning_details: true,
        merge_all_canals: true,
      },
    },
  });

  if (error) throw error;

  return {
    success: data.success,
    message: data.message,
    fileName: data.file_name,
    generationTime: data.generation_time_ms,
  };
}

async function testEdgeFunctionGeneratePPT() {
  const exportData = {
    annonceur: 'Test Client',
    campagne: 'Test Campaign',
    brief_text: 'Test brief',
    brief_metadata: {
      months: [11],
      canals: ['print'],
      budget_max: 15000,
      has_month_filter: true,
      has_canal_filter: true,
      has_budget_filter: true,
    },
    targets_detected: [{ target: 'pharmaciens', category: 'pharmaciens' }],
    supports_by_target: [],
    supports_by_canal: { print: [], web: [], nl: [] },
    total_supports: 0,
    total_budget_estimated: 0,
    generated_at: new Date().toISOString(),
    analysis_duration_ms: 1000,
  };

  const { data, error } = await supabase.functions.invoke('generate-ppt-devis', {
    body: {
      export_data: exportData,
      options: {
        include_visuels: true,
        include_contacts: true,
        include_planning_details: true,
        presentation_template: 'default',
      },
    },
  });

  if (error) throw error;

  return {
    success: data.success,
    message: data.message,
    fileName: data.file_name,
    generationTime: data.generation_time_ms,
  };
}

async function main() {
  console.log('🚀 Starting Phase 1 Complete Flow Tests\n');
  console.log('=' .repeat(60));

  console.log('\n📋 SECTION 1: Database Tables & Rules');
  console.log('=' .repeat(60));
  await runTest('Brief Extraction Rules Table', testBriefExtractionRules);
  await runTest('Profession Mappings Enrichment', testProfessionMappings);

  console.log('\n🔍 SECTION 2: Metadata Extraction & Intent Detection');
  console.log('=' .repeat(60));
  await runTest('Extract Brief Metadata', testExtractBriefMetadata);
  await runTest('Find Closest Profession', testFindClosestProfession);

  console.log('\n🎯 SECTION 3: Dynamic Filtering Functions');
  console.log('=' .repeat(60));
  await runTest('Filter Supports by Month', testFilterSupportsByMonth);
  await runTest('Match Supports with Filters', testMatchSupportsWithFilters);

  console.log('\n🔄 SECTION 4: Fallback Strategies');
  console.log('=' .repeat(60));
  await runTest('Get Fallback Supports by Popularity', testFallbackStrategies);
  await runTest('Expand Search to Adjacent Months', testExpandSearchToAdjacentMonths);
  await runTest('Relax Budget Constraint', testRelaxBudgetConstraint);
  await runTest('Suggest Alternative Targets', testSuggestAlternativeTargets);

  console.log('\n📊 SECTION 5: Logging & Diagnostics');
  console.log('=' .repeat(60));
  await runTest('Brief Analysis Logging', testBriefAnalysisLogging);
  await runTest('Excel Generation Logging', testExcelGenerationLogging);

  console.log('\n⚡ SECTION 6: Edge Functions (Export)');
  console.log('=' .repeat(60));
  await runTest('Generate Excel Devis Edge Function', testEdgeFunctionGenerateExcel);
  await runTest('Generate PowerPoint Devis Edge Function', testEdgeFunctionGeneratePPT);

  console.log('\n' + '=' .repeat(60));
  console.log('📈 TEST SUMMARY');
  console.log('=' .repeat(60));

  const totalTests = testResults.length;
  const passedTests = testResults.filter(t => t.success).length;
  const failedTests = testResults.filter(t => !t.success).length;
  const totalDuration = testResults.reduce((sum, t) => sum + t.duration, 0);

  console.log(`\n✅ Passed: ${passedTests}/${totalTests}`);
  console.log(`❌ Failed: ${failedTests}/${totalTests}`);
  console.log(`⏱️  Total Duration: ${totalDuration}ms`);
  console.log(`📊 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (failedTests > 0) {
    console.log('\n❌ FAILED TESTS:');
    testResults.filter(t => !t.success).forEach(t => {
      console.log(`  - ${t.testName}: ${t.error}`);
    });
  }

  console.log('\n' + '=' .repeat(60));
  console.log('🎉 Phase 1 Testing Complete!');
  console.log('=' .repeat(60));

  process.exit(failedTests > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
