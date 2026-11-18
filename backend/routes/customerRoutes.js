const express = require('express');
const controller = require('../controllers/customerController');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', requireAuth('customer'), controller.getMe);
router.patch('/me', requireAuth('customer'), controller.updateMe);

module.exports = router;
