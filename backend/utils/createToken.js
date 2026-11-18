const jwt = require('jsonwebtoken');

function createToken(userId, role) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is missing. Add it to backend/.env.');
  }

  return jwt.sign({ role }, secret, {
    algorithm: 'HS256',
    subject: String(userId),
    expiresIn: '7d'
  });
}

module.exports = createToken;
