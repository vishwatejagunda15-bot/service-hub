const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
if (!process.env.VERCEL) {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}
const {
  prisma,
  ensureDatabaseExists,
  checkDatabaseHealth,
  redactCredentials
} = require('../config/database');

const BACKEND_DIR = path.resolve(__dirname, '..');
const EXPECTED_TABLES = ['admins', 'bookings', 'customers', 'providers'];

function resolvePrismaCliEntry(backendDir) {
  try {
    const prismaPkgPath = require.resolve('prisma/package.json', { paths: [backendDir] });
    const prismaPkg = require(prismaPkgPath);
    const binField = prismaPkg && prismaPkg.bin;
    const relativeEntry = typeof binField === 'string' ? binField : binField && binField.prisma;
    if (relativeEntry) {
      const candidate = path.resolve(path.dirname(prismaPkgPath), relativeEntry);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  } catch (_) {
    // Fall through to direct node_modules path check
  }

  const fallbackEntry = path.resolve(backendDir, 'node_modules', 'prisma', 'build', 'index.js');
  if (fs.existsSync(fallbackEntry)) {
    return fallbackEntry;
  }

  throw new Error(
    'Local Prisma CLI entry point not found in backend/node_modules/prisma. Run "npm install" inside backend/ first.'
  );
}

function runPrismaCli(args, cwd) {
  const prismaCliEntry = resolvePrismaCliEntry(cwd);
  const result = spawnSync(process.execPath, [prismaCliEntry, ...args], {
    cwd,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (result.stdout) {
    process.stdout.write(redactCredentials(result.stdout));
  }
  if (result.stderr) {
    process.stderr.write(redactCredentials(result.stderr));
  }

  if (result.error) {
    throw new Error(`Failed to launch Prisma CLI via Node (${result.error.code || result.error.message}).`);
  }

  if (result.signal) {
    throw new Error(`Prisma CLI terminated unexpectedly by signal ${result.signal}.`);
  }

  if (result.status !== 0) {
    throw new Error(`Prisma CLI exited with code ${result.status}.`);
  }

  return result;
}

async function listDatabaseTables() {
  const tables = await prisma.$queryRaw`SHOW TABLES`;
  return tables.map((row) => String(Object.values(row)[0])).sort();
}

async function inspectExistingTables() {
  try {
    const tableNames = await listDatabaseTables();
    if (tableNames.length === 0) {
      console.log('No existing tables found in database. Ready for initial non-destructive sync.');
      return;
    }
    console.log('Existing tables detected (preserving all data):', tableNames.join(', '));
  } catch (_) {
    // Database may be empty or not yet synced
  }
}

async function syncDatabase() {
  console.log('=== ServiceHub MySQL Database Creation & Prisma Schema Sync ===\n');
  try {
    console.log('[Step 1/4] Ensuring MySQL database exists (non-destructive)...');
    await ensureDatabaseExists();
    console.log('✓ MySQL database verified.\n');

    console.log('[Step 2/4] Inspecting existing tables to preserve existing data...');
    await prisma.$connect();
    await inspectExistingTables();
    await prisma.$disconnect();
    console.log('');

    console.log('[Step 3/4] Synchronizing Prisma schema safely (no --force-reset, no --accept-data-loss)...');
    runPrismaCli(['db', 'push', '--skip-generate'], BACKEND_DIR);
    console.log('\n✓ Prisma schema synchronized safely.\n');

    console.log('[Step 4/4] Verifying Prisma connectivity and table access...');
    const health = await checkDatabaseHealth();
    if (!health.connected) {
      throw new Error(health.reason || 'Database health check failed after sync.');
    }

    const syncedTables = await listDatabaseTables();
    const missingTables = EXPECTED_TABLES.filter(
      (expected) => !syncedTables.some((actual) => actual.toLowerCase() === expected)
    );
    if (missingTables.length > 0) {
      throw new Error(`Expected MySQL tables are missing after sync: ${missingTables.join(', ')}`);
    }
    console.log('✓ MySQL tables present:', syncedTables.join(', '));

    const [customers, providers, bookings, admins] = await Promise.all([
      prisma.customer.count(),
      prisma.provider.count(),
      prisma.booking.count(),
      prisma.admin.count()
    ]);
    console.log(`✓ Verified table counts — customers: ${customers}, providers: ${providers}, bookings: ${bookings}, admins: ${admins}`);
    await prisma.$disconnect();
  } catch (error) {
    console.error('\n✗ Database synchronization failed:', redactCredentials(error.message || error.name));
    await prisma.$disconnect().catch(() => {});
    process.exitCode = 1;
  }
}

syncDatabase();
