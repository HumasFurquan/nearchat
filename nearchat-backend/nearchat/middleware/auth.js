/**
 * middleware/auth.js
 *
 * Express middleware that validates a Bearer JWT from the Authorization header
 * and attaches the decoded user record to req.user.
 *
 * Usage:
 *   router.get('/protected', requireAuth, (req, res) => { ... })
 */

const jwt  = require('jsonwebtoken');
const { getUserById } = require('../utils/store');

const JWT_SECRET = process.env.JWT_SECRET || 'nearchat_dev_secret_change_in_production';

/**
 * Sign a JWT for a given user.
 * @param {string} userId
 * @returns {string} signed token (expires in 7 days)
 */
function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Express middleware — attaches req.user or returns 401.
 */
function requireAuth(req, res, next) {
  const header = req.headers['authorization'] ?? '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const user = getUserById(payload.sub);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  req.user = user;
  next();
}

/**
 * Verify a raw token string (used by the WebSocket upgrade handler).
 * @param {string} token
 * @returns {UserRecord|null}
 */
function verifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return getUserById(payload.sub) ?? null;
  } catch {
    return null;
  }
}

module.exports = { signToken, requireAuth, verifyToken };
