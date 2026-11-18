const path = require('path');
const express = require('express');
const cors = require('cors');
const customerRoutes = require('./routes/customerRoutes');
const providerRoutes = require('./routes/providerRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const createRateLimiter = require('./middleware/rateLimit');
const { checkDatabaseHealth } = require('./config/database');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const isServerless = Boolean(process.env.VERCEL);
app.disable('x-powered-by');
if (isProduction || isServerless) {
  app.set('trust proxy', 1);
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 50 });
const port = Number(process.env.PORT) || 3000;
const devOrigins = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5501',
  'http://127.0.0.1:5501',
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`
];

const configuredOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const allowedOrigins = isProduction && configuredOrigins.length > 0
  ? Array.from(new Set(configuredOrigins))
  : Array.from(new Set([...devOrigins, ...configuredOrigins]));

app.use(cors((req, callback) => {
  const origin = req.get('origin');
  const normalized = origin ? origin.replace(/\/$/, '') : '';
  const host = (req.get('host') || '').trim();
  const isSameOrigin = Boolean(
    normalized &&
    host &&
    (normalized === `http://${host}` || normalized === `https://${host}`)
  );

  if (!normalized || isSameOrigin || allowedOrigins.includes(normalized)) {
    return callback(null, {
      origin: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      optionsSuccessStatus: 204
    });
  }
  return callback(new Error('CORS origin is not allowed.'));
}));

app.use(express.json({ limit: '1mb' }));

// Serve static frontend files
app.use(express.static(path.resolve(__dirname, '../frontend')));

app.get('/favicon.ico', (req, res) => {
  res.type('image/svg+xml').sendFile(path.resolve(__dirname, '../frontend/favicon.svg'));
});

app.get('/api/live', (req, res) => {
  res.json({
    success: true,
    status: 'alive',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    application: 'ServiceHub API'
  });
});

async function handleReadinessCheck(req, res) {
  const dbHealth = await checkDatabaseHealth();
  if (!dbHealth.connected) {
    return res.status(503).json({
      success: false,
      status: 'degraded',
      database: 'disconnected',
      application: 'ServiceHub API (MySQL / Prisma)',
      message: 'API is reachable, but the MySQL database is currently disconnected.'
    });
  }

  return res.json({
    success: true,
    status: 'ok',
    database: 'connected',
    application: 'ServiceHub API (MySQL / Prisma)'
  });
}

app.get('/api/health', handleReadinessCheck);
app.get('/api/ready', handleReadinessCheck);

app.get('/api/db-debug', async (req, res) => {
  const dbHealth = await checkDatabaseHealth();
  const rawUrl = process.env.DATABASE_URL || '';
  res.json({
    connected: dbHealth.connected,
    errorCode: dbHealth.errorCode || null,
    reason: dbHealth.reason || null,
    hasDatabaseUrl: Boolean(rawUrl),
    urlLength: rawUrl.length,
    urlStartsWith: rawUrl.slice(0, 10),
    hostDetected: dbHealth.host || null,
    portDetected: dbHealth.port || null,
    nodeEnv: process.env.NODE_ENV || null,
    isVercel: Boolean(process.env.VERCEL)
  });
});

app.get('/api', async (req, res) => {
  const dbHealth = await checkDatabaseHealth();
  res.status(dbHealth.connected ? 200 : 503).json({
    success: dbHealth.connected,
    message: dbHealth.connected
      ? 'ServiceHub API is running and connected to MySQL via Prisma.'
      : 'ServiceHub API is running, but the MySQL database is currently disconnected.',
    database: dbHealth.connected ? 'connected' : 'disconnected',
    endpoints: ['/api/customers', '/api/providers', '/api/bookings', '/api/admin']
  });
});

app.use(['/api/customers/login', '/api/customers/register', '/api/providers/login', '/api/providers/register', '/api/admin/login'], authLimiter);
app.use('/api/customers', customerRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
