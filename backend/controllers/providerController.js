const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const createToken = require('../utils/createToken');
const sanitizeUser = require('../utils/sanitizeUser');
const parsePositiveInt = require('../utils/parseId');

const emailPattern = /^\S+@\S+\.\S+$/;
const phonePattern = /^[+0-9() .-]{7,20}$/;
const serviceCategories = ['Electrician', 'Plumber', 'Carpenter', 'AC Repair', 'Cleaning', 'Painting'];
const MAX_CHARGES = 99999999.99;

function isNumberInput(value) {
  return value !== null && value !== '' && typeof value !== 'boolean' && Number.isFinite(Number(value));
}

const register = asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { fullName, email, phone, password, confirmPassword, serviceCategory, location, experience, charges, availability, description, about } = body;
  if (typeof fullName !== 'string' || typeof email !== 'string' || typeof phone !== 'string' || typeof password !== 'string' || typeof confirmPassword !== 'string' || typeof serviceCategory !== 'string' || typeof location !== 'string' || experience === undefined || charges === undefined || typeof availability !== 'string') {
    return res.status(400).json({ success: false, message: 'Please provide all required provider details.' });
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
  if (!serviceCategories.includes(serviceCategory)) {
    return res.status(400).json({ success: false, message: 'Choose a supported service category.' });
  }
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters and no more than 72 UTF-8 bytes.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'Passwords do not match.' });
  }
  if (location.trim().length < 2 || location.trim().length > 100) {
    return res.status(400).json({ success: false, message: 'Enter a location between 2 and 100 characters.' });
  }
  if (!isNumberInput(experience) || !Number.isInteger(Number(experience)) || Number(experience) < 0 || Number(experience) > 60) {
    return res.status(400).json({ success: false, message: 'Experience must be a whole number from 0 to 60.' });
  }
  if (!isNumberInput(charges) || Number(charges) < 0 || Number(charges) > MAX_CHARGES) {
    return res.status(400).json({ success: false, message: 'Charges must be a non-negative number within valid limits.' });
  }
  if (!availability.trim() || availability.trim().length > 80) {
    return res.status(400).json({ success: false, message: 'Enter an availability value.' });
  }

  const rawDescription = description !== undefined ? description : about;
  let providerDescription;
  if (rawDescription !== undefined && rawDescription !== '') {
    if (typeof rawDescription !== 'string' || rawDescription.trim().length < 5 || rawDescription.trim().length > 400) {
      return res.status(400).json({ success: false, message: 'Description must contain 5 to 400 characters.' });
    }
    providerDescription = rawDescription.trim();
  } else {
    providerDescription = `${fullName.trim()} provides ${serviceCategory} services in ${location.trim()}.`.slice(0, 400);
  }

  const existing = await prisma.provider.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ success: false, message: 'A provider account with this email already exists.' });
  }

  const provider = await prisma.provider.create({
    data: {
      fullName: fullName.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      passwordHash: await bcrypt.hash(password, 12),
      serviceCategory,
      location: location.trim(),
      experience: Number(experience),
      charges: Number(charges),
      availability: availability.trim(),
      description: providerDescription,
      about: providerDescription
    }
  });

  res.status(201).json({ success: true, token: createToken(provider.id, 'provider'), data: sanitizeUser(provider) });
});

const login = asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required.' });
  if (!emailPattern.test(email) || email.length > 254) {
    return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
  }

  const provider = await prisma.provider.findUnique({ where: { email } });
  if (!provider || !(await bcrypt.compare(password, provider.passwordHash))) {
    return res.status(401).json({ success: false, message: 'Email or password is incorrect.' });
  }

  res.json({ success: true, token: createToken(provider.id, 'provider'), data: sanitizeUser(provider) });
});

const list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.category) {
    if (typeof req.query.category !== 'string' || !serviceCategories.includes(req.query.category)) {
      return res.status(400).json({ success: false, message: 'Choose a supported service category.' });
    }
    where.serviceCategory = req.query.category;
  }
  if (req.query.location) {
    if (typeof req.query.location !== 'string' || req.query.location.trim().length > 100) {
      return res.status(400).json({ success: false, message: 'Location filter must be 100 characters or fewer.' });
    }
    where.location = { contains: req.query.location.trim() };
  }
  if (req.query.q) {
    if (typeof req.query.q !== 'string' || req.query.q.trim().length > 100) {
      return res.status(400).json({ success: false, message: 'Search query must be 100 characters or fewer.' });
    }
    const q = req.query.q.trim();
    if (q) {
      where.OR = [
        { fullName: { contains: q } },
        { serviceCategory: { contains: q } },
        { location: { contains: q } }
      ];
    }
  }

  const providers = await prisma.provider.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });

  res.json({ success: true, count: providers.length, data: providers.map(sanitizeUser) });
});

