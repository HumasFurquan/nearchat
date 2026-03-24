/**
 * routes/users.js
 *
 * GET /api/users/nearby?scope=area|city|state|world
 *   Returns users within the radius of the current scope, sorted by distance.
 *   Requires: Authorization: Bearer <token>
 *
 * GET /api/users/:id
 *   Public profile of a specific user.
 *
 * GET /api/users/:id/messages
 *   Conversation history between the caller and the target user.
 *
 * POST /api/users/:id/messages
 *   Send a REST message (fallback — real-time path is WebSocket).
 */

const express = require('express');
const router  = express.Router();

const {
  getAllUsers,
  getUserById,
  getConversation,
  saveMessage,
  getUnreadCount,
  isOnline,
  getSocket,
} = require('../utils/store');

const { filterUsersByScope } = require('../utils/haversine');
const { requireAuth }        = require('../middleware/auth');

// ─── Nearby users ─────────────────────────────────────────────────────────────
router.get('/nearby', requireAuth, (req, res) => {
  const scope = req.query.scope ?? 'area';

  if (!['area','city','state','world'].includes(scope)) {
    return res.status(400).json({ error: 'scope must be area|city|state|world' });
  }

  const { lat, lon, id: myId } = req.user;

  // All users except ourselves
  const candidates = getAllUsers().filter(u => u.id !== myId);

  // Apply Haversine filter + sort
  const nearby = filterUsersByScope(candidates, lat, lon, scope);

  // Attach live status + unread count
  const result = nearby.map(user => ({
    id:            user.id,
    displayName:   user.displayName,
    username:      user.username,
    avatarColor:   user.avatarColor,
    locationLabel: user.locationLabel,
    distanceLabel: user.distanceLabel,
    distanceMeters:user.distanceMeters,
    scope:         user.scope,          // tightest scope for this pair
    online:        isOnline(user.id),
    lastSeen:      user.lastSeen,
    unreadCount:   getUnreadCount(myId, user.id),
  }));

  res.json({ scope, users: result });
});

// ─── Single user profile ──────────────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  const user = getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { passwordHash, ...safe } = user;
  res.json({
    ...safe,
    online: isOnline(user.id),
  });
});

// ─── Conversation history ─────────────────────────────────────────────────────
router.get('/:id/messages', requireAuth, (req, res) => {
  const other = getUserById(req.params.id);
  if (!other) return res.status(404).json({ error: 'User not found' });

  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const history = getConversation(req.user.id, other.id, limit);

  res.json({ messages: history });
});

// ─── Send message (REST fallback) ─────────────────────────────────────────────
router.post('/:id/messages', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const other = getUserById(req.params.id);
  if (!other) return res.status(404).json({ error: 'User not found' });

  const msg = saveMessage({ fromId: req.user.id, toId: other.id, text: text.trim() });

  // If recipient is online, push via WebSocket
  const socket = getSocket(other.id);
  if (socket && socket.readyState === 1 /* OPEN */) {
    socket.send(JSON.stringify({
      type:    'NEW_MESSAGE',
      payload: msg,
    }));
  }

  res.status(201).json({ message: msg });
});

module.exports = router;
