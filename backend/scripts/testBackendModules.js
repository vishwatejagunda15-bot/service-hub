/**
 * Isolated Backend Module & HTTP Contract Verification Suite
 *
 * Tests every Express route, controller, middleware, validation rule, ownership guard,
 * status transition, and Prisma error mapping in-process using an in-memory Prisma
 * delegate harness.
 *
 * NOTE: This verifies backend application logic and HTTP contracts ONLY.
 * Live MySQL persistence must be verified separately via "npm run test:mysql".
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const http = require('http');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const errorHandler = require('../middleware/errorHandler');

function createInMemoryPrismaHarness() {
  const store = {
    customers: [],
    providers: [],
    bookings: [],
    admins: []
  };
  const seq = { customers: 1, providers: 1, bookings: 1, admins: 1 };

  function makeNotFoundError() {
    const e = new Error('Record to update or delete does not exist.');
    e.code = 'P2025';
    return e;
  }

  function applySelect(row, select) {
    if (!select) return { ...row };
    const out = {};
    for (const [k, v] of Object.entries(select)) {
      if (v) out[k] = row[k];
    }
    return out;
  }

  function matchesWhere(row, where) {
    if (!where) return true;
    for (const [k, cond] of Object.entries(where)) {
      if (k === 'OR' && Array.isArray(cond)) {
        if (!cond.some((sub) => matchesWhere(row, sub))) return false;
      } else if (cond && typeof cond === 'object' && cond.contains !== undefined) {
        if (!String(row[k] || '').toLowerCase().includes(String(cond.contains).toLowerCase())) return false;
      } else if (row[k] !== cond) {
        return false;
      }
    }
    return true;
  }

  function makeModel(table, uniqueFields = []) {
    return {
      async findUnique({ where }) {
        return store[table].find((r) => matchesWhere(r, where)) || null;
      },
      async findFirst({ where }) {
        return store[table].find((r) => matchesWhere(r, where)) || null;
      },
      async findMany({ where, include, orderBy } = {}) {
        let rows = store[table].filter((r) => matchesWhere(r, where));
        if (orderBy && orderBy.createdAt === 'desc') {
          rows = [...rows].sort((a, b) => b.id - a.id);
        }
        return rows.map((r) => {
          const item = { ...r };
          if (include && include.provider) {
            const p = store.providers.find((x) => x.id === r.providerId) || null;
            item.provider = p ? applySelect(p, include.provider.select) : null;
          }
          if (include && include.customer) {
            const c = store.customers.find((x) => x.id === r.customerId) || null;
            item.customer = c ? applySelect(c, include.customer.select) : null;
          }
          return item;
        });
      },
      async create({ data }) {
        for (const f of uniqueFields) {
          if (store[table].some((r) => r[f] === data[f])) {
            const err = new Error(`Unique constraint failed on ${f}`);
            err.code = 'P2002';
            err.meta = { target: [f] };
            throw err;
          }
        }
        const now = new Date();
        const row = {
          id: seq[table]++,
          confirmedProviderArrivalDate: '',
          confirmedProviderArrivalTime: '',
          ...data,
          createdAt: now,
          updatedAt: now
        };
        store[table].push(row);
        return { ...row };
      },
      async update({ where, data }) {
        const idx = store[table].findIndex((r) => matchesWhere(r, where));
        if (idx === -1) throw makeNotFoundError();
        store[table][idx] = { ...store[table][idx], ...data, updatedAt: new Date() };
        return { ...store[table][idx] };
      },
      async delete({ where }) {
        const idx = store[table].findIndex((r) => matchesWhere(r, where));
        if (idx === -1) throw makeNotFoundError();
        const [removed] = store[table].splice(idx, 1);
        if (table === 'customers') {
          store.bookings = store.bookings.filter((b) => b.customerId !== removed.id);
        } else if (table === 'providers') {
          store.bookings = store.bookings.filter((b) => b.providerId !== removed.id);
        }
        return removed;
      },
      async count({ where } = {}) {
        return store[table].filter((r) => matchesWhere(r, where)).length;
      }
    };
  }

  return {
    store,
    customer: makeModel('customers', ['email']),
    provider: makeModel('providers', ['email']),
    booking: makeModel('bookings', []),
    admin: makeModel('admins', ['email']),
    async $queryRaw() { return [{ 1: 1 }]; }
  };
}

async function run() {
  console.log('=== ServiceHub Backend Module & HTTP Contract Test Suite ===\n');

  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-only-ephemeral-secret-for-module-verification';
  }

  const harness = createInMemoryPrismaHarness();

  // Swap delegates on the shared prisma singleton for isolated controller verification
  Object.assign(db.prisma, {
    customer: harness.customer,
    provider: harness.provider,
    booking: harness.booking,
    admin: harness.admin,
    $queryRaw: harness.$queryRaw
  });

  // Seed one admin directly (testing safe provisioning — login never auto-creates admins)
  const adminPassword = 'StrongAdminPassword!2026';
  await harness.admin.create({
    data: {
      fullName: 'Test Admin',
      email: 'admin@servicehub.test',
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: 'admin'
    }
  });

  const app = require('../app');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  let passed = 0;
  let failed = 0;

  function assert(name, cond, detail) {
    if (cond) {
      passed++;
      console.log(`✓ [PASS] ${name}${detail ? ' — ' + detail : ''}`);
    } else {
      failed++;
      console.error(`✗ [FAIL] ${name}${detail ? ' — ' + detail : ''}`);
    }
  }

  async function req(method, urlPath, body, token) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + urlPath, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  // Future date helper (always tomorrow local date)
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const futureDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  try {
    // --- CUSTOMER MODULE ---
    const cReg1 = await req('POST', '/api/customers/register', {
      fullName: 'Alice Customer',
      email: 'alice@example.com',
      phone: '+1 555 100 1001',
      password: 'Password123!',
      confirmPassword: 'Password123!'
    });
    assert('Customer: Register valid account', cReg1.status === 201 && !!cReg1.data.token && cReg1.data.data.id === '1' && cReg1.data.data._id === '1' && !cReg1.data.data.passwordHash);
    const custToken1 = cReg1.data.token;

    const cRegDup = await req('POST', '/api/customers/register', {
      fullName: 'Alice Clone',
      email: 'ALICE@example.com',
      phone: '+1 555 100 1002',
      password: 'Password123!',
      confirmPassword: 'Password123!'
    });
    assert('Customer: Duplicate email returns 409', cRegDup.status === 409);

    const cReg2 = await req('POST', '/api/customers/register', {
      fullName: 'Bob Customer',
      email: 'bob@example.com',
      phone: '+1 555 100 1002',
      password: 'Password123!',
      confirmPassword: 'Password123!'
    });
    const custToken2 = cReg2.data.token;

    const cLoginBad = await req('POST', '/api/customers/login', { email: 'alice@example.com', password: 'WrongPassword!' });
    assert('Customer: Wrong password returns 401', cLoginBad.status === 401);

    const cLoginOk = await req('POST', '/api/customers/login', { email: 'alice@example.com', password: 'Password123!' });
    assert('Customer: Valid login returns 200 & token', cLoginOk.status === 200 && !!cLoginOk.data.token);

    const cMe = await req('GET', '/api/customers/me', undefined, custToken1);
    assert('Customer: GET /me returns own profile', cMe.status === 200 && cMe.data.data.email === 'alice@example.com');

    const cUpdate = await req('PATCH', '/api/customers/me', { fullName: 'Alice Updated', phone: '+1 555 999 0000' }, custToken1);
    assert('Customer: PATCH /me updates name & phone', cUpdate.status === 200 && cUpdate.data.data.fullName === 'Alice Updated');

    const cUpdateBad = await req('PATCH', '/api/customers/me', { role: 'admin' }, custToken1);
    assert('Customer: PATCH /me blocks unsupported fields (role injection)', cUpdateBad.status === 400);

    // --- PROVIDER MODULE ---
    const pRegBadLoc = await req('POST', '/api/providers/register', {
      fullName: 'Pete Pro', email: 'pete@example.com', phone: '+1 555 200 2001',
      password: 'Password123!', confirmPassword: 'Password123!',
      serviceCategory: 'Electrician', location: 'A', experience: 5, charges: 50, availability: 'Available today'
    });
    assert('Provider: 1-char location rejected with 400', pRegBadLoc.status === 400);

    const pReg1 = await req('POST', '/api/providers/register', {
      fullName: 'Pete Electrician', email: 'pete@example.com', phone: '+1 555 200 2001',
      password: 'Password123!', confirmPassword: 'Password123!',
      serviceCategory: 'Electrician', location: 'Downtown', experience: 5, charges: 50, availability: 'Available today'
    });
    assert('Provider: Register valid account', pReg1.status === 201 && !!pReg1.data.token && pReg1.data.data.charges === 50 && !pReg1.data.data.passwordHash);
    const provToken1 = pReg1.data.token;
    const provId1 = pReg1.data.data.id;

    const pRegDup = await req('POST', '/api/providers/register', {
      fullName: 'Pete Dup', email: 'pete@example.com', phone: '+1 555 200 2002',
      password: 'Password123!', confirmPassword: 'Password123!',
      serviceCategory: 'Electrician', location: 'Downtown', experience: 5, charges: 50, availability: 'Available today'
    });
    assert('Provider: Duplicate email returns 409', pRegDup.status === 409);

    const pReg2 = await req('POST', '/api/providers/register', {
      fullName: 'Paula Plumber', email: 'paula@example.com', phone: '+1 555 200 2003',
      password: 'Password123!', confirmPassword: 'Password123!',
      serviceCategory: 'Plumber', location: 'Uptown', experience: 8, charges: 65, availability: 'Weekends'
    });
    const provToken2 = pReg2.data.token;

    const pLoginOk = await req('POST', '/api/providers/login', { email: 'pete@example.com', password: 'Password123!' });
    assert('Provider: Valid login returns 200', pLoginOk.status === 200 && !!pLoginOk.data.token);

    const pUpdate = await req('PATCH', '/api/providers/me', { experience: '7', charges: '75.50', availability: 'Weekdays, 9am–6pm' }, provToken1);
    assert('Provider: PATCH /me casts numeric strings & updates fields', pUpdate.status === 200 && pUpdate.data.data.experience === 7 && pUpdate.data.data.charges === 75.5);

    const pListCat = await req('GET', '/api/providers?category=Electrician');
    assert('Provider: Filter by category works', pListCat.status === 200 && pListCat.data.count === 1);

    const pListSearch = await req('GET', '/api/providers?q=Uptown');
    assert('Provider: Search by ?q= works', pListSearch.status === 200 && pListSearch.data.count === 1);

    const pById = await req('GET', `/api/providers/${provId1}`);
    assert('Provider: GET /:id returns provider', pById.status === 200 && pById.data.data.fullName === 'Pete Electrician');

    const pByIdMissing = await req('GET', '/api/providers/9999');
    assert('Provider: Non-existent valid ID returns 404', pByIdMissing.status === 404);

    const pByIdInvalid = await req('GET', '/api/providers/not-an-id');
    assert('Provider: Invalid ID syntax returns 400', pByIdInvalid.status === 400);

    // Cross-role isolation checks
    const crossCustOnProv = await req('GET', '/api/providers/me', undefined, custToken1);
    assert('Security: Customer token blocked from provider /me (403)', crossCustOnProv.status === 403);
    const crossProvOnCust = await req('GET', '/api/customers/me', undefined, provToken1);
    assert('Security: Provider token blocked from customer /me (403)', crossProvOnCust.status === 403);

    // --- BOOKING MODULE ---
    const bPast = await req('POST', '/api/bookings', {
      providerId: provId1, customerName: 'Alice', customerPhone: '+1 555 100 1001',
      address: '123 Main St', bookingDate: '2020-01-01', bookingTime: '10:00', description: 'Fix ceiling fan wiring'
    }, custToken1);
    assert('Booking: Past booking date rejected (400)', bPast.status === 400);

    const b1 = await req('POST', '/api/bookings', {
      providerId: provId1, customerName: 'Alice', customerPhone: '+1 555 100 1001',
      address: '123 Main St', bookingDate: futureDate, bookingTime: '14:00', description: 'Fix ceiling fan wiring'
    }, custToken1);
    assert('Booking: Create valid booking (201)', b1.status === 201 && b1.data.data.status === 'Pending' && b1.data.data.customerId === '1' && b1.data.data.providerId === provId1);
    const b1Id = b1.data.data.id;

    const bCustList = await req('GET', '/api/bookings/my', undefined, custToken1);
    assert('Booking: Customer sees own bookings with provider & no passwordHash', bCustList.status === 200 && bCustList.data.count === 1 && !bCustList.data.data[0].provider.passwordHash);

    const bCust2List = await req('GET', '/api/bookings/my', undefined, custToken2);
    assert('Booking: Other customer sees 0 of Alice bookings', bCust2List.status === 200 && bCust2List.data.count === 0);

    const bProvList = await req('GET', '/api/bookings/provider', undefined, provToken1);
    assert('Booking: Provider sees assigned bookings with customer & no passwordHash', bProvList.status === 200 && bProvList.data.count === 1 && !bProvList.data.data[0].customer.passwordHash);

    // Ownership checks
    const bWrongProvAccept = await req('PATCH', `/api/bookings/${b1Id}/accept`, { confirmedArrivalDate: futureDate, confirmedArrivalTime: '14:30' }, provToken2);
    assert('Booking: Unassigned provider cannot accept booking (404)', bWrongProvAccept.status === 404);

    const bWrongCustCancel = await req('PATCH', `/api/bookings/${b1Id}/cancel`, {}, custToken2);
    assert('Booking: Other customer cannot cancel booking (404)', bWrongCustCancel.status === 404);

    // Invalid state transition before accept
    const bCompleteEarly = await req('PATCH', `/api/bookings/${b1Id}/complete`, {}, provToken1);
    assert('Booking: Cannot complete Pending booking (409)', bCompleteEarly.status === 409);

    // Valid accept -> complete lifecycle
    const bAccept = await req('PATCH', `/api/bookings/${b1Id}/accept`, { confirmedArrivalDate: futureDate, confirmedArrivalTime: '14:30' }, provToken1);
    assert('Booking: Provider accepts booking with confirmed arrival (200)', bAccept.status === 200 && bAccept.data.data.status === 'Accepted' && bAccept.data.data.confirmedProviderArrivalTime === '14:30');

    const bReReject = await req('PATCH', `/api/bookings/${b1Id}/reject`, {}, provToken1);
    assert('Booking: Cannot reject Accepted booking (409)', bReReject.status === 409);

    const bComplete = await req('PATCH', `/api/bookings/${b1Id}/complete`, {}, provToken1);
    assert('Booking: Provider marks Accepted booking Completed (200)', bComplete.status === 200 && bComplete.data.data.status === 'Completed');

    const bCancelCompleted = await req('PATCH', `/api/bookings/${b1Id}/cancel`, {}, custToken1);
    assert('Booking: Customer cannot cancel Completed booking (409)', bCancelCompleted.status === 409);

    // Create booking 2 for reject test & booking 3 for cancel test
    const b2 = await req('POST', '/api/bookings', {
      providerId: provId1, customerName: 'Alice', customerPhone: '+1 555 100 1001',
      address: '123 Main St', bookingDate: futureDate, bookingTime: '15:00', description: 'Install porch light'
    }, custToken1);
    const bReject = await req('PATCH', `/api/bookings/${b2.data.data.id}/reject`, {}, provToken1);
    assert('Booking: Provider rejects Pending booking (200)', bReject.status === 200 && bReject.data.data.status === 'Rejected');

    const b3 = await req('POST', '/api/bookings', {
      providerId: provId1, customerName: 'Alice', customerPhone: '+1 555 100 1001',
      address: '123 Main St', bookingDate: futureDate, bookingTime: '16:00', description: 'Check circuit breaker'
    }, custToken1);
    const bCancel = await req('PATCH', `/api/bookings/${b3.data.data.id}/cancel`, {}, custToken1);
    assert('Booking: Customer cancels future Pending booking (200)', bCancel.status === 200 && bCancel.data.data.status === 'Cancelled');

    // --- ADMIN MODULE ---
    const aLoginBad = await req('POST', '/api/admin/login', { email: 'admin@servicehub.test', password: 'WrongPassword!' });
    assert('Admin: Wrong password rejected (401)', aLoginBad.status === 401);

    const aLoginOk = await req('POST', '/api/admin/login', { email: 'admin@servicehub.test', password: adminPassword });
    assert('Admin: Valid login returns 200 & token', aLoginOk.status === 200 && !!aLoginOk.data.token && !aLoginOk.data.data.passwordHash);
    const adminToken = aLoginOk.data.token;

    const aForbidden = await req('GET', '/api/admin/stats', undefined, custToken1);
    assert('Admin: Customer token blocked from /stats (403)', aForbidden.status === 403);

    const aMe = await req('GET', '/api/admin/me', undefined, adminToken);
    assert('Admin: GET /me works (200)', aMe.status === 200 && aMe.data.data.email === 'admin@servicehub.test');

    const aStats = await req('GET', '/api/admin/stats', undefined, adminToken);
    assert('Admin: GET /stats returns accurate counts & categoryBreakdown', aStats.status === 200 && aStats.data.data.totalCustomers === 2 && aStats.data.data.totalProviders === 2 && aStats.data.data.totalBookings === 3 && aStats.data.data.completedBookings === 1 && aStats.data.data.rejectedBookings === 1 && aStats.data.data.cancelledBookings === 1 && Array.isArray(aStats.data.data.categoryBreakdown) && aStats.data.data.categoryBreakdown.length === 6);

    const aCustSearch = await req('GET', '/api/admin/customers?q=Alice', undefined, adminToken);
    assert('Admin: Search customers by ?q= works', aCustSearch.status === 200 && aCustSearch.data.count === 1 && !aCustSearch.data.data[0].passwordHash);

    const aProvFilter = await req('GET', '/api/admin/providers?category=Plumber&q=Uptown', undefined, adminToken);
    assert('Admin: Filter providers by ?category= and ?q= works', aProvFilter.status === 200 && aProvFilter.data.count === 1 && !aProvFilter.data.data[0].passwordHash);

    const aBookFilter = await req('GET', '/api/admin/bookings?status=Completed', undefined, adminToken);
    assert('Admin: Filter bookings by ?status= works', aBookFilter.status === 200 && aBookFilter.data.count === 1 && !aBookFilter.data.data[0].customer.passwordHash && !aBookFilter.data.data[0].provider.passwordHash);

    const aTermTrans = await req('PATCH', `/api/admin/bookings/${b1Id}/status`, { status: 'Pending' }, adminToken);
    assert('Admin: Terminal booking transition (Completed -> Pending) blocked (409)', aTermTrans.status === 409);

    const aDelMissing = await req('DELETE', '/api/admin/customers/9999', undefined, adminToken);
    assert('Admin: Delete non-existent customer maps P2025 -> 404', aDelMissing.status === 404);

    const aDelCust = await req('DELETE', '/api/admin/customers/2', undefined, adminToken);
    assert('Admin: Delete existing customer returns 200', aDelCust.status === 200);

    const aDelProv = await req('DELETE', '/api/admin/providers/2', undefined, adminToken);
    assert('Admin: Delete existing provider returns 200', aDelProv.status === 200);

    // --- CENTRALIZED ERROR HANDLER & DEEP SECURITY CHECKS ---
    let mockStatus = 0;
    let mockJson = null;
    const mockRes = { status(s) { mockStatus = s; return this; }, json(j) { mockJson = j; } };
    errorHandler({ name: 'Error', message: 'secret mysql://root:topsecret@127.0.0.1/db leaked' }, {}, mockRes, () => {});
    assert('ErrorHandler: 500 masks internal message & credentials', mockStatus === 500 && mockJson.message === 'An unexpected server error occurred.');

    // Verify stored customer password is a bcrypt hash (never plaintext)
    const storedCust = harness.store.customers.find((c) => c.email === 'alice@example.com');
    assert('Security: Password stored as bcrypt hash (never plaintext)', Boolean(storedCust && storedCust.passwordHash && /^\$2[ab]\$12\$/.test(storedCust.passwordHash) && storedCust.passwordHash !== 'Password123!'));

    // Verify JWT alg:none forged token is rejected with 401
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const nonePayload = Buffer.from(JSON.stringify({ sub: '1', role: 'admin' })).toString('base64url');
    const forgedNoneToken = `${noneHeader}.${nonePayload}.`;
    const noneResp = await req('GET', '/api/admin/stats', undefined, forgedNoneToken);
    assert('Security: Forged JWT (alg: none) rejected with 401', noneResp.status === 401);

    // Verify tampered JWT signature is rejected with 401
    const tamperedToken = adminToken.slice(0, -4) + 'AAAA';
    const tamperedResp = await req('GET', '/api/admin/stats', undefined, tamperedToken);
    assert('Security: Tampered JWT signature rejected with 401', tamperedResp.status === 401);

    // Verify malformed JSON request body returns 400 (not 500)
    const badJsonRes = await fetch(base + '/api/customers/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json'
    });
    assert('Security: Malformed JSON body returns 400', badJsonRes.status === 400);

    // Verify auth rate limiter triggers 429 after max hits
    const createRateLimiter = require('../middleware/rateLimit');
    const rl = createRateLimiter({ windowMs: 60000, max: 2 });
    let rlStatuses = [];
    for (let i = 0; i < 3; i++) {
      let calledNext = false;
      let st = 200;
      rl({ ip: '10.0.0.99' }, { setHeader() {}, status(code) { st = code; return this; }, json() {} }, () => { calledNext = true; });
      rlStatuses.push(calledNext ? 200 : st);
    }
    assert('Security: Rate limiter enforces 429 on excess attempts', rlStatuses[0] === 200 && rlStatuses[1] === 200 && rlStatuses[2] === 429, rlStatuses.join(', '));

    console.log('\n================================================================');
    console.log(`ISOLATED BACKEND MODULE TESTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');
    if (failed > 0) process.exitCode = 1;
  } finally {
    server.close();
  }
}

run();
