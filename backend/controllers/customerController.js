const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const createToken = require('../utils/createToken');
const sanitizeUser = require('../utils/sanitizeUser');
const parsePositiveInt = require('../utils/parseId');

const emailPattern = /^\S+@\S+\.\S+$/;
const phonePattern = /^[+0-9() .-]{7,20}$/;

const register = asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { fullName, email, phone, password, confirmPassword } = body;
  if (typeof fullName !== 'string' || typeof email !== 'string' || typeof phone !== 'string' || typeof password !== 'string' || typeof confirmPassword !== 'string') {
    return res.status(400).json({ success: false, message: 'Full name, email, phone, password, and password confirmation are required.' });
  }
  if (fullName.trim().length < 2 || fullName.trim().length > 80) {
    return res.status(400).json({ success: false, message: 'Full name must contain 2 to 80 characters.' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!emailPattern.test(normalizedEmail) || normalizedEmail.length > 254) {
    return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
  }
  if (!phonePattern.test(phone.trim())) {
    return res.status(400).json({ success: false, message: 'Enter a valid phone number.' });
  }
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters and no more than 72 UTF-8 bytes.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'Passwords do not match.' });
  }

  const existing = await prisma.customer.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
  }

  const customer = await prisma.customer.create({
    data: {
      fullName: fullName.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      passwordHash: await bcrypt.hash(password, 12)
    }
  });

  const token = createToken(customer.id, 'customer');
  res.status(201).json({ success: true, token, data: sanitizeUser(customer) });
});

const login = asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }
  if (!emailPattern.test(email) || email.length > 254) {
    return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
  }

  const customer = await prisma.customer.findUnique({ where: { email } });
  if (!customer || !(await bcrypt.compare(password, customer.passwordHash))) {
    return res.status(401).json({ success: false, message: 'Email or password is incorrect.' });
  }

  res.json({ success: true, token: createToken(customer.id, 'customer'), data: sanitizeUser(customer) });
});

const getMe = asyncHandler(async (req, res) => {
  const userId = parsePositiveInt(req.auth.userId);
  if (!userId) return res.status(400).json({ success: false, message: 'Invalid customer ID.' });

  const customer = await prisma.customer.findUnique({ where: { id: userId } });
  if (!customer) return res.status(404).json({ success: false, message: 'Customer account not found.' });
  res.json({ success: true, data: sanitizeUser(customer) });
});

const updateMe = asyncHandler(async (req, res) => {
  const userId = parsePositiveInt(req.auth.userId);
  if (!userId) return res.status(400).json({ success: false, message: 'Invalid customer ID.' });

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null;
  if (!body) return res.status(400).json({ success: false, message: 'A profile update object is required.' });
  const unsupported = Object.keys(body).filter((field) => !['fullName', 'phone'].includes(field));
  if (unsupported.length) return res.status(400).json({ success: false, message: 'Only fullName and phone can be updated.' });

  const changes = {};
  ['fullName', 'phone'].forEach((field) => {
    if (body[field] !== undefined) changes[field] = body[field];
  });
  if (!Object.keys(changes).length) return res.status(400).json({ success: false, message: 'Provide a fullName or phone value to update.' });
  if (changes.fullName !== undefined && (typeof changes.fullName !== 'string' || changes.fullName.trim().length < 2 || changes.fullName.trim().length > 80)) {
    return res.status(400).json({ success: false, message: 'Full name must contain 2 to 80 characters.' });
  }
  if (changes.phone !== undefined && (typeof changes.phone !== 'string' || !phonePattern.test(changes.phone.trim()))) {
    return res.status(400).json({ success: false, message: 'Enter a valid phone number.' });
  }
  if (changes.fullName !== undefined) changes.fullName = changes.fullName.trim();
  if (changes.phone !== undefined) changes.phone = changes.phone.trim();

  const customer = await prisma.customer.update({
    where: { id: userId },
    data: changes
  });
  res.json({ success: true, data: sanitizeUser(customer) });
});

module.exports = { register, login, getMe, updateMe };
