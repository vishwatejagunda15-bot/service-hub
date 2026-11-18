const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { prisma, connectDatabase } = require('../config/database');

async function checkDatabase() {
  try {
    await connectDatabase();
    console.log('✓ MySQL database connection check passed successfully via Prisma.');
    await prisma.$disconnect();
  } catch (error) {
    console.error('✗ MySQL database connection check failed:', error.message || error.name);
    await prisma.$disconnect().catch(() => {});
    process.exitCode = 1;
  }
}

checkDatabase();
