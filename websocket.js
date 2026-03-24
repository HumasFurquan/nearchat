/**
 * utils/websocket.js
 *
 * WebSocket server — handles real-time messaging, presence,
 * location updates, and typing indicators.
 *
 * Message protocol (JSON over WS):
 *
 *   CLIENT → SERVER
 *   ─────────────────────────────────────────────────────
 *   { type: 'AUTH',           payload: { token } }
 *   { type: 'SEND_MESSAGE',   payload: { toId, text } }
 *   { type: 'TYPING_START',   payload: { toId } }
 *   { type: 'TYPING_STOP',    payload: { toId } }
 *   { type: 'UPDATE_LOCATION',payload: { lat, lon, locationLabel } }
 *   { type: 'MARK_READ',      payload: { fromId } }
 *   { type: 'PING' }
 *
 *   SERVER → CLIENT
 *   ─────────────────────────────────────────────────────
 *   { type: 'AUTH_OK',        payload: { user } }
 *   { type: 'AUTH_ERROR',     payload: { error } }
 *   { type: 'NEW_MESSAGE',    payload: Message }
 *   { type: 'TYPING_START',   payload: { fromId, displayName } }
 *   { type: 'TYPING_STOP',    payload: { fromId } }
 *   { type: 'PRESENCE',       payload: { userId, online } }
 *   { type: 'LOCATION_UPDATE',payload: { userId, lat, lon, locationLabel } }
 *   { type: 'PONG' }
 *   { type: 'ERROR',          payload: { error } }
 */

const WebSocket = require('ws');
const { verifyToken }  = require('../middleware/auth');
const {
  saveMessage,
  markRead,
  registerSocket,
  removeSocket,
  getSocket,
  updateUser,
  getAllUsers,
} = require('./store');

/**
 * Attach a WebSocket.Server to an existing http.Server.
 * @param {http.Server} httpServer
 */
function attachWebSocketServer(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Each connection starts unauthenticated
    ws._userId = null;
    ws._authenticated = false;

    console.log('[ws] new connection from', req.socket.remoteAddress);

    ws.on('message', (raw) => {
      let envelope;
      try {
        envelope = JSON.parse(raw);
      } catch {
        return send(ws, 'ERROR', { error: 'Invalid JSON' });
      }

      const { type, payload = {} } = envelope;

      // ── AUTH (must be first message) ──────────────────────────────────────
      if (type === 'AUTH') {
        const user = verifyToken(payload.token);
        if (!user) {
          send(ws, 'AUTH_ERROR', { error: 'Invalid token' });
          return ws.close(1008, 'Unauthorized');
        }

        ws._userId        = user.id;
        ws._authenticated = true;
        registerSocket(user.id, ws);
        updateUser(user.id, { online: true, lastSeen: new Date() });

        // Notify all other connected clients that this user is now online
        broadcast(wss, ws, {
          type:    'PRESENCE',
          payload: { userId: user.id, online: true },
        });

        const { passwordHash, ...safeUser } = user;
        send(ws, 'AUTH_OK', { user: safeUser });
        console.log(`[ws] authenticated: ${user.displayName} (${user.id})`);
        return;
      }

      // All subsequent messages require authentication
      if (!ws._authenticated) {
        return send(ws, 'ERROR', { error: 'Not authenticated — send AUTH first' });
      }

      // ── PING / PONG ───────────────────────────────────────────────────────
      if (type === 'PING') {
        updateUser(ws._userId, { lastSeen: new Date() });
        return send(ws, 'PONG', {});
      }

      // ── SEND_MESSAGE ──────────────────────────────────────────────────────
      if (type === 'SEND_MESSAGE') {
        const { toId, text } = payload;
        if (!toId || !text?.trim()) {
          return send(ws, 'ERROR', { error: 'toId and text are required' });
        }

        const msg = saveMessage({ fromId: ws._userId, toId, text: text.trim() });

        // Echo back to sender (so they can render it)
        send(ws, 'NEW_MESSAGE', msg);

        // Deliver to recipient if online
        const recipientSocket = getSocket(toId);
        if (recipientSocket && recipientSocket.readyState === WebSocket.OPEN) {
          send(recipientSocket, 'NEW_MESSAGE', msg);
        }
        return;
      }

      // ── TYPING ────────────────────────────────────────────────────────────
      if (type === 'TYPING_START' || type === 'TYPING_STOP') {
        const { toId } = payload;
        const senderSocket = getSocket(toId);
        if (senderSocket && senderSocket.readyState === WebSocket.OPEN) {
          send(senderSocket, type, {
            fromId:      ws._userId,
            displayName: (getAllUsers().find(u => u.id === ws._userId))?.displayName,
          });
        }
        return;
      }

      // ── UPDATE_LOCATION ───────────────────────────────────────────────────
      if (type === 'UPDATE_LOCATION') {
        const { lat, lon, locationLabel } = payload;
        if (lat == null || lon == null) {
          return send(ws, 'ERROR', { error: 'lat and lon are required' });
        }
        updateUser(ws._userId, {
          lat: parseFloat(lat),
          lon: parseFloat(lon),
          locationLabel: locationLabel || undefined,
        });

        // Broadcast updated location to all connected users
        broadcast(wss, null, {
          type:    'LOCATION_UPDATE',
          payload: { userId: ws._userId, lat, lon, locationLabel },
        });
        return;
      }

      // ── MARK_READ ─────────────────────────────────────────────────────────
      if (type === 'MARK_READ') {
        const { fromId } = payload;
        if (fromId) markRead(fromId, ws._userId);
        return;
      }

      send(ws, 'ERROR', { error: `Unknown message type: ${type}` });
    });

    // ── DISCONNECT ────────────────────────────────────────────────────────────
    ws.on('close', () => {
      if (ws._userId) {
        removeSocket(ws._userId);
        updateUser(ws._userId, { online: false, lastSeen: new Date() });

        broadcast(wss, ws, {
          type:    'PRESENCE',
          payload: { userId: ws._userId, online: false },
        });

        console.log(`[ws] disconnected: ${ws._userId}`);
      }
    });

    ws.on('error', (err) => {
      console.error('[ws] socket error:', err.message);
    });
  });

  console.log('[ws] WebSocket server ready on path /ws');
  return wss;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function send(ws, type, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

/** Broadcast to all authenticated clients except `excludeWs` */
function broadcast(wss, excludeWs, message) {
  const json = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client !== excludeWs && client._authenticated && client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

module.exports = { attachWebSocketServer };
