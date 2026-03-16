/**
 * routes/auth.js
 *
 * POST /api/auth/register  — create account
 * POST /api/auth/login     — obtain JWT
 * GET  /api/auth/me        — current user profile (requires auth)
 * PUT  /api/auth/location  — update user's lat/lon (requires auth)
 */

const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();

const { createUser, getUserByUsername, updateUser } = require('../utils/store');
const { signToken, requireAuth } = require('../middleware/auth');

// ─── Register ──────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, displayName, password, lat, lon, locationLabel } = req.body;

    // Validation
    if (!username || !password || !displayName) {
      return res.status(400).json({ error: 'username, displayName, and password are required' });
    }
    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'username must be 3–30 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }
    if (getUserByUsername(username)) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = createUser({
      username,
      displayName,
      passwordHash,
      lat:  parseFloat(lat)  || 0,
      lon:  parseFloat(lon)  || 0,
      locationLabel: locationLabel || 'Unknown',
    });

    const token = signToken(user.id);

    res.status(201).json({
      token,
      user: publicProfile(user),
    });
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const user = getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update lastSeen
    updateUser(user.id, { lastSeen: new Date() });

    const token = signToken(user.id);
    res.json({
      token,
      user: publicProfile(user),
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Me ────────────────────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicProfile(req.user) });
});

// ─── Update location ───────────────────────────────────────────────────────────
router.put('/location', requireAuth, (req, res) => {
  const { lat, lon, locationLabel } = req.body;

  if (lat === undefined || lon === undefined) {
    return res.status(400).json({ error: 'lat and lon are required' });
  }

  const parsed = {
    lat: parseFloat(lat),
    lon: parseFloat(lon),
  };

  if (isNaN(parsed.lat) || isNaN(parsed.lon)) {
    return res.status(400).json({ error: 'lat and lon must be numbers' });
  }
  if (parsed.lat < -90 || parsed.lat > 90 || parsed.lon < -180 || parsed.lon > 180) {
    return res.status(400).json({ error: 'lat/lon out of range' });
  }

  const updated = updateUser(req.user.id, {
    lat: parsed.lat,
    lon: parsed.lon,
    locationLabel: locationLabel || req.user.locationLabel,
  });

  res.json({ user: publicProfile(updated) });
});

// ─── Helpers ───────────────────────────────────────────────────────────────────
function publicProfile(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

module.exports = router;
