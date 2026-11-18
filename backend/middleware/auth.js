const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const parsePositiveInt = require('../utils/parseId');

const validRoles = ['customer', 'provider', 'admin'];

function requireAuth(requiredRole) {
  return asyncHandler(async (req, res, next) => {
    const header = (req.get('authorization') || '').trim();
    const parts = header.split(/\s+/);
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      return res.status(401).json({ success: false, message: 'A Bearer access token is required.' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      const err = new Error('JWT_SECRET is not configured on the server.');
      err.status = 500;
      return next(err);
    }

    try {
      const payload = jwt.verify(parts[1], secret, { algorithms: ['HS256'] });
      const userId = parsePositiveInt(payload.sub);
      if (!userId || !validRoles.includes(payload.role)) {
        return res.status(401).json({ success: false, message: 'The access token payload is invalid.' });
      }
      if (requiredRole && payload.role !== requiredRole) {
        return res.status(403).json({ success: false, message: 'This account role cannot access this endpoint.' });
      }
      req.auth = { userId, role: payload.role };
      return next();
    } catch (error) {
      return res.status(401).json({ success: false, message: 'The access token is invalid or expired.' });
    }
  });
}

module.exports = requireAuth;
