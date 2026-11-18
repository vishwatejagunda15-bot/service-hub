const express = require('express');
const bcrypt = require('bcryptjs');
const controller = require('../controllers/adminController');
const requireAuth = require('../middleware/auth');
const { prisma, checkDatabaseHealth } = require('../config/database');
const path = require('path');
const fs = require('fs');

const router = express.Router();

async function executeSchemaSync(req, res) {
  try {
    const rawSql = `
      CREATE TABLE IF NOT EXISTS \`customers\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`fullName\` VARCHAR(80) NOT NULL,
        \`email\` VARCHAR(254) NOT NULL UNIQUE,
        \`phone\` VARCHAR(20) NOT NULL,
        \`passwordHash\` VARCHAR(255) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      );

      CREATE TABLE IF NOT EXISTS \`providers\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`fullName\` VARCHAR(80) NOT NULL,
        \`email\` VARCHAR(254) NOT NULL UNIQUE,
        \`phone\` VARCHAR(20) NOT NULL,
        \`passwordHash\` VARCHAR(255) NOT NULL,
        \`serviceCategory\` VARCHAR(50) NOT NULL,
        \`location\` VARCHAR(100) NOT NULL,
        \`experience\` INT NOT NULL DEFAULT 0,
        \`charges\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        \`availability\` VARCHAR(80) NOT NULL,
        \`description\` TEXT NOT NULL,
        \`about\` TEXT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`providers_serviceCategory_idx\` (\`serviceCategory\`),
        INDEX \`providers_location_idx\` (\`location\`),
        INDEX \`providers_serviceCategory_location_idx\` (\`serviceCategory\`, \`location\`),
        INDEX \`providers_createdAt_idx\` (\`createdAt\`)
      );

      CREATE TABLE IF NOT EXISTS \`bookings\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`customerId\` INT NOT NULL,
        \`providerId\` INT NOT NULL,
        \`customerName\` VARCHAR(80) NOT NULL,
        \`customerPhone\` VARCHAR(20) NOT NULL,
        \`address\` VARCHAR(250) NOT NULL,
        \`serviceCategory\` VARCHAR(50) NOT NULL,
        \`bookingDate\` VARCHAR(10) NOT NULL,
        \`bookingTime\` VARCHAR(5) NOT NULL,
        \`description\` TEXT NOT NULL,
        \`status\` VARCHAR(20) NOT NULL DEFAULT 'Pending',
        \`confirmedProviderArrivalDate\` VARCHAR(10) NOT NULL DEFAULT '',
        \`confirmedProviderArrivalTime\` VARCHAR(5) NOT NULL DEFAULT '',
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`bookings_customerId_idx\` (\`customerId\`),
        INDEX \`bookings_providerId_idx\` (\`providerId\`),
        INDEX \`bookings_status_idx\` (\`status\`),
        INDEX \`bookings_bookingDate_idx\` (\`bookingDate\`),
        INDEX \`bookings_customerId_createdAt_idx\` (\`customerId\`, \`createdAt\`),
        INDEX \`bookings_providerId_createdAt_idx\` (\`providerId\`, \`createdAt\`),
        CONSTRAINT \`bookings_customerId_fkey\` FOREIGN KEY (\`customerId\`) REFERENCES \`customers\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`bookings_providerId_fkey\` FOREIGN KEY (\`providerId\`) REFERENCES \`providers\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      );

      CREATE TABLE IF NOT EXISTS \`admins\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`fullName\` VARCHAR(80) NOT NULL,
        \`email\` VARCHAR(254) NOT NULL UNIQUE,
        \`passwordHash\` VARCHAR(255) NOT NULL,
        \`role\` VARCHAR(20) NOT NULL DEFAULT 'admin',
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      );
    `;

    // Execute each CREATE statement safely
    const statements = rawSql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
    }

    let adminCreated = null;
    const body = req.body || {};
    if (body.adminEmail && body.adminPassword) {
      const email = body.adminEmail.trim().toLowerCase();
      const existing = await prisma.admin.findUnique({ where: { email } });
      if (!existing) {
        const hash = await bcrypt.hash(body.adminPassword, 12);
        const admin = await prisma.admin.create({
          data: {
            fullName: (body.adminName || 'ServiceHub Admin').trim(),
            email,
            passwordHash: hash,
            role: 'admin'
          }
        });
        adminCreated = admin.email;
      }
    }

    const tables = await prisma.$queryRaw`SHOW TABLES`;
    return res.json({
      success: true,
      tables: tables.map(r => Object.values(r)[0]),
      adminCreated
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// Protected admin endpoint to run schema sync in production
// Allows unauthenticated access ONLY during initial setup when 0 admin accounts exist
router.post('/sync-schema', async (req, res, next) => {
  try {
    let isInitialSetup = false;
    try {
      const adminCount = await prisma.admin.count();
      if (adminCount === 0) {
        isInitialSetup = true;
      }
    } catch (_) {
      // Table doesn't exist yet -> initial setup mode
      isInitialSetup = true;
    }

    if (!isInitialSetup) {
      return requireAuth('admin')(req, res, () => executeSchemaSync(req, res));
    }
    return executeSchemaSync(req, res);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/login', controller.login);
router.get('/me', requireAuth('admin'), controller.getMe);
router.get('/stats', requireAuth('admin'), controller.getStats);
router.get('/customers', requireAuth('admin'), controller.getCustomers);
router.delete('/customers/:id', requireAuth('admin'), controller.deleteCustomer);
router.get('/providers', requireAuth('admin'), controller.getProviders);
router.delete('/providers/:id', requireAuth('admin'), controller.deleteProvider);
router.get('/bookings', requireAuth('admin'), controller.getBookings);
router.patch('/bookings/:id/status', requireAuth('admin'), controller.updateBookingStatus);

module.exports = router;
