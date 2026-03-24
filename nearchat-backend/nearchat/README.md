# NearChat — Full-Stack Backend

Real-time proximity chat with geolocation, WebSockets, JWT auth, and Haversine-based distance filtering.

---

## Stack

| Layer | Technology |
|---|---|
| HTTP server | Node.js + Express |
| Real-time | WebSocket (`ws` library) |
| Auth | JWT (`jsonwebtoken`) + bcrypt |
| Distance | Haversine formula (pure JS) |
| Storage | In-memory (swap to Postgres/Redis) |

---

## Project Structure

```
nearchat/
├── server.js                 ← Entry point (Express + WebSocket)
├── package.json
│
├── routes/
│   ├── auth.js               ← POST /api/auth/register|login, GET /me, PUT /location
│   └── users.js              ← GET /api/users/nearby, /:id/messages, POST /:id/messages
│
├── middleware/
│   └── auth.js               ← requireAuth middleware + signToken + verifyToken
│
├── utils/
│   ├── haversine.js          ← haversine(), formatDistance(), filterUsersByScope()
│   ├── store.js              ← In-memory DB: users, messages, WS client registry
│   └── websocket.js          ← Full WebSocket server (auth, messaging, presence, typing)
│
└── public/
    └── index.html            ← Frontend (connects to backend WS + REST)
```

---

## Quick Start

```bash
# 1. Install dependencies
cd nearchat
npm install

# 2. Create .env (optional — defaults work for dev)
echo "PORT=3001" > .env
echo "JWT_SECRET=change_me_to_something_long_and_random" >> .env
echo "CLIENT_ORIGIN=http://localhost:3000" >> .env

# 3. Start the server
npm run dev        # with hot-reload (nodemon)
# or
npm start          # production

# 4. Open the frontend
open public/index.html
# or serve it: npx serve public -p 3000
```

Server starts at:
- REST API  → `http://localhost:3001/api`
- WebSocket → `ws://localhost:3001/ws`
- Health    → `http://localhost:3001/health`

---

## Demo Accounts

10 demo users are seeded at startup (password: `demo1234`):

| Username | Location |
|---|---|
| arjun | Banjara Hills, Hyderabad |
| priya | Jubilee Hills, Hyderabad |
| karthik | Gachibowli, Hyderabad |
| sneha | Madhapur, Hyderabad |
| ravi | Ameerpet, Hyderabad |
| divya | HITEC City, Hyderabad |
| yuki | Tokyo, Japan |
| lucas | São Paulo, Brazil |
| sophie | Paris, France |
| emily | San Francisco, USA |

---

## REST API Reference

### Auth

```
POST /api/auth/register
Body: { username, displayName, password, lat?, lon?, locationLabel? }
→ { token, user }

POST /api/auth/login
Body: { username, password }
→ { token, user }

GET /api/auth/me
Headers: Authorization: Bearer <token>
→ { user }

PUT /api/auth/location
Headers: Authorization: Bearer <token>
Body: { lat, lon, locationLabel? }
→ { user }
```

### Users

```
GET /api/users/nearby?scope=area|city|state|world
Headers: Authorization: Bearer <token>
→ { scope, users: [{ id, displayName, distanceLabel, distanceMeters, scope, online, unreadCount, ... }] }

GET /api/users/:id
→ { ...user, online }

GET /api/users/:id/messages?limit=50
→ { messages: [...] }

POST /api/users/:id/messages
Body: { text }
→ { message }
```

---

## WebSocket Protocol

Connect to `ws://localhost:3001/ws`. All messages are JSON `{ type, payload }`.

### Client → Server

```json
{ "type": "AUTH",            "payload": { "token": "..." } }
{ "type": "SEND_MESSAGE",    "payload": { "toId": "...", "text": "Hello!" } }
{ "type": "TYPING_START",    "payload": { "toId": "..." } }
{ "type": "TYPING_STOP",     "payload": { "toId": "..." } }
{ "type": "UPDATE_LOCATION", "payload": { "lat": 17.42, "lon": 78.44, "locationLabel": "..." } }
{ "type": "MARK_READ",       "payload": { "fromId": "..." } }
{ "type": "PING" }
```

### Server → Client

```json
{ "type": "AUTH_OK",         "payload": { "user": {...} } }
{ "type": "NEW_MESSAGE",     "payload": { "id", "fromId", "toId", "text", "createdAt" } }
{ "type": "TYPING_START",    "payload": { "fromId", "displayName" } }
{ "type": "TYPING_STOP",     "payload": { "fromId" } }
{ "type": "PRESENCE",        "payload": { "userId", "online": true|false } }
{ "type": "LOCATION_UPDATE", "payload": { "userId", "lat", "lon", "locationLabel" } }
{ "type": "PONG" }
```

---

## Haversine — How it Works

```
a = sin²(Δlat/2) + cos(lat1) · cos(lat2) · sin²(Δlon/2)
c = 2 · atan2(√a, √(1−a))
d = R · c      where R = 6,371 km
```

**Scope radius buckets:**

| Scope | Radius |
|---|---|
| Area | ≤ 2 km |
| City | ≤ 50 km |
| State | ≤ 500 km |
| World | Unlimited |

---

## Production Upgrade Path

| Current | Production |
|---|---|
| In-memory `Map` | PostgreSQL / MongoDB |
| WS client `Map` | Redis pub/sub (multi-node) |
| Single process | PM2 cluster / Docker |
| HTTP | HTTPS + TLS termination (nginx) |
| `.env` secret | AWS Secrets Manager / Vault |
| Nominatim geocoder | Google Maps / Mapbox API |
