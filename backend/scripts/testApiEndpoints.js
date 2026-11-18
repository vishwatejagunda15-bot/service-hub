const app = require('../app');
const http = require('http');

async function runApiTests() {
  console.log('=== ServiceHub API Endpoints, Security & Middleware Validation ===\n');
  const server = http.createServer(app);
  let failures = 0;

  function assert(label, condition, detail) {
    if (condition) {
      console.log(`✓ [PASS] ${label}${detail ? ' — ' + detail : ''}`);
    } else {
      failures++;
      console.error(`✗ [FAIL] ${label}${detail ? ' — ' + detail : ''}`);
    }
  }

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  async function req(method, path, body, headers = {}) {
    const opts = { method, headers: { ...headers } };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(base + path, opts);
    const data = await res.json();
    return { status: res.status, headers: res.headers, data };
  }

  try {
    // 1. Liveness, Health & Readiness Probes + Security Headers
    const live = await req('GET', '/api/live');
    assert('Liveness Probe (/api/live) Returns 200', live.status === 200 && live.data.status === 'alive', `uptime=${live.data.uptimeSeconds}s`);

    const health = await req('GET', '/api/health');
    const healthIsTruthful =
      (health.status === 200 && health.data.status === 'ok' && health.data.database === 'connected') ||
      (health.status === 503 && health.data.status === 'degraded' && health.data.database === 'disconnected');
    assert('Health Check Reports Accurate DB Readiness', healthIsTruthful, `HTTP ${health.status} / db=${health.data.database}`);

    const ready = await req('GET', '/api/ready');
    assert('Readiness Probe (/api/ready) Matches Health Status', ready.status === health.status && ready.data.database === health.data.database, `HTTP ${ready.status} / db=${ready.data.database}`);
    assert('X-Powered-By Disabled', !health.headers.get('x-powered-by'));
    assert('Security Header X-Content-Type-Options', health.headers.get('x-content-type-options') === 'nosniff');
    assert('Security Header X-Frame-Options', health.headers.get('x-frame-options') === 'DENY');

    // 2. API Root
    const root = await req('GET', '/api');
    const rootIsTruthful =
      (root.status === 200 && root.data.database === 'connected') ||
      (root.status === 503 && root.data.database === 'disconnected');
    assert('API Root Reports Accurate DB Readiness & Endpoints', rootIsTruthful && root.data.endpoints.includes('/api/admin'), `HTTP ${root.status} / ${root.data.endpoints.join(', ')}`);

    // 3. Input Validations
    const custReg = await req('POST', '/api/customers/register', {});
    assert('Customer Register Validation', custReg.status === 400, custReg.data.message);

    const custLogin = await req('POST', '/api/customers/login', {});
    assert('Customer Login Validation', custLogin.status === 400, custLogin.data.message);

    const provReg = await req('POST', '/api/providers/register', {});
    assert('Provider Register Validation', provReg.status === 400, provReg.data.message);

    const provLogin = await req('POST', '/api/providers/login', {});
    assert('Provider Login Validation', provLogin.status === 400, provLogin.data.message);

    // 4. Strict Integer ID Validation (rejects 0, negative, float, text)
    const badIdZero = await req('GET', '/api/providers/0');
    assert('Invalid Provider ID (0) Rejected', badIdZero.status === 400, badIdZero.data.message);

    const badIdFloat = await req('GET', '/api/providers/1.5');
    assert('Invalid Provider ID (1.5) Rejected', badIdFloat.status === 400, badIdFloat.data.message);

    const badCategory = await req('GET', '/api/providers?category=InvalidCat');
    assert('Invalid Category Filter Rejected', badCategory.status === 400, badCategory.data.message);

    // 5. Auth & Role Protection
    const unauth = await req('GET', '/api/customers/me');
    assert('Protected Customer Route Token Enforcement', unauth.status === 401, unauth.data.message);

    const badToken = await req('GET', '/api/customers/me', undefined, { Authorization: 'Bearer bad.token.here' });
    assert('Invalid Token Rejection', badToken.status === 401, badToken.data.message);

    const adminMe = await req('GET', '/api/admin/me');
    assert('Protected Admin /me Route Enforcement', adminMe.status === 401, adminMe.data.message);

    const adminStats = await req('GET', '/api/admin/stats');
    assert('Protected Admin /stats Route Enforcement', adminStats.status === 401, adminStats.data.message);

    // 6. 404 Handler
    const notFound = await req('GET', '/api/unknown-route');
    assert('404 Route Handler', notFound.status === 404, notFound.data.message);

    console.log('\n================================================================');
    if (failures === 0) {
      console.log('ALL 17 API, SECURITY & VALIDATION TESTS PASSED!');
    } else {
      console.error(`${failures} TEST(S) FAILED!`);
      process.exitCode = 1;
    }
    console.log('================================================================');
  } finally {
    server.close();
  }
}

runApiTests();