const getById = asyncHandler(async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'Invalid provider ID.' });

  const provider = await prisma.provider.findUnique({ where: { id } });
  if (!provider) return res.status(404).json({ success: false, message: 'Provider not found.' });
  res.json({ success: true, data: sanitizeUser(provider) });
});

const getMe = asyncHandler(async (req, res) => {
  const id = parsePositiveInt(req.auth.userId);
  if (!id) return res.status(400).json({ success: false, message: 'Invalid provider ID.' });

  const provider = await prisma.provider.findUnique({ where: { id } });
  if (!provider) return res.status(404).json({ success: false, message: 'Provider account not found.' });
  res.json({ success: true, data: sanitizeUser(provider) });
});

const updateMe = asyncHandler(async (req, res) => {
  const id = parsePositiveInt(req.auth.userId);
  if (!id) return res.status(400).json({ success: false, message: 'Invalid provider ID.' });

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null;
  if (!body) return res.status(400).json({ success: false, message: 'A profile update object is required.' });
  const allowedFields = ['fullName', 'phone', 'serviceCategory', 'location', 'experience', 'charges', 'availability', 'description', 'about'];
  if (Object.keys(body).some((field) => !allowedFields.includes(field))) {
    return res.status(400).json({ success: false, message: 'The profile update contains unsupported fields.' });
  }

  const changes = {};
  ['fullName', 'phone', 'serviceCategory', 'location', 'experience', 'charges', 'availability'].forEach((field) => {
    if (body[field] !== undefined) changes[field] = body[field];
  });
  if (body.description !== undefined || body.about !== undefined) {
    changes.description = body.description === undefined ? body.about : body.description;
    changes.about = changes.description;
  }
  if (!Object.keys(changes).length) return res.status(400).json({ success: false, message: 'Provide at least one provider profile field to update.' });

  if (changes.fullName !== undefined && (typeof changes.fullName !== 'string' || changes.fullName.trim().length < 2 || changes.fullName.trim().length > 80)) {
    return res.status(400).json({ success: false, message: 'Full name must contain 2 to 80 characters.' });
  }
  if (changes.serviceCategory !== undefined && (typeof changes.serviceCategory !== 'string' || !serviceCategories.includes(changes.serviceCategory))) {
    return res.status(400).json({ success: false, message: 'Choose a supported service category.' });
  }
  if (changes.phone !== undefined && (typeof changes.phone !== 'string' || !phonePattern.test(changes.phone.trim()))) {
    return res.status(400).json({ success: false, message: 'Enter a valid phone number.' });
  }
  if (changes.location !== undefined && (typeof changes.location !== 'string' || changes.location.trim().length < 2 || changes.location.trim().length > 100)) {
    return res.status(400).json({ success: false, message: 'Location must contain 2 to 100 characters.' });
  }
  if (changes.experience !== undefined && (!isNumberInput(changes.experience) || !Number.isInteger(Number(changes.experience)) || Number(changes.experience) < 0 || Number(changes.experience) > 60)) {
    return res.status(400).json({ success: false, message: 'Experience must be a whole number from 0 to 60.' });
  }
  if (changes.charges !== undefined && (!isNumberInput(changes.charges) || Number(changes.charges) < 0 || Number(changes.charges) > MAX_CHARGES)) {
    return res.status(400).json({ success: false, message: 'Charges must be a non-negative number within valid limits.' });
  }
  if (changes.availability !== undefined && (typeof changes.availability !== 'string' || !changes.availability.trim() || changes.availability.trim().length > 80)) {
    return res.status(400).json({ success: false, message: 'Enter a valid availability value.' });
  }
  if (changes.description !== undefined && (typeof changes.description !== 'string' || changes.description.trim().length < 5 || changes.description.trim().length > 400)) {
    return res.status(400).json({ success: false, message: 'Description must contain 5 to 400 characters.' });
  }

  if (changes.fullName !== undefined) changes.fullName = changes.fullName.trim();
  if (changes.phone !== undefined) changes.phone = changes.phone.trim();
  if (changes.location !== undefined) changes.location = changes.location.trim();
  if (changes.experience !== undefined) changes.experience = Number(changes.experience);
  if (changes.charges !== undefined) changes.charges = Number(changes.charges);
  if (changes.availability !== undefined) changes.availability = changes.availability.trim();
  if (changes.description !== undefined) changes.description = changes.description.trim();
  if (changes.about !== undefined) changes.about = changes.description;

  const provider = await prisma.provider.update({
    where: { id },
    data: changes
  });
  res.json({ success: true, data: sanitizeUser(provider) });
});

module.exports = { register, login, list, getById, getMe, updateMe };
