import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSimplifiedFlow() {
  console.log('🧪 Testing Simplified Search Flow');
  console.log('================================\n');

  const testBrief = "Je veux toucher les collectivités locales";

  console.log(`📝 Test Brief: "${testBrief}"\n`);

  try {
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/chat-ai`;

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: testBrief }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge function failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    console.log('✅ Edge Function Response Received\n');
    console.log('📊 Results Summary:');
    console.log(`   - Total Matches: ${result.totalMatches || 0}`);
    console.log(`   - Vector Results: ${result.vectorResults?.length || 0}`);
    console.log(`   - AI Message Length: ${result.message?.content?.length || 0} chars\n`);

    if (result.vectorResults && result.vectorResults.length > 0) {
      console.log('🎯 Sample Results (first 5):');
      result.vectorResults.slice(0, 5).forEach((support: any, idx: number) => {
        console.log(`\n${idx + 1}. ${support.support || 'Unknown'}`);
        console.log(`   Canal: ${support.canal || 'N/A'}`);
        console.log(`   Categorie: ${support.categorie || 'N/A'}`);
        console.log(`   Similarity: ${support.similarity ? (support.similarity * 100).toFixed(1) + '%' : 'N/A'}`);
        console.log(`   Threshold Used: ${support.threshold_used || 'N/A'}`);
      });
    }

    console.log('\n💬 AI Response Preview:');
    console.log(result.message?.content?.substring(0, 500) || 'No AI response');

    console.log('\n✅ Test Completed Successfully!');
    console.log('\n📌 Key Observations:');
    console.log('   - The system should return ALL supports found for the target');
    console.log('   - NO filtering by channel/date/price at this stage');
    console.log('   - User can refine in subsequent conversation');

  } catch (error) {
    console.error('❌ Test Failed:', error);
    throw error;
  }
}

testSimplifiedFlow()
  .then(() => {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test suite failed:', error);
    process.exit(1);
  });
