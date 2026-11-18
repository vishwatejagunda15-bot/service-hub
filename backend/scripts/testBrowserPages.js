/**
 * Real Headless Chrome Browser E2E Verification Script
 * Drives installed Google Chrome via Chrome DevTools Protocol (native Node WebSocket)
 * to inspect all 14 HTML pages for JS exceptions, broken assets, responsive overflow
 * (Desktop 1440px, Tablet 768px, Mobile 375px), and live form validation behavior.
 */
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const app = require('../app');

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];

function findBrowser() {
  return CHROME_PATHS.find((p) => fs.existsSync(p)) || null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForCdp(port, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (target) return target.webSocketDebuggerUrl;
      }
    } catch (_) {}
    await sleep(200);
  }
  throw new Error('Timed out waiting for headless Chrome DevTools endpoint.');
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
      this.ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(String(ev.data));
        if (msg.id && this.pending.has(msg.id)) {
          const { res, rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message));
          else res(msg.result);
        } else if (msg.method && this.listeners.has(msg.method)) {
          this.listeners.get(msg.method).forEach((fn) => fn(msg.params));
        }
      });
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Evaluation exception');
    }
    return result.result ? result.result.value : undefined;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log('=== ServiceHub Real Headless Browser E2E Verification ===\n');
  const browserPath = findBrowser();
  if (!browserPath) {
    console.error('✗ No Chrome/Edge binary found for headless browser testing.');
    process.exitCode = 1;
    return;
  }

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const serverPort = server.address().port;
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  const cdpPort = 9229;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'servicehub-cdp-'));
  const chrome = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: 'ignore' });

  let cdp;
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

  try {
    const wsUrl = await waitForCdp(cdpPort);
    cdp = new CdpClient(wsUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    let jsExceptions = [];
    let assetFailures = [];

    cdp.on('Runtime.exceptionThrown', (params) => {
      const desc = (params.exceptionDetails && params.exceptionDetails.exception && params.exceptionDetails.exception.description) ||
        (params.exceptionDetails && params.exceptionDetails.text) || 'Unknown JS exception';
      jsExceptions.push(desc);
    });

    cdp.on('Network.responseReceived', (params) => {
      const url = params.response.url || '';
      const status = params.response.status;
      // Only flag local static asset failures (ignore expected 503/401 API calls when MySQL is offline or unauthenticated)
      if (url.startsWith(baseUrl) && !url.includes('/api/') && status >= 400) {
        assetFailures.push(`${status} ${url}`);
      }
    });

    const pages = [
      'index.html',
      'services.html',
      'provider-details.html?id=1',
      'register.html',
      'login.html',
      'service-booking.html?providerId=1',
      'my-bookings.html',
      'customer-dashboard.html',
      'provider-register.html',
      'provider-login.html',
      'provider-dashboard.html',
      'provider-bookings.html',
      'provider-profile.html',
      'admin-login.html',
      'admin-dashboard.html'
    ];

    // 1. Visit all 14 pages at desktop viewport (1440x900)
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    for (const page of pages) {
      jsExceptions = [];
      assetFailures = [];
      await cdp.send('Page.navigate', { url: `${baseUrl}/${page}` });
      await sleep(750);
      const title = await cdp.eval('document.title');
      assert(
        `Browser Load: ${page}`,
        Boolean(title) && jsExceptions.length === 0 && assetFailures.length === 0,
        `title="${title}", jsErrors=${jsExceptions.length}, asset404s=${assetFailures.length}` +
          (jsExceptions.length ? ` [${jsExceptions.join('; ')}]` : '') +
          (assetFailures.length ? ` [${assetFailures.join('; ')}]` : '')
      );
    }

    // 2. Responsive layout overflow check across Desktop (1440), Tablet (768), Mobile (375)
    const responsivePages = ['index.html', 'services.html', 'register.html', 'login.html', 'provider-register.html', 'admin-login.html'];
    const viewports = [
      { name: 'Desktop 1440px', width: 1440, height: 900, mobile: false },
      { name: 'Tablet 768px', width: 768, height: 1024, mobile: false },
      { name: 'Mobile 375px', width: 375, height: 812, mobile: true }
    ];

    for (const vp of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.mobile
      });
      const overflows = [];
      for (const page of responsivePages) {
        await cdp.send('Page.navigate', { url: `${baseUrl}/${page}` });
        await sleep(500);
        const info = await cdp.eval('({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })');
        if (info && info.sw > info.iw + 2) {
          overflows.push(`${page} (scrollWidth=${info.sw} > ${info.iw})`);
        }
      }
      assert(`Responsive Layout (${vp.name}): Zero horizontal overflow`, overflows.length === 0, overflows.length ? overflows.join(', ') : `${responsivePages.length} pages clean`);
    }

    // 3. Interactive Form Validation Tests in Real Browser
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    // Customer register empty submit -> shows #form-message error
    await cdp.send('Page.navigate', { url: `${baseUrl}/register.html` });
    await sleep(600);
    const regValidation = await cdp.eval(`
      (function () {
        var form = document.getElementById('register-form');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        var msg = document.getElementById('form-message');
        return { hidden: msg.hidden, text: msg.textContent, cls: msg.className };
      })()
    `);
    assert('Interactive Form: register.html empty submit displays validation error', !regValidation.hidden && regValidation.cls.includes('error'), regValidation.text);

    // Admin login empty submit -> shows #admin-login-message error
    await cdp.send('Page.navigate', { url: `${baseUrl}/admin-login.html` });
    await sleep(600);
    const adminValidation = await cdp.eval(`
      (function () {
        var form = document.getElementById('admin-login-form');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        var msg = document.getElementById('admin-login-message');
        return { hidden: msg.hidden, text: msg.textContent, cls: msg.className };
      })()
    `);
    assert('Interactive Form: admin-login.html empty submit displays validation error', !adminValidation.hidden && adminValidation.cls.includes('error'), adminValidation.text);

    // Unauthenticated protected page redirect check (my-bookings.html & customer-dashboard.html -> login.html)
    await cdp.send('Page.navigate', { url: `${baseUrl}/my-bookings.html` });
    await sleep(700);
    const redirectedUrl = await cdp.eval('window.location.pathname');
    assert('Protected Page Guard: unauthenticated my-bookings.html redirects to login.html', redirectedUrl.endsWith('/login.html'), redirectedUrl);

    await cdp.send('Page.navigate', { url: `${baseUrl}/customer-dashboard.html` });
    await sleep(700);
    const customerDashRedirect = await cdp.eval('window.location.pathname');
    assert('Protected Page Guard: unauthenticated customer-dashboard.html redirects to login.html', customerDashRedirect.endsWith('/login.html'), customerDashRedirect);

    // Unauthenticated admin-dashboard.html -> admin-login.html
    await cdp.send('Page.navigate', { url: `${baseUrl}/admin-dashboard.html` });
    await sleep(700);
    const adminRedirect = await cdp.eval('window.location.pathname');
    assert('Protected Page Guard: unauthenticated admin-dashboard.html redirects to admin-login.html', adminRedirect.endsWith('/admin-login.html'), adminRedirect);

    console.log('\n================================================================');
    console.log(`REAL HEADLESS BROWSER E2E TESTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');
    if (failed > 0) process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    chrome.kill('SIGTERM');
    server.close();
    await sleep(300);
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch((err) => {
  console.error('Browser test runner crashed:', err.message);
  process.exitCode = 1;
});
