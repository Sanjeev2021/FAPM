import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scripts = [
  'import-00-supports-master.ts',
  'import-01-supports-variants.ts',
  'import-02-planning-kits.ts',
  'import-03-visuels.ts',
  'import-04-contacts.ts'
];

async function runAllImports() {
  console.log('\n🚀 PLS Data Import - Full Pipeline\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;

  for (const script of scripts) {
    console.log(`\n▶️  Running ${script}...`);
    console.log('─────────────────────────────────────────────────────────────\n');

    try {
      const scriptPath = resolve(__dirname, script);
      execSync(`npx tsx ${scriptPath}`, {
        stdio: 'inherit',
        cwd: resolve(__dirname, '../..')
      });
      successCount++;
      console.log(`\n✅ ${script} completed successfully\n`);
    } catch (error) {
      errorCount++;
      console.error(`\n❌ ${script} failed with error\n`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('\n📊 IMPORT SUMMARY\n');
  console.log(`   Total scripts: ${scripts.length}`);
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed: ${errorCount}`);
  console.log(`   Duration: ${duration}s`);
  console.log('\n═══════════════════════════════════════════════════════════════\n');

  if (errorCount > 0) {
    console.error('⚠️  Some imports failed. Check the logs above for details.\n');
    process.exit(1);
  } else {
    console.log('🎉 All imports completed successfully!\n');
  }
}

runAllImports().catch(console.error);
