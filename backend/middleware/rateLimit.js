function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 30 } = {}) {
  const hits = new Map();

  return function rateLimiter(req, res, next) {
    const key = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    const now = Date.now();
    const record = hits.get(key);

    if (!record || now > record.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    record.count += 1;
    if (record.count > max) {
      const retrySeconds = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retrySeconds));
      return res.status(429).json({
        success: false,
        message: 'Too many authentication attempts. Please wait a few minutes and try again.'
      });
    }

    return next();
  };
}

module.exports = createRateLimiter;
