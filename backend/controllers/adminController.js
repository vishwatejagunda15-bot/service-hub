const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const createToken = require('../utils/createToken');
const sanitizeUser = require('../utils/sanitizeUser');
const parsePositiveInt = require('../utils/parseId');

const emailPattern = /^\S+@\S+\.\S+$/;
const serviceCategories = ['Electrician', 'Plumber', 'Carpenter', 'AC Repair', 'Cleaning', 'Painting'];
const validBookingStatuses = ['Pending', 'Accepted', 'Rejected', 'Rescheduled', 'Completed', 'Cancelled'];
const allowedAdminTransitions = {
  Pending: ['Accepted', 'Rejected', 'Rescheduled', 'Cancelled'],
  Accepted: ['Completed', 'Rescheduled', 'Cancelled'],
  Rescheduled: ['Accepted', 'Completed', 'Cancelled'],
  Rejected: [],
  Completed: [],
  Cancelled: []
};

function formatAdminBooking(booking) {
  const json = { ...booking };
  json.id = String(json.id);
  json._id = String(json.id);
  if (json.customerId !== undefined) json.customerId = String(json.customerId);
  if (json.providerId !== undefined) json.providerId = String(json.providerId);
  if (json.customer) json.customer = sanitizeUser(json.customer);
  if (json.provider) json.provider = sanitizeUser(json.provider);
  return json;
}

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

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
    return res.status(401).json({ success: false, message: 'Email or password is incorrect.' });
  }

  res.json({
    success: true,
    token: createToken(admin.id, 'admin'),
    data: sanitizeUser(admin)
  });
});

const getMe = asyncHandler(async (req, res) => {
  const id = parsePositiveInt(req.auth.userId);
  if (!id) return res.status(400).json({ success: false, message: 'Invalid admin ID.' });

  const admin = await prisma.admin.findUnique({ where: { id } });
  if (!admin) return res.status(404).json({ success: false, message: 'Admin account not found.' });
  res.json({ success: true, data: sanitizeUser(admin) });
});

const getStats = asyncHandler(async (req, res) => {
  const [
    totalCustomers,
    totalProviders,
    totalBookings,
    pendingBookings,
    acceptedBookings,
    completedBookings,
    rejectedBookings,
    cancelledBookings,
    rescheduledBookings,
    providers,
    bookings
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.provider.count(),
    prisma.booking.count(),
    prisma.booking.count({ where: { status: 'Pending' } }),
    prisma.booking.count({ where: { status: 'Accepted' } }),
    prisma.booking.count({ where: { status: 'Completed' } }),
    prisma.booking.count({ where: { status: 'Rejected' } }),
    prisma.booking.count({ where: { status: 'Cancelled' } }),
    prisma.booking.count({ where: { status: 'Rescheduled' } }),
    prisma.provider.findMany(),
    prisma.booking.findMany()
  ]);

  const categoryBreakdown = serviceCategories.map((category) => ({
    category,
    providers: providers.filter((p) => p.serviceCategory === category).length,
    bookings: bookings.filter((b) => b.serviceCategory === category).length
  }));

  res.json({
    success: true,
    data: {
      totalCustomers,
      totalProviders,
      totalBookings,
      pendingBookings,
      acceptedBookings,
      completedBookings,
      rejectedBookings,
      cancelledBookings,
      rescheduledBookings,
      categoryBreakdown
    }
  });
});

const getCustomers = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.q && typeof req.query.q === 'string' && req.query.q.trim()) {
    const q = req.query.q.trim();
    if (q.length > 100) return res.status(400).json({ success: false, message: 'Search query must be 100 characters or fewer.' });
    where.OR = [
      { fullName: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } }
    ];
  }

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, count: customers.length, data: customers.map(sanitizeUser) });
});

const getProviders = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.category && typeof req.query.category === 'string' && req.query.category.trim()) {
    if (!serviceCategories.includes(req.query.category)) {
      return res.status(400).json({ success: false, message: 'Choose a supported service category.' });
    }
    where.serviceCategory = req.query.category;
  }
  if (req.query.q && typeof req.query.q === 'string' && req.query.q.trim()) {
    const q = req.query.q.trim();
    if (q.length > 100) return res.status(400).json({ success: false, message: 'Search query must be 100 characters or fewer.' });
    where.OR = [
      { fullName: { contains: q } },
      { email: { contains: q } },
      { location: { contains: q } },
      { serviceCategory: { contains: q } }
    ];
  }

  const providers = await prisma.provider.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, count: providers.length, data: providers.map(sanitizeUser) });
});

const getBookings = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.status && typeof req.query.status === 'string' && req.query.status.trim()) {
    if (!validBookingStatuses.includes(req.query.status)) {
      return res.status(400).json({ success: false, message: 'Choose a valid booking status.' });
    }
    where.status = req.query.status;
  }
  if (req.query.q && typeof req.query.q === 'string' && req.query.q.trim()) {
    const q = req.query.q.trim();
    if (q.length > 100) return res.status(400).json({ success: false, message: 'Search query must be 100 characters or fewer.' });
    where.OR = [
      { customerName: { contains: q } },
      { serviceCategory: { contains: q } },
      { address: { contains: q } }
    ];
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      customer: {
        select: { id: true, fullName: true, email: true, phone: true }
      },
      provider: {
        select: { id: true, fullName: true, email: true, phone: true, serviceCategory: true, location: true, charges: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const formatted = bookings.map(formatAdminBooking);
  res.json({ success: true, count: formatted.length, data: formatted });
});

const updateBookingStatus = asyncHandler(async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'Invalid booking ID.' });

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { status } = body;
  if (typeof status !== 'string' || !validBookingStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Choose a valid booking status.' });
  }

  const existing = await prisma.booking.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ success: false, message: 'Booking not found.' });
  if (existing.status === status) {
    return res.status(409).json({ success: false, message: `Booking is already in ${status} status.` });
  }

  const allowedNext = allowedAdminTransitions[existing.status] || [];
  if (!allowedNext.includes(status)) {
    return res.status(409).json({
      success: false,
      message: `Cannot transition booking from ${existing.status} to ${status}.`
    });
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: { status }
  });

  res.json({ success: true, data: formatAdminBooking(updated) });
});

const deleteCustomer = asyncHandler(async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'Invalid customer ID.' });

  await prisma.customer.delete({ where: { id } });
  res.json({ success: true, message: 'Customer account deleted.' });
});

const deleteProvider = asyncHandler(async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'Invalid provider ID.' });

  await prisma.provider.delete({ where: { id } });
  res.json({ success: true, message: 'Provider account deleted.' });
});

module.exports = {
  login,
  getMe,
  getStats,
  getCustomers,
  getProviders,
  getBookings,
  updateBookingStatus,
  deleteCustomer,
  deleteProvider
};
