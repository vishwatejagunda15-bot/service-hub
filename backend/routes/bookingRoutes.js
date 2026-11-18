const express = require('express');
const controller = require('../controllers/bookingController');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.post('/', requireAuth('customer'), controller.create);
router.get('/my', requireAuth('customer'), controller.getForCustomer);
router.get('/provider', requireAuth('provider'), controller.getForProvider);
router.patch('/:id/accept', requireAuth('provider'), controller.accept);
router.patch('/:id/reject', requireAuth('provider'), controller.reject);
router.patch('/:id/complete', requireAuth('provider'), controller.complete);
router.patch('/:id/cancel', requireAuth('customer'), controller.cancel);

module.exports = router;
