/**
 * utils/store.js
 *
 * In-memory store — acts as the database for users, sessions, and messages.
 * 
 * Production upgrade path:
 *   - Swap `users` Map → PostgreSQL / MongoDB collection
 *   - Swap `messages` Map → Redis Streams or a messages table
 *   - Swap `wsClients` Map → stays in-process (or use Redis pub/sub for multi-node)
 *
 * Every mutating function here mirrors a SQL/NoSQL operation so the refactor
 * is a straightforward 1-to-1 replacement.
 */

const { v4: uuidv4 } = require('uuid');

// ─── Users ────────────────────────────────────────────────────────────────────
// Map<userId, UserRecord>
const users = new Map();

/**
 * @typedef {Object} UserRecord
 * @property {string}  id
 * @property {string}  username
 * @property {string}  displayName
 * @property {string}  passwordHash
 * @property {string}  avatarColor  — hex color for the avatar circle
 * @property {number}  lat          — last known latitude
 * @property {number}  lon          — last known longitude
 * @property {string}  locationLabel — human-readable e.g. "Banjara Hills"
 * @property {boolean} online
 * @property {Date}    lastSeen
 * @property {Date}    createdAt
 */

function createUser({ username, displayName, passwordHash, lat, lon, locationLabel }) {
  const AVATAR_COLORS = [
    '#60a8c4','#7b9cf0','#a87bdc','#c4a060',
    '#4fc98e','#e07060','#e0a060','#dc7bb0',
  ];
  const id = uuidv4();
  const user = {
    id,
    username,
    displayName,
    passwordHash,
    avatarColor: AVATAR_COLORS[users.size % AVATAR_COLORS.length],
    lat:   lat   ?? 0,
    lon:   lon   ?? 0,
    locationLabel: locationLabel ?? 'Unknown',
    online:    false,
    lastSeen:  new Date(),
    createdAt: new Date(),
  };
  users.set(id, user);
  return user;
}

function getUserById(id)           { return users.get(id) ?? null; }
function getUserByUsername(name)   { return [...users.values()].find(u => u.username === name) ?? null; }
function getAllUsers()              { return [...users.values()]; }

function updateUser(id, fields) {
  const user = users.get(id);
  if (!user) return null;
  Object.assign(user, fields);
  return user;
}

// ─── Messages ─────────────────────────────────────────────────────────────────
// Map<conversationId, Message[]>
// conversationId = sorted pair of userIds joined by ':' e.g. "aaa:bbb"
const messages = new Map();

/**
 * @typedef {Object} Message
 * @property {string} id
 * @property {string} conversationId
 * @property {string} fromId
 * @property {string} toId
 * @property {string} text
 * @property {Date}   createdAt
 * @property {boolean} read
 */

function getConversationId(userA, userB) {
  return [userA, userB].sort().join(':');
}

function saveMessage({ fromId, toId, text }) {
  const conversationId = getConversationId(fromId, toId);
  const msg = {
    id:             uuidv4(),
    conversationId,
    fromId,
    toId,
    text,
    createdAt: new Date(),
    read:      false,
  };
  if (!messages.has(conversationId)) messages.set(conversationId, []);
  messages.get(conversationId).push(msg);
  return msg;
}

function getConversation(userA, userB, limit = 50) {
  const id = getConversationId(userA, userB);
  const history = messages.get(id) ?? [];
  return history.slice(-limit);
}

function markRead(fromId, toId) {
  const id = getConversationId(fromId, toId);
  const history = messages.get(id) ?? [];
  history.forEach(m => { if (m.fromId === fromId) m.read = true; });
}

function getUnreadCount(forUserId, fromUserId) {
  const id = getConversationId(forUserId, fromUserId);
  return (messages.get(id) ?? []).filter(m => m.toId === forUserId && !m.read).length;
}

// ─── WebSocket client registry ─────────────────────────────────────────────────
// Map<userId, WebSocket>  — live socket connections
const wsClients = new Map();

function registerSocket(userId, ws)  { wsClients.set(userId, ws); }
function removeSocket(userId)        { wsClients.delete(userId); }
function getSocket(userId)           { return wsClients.get(userId) ?? null; }
function isOnline(userId)            { return wsClients.has(userId); }

// ─── Seed demo users (for development) ────────────────────────────────────────
const bcrypt = require('bcryptjs');

async function seedDemoUsers() {
  if (users.size > 0) return; // already seeded

  const hash = await bcrypt.hash('demo1234', 10);

  const demos = [
    { username:'arjun',   displayName:'Arjun Mehta',    lat:17.4230, lon:78.4480, locationLabel:'Banjara Hills' },
    { username:'priya',   displayName:'Priya Sharma',   lat:17.4320, lon:78.4100, locationLabel:'Jubilee Hills' },
    { username:'karthik', displayName:'Karthik Rao',    lat:17.4400, lon:78.3490, locationLabel:'Gachibowli'   },
    { username:'sneha',   displayName:'Sneha Nair',     lat:17.4500, lon:78.3800, locationLabel:'Madhapur'     },
    { username:'ravi',    displayName:'Ravi Kumar',     lat:17.4260, lon:78.4680, locationLabel:'Ameerpet'     },
    { username:'divya',   displayName:'Divya Patel',    lat:17.4440, lon:78.3810, locationLabel:'HITEC City'   },
    { username:'yuki',    displayName:'Yuki Tanaka',    lat:35.6762, lon:139.6503,locationLabel:'Tokyo'        },
    { username:'lucas',   displayName:'Lucas Ferreira', lat:-23.5505,lon:-46.6333,locationLabel:'São Paulo'    },
    { username:'sophie',  displayName:'Sophie Martin',  lat:48.8566, lon:2.3522,  locationLabel:'Paris'        },
    { username:'emily',   displayName:'Emily Chen',     lat:37.7749, lon:-122.4194,locationLabel:'San Francisco'},
  ];

  for (const d of demos) {
    createUser({ ...d, passwordHash: hash });
  }

  console.log(`[store] Seeded ${demos.length} demo users`);
}

module.exports = {
  // users
  createUser, getUserById, getUserByUsername, getAllUsers, updateUser,
  // messages
  saveMessage, getConversation, markRead, getUnreadCount, getConversationId,
  // websockets
  registerSocket, removeSocket, getSocket, isOnline,
  // seed
  seedDemoUsers,
};
