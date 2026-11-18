const express = require('express');
const controller = require('../controllers/providerController');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', requireAuth('provider'), controller.getMe);
router.patch('/me', requireAuth('provider'), controller.updateMe);
router.get('/', controller.list);
router.get('/:id', controller.getById);

module.exports = router;
