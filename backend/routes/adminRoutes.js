const express = require('express');
const controller = require('../controllers/adminController');
const requireAuth = require('../middleware/auth');

const router = express.Router();

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
