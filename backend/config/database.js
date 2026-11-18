const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const mysql = require('mysql2/promise');

// Redact credentials from any error message or log output
function redactCredentials(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/(mysql2?:\/\/[^:\s/]+:)([^@\s]+)(@)/gi, '$1***$3')
    .replace(/(password\s*[:=]\s*)([^\s,;]+)/gi, '$1***');
}

function parseDatabaseConfig() {
  const url = process.env.DATABASE_URL || process.env.MYSQL_URI;
  const isProdOrServerless = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

  if (url && (url.startsWith('mysql://') || url.startsWith('mysql2://'))) {
    try {
      const parsed = new URL(url);
      const sslParam = (
        parsed.searchParams.get('sslaccept') ||
        parsed.searchParams.get('ssl-mode') ||
        parsed.searchParams.get('sslmode') ||
        parsed.searchParams.get('ssl') ||
        parsed.searchParams.get('tls') ||
        ''
      ).toLowerCase();
      const host = parsed.hostname || '127.0.0.1';
      const isTiDbCloud = host.endsWith('.tidbcloud.com');
      const useSsl = isTiDbCloud ||
        ['strict', 'required', 'require', 'true', '1', 'verify_identity', 'verify_ca'].includes(sslParam) ||
        sslParam.includes('true');

      // Normalize TiDB Cloud URL for Prisma (require sslaccept=strict & serverless connection limit)
      let effectiveUrl = url;
      if (isTiDbCloud) {
        if (!parsed.searchParams.has('sslaccept')) {
          parsed.searchParams.set('sslaccept', 'strict');
        }
        if (process.env.VERCEL && !parsed.searchParams.has('connection_limit')) {
          parsed.searchParams.set('connection_limit', '5');
        }
        effectiveUrl = parsed.toString();
        process.env.DATABASE_URL = effectiveUrl;
      }

      return {
        host,
        port: Number(parsed.port) || 3306,
        user: decodeURIComponent(parsed.username || 'root'),
        password: decodeURIComponent(parsed.password || ''),
        database: (parsed.pathname || '/servicehub').replace(/^\//, '') || 'servicehub',
        useSsl,
        url: effectiveUrl,
        configured: true
      };
    } catch (_) {
      throw new Error('DATABASE_URL is not a valid MySQL URL.');
    }
  }

  if (isProdOrServerless && !process.env.DB_HOST) {
    return {
      host: 'unconfigured',
      port: 3306,
      user: 'unconfigured',
      password: '',
      database: 'servicehub',
      useSsl: true,
      url: '',
      configured: false
    };
  }

  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT) || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '';
  const database = process.env.DB_NAME || 'servicehub';
  const constructedUrl = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;

  return {
    host,
    port,
    user,
    password,
    database,
    useSsl: false,
    url: constructedUrl,
    configured: true
  };
}

const dbConfig = parseDatabaseConfig();

// Ensure process.env.DATABASE_URL is populated for Prisma Client when configured
if (!process.env.DATABASE_URL && dbConfig.url) {
  process.env.DATABASE_URL = dbConfig.url;
}

// Reuse a single PrismaClient across warm serverless invocations and dev reloads
const prisma = globalThis.__servicehubPrisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
});
if (!globalThis.__servicehubPrisma) {
  globalThis.__servicehubPrisma = prisma;
}

let shutdownRegistered = false;
function registerShutdownHooks() {
  if (shutdownRegistered) return;
  shutdownRegistered = true;
  const shutdown = async () => {
    await prisma.$disconnect().catch(() => {});
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

// Non-destructive database creation (never drops or resets existing tables/data)
async function ensureDatabaseExists() {
  if (!/^[a-zA-Z0-9_]+$/.test(dbConfig.database)) {
    throw new Error('Invalid database name in environment configuration. Use only letters, numbers, and underscores.');
  }

  const connOptions = {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    connectTimeout: dbConfig.useSsl ? 10000 : 5000
  };
  if (dbConfig.useSsl) {
    connOptions.ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
  }

  let connection;
  try {
    connection = await mysql.createConnection(connOptions);
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    return { createdOrVerified: true };
  } catch (error) {
    // Allow restricted cloud users without CREATE DATABASE privilege to proceed if the database already exists
    if (error && (error.code === 'ER_DBACCESS_DENIED_ERROR' || error.code === 'ER_SPECIFIC_ACCESS_DENIED_ERROR')) {
      return { createdOrVerified: false, skippedPrivilege: true };
    }
    throw formatDatabaseError(error);
  } finally {
    if (connection) {
      await connection.end().catch(() => {});
    }
  }
}

function formatDatabaseError(error) {
  const code = (error && (error.code || (error.original && error.original.code))) || '';
  const rawMsg = error && error.message ? redactCredentials(error.message) : 'MySQL connection failed.';
  let cleanMessage = rawMsg;

  if (code === 'ECONNREFUSED' || code === 'P1001' || rawMsg.includes("Can't reach database server")) {
    cleanMessage = `Could not connect to MySQL server at ${dbConfig.host}:${dbConfig.port}. Please ensure MySQL is running (e.g. XAMPP, WAMP, MySQL Windows Service, or a cloud MySQL host).`;
  } else if (code === 'ER_ACCESS_DENIED_ERROR' || code === 'P1000' || rawMsg.includes('Authentication failed')) {
    cleanMessage = `Authentication failed for MySQL user "${dbConfig.user}" at ${dbConfig.host}:${dbConfig.port}. Please verify DATABASE_URL credentials in backend/.env.`;
  } else if (code === 'ER_BAD_DB_ERROR' || code === 'P1003' || rawMsg.includes('does not exist')) {
    cleanMessage = `MySQL database "${dbConfig.database}" does not exist. Create it or run "npm run db:sync".`;
  } else if (code === 'ETIMEDOUT' || code === 'P1002') {
    cleanMessage = `Timed out connecting to MySQL server at ${dbConfig.host}:${dbConfig.port}. Check network access and firewall rules.`;
  }

  const formatted = new Error(cleanMessage);
  formatted.code = code || 'DB_ERROR';
  return formatted;
}

async function checkDatabaseHealth() {
  if (!dbConfig.configured) {
    return {
      connected: false,
      errorCode: 'DB_NOT_CONFIGURED',
      reason: 'DATABASE_URL environment variable is not configured.'
    };
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { connected: true, host: dbConfig.host, port: dbConfig.port, database: dbConfig.database };
  } catch (error) {
    return {
      connected: false,
      errorCode: (error && error.code) || 'DB_UNAVAILABLE',
      reason: formatDatabaseError(error).message
    };
  }
}

async function connectDatabase() {
  registerShutdownHooks();
  try {
    await ensureDatabaseExists();
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log(`Connected to MySQL database "${dbConfig.database}" on ${dbConfig.host}:${dbConfig.port} via Prisma`);
    return prisma;
  } catch (error) {
    throw formatDatabaseError(error);
  }
}

module.exports = {
  prisma,
  connectDatabase,
  ensureDatabaseExists,
  checkDatabaseHealth,
  redactCredentials
};
