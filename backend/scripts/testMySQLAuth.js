const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { prisma, connectDatabase } = require('../config/database');
const createToken = require('../utils/createToken');
const sanitizeUser = require('../utils/sanitizeUser');

async function testMySQLAuth() {
  console.log('=== ServiceHub MySQL + Prisma Verification & Test Suite ===\n');
  let testCustomer = null;
  let testProvider = null;
  let testBooking = null;

  try {
    // 1. Database Connection
    console.log('[Step 1/7] Connecting to MySQL database via Prisma...');
    await connectDatabase();
    console.log('✓ Successfully connected to MySQL via Prisma!\n');

    const timestamp = Date.now();
    const saltRounds = 12;

    // 2. Customer Registration
    console.log('[Step 2/7] Testing Customer registration with bcrypt hashing in MySQL...');
    const customerEmail = `prisma_cust_${timestamp}@example.com`;
    const customerPassword = 'PrismaSecurePass123!';
    const customerHash = await bcrypt.hash(customerPassword, saltRounds);

    testCustomer = await prisma.customer.create({
      data: {
        fullName: 'Prisma Test Customer',
        email: customerEmail,
        phone: '+1 555 019 5555',
        passwordHash: customerHash
      }
    });
    console.log('✓ Customer record inserted into MySQL table "customers":');
    console.log(`  - ID: ${testCustomer.id}`);
    console.log(`  - Email: ${testCustomer.email}\n`);

    // 3. Customer Verification & Login
    console.log('[Step 3/7] Verifying Customer in MySQL & testing login authentication...');
    const retrievedCust = await prisma.customer.findUnique({ where: { email: customerEmail } });
    if (!retrievedCust) throw new Error('Customer verification failed: Record not found in MySQL.');
    const isCustPwValid = await bcrypt.compare(customerPassword, retrievedCust.passwordHash);
    if (!isCustPwValid) throw new Error('Customer login failed: Password mismatch.');
    const custToken = createToken(retrievedCust.id, 'customer');
    console.log('✓ Customer login authentication successful:');
    console.log(`  - Persisted in MySQL confirmed (ID: ${retrievedCust.id})`);
    console.log(`  - JWT Token issued: ${custToken ? 'Valid' : 'Failed'}`);
    console.log(`  - User Data: ${JSON.stringify(sanitizeUser(retrievedCust))}\n`);

    // 4. Provider Registration
    console.log('[Step 4/7] Testing Provider registration in MySQL...');
    const providerEmail = `prisma_prov_${timestamp}@example.com`;
    const providerPassword = 'PrismaProvPass123!';
    const providerHash = await bcrypt.hash(providerPassword, saltRounds);

    testProvider = await prisma.provider.create({
      data: {
        fullName: 'Prisma Test Electrician',
        email: providerEmail,
        phone: '+1 555 019 6666',
        passwordHash: providerHash,
        serviceCategory: 'Electrician',
        location: 'Midtown',
        experience: 5,
        charges: 50.00,
        availability: 'Available today',
        description: 'Certified electrical repair and rewiring expert.',
        about: 'Certified electrical repair and rewiring expert.'
      }
    });
    console.log('✓ Provider record inserted into MySQL table "providers":');
    console.log(`  - ID: ${testProvider.id}`);
    console.log(`  - Email: ${testProvider.email}\n`);

    // 5. Relational Booking Creation
    console.log('[Step 5/7] Testing relational Booking creation with Foreign Keys...');
    testBooking = await prisma.booking.create({
      data: {
        customerId: testCustomer.id,
        providerId: testProvider.id,
        customerName: testCustomer.fullName,
        customerPhone: testCustomer.phone,
        address: '456 Tech Park, Suite 101',
        serviceCategory: testProvider.serviceCategory,
        bookingDate: '2026-11-22',
        bookingTime: '14:00',
        description: 'Full electrical inspection needed.',
        status: 'Pending'
      }
    });
    console.log('✓ Relational booking created in MySQL table "bookings":');
    console.log(`  - Booking ID: ${testBooking.id}`);
    console.log(`  - Customer ID FK: ${testBooking.customerId}`);
    console.log(`  - Provider ID FK: ${testBooking.providerId}`);
    console.log(`  - Status: ${testBooking.status}\n`);

    // 6. Booking Status Transition
    console.log('[Step 6/7] Testing booking status transition (Accept booking)...');
    const acceptedBooking = await prisma.booking.update({
      where: { id: testBooking.id },
      data: {
        status: 'Accepted',
        confirmedProviderArrivalDate: '2026-11-22',
        confirmedProviderArrivalTime: '14:30'
      }
    });
    console.log(`✓ Booking status updated to: ${acceptedBooking.status}`);
    console.log(`  - Confirmed Arrival: ${acceptedBooking.confirmedProviderArrivalDate} at ${acceptedBooking.confirmedProviderArrivalTime}\n`);

    // 7. Cleanup
    console.log('[Step 7/7] Cleaning up test records from MySQL...');
    await prisma.booking.delete({ where: { id: testBooking.id } });
    await prisma.customer.delete({ where: { id: testCustomer.id } });
    await prisma.provider.delete({ where: { id: testProvider.id } });
    console.log('✓ Test records cleaned up successfully.\n');

    console.log('================================================================');
    console.log('ALL TESTS PASSED: MySQL + Prisma integration, schema integrity,');
    console.log('password security, and relational bookings successfully verified.');
    console.log('================================================================');
  } catch (error) {
    console.error('\n✗ Test failed:', error.message || error.name);
    process.exitCode = 1;
  } finally {
    if (testBooking && testBooking.id) {
      try { await prisma.booking.delete({ where: { id: testBooking.id } }); } catch (_) {}
    }
    if (testCustomer && testCustomer.id) {
      try { await prisma.customer.delete({ where: { id: testCustomer.id } }); } catch (_) {}
    }
    if (testProvider && testProvider.id) {
      try { await prisma.provider.delete({ where: { id: testProvider.id } }); } catch (_) {}
    }
    await prisma.$disconnect().catch(() => {});
  }
}

testMySQLAuth();
