const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const app = require('../app');

const frontendDir = path.resolve(__dirname, '../../frontend');
const frontendJsDir = path.join(frontendDir, 'js');

let passed = 0;
let failed = 0;

function assert(label, ok, detail) {
  if (ok) {
    passed++;
    console.log(`✓ [PASS] ${label}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    console.error(`✗ [FAIL] ${label}${detail ? ' — ' + detail : ''}`);
  }
}

async function run() {
  console.log('=== ServiceHub Frontend-to-Backend Integration Verification ===\n');

  // 1. Check zero raw ._id references outside api.js
  const jsFiles = fs.readdirSync(frontendJsDir).filter((f) => f.endsWith('.js'));
  const rawIdFiles = jsFiles.filter((f) => {
    if (f === 'api.js') return false;
    return fs.readFileSync(path.join(frontendJsDir, f), 'utf8').includes('._id');
  });
  assert('Canonical ID usage (no raw ._id outside api.js)', rawIdFiles.length === 0, rawIdFiles.length ? rawIdFiles.join(', ') : '0 raw ._id refs');

  // 2. Verify all document.getElementById(...) in JS exist in matching HTML
  const pairs = [
    ['auth.js', ['register.html', 'login.html']],
    ['provider-auth.js', ['provider-register.html', 'provider-login.html']],
    ['services.js', ['services.html']],
    ['provider-details.js', ['provider-details.html']],
    ['service-booking.js', ['service-booking.html']],
    ['my-bookings.js', ['my-bookings.html']],
    ['customer-dashboard.js', ['customer-dashboard.html']],
    ['provider-dashboard.js', ['provider-dashboard.html']],
    ['provider-bookings.js', ['provider-bookings.html']],
    ['provider-profile.js', ['provider-profile.html']],
    ['admin-auth.js', ['admin-login.html']],
    ['admin-dashboard.js', ['admin-dashboard.html']]
  ];

  const missingIds = [];
  for (const [js, htmls] of pairs) {
    const code = fs.readFileSync(path.join(frontendJsDir, js), 'utf8');
    const html = htmls.map((h) => fs.readFileSync(path.join(frontendDir, h), 'utf8')).join('\n');
    const re = /getElementById\(['"]([^'"]+)['"]\)/g;
    let match;
    const seen = new Set();
    while ((match = re.exec(code)) !== null) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        if (!html.includes(`id="${match[1]}"`)) {
          missingIds.push(`${js} -> #${match[1]}`);
        }
      }
    }
  }
  assert('HTML element ID integrity across all 9 page scripts', missingIds.length === 0, missingIds.length ? missingIds.join(', ') : '100% matched');

  // 3. Verify form field names in JS match HTML name attributes
  const formPairs = [
    ['auth.js', ['register.html', 'login.html']],
    ['provider-auth.js', ['provider-register.html', 'provider-login.html']],
    ['service-booking.js', ['service-booking.html']],
    ['customer-dashboard.js', ['customer-dashboard.html']],
    ['provider-profile.js', ['provider-profile.html']],
    ['admin-auth.js', ['admin-login.html']]
  ];
  const missingFields = [];
  for (const [js, htmls] of formPairs) {
    const code = fs.readFileSync(path.join(frontendJsDir, js), 'utf8');
    const html = htmls.map((h) => fs.readFileSync(path.join(frontendDir, h), 'utf8')).join('\n');
    const re = /\.elements\.([a-zA-Z0-9_]+)/g;
    let match;
    const seen = new Set();
    while ((match = re.exec(code)) !== null) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        if (!html.includes(`name="${match[1]}"`)) {
          missingFields.push(`${js} -> name="${match[1]}"`);
        }
      }
    }
  }
  assert('Form field name integrity across all form scripts', missingFields.length === 0, missingFields.length ? missingFields.join(', ') : '100% matched');

  // 4. Verify api.js resolveApiRoot across local dev, Live Server, Express, and production
  const apiCode = fs.readFileSync(path.join(frontendJsDir, 'api.js'), 'utf8');
  function testApiRoot(loc, override) {
    const ctx = {
      window: { location: loc, SERVICEHUB_API_URL: override },
      document: { querySelector: () => null },
      sessionStorage: { getItem: () => null, setItem: () => { }, removeItem: () => { } }
    };
    vm.runInNewContext(apiCode, ctx);
    return ctx.window.ServiceHubApi;
  }

  assert('API URL: Live Server localhost:5500 -> localhost:3000/api', testApiRoot({ origin: 'http://localhost:5500', protocol: 'http:', hostname: 'localhost', port: '5500' }).apiRoot === 'http://localhost:3000/api');
  assert('API URL: Live Server 127.0.0.1:5500 -> 127.0.0.1:3000/api', testApiRoot({ origin: 'http://127.0.0.1:5500', protocol: 'http:', hostname: '127.0.0.1', port: '5500' }).apiRoot === 'http://127.0.0.1:3000/api');
  assert('API URL: Express same-origin :3000 -> localhost:3000/api', testApiRoot({ origin: 'http://localhost:3000', protocol: 'http:', hostname: 'localhost', port: '3000' }).apiRoot === 'http://localhost:3000/api');
  assert('API URL: Production HTTPS domain -> same-origin /api', testApiRoot({ origin: 'https://servicehub.example.com', protocol: 'https:', hostname: 'servicehub.example.com', port: '' }).apiRoot === 'https://servicehub.example.com/api');
  assert('API URL: Explicit SERVICEHUB_API_URL override', testApiRoot({ origin: 'https://servicehub.example.com', protocol: 'https:', hostname: 'servicehub.example.com', port: '' }, 'https://api.example.com/api/').apiRoot === 'https://api.example.com/api');
  assert('API URL: file:// protocol fallback -> localhost:3000/api', testApiRoot({ origin: 'null', protocol: 'file:', hostname: '', port: '' }).apiRoot === 'http://localhost:3000/api');

  const apiHelper = testApiRoot({ origin: 'http://localhost:3000', protocol: 'http:', hostname: 'localhost', port: '3000' });
  assert('API Helper: getId resolves numeric id and _id consistently', apiHelper.getId({ id: 42 }) === '42' && apiHelper.getId({ _id: '99' }) === '99' && apiHelper.getId(null) === '');

  // 4b. Verify all HTML pages include ui-polish.css, viewport meta, and have zero broken local links/assets
  const allHtmlFiles = fs.readdirSync(frontendDir).filter((f) => f.endsWith('.html'));
  const brokenLinks = [];
  const missingDesignSystem = [];
  const missingViewport = [];
  for (const h of allHtmlFiles) {
    const content = fs.readFileSync(path.join(frontendDir, h), 'utf8');
    if (!content.includes('css/ui-polish.css')) missingDesignSystem.push(h);
    if (!content.includes('name="viewport"')) missingViewport.push(h);
    const linkRe = /(?:href|src)="([^"]+)"/g;
    let m;
    while ((m = linkRe.exec(content)) !== null) {
      const raw = m[1];
      if (raw.startsWith('http') || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.includes('{{')) continue;
      const clean = raw.split('?')[0].split('#')[0];
      if (clean && !fs.existsSync(path.join(frontendDir, clean))) {
        brokenLinks.push(`${h} -> ${raw}`);
      }
    }
  }
  assert('UI Asset Integrity: Zero broken local HTML/CSS/JS links', brokenLinks.length === 0, brokenLinks.length ? brokenLinks.join(', ') : `${allHtmlFiles.length} pages scanned`);
  assert('Design System Coverage: All pages load css/ui-polish.css', missingDesignSystem.length === 0, `${allHtmlFiles.length}/${allHtmlFiles.length} pages`);
  assert('Responsive Viewport: All pages declare viewport meta tag', missingViewport.length === 0, `${allHtmlFiles.length}/${allHtmlFiles.length} pages`);

  // 5. Verify CORS preflight & static page delivery on Express server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const corsOk = await fetch(base + '/api/providers', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5500', 'Access-Control-Request-Method': 'GET' }
    });
    assert('CORS: Preflight allows http://localhost:5500', corsOk.status === 204 && corsOk.headers.get('access-control-allow-origin') === 'http://localhost:5500');

    const corsBad = await fetch(base + '/api/providers', {
      method: 'GET',
      headers: { Origin: 'https://malicious.example.net' }
    });
    assert('CORS: Rejects untrusted origin with 403', corsBad.status === 403);

    const htmlPages = ['index.html', 'register.html', 'login.html', 'services.html', 'provider-details.html', 'service-booking.html', 'my-bookings.html', 'customer-dashboard.html', 'provider-register.html', 'provider-login.html', 'provider-dashboard.html', 'provider-bookings.html', 'provider-profile.html', 'admin-login.html', 'admin-dashboard.html'];
    let all200 = true;
    for (const page of htmlPages) {
      const r = await fetch(base + '/' + page);
      if (r.status !== 200) all200 = false;
    }
    assert('Static Frontend Delivery: All 15 HTML pages return HTTP 200', all200, `${htmlPages.length} pages checked`);
  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`FRONTEND-BACKEND INTEGRATION CHECKS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');
  if (failed > 0) process.exitCode = 1;
}

run();
