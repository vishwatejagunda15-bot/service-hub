const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { prisma, connectDatabase } = require('../config/database');

const emailPattern = /^\S+@\S+\.\S+$/;

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return '';
}

async function createAdmin() {
  const fullName = (getArg('--name') || process.env.ADMIN_NAME || 'ServiceHub Admin').trim();
  const email = (getArg('--email') || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = getArg('--password') || process.env.ADMIN_PASSWORD || '';

  if (!email || !emailPattern.test(email) || email.length > 254) {
    console.error('✗ Provide a valid admin email via ADMIN_EMAIL env var or --email.');
    process.exitCode = 1;
    return;
  }
  if (fullName.length < 2 || fullName.length > 80) {
    console.error('✗ Admin name must contain 2 to 80 characters.');
    process.exitCode = 1;
    return;
  }
  if (password.length < 10 || Buffer.byteLength(password, 'utf8') > 72) {
    console.error('✗ Admin password must be at least 10 characters and no more than 72 UTF-8 bytes (set via ADMIN_PASSWORD env var or --password).');
    process.exitCode = 1;
    return;
  }

  try {
    await connectDatabase();

    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) {
      console.error(`✗ An admin account with email "${email}" already exists.`);
      process.exitCode = 1;
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await prisma.admin.create({
      data: {
        fullName,
        email,
        passwordHash,
        role: 'admin'
      }
    });

    console.log('✓ Admin account provisioned safely:');
    console.log(`  - ID   : ${admin.id}`);
    console.log(`  - Name : ${admin.fullName}`);
    console.log(`  - Email: ${admin.email}`);
    console.log(`  - Role : ${admin.role}`);
  } catch (error) {
    console.error('✗ Could not provision admin account:', error.message || error.name);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

createAdmin();
