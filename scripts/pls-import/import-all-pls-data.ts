import { execSync } from 'child_process';
import { resolve } from 'path';
import { existsSync } from 'fs';

const dryRun = process.argv.includes('--dry-run');
const dryRunFlag = dryRun ? '--dry-run' : '';

console.log('═══════════════════════════════════════════════════════════');
console.log('  PLS Data Import - Multi-Channel Press Support System');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

if (dryRun) {
  console.log('🔍 DRY RUN MODE - No data will be inserted into database');
  console.log('');
}

const dataDir = resolve(__dirname, '../pls-data');

const requiredFiles = [
  'variants.csv',
  'planning.csv',
  'kits.csv',
  'contacts.csv',
  'visuals.csv'
];

console.log('🔍 Checking for required CSV files...\n');
let allFilesExist = true;

for (const file of requiredFiles) {
  const path = resolve(dataDir, file);
  if (existsSync(path)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} (not found)`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.log('\n❌ Missing required CSV files. Please ensure all files exist in scripts/pls-data/');
  process.exit(1);
}

console.log('\n✅ All required files found\n');

console.log('═══════════════════════════════════════════════════════════');
console.log('  STEP 1/5: Import Variants');
console.log('═══════════════════════════════════════════════════════════');

try {
  execSync(`npx tsx ${resolve(__dirname, 'import-variants.ts')} ${dryRunFlag}`, { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Failed to import variants');
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  STEP 2/5: Import Planning');
console.log('═══════════════════════════════════════════════════════════');

try {
  execSync(`npx tsx ${resolve(__dirname, 'import-planning.ts')} ${dryRunFlag}`, { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Failed to import planning');
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  STEP 3/5: Import Kits');
console.log('═══════════════════════════════════════════════════════════');

try {
  execSync(`npx tsx ${resolve(__dirname, 'import-kits.ts')} ${dryRunFlag}`, { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Failed to import kits');
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  STEP 4/5: Import Contacts');
console.log('═══════════════════════════════════════════════════════════');

try {
  execSync(`npx tsx ${resolve(__dirname, 'import-contacts-visuals.ts')} contacts ${dryRunFlag}`, { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Failed to import contacts');
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  STEP 5/5: Import Visuals');
console.log('═══════════════════════════════════════════════════════════');

try {
  execSync(`npx tsx ${resolve(__dirname, 'import-contacts-visuals.ts')} visuals ${dryRunFlag}`, { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Failed to import visuals');
  process.exit(1);
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  ✅ All imports completed successfully!');
console.log('═══════════════════════════════════════════════════════════\n');

if (dryRun) {
  console.log('💡 To perform actual import, run without --dry-run flag:');
  console.log('   npx tsx scripts/pls-import/import-all-pls-data.ts\n');
}
