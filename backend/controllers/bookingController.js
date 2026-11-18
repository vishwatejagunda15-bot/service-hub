const { prisma } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const sanitizeUser = require('../utils/sanitizeUser');
const parsePositiveInt = require('../utils/parseId');

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && localDateString(date) === value;
}

function isFutureDateTime(dateStr, timeStr) {
  const appointment = new Date(`${dateStr}T${timeStr}:00`);
  return !Number.isNaN(appointment.getTime()) && appointment > new Date();
}

function formatBooking(booking) {
  if (!booking) return null;
  const json = { ...booking };
  json.id = String(json.id);
  json._id = String(json.id);
  if (json.customerId !== undefined) json.customerId = String(json.customerId);
  if (json.providerId !== undefined) json.providerId = String(json.providerId);
  if (json.provider) json.provider = sanitizeUser(json.provider);
  if (json.customer) json.customer = sanitizeUser(json.customer);
  return json;
}

const providerPublicSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  serviceCategory: true,
  location: true,
  experience: true,
  charges: true,
  availability: true,
  description: true,
  about: true
};

const customerPublicSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true
};

const create = asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { providerId, customerName, customerPhone, address, bookingDate, bookingTime, description } = body;
  if (!providerId || typeof customerName !== 'string' || typeof customerPhone !== 'string' || typeof address !== 'string' || typeof bookingDate !== 'string' || typeof bookingTime !== 'string' || typeof description !== 'string') {
    return res.status(400).json({ success: false, message: 'Provider, contact, address, schedule, and problem details are required.' });
  }

  const parsedProviderId = parsePositiveInt(providerId);
  const parsedCustomerId = parsePositiveInt(req.auth.userId);
  if (!parsedProviderId) return res.status(400).json({ success: false, message: 'The selected provider ID is invalid.' });
  if (!parsedCustomerId) return res.status(400).json({ success: false, message: 'Invalid customer account.' });

  if (customerName.trim().length < 2 || customerName.trim().length > 80) return res.status(400).json({ success: false, message: 'Customer name must contain 2 to 80 characters.' });
  if (!/^[+0-9() .-]{7,20}$/.test(customerPhone.trim())) return res.status(400).json({ success: false, message: 'Enter a valid customer phone number.' });
  if (address.trim().length < 5 || address.trim().length > 250) return res.status(400).json({ success: false, message: 'Address must contain 5 to 250 characters.' });
  if (description.trim().length < 5 || description.trim().length > 1000) return res.status(400).json({ success: false, message: 'Problem description must contain 5 to 1000 characters.' });
  if (!isValidTime(bookingTime)) {
    return res.status(400).json({ success: false, message: 'Preferred time must use 24-hour HH:mm format.' });
  }
  if (!isValidDate(bookingDate) || bookingDate < localDateString(new Date())) {
    return res.status(400).json({ success: false, message: 'Booking date must be today or a future date.' });
  }
  if (!isFutureDateTime(bookingDate, bookingTime)) {
    return res.status(400).json({ success: false, message: 'Preferred booking date and time must be in the future.' });
  }

  const [customer, provider] = await Promise.all([
    prisma.customer.findUnique({ where: { id: parsedCustomerId } }),
    prisma.provider.findUnique({ where: { id: parsedProviderId } })
  ]);
  if (!customer) return res.status(404).json({ success: false, message: 'Customer account not found.' });
  if (!provider) return res.status(404).json({ success: false, message: 'Selected provider not found.' });

  const booking = await prisma.booking.create({
    data: {
      customerId: customer.id,
      providerId: provider.id,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      address: address.trim(),
      serviceCategory: provider.serviceCategory,
      bookingDate,
      bookingTime,
      description: description.trim(),
      status: 'Pending'
    }
  });

  res.status(201).json({ success: true, data: formatBooking(booking) });
});

const getForCustomer = asyncHandler(async (req, res) => {
  const customerId = parsePositiveInt(req.auth.userId);
  if (!customerId) return res.status(400).json({ success: false, message: 'Invalid customer ID.' });

  const bookings = await prisma.booking.findMany({
    where: { customerId },
    include: { provider: { select: providerPublicSelect } },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, count: bookings.length, data: bookings.map(formatBooking) });
});

