require('dotenv').config();
const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ── CONFIG ──────────────────────────────────────────
const DISCORD_CLIENT_ID     = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_BOT_TOKEN     = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID              = '1440476225482260573'; // TheConclave server
const FRONTEND_URL          = process.env.FRONTEND_URL || 'https://theconclave.pages.dev';
const REDIRECT_URI          = process.env.REDIRECT_URI || 'https://theconclavedominion.com/auth/discord/callback';

// Role IDs
const ROLES = {
  owner: '1440476225482260573',
  admin: '1442244623002243272'
};

// Server list with IPs/ports for BattleMetrics-style querying
const SERVERS = [
  { id: 'island',      name: 'The Island',    ip: '217.114.196.102', port: 5390, map: 'TheIsland',    mode: 'PvE' },
  { id: 'volcano',     name: 'The Volcano',   ip: '217.114.196.79',  port: 5310, map: 'Volcano',      mode: 'PvE' },
  { id: 'extinction',  name: 'Extinction',    ip: '31.214.196.102',  port: 6440, map: 'Extinction',   mode: 'PvE' },
  { id: 'center',      name: 'The Center',    ip: '31.214.163.71',   port: 5120, map: 'TheCenter',    mode: 'PvE' },
  { id: 'lostcolony',  name: 'Lost Colony',   ip: '217.114.196.104', port: 5150, map: 'LostColony',   mode: 'PvE' },
  { id: 'astraeos',    name: 'Astraeos',      ip: '217.114.196.9',   port: 5320, map: 'Astraeos',     mode: 'PvE' },
  { id: 'valguero',    name: 'Valguero',      ip: '85.190.136.141',  port: 5090, map: 'Valguero',     mode: 'PvE' },
  { id: 'scorched',    name: 'Scorched Earth',ip: '217.114.196.103', port: 5240, map: 'ScorchedEarth',mode: 'PvE' },
  { id: 'aberration',  name: 'Aberration',    ip: '217.114.196.80',  port: 5540, map: 'Aberration',   mode: 'PvP' },
  { id: 'amissa',      name: 'Amissa',        ip: '217.114.196.80',  port: 5180, map: 'Amissa',       mode: 'Donator' }
];

// In-memory store (replace with DB later if needed)
let donationData = {
  goal: 200,
  raised: 0,
  month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
  donors: []
};
let announcements = [];
let events = [];

// ── MIDDLEWARE ───────────────────────────────────────
app.use(cors({
  origin: [FRONTEND_URL, 'https://theconclavedominion.com', 'https://theconclave.pages.dev'],
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'conclave-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// ── HELPERS ──────────────────────────────────────────
function isAdmin(req) {
  if (!req.session.user) return false;
  const roles = req.session.user.roles || [];
  return roles.includes(ROLES.owner) || roles.includes(ROLES.admin);
}

async function getUserRoles(userId, accessToken) {
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`, {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }
    });
    if (!res.ok) return [];
    const member = await res.json();
    return member.roles || [];
  } catch { return []; }
}

// ── BattleMetrics SERVER STATUS ──────────────────────
let serverCache = {};
let lastFetch = 0;

async function fetchServerStatuses() {
  // Only refetch every 60 seconds
  if (Date.now() - lastFetch < 60000 && Object.keys(serverCache).length) return serverCache;
  
  const results = {};
  await Promise.all(SERVERS.map(async (srv) => {
    try {
      // Search BattleMetrics by IP:port
      const url = `https://api.battlemetrics.com/servers?filter[search]=${srv.ip}:${srv.port}&filter[game]=ark&fields[server]=name,players,maxPlayers,status,ip,port`;
      const res = await fetch(url, {
        headers: process.env.BATTLEMETRICS_TOKEN 
          ? { Authorization: `Bearer ${process.env.BATTLEMETRICS_TOKEN}` } 
          : {}
      });
      if (res.ok) {
        const data = await res.json();
        const server = data.data?.[0];
        if (server) {
          results[srv.id] = {
            ...srv,
            status: server.attributes.status === 'online' ? 'online' : 'offline',
            players: server.attributes.players || 0,
            maxPlayers: server.attributes.maxPlayers || 70,
            bmId: server.id
          };
          return;
        }
      }
    } catch (e) {}
    // Fallback if BM fails
    results[srv.id] = { ...srv, status: 'unknown', players: 0, maxPlayers: 70 };
  }));

  serverCache = results;
  lastFetch = Date.now();
  return results;
}

// ── AUTH ROUTES ──────────────────────────────────────

// Step 1: Redirect to Discord
app.get('/auth/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds.members.read'
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// Step 2: Discord callback
app.get('/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect(`${FRONTEND_URL}?error=no_code`);

  try {
    // Exchange code for token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('No access token');

    // Get user info
    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const user = await userRes.json();

    // Get roles from guild
    const roles = await getUserRoles(user.id, tokenData.access_token);
    const isAdminUser = roles.includes(ROLES.owner) || roles.includes(ROLES.admin);

    req.session.user = {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      discriminator: user.discriminator,
      roles,
      isAdmin: isAdminUser
    };

    res.redirect(`${FRONTEND_URL}?login=success`);
  } catch (err) {
    console.error('Auth error:', err);
    res.redirect(`${FRONTEND_URL}?error=auth_failed`);
  }
});

// Logout
app.get('/auth/logout', (req, res) => {
  req.session.destroy();
  res.redirect(FRONTEND_URL);
});

// Get current session user
app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, user: req.session.user });
});

// ── SERVER STATUS ROUTES ─────────────────────────────
app.get('/api/servers', async (req, res) => {
  try {
    const statuses = await fetchServerStatuses();
    res.json({ servers: Object.values(statuses), lastUpdated: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch server status' });
  }
});

app.get('/api/servers/:id', async (req, res) => {
  const statuses = await fetchServerStatuses();
  const server = statuses[req.params.id];
  if (!server) return res.status(404).json({ error: 'Server not found' });
  res.json(server);
});

// ── DONATION ROUTES ──────────────────────────────────
app.get('/api/donation', (req, res) => {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = daysInMonth - now.getDate();
  res.json({ ...donationData, daysRemaining, percentage: Math.min(100, Math.round((donationData.raised / donationData.goal) * 100)) });
});

app.post('/api/donation', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
  const { goal, raised, donors } = req.body;
  if (goal !== undefined) donationData.goal = goal;
  if (raised !== undefined) donationData.raised = raised;
  if (donors !== undefined) donationData.donors = donors;
  donationData.month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
  res.json({ success: true, data: donationData });
});

// ── ANNOUNCEMENTS ────────────────────────────────────
app.get('/api/announcements', (req, res) => res.json(announcements));

app.post('/api/announcements', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
  const ann = { ...req.body, id: Date.now(), date: new Date().toISOString() };
  announcements.unshift(ann);
  res.json({ success: true, announcement: ann });
});

app.delete('/api/announcements/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
  announcements = announcements.filter(a => a.id !== parseInt(req.params.id));
  res.json({ success: true });
});

// ── EVENTS ───────────────────────────────────────────
app.get('/api/events', (req, res) => res.json(events));

app.post('/api/events', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
  const ev = { ...req.body, id: Date.now() };
  events.unshift(ev);
  res.json({ success: true, event: ev });
});

app.delete('/api/events/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
  events = events.filter(e => e.id !== parseInt(req.params.id));
  res.json({ success: true });
});

// ── HEALTH CHECK ─────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'TheConclave API' }));

app.listen(PORT, () => console.log(`TheConclave API running on port ${PORT}`));