const getForProvider = asyncHandler(async (req, res) => {
  const providerId = parsePositiveInt(req.auth.userId);
  if (!providerId) return res.status(400).json({ success: false, message: 'Invalid provider ID.' });

  const bookings = await prisma.booking.findMany({
    where: { providerId },
    include: { customer: { select: customerPublicSelect } },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, count: bookings.length, data: bookings.map(formatBooking) });
});

const accept = asyncHandler(async (req, res) => {
  const providerId = parsePositiveInt(req.auth.userId);
  const bookingId = parsePositiveInt(req.params.id);
  if (!providerId || !bookingId) {
    return res.status(400).json({ success: false, message: 'Invalid booking or provider ID.' });
  }

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { confirmedArrivalDate, confirmedArrivalTime } = body;
  if (!isValidDate(confirmedArrivalDate) || !isValidTime(confirmedArrivalTime)) {
    return res.status(400).json({ success: false, message: 'Confirmed arrival date and time are required. Use HH:mm time format.' });
  }
  if (confirmedArrivalDate < localDateString(new Date())) {
    return res.status(400).json({ success: false, message: 'Arrival date must be today or a future date.' });
  }
  if (!isFutureDateTime(confirmedArrivalDate, confirmedArrivalTime)) {
    return res.status(400).json({ success: false, message: 'Confirmed arrival date and time must be in the future.' });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, providerId }
  });
  if (!booking) return res.status(404).json({ success: false, message: 'Booking request not found for this provider.' });
  if (booking.status !== 'Pending') return res.status(409).json({ success: false, message: 'Only pending bookings can be accepted.' });

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: 'Accepted',
      confirmedProviderArrivalDate: confirmedArrivalDate,
      confirmedProviderArrivalTime: confirmedArrivalTime
    }
  });

  res.json({ success: true, data: formatBooking(updated) });
});

const reject = asyncHandler(async (req, res) => {
  const providerId = parsePositiveInt(req.auth.userId);
  const bookingId = parsePositiveInt(req.params.id);
  if (!providerId || !bookingId) {
    return res.status(400).json({ success: false, message: 'Invalid booking or provider ID.' });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, providerId }
  });
  if (!booking) return res.status(404).json({ success: false, message: 'Booking request not found for this provider.' });
  if (booking.status !== 'Pending') return res.status(409).json({ success: false, message: 'Only pending bookings can be rejected.' });

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: 'Rejected' }
  });

  res.json({ success: true, data: formatBooking(updated) });
});

const complete = asyncHandler(async (req, res) => {
  const providerId = parsePositiveInt(req.auth.userId);
  const bookingId = parsePositiveInt(req.params.id);
  if (!providerId || !bookingId) {
    return res.status(400).json({ success: false, message: 'Invalid booking or provider ID.' });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, providerId }
  });
  if (!booking) return res.status(404).json({ success: false, message: 'Booking request not found for this provider.' });
  if (booking.status !== 'Accepted') {
    return res.status(409).json({ success: false, message: 'Only accepted bookings can be marked completed.' });
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: 'Completed' }
  });

  res.json({ success: true, message: 'Booking marked as completed.', data: formatBooking(updated) });
});

const cancel = asyncHandler(async (req, res) => {
  const customerId = parsePositiveInt(req.auth.userId);
  const bookingId = parsePositiveInt(req.params.id);
  if (!customerId || !bookingId) {
    return res.status(400).json({ success: false, message: 'Invalid booking or customer ID.' });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, customerId }
  });
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found for this customer.' });
  if (!['Pending', 'Accepted'].includes(booking.status)) {
    return res.status(409).json({ success: false, message: 'This booking can no longer be cancelled.' });
  }

  if (!isFutureDateTime(booking.bookingDate, booking.bookingTime)) {
    return res.status(409).json({ success: false, message: 'Past bookings cannot be cancelled.' });
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: 'Cancelled' }
  });

  res.json({ success: true, data: formatBooking(updated) });
});

module.exports = { create, getForCustomer, getForProvider, accept, reject, complete, cancel };
