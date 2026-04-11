// ═══════════════════════════════════════════════════════════════
// CONCLAVE AEGIS API — server.js v7.0
// Express API + Discord OAuth + Supabase + BattleMetrics
// Bot loaded safely at bottom via bot.js
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');
const axios      = require('axios');
const session    = require('express-session');
const Anthropic  = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

// ─── ENV ──────────────────────────────────────────────────────────
const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  DISCORD_WEBHOOK_URL,
  JWT_SECRET,
  FRONTEND_URL,
  NODE_ENV,
  ROLE_OWNER_ID,
  ROLE_ADMIN_ID,
  ROLE_HELPER_ID,
  ROLE_BOOSTER_ID,
  ROLE_DONATOR_ID,
  ROLE_ADVERTISER_ID,
  ROLE_SURVIVOR_ID,
  ANTHROPIC_API_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SESSION_SECRET,
  BATTLEMETRICS_TOKEN,
  PORT
} = process.env;

// ─── CONSTANTS ────────────────────────────────────────────────────
const DISCORD_API = 'https://discord.com/api/v10';
const IS_PROD     = NODE_ENV === 'production';
const FRONTEND    = FRONTEND_URL || 'http://localhost:3000';
const APP_PORT    = PORT || 5001;

// ─── REQUIRED ENV CHECKS ──────────────────────────────────────────
if (!SUPABASE_URL)              throw new Error('SUPABASE_URL missing');
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
if (!JWT_SECRET)     console.warn('⚠️  JWT_SECRET missing — auth routes will fail');
if (!SESSION_SECRET) console.warn('⚠️  SESSION_SECRET missing — using fallback');

// ─── CLIENTS ──────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── BEACON SENTINEL ──────────────────────────────────────────
// ─── BEACON SENTINEL ENGINE (inlined) ─────────────────────────
// ═══════════════════════════════════════════════════════════════
// BEACON SENTINEL ENGINE — beacon.js v1.0
// OAuth 2.1 + Sentinel API for TheConclave Dominion
// Handles: token lifecycle, device auth, player/tribe/server data
// ═══════════════════════════════════════════════════════════════
'use strict';




const _BCL_API   = 'https://api.usebeacon.app';
const _BCL_ID    = process.env.BEACON__BCL_ID    || 'eb9ecdff-4048-4a83-8f40-f2e16d2e9a81';
const _BCL_SEC   = process.env.BEACON__BCL_SEC|| process.env.BEACON_SENTINEL_KEY || '';
const _BCL__BCL_SCOPE = 'common sentinel:read sentinel:write';

// ─── TOKEN STORE ──────────────────────────────────────────────
// In-memory + env fallback. On boot loads from env, refreshes silently.
let _accessToken  = process.env.BEACON_ACCESS_TOKEN  || null;
let _refreshToken = process.env.BEACON_REFRESH_TOKEN || null;
let _tokenExpiry  = 0; // unix ms
let _devicePoll   = null;

// ─── PKCE HELPERS ─────────────────────────────────────────────
function generateVerifier() {
  return crypto.randomBytes(48).toString('base64url').slice(0, 96);
}
function generateChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ─── TOKEN MANAGEMENT ─────────────────────────────────────────
async function refreshAccessToken() {
  if (!_refreshToken) return false;
  try {
    const res = await axios.post(`${_BCL_API}/v4/login`, {
      client_id:     _BCL_ID,
      client_secret: _BCL_SEC,
      grant_type:    'refresh_token',
      refresh_token: _refreshToken,
      scope:         _BCL_SCOPE,
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });

    _accessToken  = res.data.access_token;
    _refreshToken = res.data.refresh_token;
    _tokenExpiry  = Date.now() + (res.data.access_token_expires_in * 1000) - 60000;
    console.log('✅ Beacon token refreshed');
    return true;
  } catch (e) {
    console.error('❌ Beacon token refresh failed:', e.response?.data || e.message);
    return false;
  }
}

async function getToken() {
  if (!_accessToken) return null;
  if (Date.now() > _tokenExpiry) await refreshAccessToken();
  return _accessToken;
}

function isAuthed() { return !!_accessToken; }

// ─── DEVICE AUTH FLOW ─────────────────────────────────────────
// Call startDeviceAuth() → show user the URL + code → poll until done
let _pendingVerifier = null;

async function startDeviceAuth() {
  const verifier   = generateVerifier();
  const challenge  = generateChallenge(verifier);
  _pendingVerifier = verifier;

  try {
    const params = new URLSearchParams({
      client_id:             _BCL_ID,
      client_secret:         _BCL_SEC,
      scope:                 _BCL_SCOPE,
      code_challenge:        challenge,
      code_challenge_method: 'S256',
    });
    const res = await axios.post(`${_BCL_API}/v4/device`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    });
    return {
      userCode:            res.data.user_code,
      verificationUri:     res.data.verification_uri,
      verificationUriFull: res.data.verification_uri_complete,
      deviceCode:          res.data.device_code,
      interval:            res.data.interval || 5,
      expiresIn:           res.data.expires_in,
    };
  } catch (e) {
    throw new Error('Beacon device auth start failed: ' + (e.response?.data?.message || e.message));
  }
}

async function pollDeviceAuth(deviceCode) {
  if (!_pendingVerifier) throw new Error('No pending verifier — call startDeviceAuth first');
  try {
    const res = await axios.post(`${_BCL_API}/v4/login`, {
      client_id:     _BCL_ID,
      client_secret: _BCL_SEC,
      device_code:   deviceCode,
      grant_type:    'device_code',
      code_verifier: _pendingVerifier,
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });

    if (res.data.access_token) {
      _accessToken     = res.data.access_token;
      _refreshToken    = res.data.refresh_token;
      _tokenExpiry     = Date.now() + (res.data.access_token_expires_in * 1000) - 60000;
      _pendingVerifier = null;
      console.log('✅ Beacon auth complete — tokens stored');
      return { success: true, refreshToken: _refreshToken };
    }
    return { success: false, pending: true };
  } catch (e) {
    const code = e.response?.data?.error;
    if (code === 'authorization_pending') return { success: false, pending: true };
    if (code === 'slow_down')             return { success: false, pending: true, slowDown: true };
    if (code === 'expired_token')         return { success: false, expired: true };
    if (code === 'access_denied')         return { success: false, denied: true };
    return { success: false, error: e.response?.data?.message || e.message };
  }
}

// ─── SENTINEL API CALLS ────────────────────────────────────────
async function sentinelGet(path, params = {}) {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated with Beacon');
  const res = await axios.get(`${_BCL_API}/v4/sentinel${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
    timeout: 10000,
  });
  return res.data;
}

// ── Services (Servers) ────────────────────────────────────────
async function getServices() {
  const data = await sentinelGet('/services');
  return data.results || [];
}

// ── Online Characters (who's live right now) ──────────────────
async function getOnlineCharacters(serviceId = null) {
  const params = serviceId ? { serviceId } : {};
  const data   = await sentinelGet('/characters', { ...params, online: true });
  return data.results || [];
}

// ── All Players (registered in Sentinel) ─────────────────────
async function getPlayers(limit = 50) {
  const data = await sentinelGet('/players', { pageSize: limit });
  return data.results || [];
}

// ── Player by identifier (gamertag / steam id) ────────────────
async function findPlayer(query) {
  const data = await sentinelGet('/players', { pageSize: 25 });
  const all  = data.results || [];
  const q    = query.toLowerCase();
  return all.filter(p =>
    (p.playerName || '').toLowerCase().includes(q) ||
    (p.playerId   || '').toLowerCase().includes(q)
  );
}

// ── Player Sessions (recent activity) ────────────────────────
async function getPlayerSessions(playerId, limit = 10) {
  const data = await sentinelGet('/sessions', { playerId, pageSize: limit });
  return data.results || [];
}

// ── Tribes ────────────────────────────────────────────────────
async function getTribes(serviceId = null) {
  const params = serviceId ? { serviceId, pageSize: 100 } : { pageSize: 100 };
  const data   = await sentinelGet('/tribes', params);
  return data.results || [];
}

// ── Dinos ─────────────────────────────────────────────────────
async function getDinos(serviceId = null, limit = 100) {
  const params = { pageSize: limit, ...(serviceId ? { serviceId } : {}) };
  const data   = await sentinelGet('/dinos', params);
  return data.results || [];
}

// ── Bans ──────────────────────────────────────────────────────
async function getBans() {
  const data = await sentinelGet('/bans', { pageSize: 100 });
  return data.results || [];
}

async function banPlayer(playerId, reason = 'Banned via AEGIS') {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated with Beacon');
  await axios.post(`${_BCL_API}/v4/sentinel/bans`, {
    playerId, reason
  }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
}

async function unbanPlayer(banId) {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated with Beacon');
  await axios.delete(`${_BCL_API}/v4/sentinel/bans/${banId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// ── Log Messages ─────────────────────────────────────────────
async function getLogs(serviceId = null, limit = 50) {
  const params = { pageSize: limit, ...(serviceId ? { serviceId } : {}) };
  const data   = await sentinelGet('/log-messages', params);
  return data.results || [];
}

// ── Execute Admin Command ─────────────────────────────────────
async function executeCommand(serviceId, command) {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated with Beacon');
  const res = await axios.post(`${_BCL_API}/v4/sentinel/game-commands`, {
    serviceId, command
  }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 15000,
  });
  return res.data;
}

// ─── CLUSTER SUMMARY ──────────────────────────────────────────
// Combines Sentinel service data with Nitrado player counts
async function getClusterSummary() {
  const services = await getServices();
  const online   = await getOnlineCharacters();

  const summary = services.map(srv => {
    const chars = online.filter(c => c.serviceId === srv.serviceId);
    return {
      serviceId:   srv.serviceId,
      name:        srv.name,
      status:      srv.status,
      playerCount: chars.length,
      players:     chars.map(c => ({
        name:    c.characterName || c.playerName || 'Unknown',
        tribe:   c.tribeName     || null,
        level:   c.level         || null,
      })),
    };
  });
  return summary;
}

// ─── AUTO REFRESH LOOP ─────────────────────────────────────────
// Refreshes token every 45 min silently
setInterval(async () => {
  if (_refreshToken && Date.now() > _tokenExpiry - 5 * 60_000) {
    await refreshAccessToken();
  }
}, 45 * 60_000);

const beacon = {
  isAuthed,
  getToken,
  startDeviceAuth,
  pollDeviceAuth,
  refreshAccessToken,
  // Sentinel
  getServices,
  getOnlineCharacters,
  getPlayers,
  findPlayer,
  getPlayerSessions,
  getTribes,
  getDinos,
  getBans,
  banPlayer,
  unbanPlayer,
  getLogs,
  executeCommand,
  getClusterSummary,
  // Token state (for admin panel)
  getTokenState: () => ({
    authed:      !!_accessToken,
    expiry:      _tokenExpiry,
    hasRefresh:  !!_refreshToken,
  }),
  // Allow server.js to inject tokens on startup
  setTokens: (access, refresh, expiry) => {
    _accessToken  = access;
    _refreshToken = refresh;
    _tokenExpiry  = expiry || Date.now() + 3600_000;
  },
};

// ─── END BEACON ENGINE ────────────────────────────────────────
// Load stored tokens from env on boot
if (process.env.BEACON_ACCESS_TOKEN && process.env.BEACON_REFRESH_TOKEN) {
  beacon.setTokens(
    process.env.BEACON_ACCESS_TOKEN,
    process.env.BEACON_REFRESH_TOKEN,
    parseInt(process.env.BEACON_TOKEN_EXPIRY || '0')
  );
  console.log('✅ Beacon tokens loaded from env');
}

const anthropic = ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  : null;

// ─── EXPRESS APP ──────────────────────────────────────────────────
const app = express();

app.set('trust proxy', 1);

app.use(cors({
  origin: [
    FRONTEND,
    'https://theconclave.pages.dev',
    'https://theconclavedominion.com',
    'https://www.theconclavedominion.com'
  ],
  credentials: true
}));

app.use(express.json());

app.use(session({
  secret: SESSION_SECRET || 'conclave-secret-fallback',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure:   IS_PROD,
    httpOnly: true,
    sameSite: IS_PROD ? 'none' : 'lax',
    maxAge:   8 * 60 * 60 * 1000  // 8 hours
  }
}));

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────
const verifyToken = (req, res, next) => {
  // Session first (OAuth flow)
  if (req.session?.user) {
    req.user = req.session.user;
    return next();
  }
  // Bearer JWT fallback (AEGIS-AI direct calls)
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    return next();
  } catch {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

const checkAdmin = (req, res, next) => {
  const role = req.user?.role;
  if (role === 'owner' || role === 'admin') return next();
  return res.status(403).json({ message: 'Access denied' });
};

// ─── KNOWLEDGE / AI ───────────────────────────────────────────────
async function getLiveKnowledge() {
  try {
    const { data, error } = await supabase
      .from('aegis_knowledge')
      .select('*')
      .order('category');

    if (error || !data?.length) return '';

    let extra = '\n\nLIVE KNOWLEDGE BASE:\n';
    data.forEach(row => {
      extra += `[${row.category}] ${row.title}: ${row.content}\n`;
    });
    return extra;
  } catch (err) {
    console.error('❌ getLiveKnowledge:', err.message);
    return '';
  }
}

const AEGIS_CORE = `You are Conclave Aegis, the AI intelligence of TheConclave Dominion — an ARK: Survival Ascended 5x crossplay PvE cluster.
10 maps: The Island, The Volcano, Extinction, The Center, Lost Colony, Astraeos, Valguero, Scorched Earth, Aberration (PvP), Amissa (Patreon).
5x XP/Harvesting/Taming/Breeding. 1M weight. No fall damage. Max wild dino: 350.
Mods: Death Inventory Keeper, ARKomatic, Awesome Spyglass, Awesome Teleporter.
Soap to Element: use Tek Replicator. First torpor = tame ownership.
Website: theconclavedominion.com | Discord: discord.gg/theconclave | Support: $TheConclaveDominion CashApp.
Be helpful, accurate, and concise. Keep Discord responses under 1500 chars.`;

async function buildPrompt(extra = '') {
  const live = await getLiveKnowledge();
  return AEGIS_CORE + live + extra;
}

// ─── DISCORD HELPERS ──────────────────────────────────────────────
// REDIRECT_URI must match EXACTLY what's registered in Discord Developer Portal
// Set DISCORD_REDIRECT_URI=https://api.theconclavedominion.com/auth/discord/callback
const REDIRECT_URI = DISCORD_REDIRECT_URI || 'https://api.theconclavedominion.com/auth/discord/callback';

const generateAuthUrl = () => {
  const params = new URLSearchParams({
    client_id:     DISCORD_CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         'identify guilds.members.read'
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
};

const getAccessToken = async (code) => {
  const params = new URLSearchParams({
    client_id:     DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type:    'authorization_code',
    code,
    redirect_uri:  REDIRECT_URI
  });
  const res = await axios.post(
    `${DISCORD_API}/oauth2/token`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data.access_token;
};

const getUserData = async (accessToken) => {
  const res = await axios.get(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return res.data;
};

const getUserGuildRole = async (accessToken) => {
  try {
    const res = await axios.get(
      `${DISCORD_API}/users/@me/guilds/${DISCORD_GUILD_ID}/member`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const roles = res.data.roles || [];
    const roleMap = {
      [ROLE_OWNER_ID]:      'owner',
      [ROLE_ADMIN_ID]:      'admin',
      [ROLE_HELPER_ID]:     'helper',
      [ROLE_BOOSTER_ID]:    'booster',
      [ROLE_DONATOR_ID]:    'donator',
      [ROLE_ADVERTISER_ID]: 'advertiser',
      [ROLE_SURVIVOR_ID]:   'survivor'
    };
    for (const [id, name] of Object.entries(roleMap)) {
      if (id && roles.includes(id)) return name;
    }
    return 'member';
  } catch {
    return 'guest';
  }
};

const getGuildMemberCount = async () => {
  const res = await axios.get(
    `${DISCORD_API}/guilds/${DISCORD_GUILD_ID}?with_counts=true`,
    { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
  );
  return res.data.approximate_member_count;
};

// ─── SERVER LIST ─────────────────────────────────────────────────
// FIX: Volcano IP corrected from 217.114.196.79:5310 → 217.114.196.59:5050
const SERVERS = [
  { id: 'island',     name: 'The Island',    nitradoId: 18266152, ip: '217.114.196.102', port: 5390, mode: 'PvE',     maxPlayers: 20, fullName: 'TheConclave-TheIsland-5xCrossplay'      },
  { id: 'volcano',    name: 'Volcano',        nitradoId: 18094678, ip: '217.114.196.59',  port: 5050, mode: 'PvE',     maxPlayers: 20, fullName: 'TheConclave-Volcano-5xCrossplay'        },
  { id: 'extinction', name: 'Extinction',     nitradoId: 18106633, ip: '31.214.196.102',  port: 6440, mode: 'PvE',     maxPlayers: 20, fullName: 'TheConclave-Extinction-5Xcrossplay'     },
  { id: 'center',     name: 'The Center',     nitradoId: 18182839, ip: '31.214.163.71',   port: 5120, mode: 'PvE',     maxPlayers: 20, fullName: 'TheConclave-Center-5xCrossplay'         },
  { id: 'lostcolony', name: 'Lost Colony',    nitradoId: 18307276, ip: '217.114.196.104', port: 5150, mode: 'PvE',     maxPlayers: 20, fullName: 'TheConclave-LostColony-5xCrossplay'     },
  { id: 'astraeos',   name: 'Astraeos',       nitradoId: 18393892, ip: '217.114.196.9',   port: 5320, mode: 'PvE',     maxPlayers: 20, fullName: 'TheConclave-Astreos-5xCrossplay'        },
  { id: 'valguero',   name: 'Valguero',       nitradoId: 18509341, ip: '85.190.136.141',  port: 5090, mode: 'PvE',     maxPlayers: 20, fullName: 'TheConclave-Valguero-5xCrossplay'       },
  { id: 'scorched',   name: 'Scorched Earth', nitradoId: 18598049, ip: '217.114.196.103', port: 5240, mode: 'PvE',     maxPlayers: 20, fullName: 'TheConclave-Scorched-5xCrossplay'       },
  { id: 'aberration', name: 'Aberration',     nitradoId: 18655529, ip: '217.114.196.80',  port: 5540, mode: 'PvP',     maxPlayers: 20, fullName: 'TheConclave-Aberration-5xCrossplay'     },
  { id: 'amissa',     name: 'Amissa',         nitradoId: 18680162, ip: '217.114.196.80',  port: 5180, mode: 'Patreon', maxPlayers: 20, fullName: 'TheConclave-Amissa-Patreon-5xCrossplay' },
];

let serverCache = {};
let lastServerFetch = 0;

const NITRADO_API_URL = 'https://api.nitrado.net';

async function fetchNitradoDirect(nitradoId) {
  const key = process.env.NITRADO_API_KEY;
  if (!key) return null;
  try {
    const res = await axios.get(`${NITRADO_API_URL}/services/${nitradoId}/gameservers`, {
      headers: { Authorization: `Bearer ${key}` },
      timeout: 10000,
    });
    const gs = res.data?.data?.gameserver;
    if (!gs) return null;
    return {
      status:     gs.status === 'started' ? 'online' : 'offline',
      players:    gs.query?.player_current  ?? 0,
      maxPlayers: gs.query?.player_max      ?? 20,
      version:    gs.query?.version         ?? null,
      playerList: gs.query?.players         ?? [],
    };
  } catch { return null; }
}

const fetchServerStatuses = async () => {
  if (Date.now() - lastServerFetch < 60000 && Object.keys(serverCache).length) {
    return serverCache;
  }

  const results = {};
  const useNitrado = !!process.env.NITRADO_API_KEY;

  await Promise.all(
    SERVERS.map(async (srv) => {
      try {
        if (useNitrado && srv.nitradoId) {
          const data = await fetchNitradoDirect(srv.nitradoId);
          results[srv.id] = {
            ...srv,
            status:     data?.status     ?? 'unknown',
            players:    data?.players    ?? 0,
            maxPlayers: data?.maxPlayers ?? 20,
            version:    data?.version    ?? null,
          };
        } else {
          // BattleMetrics fallback
          const searchTerm = encodeURIComponent(srv.fullName || `${srv.ip}:${srv.port}`);
          const url = `https://api.battlemetrics.com/servers?filter[search]=${searchTerm}&filter[game]=arksa&fields[server]=name,players,maxPlayers,status,ip,port&page[size]=5`;
          const headers = BATTLEMETRICS_TOKEN ? { Authorization: `Bearer ${BATTLEMETRICS_TOKEN}` } : {};
          const response = await axios.get(url, { headers, timeout: 10000 });
          const data = response.data?.data || [];
          const match =
            data.find(s => String(s.attributes.port) === String(srv.port) && s.attributes.ip === srv.ip) ||
            data.find(s => String(s.attributes.port) === String(srv.port)) || data[0];
          results[srv.id] = match
            ? { ...srv, status: match.attributes.status === 'online' ? 'online' : 'offline', players: match.attributes.players || 0 }
            : { ...srv, status: 'unknown', players: 0 };
        }
      } catch {
        results[srv.id] = { ...srv, status: 'unknown', players: 0 };
      }
    })
  );

  serverCache     = results;
  lastServerFetch = Date.now();
  return results;
};


// ═══════════════════════════════════════════════════════════════
// BEACON SENTINEL ENGINE
// OAuth 2.1 + PKCE device flow — auto-refresh — full Sentinel API
// ═══════════════════════════════════════════════════════════════
const crypto = require('crypto');
const BEACON_API  = 'https://api.usebeacon.app';
const BEACON_CID  = process.env.BEACON_CLIENT_ID  || 'eb9ecdff-4048-4a83-8f40-f2e16d2e9a81';
const BEACON_CSEC = process.env.BEACON_CLIENT_SECRET || process.env.BEACON_SENTINEL_KEY;

// In-memory token store — persists in Render env vars via /api/beacon/auth/save
const beaconToken = {
  access:       process.env.BEACON_ACCESS_TOKEN  || null,
  refresh:      process.env.BEACON_REFRESH_TOKEN || null,
  expiresAt:    parseInt(process.env.BEACON_TOKEN_EXPIRES || '0'),
  groupId:      process.env.BEACON_GROUP_ID      || null,
};

// PKCE helpers
function genVerifier() {
  return crypto.randomBytes(48).toString('base64url').slice(0, 96);
}
function genChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// Token refresh
async function beaconRefresh() {
  if (!beaconToken.refresh) return false;
  try {
    const res = await axios.post(`${BEACON_API}/v4/login`, {
      client_id:     BEACON_CID,
      client_secret: BEACON_CSEC,
      grant_type:    'refresh_token',
      refresh_token: beaconToken.refresh,
      scope:         'common sentinel:read sentinel:write',
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
    beaconToken.access    = res.data.access_token;
    beaconToken.refresh   = res.data.refresh_token;
    beaconToken.expiresAt = res.data.access_token_expiration;
    console.log('✅ Beacon token refreshed');
    return true;
  } catch (e) {
    console.error('❌ Beacon refresh failed:', e.message);
    return false;
  }
}

// Auto-refresh check
async function beaconAuth() {
  if (!beaconToken.access) return null;
  const now = Math.floor(Date.now() / 1000);
  if (beaconToken.expiresAt && now >= beaconToken.expiresAt - 300) {
    await beaconRefresh();
  }
  return beaconToken.access;
}

// Generic Beacon API request
async function beaconGet(path, params = {}) {
  const token = await beaconAuth();
  if (!token) throw new Error('Beacon not authenticated. Run /beacon-setup in Discord.');
  const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
  const res = await axios.get(`${BEACON_API}${path}${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 12000,
  });
  return res.data;
}

// Discover the user's Sentinel group ID automatically
async function beaconDiscoverGroup() {
  if (beaconToken.groupId) return beaconToken.groupId;
  try {
    const data = await beaconGet('/v4/sentinel/groups');
    const group = data.results?.[0];
    if (group) {
      beaconToken.groupId = group.groupId;
      console.log(`📡 Beacon Sentinel group: ${group.name} (${group.groupId})`);
      return group.groupId;
    }
  } catch (e) {
    console.error('❌ Beacon group discovery:', e.message);
  }
  return null;
}

// ─── BEACON SENTINEL DATA FETCHERS ─────────────────────────────
async function beaconGetOnlinePlayers() {
  const gid = await beaconDiscoverGroup();
  if (!gid) return [];
  try {
    const data = await beaconGet(`/v4/sentinel/groups/${gid}/characters`, { online: 'true', pageSize: 250 });
    return (data.results || []).map(c => ({
      name:     c.characterName || c.playerName || 'Unknown',
      tribe:    c.tribeName     || null,
      server:   c.serviceName   || null,
      playerId: c.playerId      || null,
      online:   true,
    }));
  } catch { return []; }
}

async function beaconGetServers() {
  const gid = await beaconDiscoverGroup();
  if (!gid) return [];
  try {
    const data = await beaconGet(`/v4/sentinel/groups/${gid}/services`, { pageSize: 50 });
    return (data.results || []).map(s => ({
      serviceId: s.serviceId,
      name:      s.serviceName || s.name,
      status:    s.connected   ? 'online' : 'offline',
      address:   s.serverAddress || null,
    }));
  } catch { return []; }
}

async function beaconGetTribes() {
  const gid = await beaconDiscoverGroup();
  if (!gid) return [];
  try {
    const data = await beaconGet(`/v4/sentinel/groups/${gid}/tribes`, { pageSize: 250 });
    return (data.results || []).map(t => ({
      tribeId:     t.tribeId,
      name:        t.tribeName,
      memberCount: t.memberCount || 0,
      server:      t.serviceName || null,
    }));
  } catch { return []; }
}

async function beaconGetBans() {
  const gid = await beaconDiscoverGroup();
  if (!gid) return [];
  try {
    const data = await beaconGet(`/v4/sentinel/groups/${gid}/bans`, { pageSize: 100 });
    return (data.results || []).map(b => ({
      playerName: b.playerName || b.playerId,
      reason:     b.reason     || 'No reason',
      bannedAt:   b.createdAt  || null,
      bannedBy:   b.createdBy  || 'Unknown',
    }));
  } catch { return []; }
}

async function beaconGetPlayer(name) {
  const gid = await beaconDiscoverGroup();
  if (!gid) return null;
  try {
    const data = await beaconGet(`/v4/sentinel/groups/${gid}/players`, { search: name, pageSize: 10 });
    return data.results?.[0] || null;
  } catch { return null; }
}

// ─── BEACON OAUTH DEVICE FLOW ──────────────────────────────────
// Stored device sessions keyed by state
const beaconDeviceSessions = new Map();

app.post('/api/beacon/auth/start', async (req, res) => {
  try {
    const verifier   = genVerifier();
    const challenge  = genChallenge(verifier);
    const formData   = new URLSearchParams({
      client_id:            BEACON_CID,
      client_secret:        BEACON_CSEC || '',
      scope:                'common sentinel:read sentinel:write',
      code_challenge:       challenge,
      code_challenge_method:'S256',
    });
    const r = await axios.post(`${BEACON_API}/v4/device`, formData.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    });
    const { device_code, user_code, verification_uri, verification_uri_complete, interval, expires_in } = r.data;
    beaconDeviceSessions.set(device_code, { verifier, device_code, interval: interval || 5 });
    res.json({ device_code, user_code, verification_uri, verification_uri_complete, expires_in });
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

app.post('/api/beacon/auth/poll', async (req, res) => {
  const { device_code } = req.body;
  const session = beaconDeviceSessions.get(device_code);
  if (!session) return res.status(400).json({ error: 'Unknown device_code' });
  try {
    const r = await axios.post(`${BEACON_API}/v4/login`, {
      client_id:     BEACON_CID,
      client_secret: BEACON_CSEC || undefined,
      device_code,
      grant_type:    'urn:ietf:params:oauth:grant-type:device_code',
      code_verifier: session.verifier,
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });

    const { access_token, refresh_token, access_token_expiration } = r.data;
    beaconToken.access    = access_token;
    beaconToken.refresh   = refresh_token;
    beaconToken.expiresAt = access_token_expiration;
    beaconDeviceSessions.delete(device_code);
    // Discover group immediately
    await beaconDiscoverGroup();
    res.json({
      success:     true,
      groupId:     beaconToken.groupId,
      access_token,
      refresh_token,
      expires_at:  access_token_expiration,
    });
  } catch (e) {
    const code = e.response?.data?.error;
    if (code === 'authorization_pending') return res.json({ pending: true });
    if (code === 'slow_down')             return res.json({ pending: true, slow: true });
    if (code === 'expired_token')         return res.status(410).json({ error: 'Device code expired' });
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

// ─── BEACON SENTINEL API ROUTES ────────────────────────────────
app.get('/api/beacon/players/online', async (req, res) => {
  try { res.json({ players: await beaconGetOnlinePlayers() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/beacon/servers', async (req, res) => {
  try { res.json({ servers: await beaconGetServers() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/beacon/tribes', async (req, res) => {
  try { res.json({ tribes: await beaconGetTribes() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/beacon/bans', verifyToken, checkAdmin, async (req, res) => {
  try { res.json({ bans: await beaconGetBans() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/beacon/player', verifyToken, checkAdmin, async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });
  try { res.json({ player: await beaconGetPlayer(name) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/beacon/status', (_req, res) => {
  res.json({
    authenticated: !!beaconToken.access,
    groupId:       beaconToken.groupId,
    expiresAt:     beaconToken.expiresAt,
    expiresIn:     beaconToken.expiresAt ? Math.max(0, beaconToken.expiresAt - Math.floor(Date.now()/1000)) : 0,
  });
});

// Auto-refresh token every 45 minutes
setInterval(async () => {
  if (beaconToken.refresh) await beaconRefresh();
}, 45 * 60_000);

// Expose fetchers for bot.js to use via internal calls
module.exports = module.exports || {};
// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

// ─── HEALTH / ROOT ────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ name: 'Conclave Aegis', status: 'online', version: '7.0' });
});

app.get('/health', (_req, res) => {
  const beaconState = beacon.getTokenState();
  res.json({
    status:      'online',
    version:     '7.0',
    supabase:    SUPABASE_URL ? 'connected' : false,
    anthropic:   ANTHROPIC_API_KEY ? 'connected' : false,
    nitrado:     process.env.NITRADO_API_KEY ? 'connected' : false,
    beacon:      beaconToken.access ? 'connected' : (BEACON_CID ? 'auth_required' : false),
    beacon:      beaconState.authed ? 'connected' : 'needs_auth',
    discord:     DISCORD_BOT_TOKEN ? true : false,
    battlemetrics: false,
    ts:          new Date().toISOString(),
  });
});

app.get('/api/members', async (_req, res, next) => {
  try {
    const count = await getGuildMemberCount();
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

// ─── AUTH ─────────────────────────────────────────────────────────
app.get('/auth/discord', (_req, res) => {
  console.log(`🔐 Auth redirect → redirect_uri: ${REDIRECT_URI}`);
  res.redirect(generateAuthUrl());
});

// Debug endpoint — shows auth config without secrets
app.get('/auth/debug', (_req, res) => {
  res.json({
    client_id_set:     !!DISCORD_CLIENT_ID,
    client_secret_set: !!DISCORD_CLIENT_SECRET,
    redirect_uri:      REDIRECT_URI,
    frontend:          FRONTEND,
    guild_id:          DISCORD_GUILD_ID,
    jwt_secret_set:    !!JWT_SECRET,
  });
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect(`${FRONTEND}?error=no_code`);

  try {
    const accessToken = await getAccessToken(code);
    const user        = await getUserData(accessToken);
    let   role        = await getUserGuildRole(accessToken);
    let   isAdmin     = role === 'owner' || role === 'admin';

    // Bot fallback — check member roles directly if OAuth didn't grant admin
    if (!isAdmin) {
      try {
        const memberRes  = await axios.get(
          `${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members/${user.id}`,
          { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
        );
        const memberRoles = memberRes.data.roles || [];
        const roleMap = {
          [ROLE_OWNER_ID]: 'owner',
          [ROLE_ADMIN_ID]: 'admin',
          [ROLE_HELPER_ID]: 'helper'
        };
        for (const [id, name] of Object.entries(roleMap)) {
          if (id && memberRoles.includes(id)) {
            role    = name;
            isAdmin = name === 'owner' || name === 'admin';
            console.log(`✅ Bot fallback role: ${name} for ${user.username}`);
            break;
          }
        }
      } catch (botErr) {
        console.warn(`⚠️ Bot fallback failed for ${user.username}:`, botErr.message);
      }
    }

    console.log(`✅ Auth: ${user.username} → ${role} (isAdmin: ${isAdmin})`);

    req.session.user = {
      id:       user.id,
      username: user.username,
      avatar:   user.avatar,
      role,
      isAdmin
    };

    const token = jwt.sign(
      { discordId: user.id, username: user.username, avatar: user.avatar, role, isAdmin },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.redirect(`${FRONTEND}/AEGIS-Admin.html?token=${token}&login=success`);
  } catch (err) {
    console.error('❌ Auth callback error:', err.message);
    console.error('   Stack:', err.response?.data || err.stack?.split('\n')[0]);
    return res.redirect(`${FRONTEND}?error=auth_failed&reason=${encodeURIComponent(err.message)}`);
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect(FRONTEND));
});

app.get('/api/me', (req, res) => {
  if (req.session?.user) {
    return res.json({ loggedIn: true, user: req.session.user });
  }
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.json({ loggedIn: false });
  try {
    const user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    return res.json({ loggedIn: true, user });
  } catch {
    return res.json({ loggedIn: false });
  }
});

// ─── SERVERS ──────────────────────────────────────────────────────
app.get('/api/servers', async (_req, res, next) => {
  try {
    const servers = Object.values(await fetchServerStatuses());
    res.json({ servers, lastUpdated: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

// ─── MINECRAFT ────────────────────────────────────────────────────
app.get('/api/minecraft/status', async (_req, res) => {
  try {
    const net = require('net');
    let online = false;

    await new Promise(resolve => {
      const socket = new net.Socket();
      socket.setTimeout(4000);
      socket.connect(10090, '134.255.214.44', () => {
        online = true;
        socket.destroy();
        resolve();
      });
      socket.on('error',   () => resolve());
      socket.on('timeout', () => { socket.destroy(); resolve(); });
    });

    // FIX: was 'Java' — this server runs Bedrock
    res.json({ online, ip: '134.255.214.44:10090', players: 0, maxPlayers: 20, edition: 'Bedrock' });
  } catch {
    res.json({ online: false, ip: '134.255.214.44:10090', players: 0, edition: 'Bedrock' });
  }
});

// ─── SHARD ORDERS ─────────────────────────────────────────────────
// Accepts both /api/shard-order (legacy) and /api/orders (frontend v18)
async function handleShardOrder(req, res, next) {
  try {
    const { username, item, cost, discordId, discordTag, tribeName, mapName, specifics } = req.body;

    if (!username || !item) {
      return res.status(400).json({ message: 'Missing required fields: username and item' });
    }

    const displayTag  = discordTag || discordId || 'N/A';
    const mentionStr  = discordId ? `<@${discordId}> (${displayTag})` : displayTag;
    const ref         = `ORD-${Date.now().toString(36).toUpperCase()}`;

    // Webhook notification
    if (DISCORD_WEBHOOK_URL) {
      await axios.post(DISCORD_WEBHOOK_URL, {
        username: 'Clave Shard Shop',
        content:  '📬 **New ClaveShard order!**',
        embeds: [{
          title: '🛒 New ClaveShard Order',
          color: 0xFFB800,
          fields: [
            { name: '📦 Item / Tier',   value: item                         },
            { name: '💠 Cost',          value: cost       || 'N/A', inline: true },
            { name: '🎮 Player Name',   value: username,             inline: true },
            { name: '🛡️ Tribe',        value: tribeName  || 'Solo', inline: true },
            { name: '🗺️ Map',          value: mapName    || 'N/A',  inline: true },
            { name: '💬 Discord',       value: mentionStr,           inline: true },
            { name: '🔖 Ref',           value: ref,                  inline: true },
            { name: '📝 Notes',         value: specifics  || 'N/A'  }
          ],
          footer: { text: 'TheConclave Dominion • ClaveShard Shop' },
          timestamp: new Date().toISOString()
        }]
      });
    }

    // Supabase insert
    const { error } = await supabase.from('orders').insert({
      order_ref:  ref,
      discord_tag: displayTag,
      discord_id: discordId || null,
      char_name:  username,
      tribe_name: tribeName || 'Solo',
      map_name:   mapName   || null,
      item,
      cost:       cost      || 'N/A',
      specifics:  specifics || 'N/A',
      status:     'pending'
    });

    if (error) throw error;

    return res.json({ message: 'Order submitted', ref });
  } catch (err) {
    next(err);
  }
}

// FIX: register both endpoints — old path for backwards compat, new path for v18 frontend
app.post('/api/shard-order', handleShardOrder);
app.post('/orders',          handleShardOrder);  // called by frontend conclave.js

// ─── ORDERS ADMIN ─────────────────────────────────────────────────
app.get('/api/orders', verifyToken, checkAdmin, async (req, res) => {
  const status = req.query.status || 'pending';
  let query = supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(50);
  if (status !== 'all') query = query.eq('status', status);

  const { data: orders, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ orders: orders || [] });
});

app.post('/api/orders/:ref/fulfill', verifyToken, checkAdmin, async (req, res) => {
  const { error } = await supabase
    .from('orders')
    .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString(), fulfilled_by: req.user.username })
    .eq('order_ref', req.params.ref.toUpperCase());
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

app.post('/api/orders/:ref/cancel', verifyToken, checkAdmin, async (req, res) => {
  const { error } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('order_ref', req.params.ref.toUpperCase());
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

// ─── KNOWLEDGE ────────────────────────────────────────────────────
app.get('/api/knowledge', verifyToken, checkAdmin, async (_req, res) => {
  const { data, error } = await supabase.from('aegis_knowledge').select('*').order('category');
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ knowledge: data || [] });
});

app.post('/api/knowledge', verifyToken, checkAdmin, async (req, res) => {
  const { category, key, title, content } = req.body;
  const { error } = await supabase
    .from('aegis_knowledge')
    .upsert(
      { category, key, title, content, added_by: req.user.username, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

app.delete('/api/knowledge/:key', verifyToken, checkAdmin, async (req, res) => {
  const { error } = await supabase.from('aegis_knowledge').delete().eq('key', req.params.key);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

// ─── DONATIONS ────────────────────────────────────────────────────
// FIX: frontend calls /donation-goal — added alias alongside /api/donation
async function getDonationData(_req, res) {
  try {
    const { data } = await supabase
      .from('donation_data')
      .select('*')
      .order('id', { ascending: false })
      .limit(1)
      .single();

    const now       = new Date();
    const daysLeft  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
    const raised    = data?.raised || 0;
    const goal      = data?.goal   || 200;

    res.json({
      ...(data || { goal: 200, raised: 0, donors: [] }),
      daysRemaining: daysLeft,
      days: daysLeft,
      percentage: Math.min(100, Math.round((raised / goal) * 100))
    });
  } catch {
    res.json({ goal: 200, raised: 0, donors: [], daysRemaining: 0, days: 0, percentage: 0 });
  }
}

app.get('/api/donation',  getDonationData);
app.get('/donation-goal', getDonationData);  // FIX: alias — frontend conclave.js calls this path

app.post('/api/donation', verifyToken, checkAdmin, async (req, res) => {
  const { goal, raised, donors } = req.body;

  const { data: existing } = await supabase
    .from('donation_data')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .single();

  const update = { updated_at: new Date().toISOString() };
  if (goal   !== undefined) update.goal   = goal;
  if (raised !== undefined) update.raised = raised;
  if (donors !== undefined) update.donors = donors;

  const result = existing?.id
    ? await supabase.from('donation_data').update(update).eq('id', existing.id)
    : await supabase.from('donation_data').insert({ goal: goal || 200, raised: raised || 0, donors: donors || [] });

  if (result.error) return res.status(500).json({ error: result.error.message });
  return res.json({ success: true });
});

// ─── ANNOUNCEMENTS ────────────────────────────────────────────────
app.get('/api/announcements', async (_req, res) => {
  const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data || []);
});

app.post('/api/announcements', verifyToken, checkAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('announcements')
    .insert({ ...req.body, author: req.user.username })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true, announcement: data });
});

app.delete('/api/announcements/:id', verifyToken, checkAdmin, async (req, res) => {
  const { error } = await supabase.from('announcements').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

// ─── EVENTS ───────────────────────────────────────────────────────
app.get('/api/events', async (_req, res) => {
  const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data || []);
});

app.post('/api/events', verifyToken, checkAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('events')
    .insert({ ...req.body, created_by: req.user.username })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true, event: data });
});

app.delete('/api/events/:id', verifyToken, checkAdmin, async (req, res) => {
  const { error } = await supabase.from('events').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── SHARD SHOP CATALOG ──────────────────────────────────────────
// SQL to run once in Supabase:
// create table if not exists aegis_shop_items (
//   id bigint generated always as identity primary key,
//   name text not null, description text, category text default 'general',
//   tier integer default 1, price integer not null,
//   price_label text, image_emoji text default '💎',
//   stock integer default -1, active boolean default true,
//   sort_order integer default 0, created_at timestamptz default now()
// );
app.get('/api/shop', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('aegis_shop_items')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    res.json({ items: data || [] });
  } catch (e) {
    // Fallback static catalog if table doesn't exist yet
    res.json({ items: SHOP_FALLBACK });
  }
});

app.post('/api/shop', verifyToken, checkAdmin, async (req, res) => {
  const { name, description, category, tier, price, price_label, image_emoji, stock, sort_order } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'name and price required' });
  const { data, error } = await supabase.from('aegis_shop_items').insert({
    name, description, category: category||'general', tier: tier||1,
    price, price_label: price_label||`$${price}`, image_emoji: image_emoji||'💎',
    stock: stock ?? -1, sort_order: sort_order||0
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, item: data });
});

app.patch('/api/shop/:id', verifyToken, checkAdmin, async (req, res) => {
  const { error } = await supabase.from('aegis_shop_items').update(req.body).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.delete('/api/shop/:id', verifyToken, checkAdmin, async (req, res) => {
  const { error } = await supabase.from('aegis_shop_items').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

const SHOP_FALLBACK = [
  { id:1,  name:'TIER 1',     description:'L600 Dino · Ammo · Coloring · 100 Kibble · 100% Imprint · 500 Structures · Cryofridge+120 Pods · 50k ConCoins · 2.5k Materials · Tributes · Boss Artifact',       category:'tier', tier:1,  price:1,  price_label:'1 Shard/Item',    image_emoji:'💠', stock:-1, active:true, sort_order:1  },
  { id:2,  name:'TIER 2',     description:'L600 Vanilla Dino · L600 Modded Dino · L450 Random Shiny · L450 Shiny Shoulder Variant · 60 Dedicated Storage Boxes',                                              category:'tier', tier:2,  price:2,  price_label:'2 Shards/Item',   image_emoji:'💎', stock:-1, active:true, sort_order:2  },
  { id:3,  name:'TIER 3',     description:'Tek Blueprint · 1 Shiny Dino Essence · 200% Imprint · Level 500 T1 Special Shiny',                                                                                 category:'tier', tier:3,  price:3,  price_label:'3 Shards/Item',   image_emoji:'✨', stock:-1, active:true, sort_order:3  },
  { id:4,  name:'TIER 5',     description:'Boss Defeat Cmd · L1000 Vanilla & Modded Dino · 250 Raw Shiny Essence · L600 T2 Shiny · 50k Resource Bundle · 2500 Imprint Kibble',                               category:'tier', tier:5,  price:5,  price_label:'5 Shards/Item',   image_emoji:'🔥', stock:-1, active:true, sort_order:4  },
  { id:5,  name:'TIER 6',     description:'Boss Ready Dino Bundle · 300% Imprint · Max XP',                                                                                                                   category:'tier', tier:6,  price:6,  price_label:'6 Shards/Item',   image_emoji:'⚔️', stock:-1, active:true, sort_order:5  },
  { id:6,  name:'TIER 8',     description:'Medium Resource Bundle — 100,000 Resources (No Element Variants)',                                                                                                  category:'tier', tier:8,  price:8,  price_label:'8 Shards/Item',   image_emoji:'🌌', stock:-1, active:true, sort_order:6  },
  { id:7,  name:'TIER 10',    description:'Astral Dino (Spayed/Neutered) · Floating Platform · 1 Set Shiny Essence · Dino Color Party (10 Max) · L1100 Breeding Pair',                                       category:'tier', tier:10, price:10, price_label:'10 Shards/Item',  image_emoji:'🛡️', stock:-1, active:true, sort_order:7  },
  { id:8,  name:'TIER 12',    description:'Large Resource Bundle — 200,000 Resources (No Element Variants)',                                                                                                   category:'tier', tier:12, price:12, price_label:'12 Shards/Item',  image_emoji:'🌠', stock:-1, active:true, sort_order:8  },
  { id:9,  name:'TIER 15',    description:'30,000 Any Element Variant · L1250 Multi-Class Dino (Rhyniognatha/Reaper/Aureliax) · 300k X-Large Resource Bundle',                                               category:'tier', tier:15, price:15, price_label:'15 Shards/Item',  image_emoji:'👑', stock:-1, active:true, sort_order:9  },
  { id:10, name:'TIER 20',    description:'Base Expansion: +1 Behemoth Gate (+10 Max) — Area Cap Remains 6x6',                                                                                                category:'tier', tier:20, price:20, price_label:'20 Shards/Item',  image_emoji:'🏰', stock:-1, active:true, sort_order:10 },
  { id:11, name:'TIER 30',    description:'2 Dedicated Storage Box Admin Refill — 1,500,000 Total Resources (No Element Variants)',                                                                            category:'tier', tier:30, price:30, price_label:'30 Shards/Item',  image_emoji:'💰', stock:-1, active:true, sort_order:11 },
  { id:12, name:'DINO INSURANCE', description:'One-Time Use · Must Be Named · Backup May Not Save · May Require Respawn · Special Cases May Apply',                                                          category:'insurance', tier:0, price:0, price_label:'Open a Ticket', image_emoji:'🛡️', stock:-1, active:true, sort_order:12 },
];

// ─── AI ───────────────────────────────────────────────────────────
app.post('/api/ai/generate', verifyToken, checkAdmin, async (req, res) => {
  const { prompt, system } = req.body;

  if (!prompt) return res.status(400).json({ error: 'No prompt provided' });
  if (!anthropic) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  try {
    const sys     = await buildPrompt(system ? `\n\n${system}` : '');
    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system:     sys,
      messages:   [{ role: 'user', content: prompt }]
    });
    return res.json({ result: message.content?.[0]?.text || '' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── AEGIS TRIGGERS ───────────────────────────────────────────────
app.post('/api/aegis/trigger', verifyToken, checkAdmin, async (req, res) => {
  const { action } = req.body;
  if (!action) return res.status(400).json({ error: 'No action' });

  try {
    if (!DISCORD_WEBHOOK_URL) {
      return res.json({ message: '⚠️ No webhook configured.' });
    }
    const messages = {
      boot_online:  '⚡ **AEGIS NETWORK** — Boot sequence complete. All systems ONLINE.',
      node4_online: '🟢 **NODE 4** — Now ONLINE. Cluster at full capacity.',
      pulse:        '🔄 **SYSTEM PULSE** — All nodes operational. Aegis monitoring active.'
    };
    await axios.post(DISCORD_WEBHOOK_URL, {
      username: 'Conclave Aegis',
      content:  messages[action] || `⚙️ Aegis trigger: ${action}`
    });
    return res.json({ message: `✅ ${action} triggered.` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN ────────────────────────────────────────────────────────
app.get('/admin/dashboard', verifyToken, checkAdmin, (_req, res) => {
  res.json({ message: 'Welcome Conclave Admin' });
});

// ─── DISCORD CONTROL PANEL — Direct Bot/API Actions ──────────────
// All require admin auth + DISCORD_BOT_TOKEN

const DISCORD_BOT_HEADERS = () => ({
  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  'Content-Type': 'application/json',
});

// GET /api/discord/guild — full guild info
app.get('/api/discord/guild', verifyToken, checkAdmin, async (_req, res) => {
  try {
    const r = await axios.get(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}?with_counts=true`, { headers: DISCORD_BOT_HEADERS() });
    res.json({ guild: r.data });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// GET /api/discord/channels — all channels
app.get('/api/discord/channels', verifyToken, checkAdmin, async (_req, res) => {
  try {
    const r = await axios.get(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/channels`, { headers: DISCORD_BOT_HEADERS() });
    const channels = r.data.sort((a, b) => (a.position || 0) - (b.position || 0));
    res.json({ channels });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// GET /api/discord/roles — all roles
app.get('/api/discord/roles', verifyToken, checkAdmin, async (_req, res) => {
  try {
    const r = await axios.get(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/roles`, { headers: DISCORD_BOT_HEADERS() });
    const roles = r.data.sort((a, b) => b.position - a.position);
    res.json({ roles });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// GET /api/discord/members — member list (up to 1000)
app.get('/api/discord/members', verifyToken, checkAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const r = await axios.get(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members?limit=${limit}`, { headers: DISCORD_BOT_HEADERS() });
    res.json({ members: r.data });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// POST /api/discord/message — send message to any channel
app.post('/api/discord/message', verifyToken, checkAdmin, async (req, res) => {
  const { channel_id, content, embed, ping_everyone } = req.body;
  if (!channel_id || (!content && !embed)) return res.status(400).json({ error: 'channel_id and content or embed required' });
  try {
    const payload = {};
    if (content || ping_everyone) payload.content = (ping_everyone ? '@everyone\n' : '') + (content || '');
    if (embed) payload.embeds = [{ ...embed, color: embed.color || 0x7B2FFF, timestamp: new Date().toISOString(), footer: { text: 'TheConclave Dominion • Admin Panel' } }];
    const r = await axios.post(`${DISCORD_API}/channels/${channel_id}/messages`, payload, { headers: DISCORD_BOT_HEADERS() });
    res.json({ success: true, message_id: r.data.id });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// POST /api/discord/embed — send a rich embed
app.post('/api/discord/embed', verifyToken, checkAdmin, async (req, res) => {
  const { channel_id, title, description, color, fields, footer, thumbnail, image, ping } = req.body;
  if (!channel_id || !title) return res.status(400).json({ error: 'channel_id and title required' });
  try {
    const embed = { title, description, color: color || 0x7B2FFF, timestamp: new Date().toISOString(), footer: { text: footer || 'TheConclave Dominion' } };
    if (fields?.length)   embed.fields    = fields;
    if (thumbnail)        embed.thumbnail = { url: thumbnail };
    if (image)            embed.image     = { url: image };
    const payload = { embeds: [embed] };
    if (ping) payload.content = '@everyone';
    const r = await axios.post(`${DISCORD_API}/channels/${channel_id}/messages`, payload, { headers: DISCORD_BOT_HEADERS() });
    res.json({ success: true, message_id: r.data.id });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// POST /api/discord/announce — formatted server announcement
app.post('/api/discord/announce', verifyToken, checkAdmin, async (req, res) => {
  const { title, body, channel_id, ping, author } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title and body required' });
  const targetChannel = channel_id || process.env.ANNOUNCEMENTS_CHANNEL_ID;
  if (!targetChannel) return res.status(400).json({ error: 'channel_id required (or set ANNOUNCEMENTS_CHANNEL_ID)' });
  try {
    const payload = {
      content: ping ? '@everyone' : undefined,
      embeds: [{
        title: `📢 ${title}`,
        description: body,
        color: 0xFFB800,
        timestamp: new Date().toISOString(),
        footer: { text: 'TheConclave Dominion' },
        author: author ? { name: author } : undefined,
      }]
    };
    const r = await axios.post(`${DISCORD_API}/channels/${targetChannel}/messages`, payload, { headers: DISCORD_BOT_HEADERS() });
    // Also save to DB
    if (supabase) {
      await supabase.from('announcements').insert({ title, body, author: author || 'Admin Panel' }).catch(() => {});
    }
    res.json({ success: true, message_id: r.data.id });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// PATCH /api/discord/member/:id/roles — add/remove role from member
app.patch('/api/discord/member/:id/roles', verifyToken, checkAdmin, async (req, res) => {
  const { id } = req.params;
  const { role_id, action } = req.body; // action: 'add' | 'remove'
  if (!role_id || !action) return res.status(400).json({ error: 'role_id and action required' });
  try {
    if (action === 'add') {
      await axios.put(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members/${id}/roles/${role_id}`, {}, { headers: DISCORD_BOT_HEADERS() });
    } else {
      await axios.delete(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members/${id}/roles/${role_id}`, { headers: DISCORD_BOT_HEADERS() });
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// POST /api/discord/kick — kick member
app.post('/api/discord/kick/:id', verifyToken, checkAdmin, async (req, res) => {
  const { reason } = req.body;
  try {
    await axios.delete(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members/${req.params.id}`, {
      headers: { ...DISCORD_BOT_HEADERS(), 'X-Audit-Log-Reason': encodeURIComponent(reason || 'Kicked via Admin Panel') }
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// POST /api/discord/ban/:id
app.post('/api/discord/ban/:id', verifyToken, checkAdmin, async (req, res) => {
  const { reason, delete_message_days } = req.body;
  try {
    await axios.put(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/bans/${req.params.id}`,
      { delete_message_seconds: (delete_message_days || 1) * 86400 },
      { headers: { ...DISCORD_BOT_HEADERS(), 'X-Audit-Log-Reason': encodeURIComponent(reason || 'Banned via Admin Panel') } }
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// DELETE /api/discord/ban/:id — unban
app.delete('/api/discord/ban/:id', verifyToken, checkAdmin, async (req, res) => {
  try {
    await axios.delete(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/bans/${req.params.id}`, { headers: DISCORD_BOT_HEADERS() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// GET /api/discord/bans
app.get('/api/discord/bans', verifyToken, checkAdmin, async (_req, res) => {
  try {
    const r = await axios.get(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/bans`, { headers: DISCORD_BOT_HEADERS() });
    res.json({ bans: r.data });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// PATCH /api/discord/bot/status — change bot status/activity
app.patch('/api/discord/bot/status', verifyToken, checkAdmin, async (req, res) => {
  const { status, activity_type, activity_name } = req.body;
  // This goes through the bot HTTP endpoint
  try {
    const r = await axios.patch(`http://localhost:${process.env.BOT_PORT || 3001}/status`, { status, activity_type, activity_name });
    res.json({ success: true });
  } catch {
    res.json({ success: false, message: 'Bot status endpoint not available — bot may not be running' });
  }
});

// GET /api/discord/audit-log — recent mod actions
app.get('/api/discord/audit-log', verifyToken, checkAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const r = await axios.get(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/audit-logs?limit=${limit}`, { headers: DISCORD_BOT_HEADERS() });
    res.json({ logs: r.data });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// POST /api/discord/webhook — fire webhook message
app.post('/api/discord/webhook', verifyToken, checkAdmin, async (req, res) => {
  const { content, embeds, type } = req.body;
  if (!DISCORD_WEBHOOK_URL) return res.status(400).json({ error: 'DISCORD_WEBHOOK_URL not configured' });
  try {
    const TEMPLATES = {
      test:           { content: '✅ **AEGIS Webhook Test** — System operational' },
      'server-status':{ embeds: [{ title: '🗺️ Server Status Update', description: 'Live cluster status checked. All systems nominal.', color: 0x35ED7E }] },
      alert:          { embeds: [{ title: '🚨 System Alert', description: content || 'Manual alert from Admin Panel', color: 0xFF4500 }] },
    };
    const payload = TEMPLATES[type] || { content, embeds };
    await axios.post(DISCORD_WEBHOOK_URL, payload);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/discord/member/:id — single member info
app.get('/api/discord/member/:id', verifyToken, checkAdmin, async (req, res) => {
  try {
    const r = await axios.get(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members/${req.params.id}`, { headers: DISCORD_BOT_HEADERS() });
    res.json({ member: r.data });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// POST /api/discord/dm/:id — send DM to member
app.post('/api/discord/dm/:id', verifyToken, checkAdmin, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  try {
    // Create DM channel
    const dmCh = await axios.post(`${DISCORD_API}/users/@me/channels`, { recipient_id: req.params.id }, { headers: DISCORD_BOT_HEADERS() });
    // Send message
    await axios.post(`${DISCORD_API}/channels/${dmCh.data.id}/messages`, { content }, { headers: DISCORD_BOT_HEADERS() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// BEACON SENTINEL ROUTES
// ═══════════════════════════════════════════════════════════════

// ── Auth state ──────────────────────────────────────────────────
app.get('/api/beacon/status', verifyToken, checkAdmin, (_req, res) => {
  const state = beacon.getTokenState();
  res.json({
    authed:     state.authed,
    hasRefresh: state.hasRefresh,
    expiry:     state.expiry,
    expiresIn:  state.expiry ? Math.floor((state.expiry - Date.now()) / 1000) : null,
  });
});

// ── Step 1: Start device auth — returns code for user to enter ──
app.post('/api/beacon/auth/start', verifyToken, checkAdmin, async (_req, res) => {
  try {
    const result = await beacon.startDeviceAuth();
    // Store device code in memory for polling
    res._deviceCode = result.deviceCode;
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Step 2: Poll until user completes auth ─────────────────────
app.post('/api/beacon/auth/poll', verifyToken, checkAdmin, async (req, res) => {
  const { deviceCode } = req.body;
  if (!deviceCode) return res.status(400).json({ error: 'deviceCode required' });
  try {
    const result = await beacon.pollDeviceAuth(deviceCode);
    if (result.success) {
      // Tell admin to save BEACON_REFRESH_TOKEN to Render env
      res.json({
        success: true,
        message: 'Beacon authenticated! Save this refresh token to Render env as BEACON_REFRESH_TOKEN',
        refreshToken: result.refreshToken,
      });
    } else {
      res.json(result);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Cluster summary (all servers + who is online) ───────────────
app.get('/api/beacon/cluster', verifyToken, checkAdmin, async (_req, res) => {
  try {
    const summary = await beacon.getClusterSummary();
    res.json({ cluster: summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Online players (public endpoint for frontend) ───────────────
app.get('/api/beacon/online', async (_req, res) => {
  try {
    if (!beacon.isAuthed()) return res.json({ players: [], authed: false });
    const chars = await beacon.getOnlineCharacters();
    res.json({
      authed: true,
      total: chars.length,
      players: chars.map(c => ({
        name:      c.characterName || c.playerName || 'Survivor',
        tribe:     c.tribeName || null,
        level:     c.level || null,
        server:    c.serviceId || null,
        joinedAt:  c.joinedAt || null,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Player lookup ───────────────────────────────────────────────
app.get('/api/beacon/players', verifyToken, checkAdmin, async (req, res) => {
  try {
    const { q, limit } = req.query;
    const players = q ? await beacon.findPlayer(q) : await beacon.getPlayers(parseInt(limit) || 50);
    res.json({ players });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Player sessions ─────────────────────────────────────────────
app.get('/api/beacon/players/:id/sessions', verifyToken, checkAdmin, async (req, res) => {
  try {
    const sessions = await beacon.getPlayerSessions(req.params.id, 20);
    res.json({ sessions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Tribes ──────────────────────────────────────────────────────
app.get('/api/beacon/tribes', verifyToken, checkAdmin, async (req, res) => {
  try {
    const tribes = await beacon.getTribes(req.query.serviceId || null);
    res.json({ tribes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dinos ───────────────────────────────────────────────────────
app.get('/api/beacon/dinos', verifyToken, checkAdmin, async (req, res) => {
  try {
    const dinos = await beacon.getDinos(req.query.serviceId || null, 200);
    res.json({ dinos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Bans ────────────────────────────────────────────────────────
app.get('/api/beacon/bans', verifyToken, checkAdmin, async (_req, res) => {
  try {
    const bans = await beacon.getBans();
    res.json({ bans });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/beacon/bans', verifyToken, checkAdmin, async (req, res) => {
  const { playerId, reason } = req.body;
  if (!playerId) return res.status(400).json({ error: 'playerId required' });
  try {
    await beacon.banPlayer(playerId, reason || `Banned by ${req.user.username} via AEGIS`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/beacon/bans/:id', verifyToken, checkAdmin, async (req, res) => {
  try {
    await beacon.unbanPlayer(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Server logs ─────────────────────────────────────────────────
app.get('/api/beacon/logs', verifyToken, checkAdmin, async (req, res) => {
  try {
    const logs = await beacon.getLogs(req.query.serviceId || null, 100);
    res.json({ logs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Execute admin command via Sentinel ──────────────────────────
app.post('/api/beacon/command', verifyToken, checkAdmin, async (req, res) => {
  const { serviceId, command } = req.body;
  if (!serviceId || !command) return res.status(400).json({ error: 'serviceId and command required' });
  try {
    const result = await beacon.executeCommand(serviceId, command);
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ERROR HANDLER ────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({ message: err.message || 'Server Error' });
});

// ─── START ────────────────────────────────────────────────────────

/* ═══════════ WORLD HUB ROUTES (injected) ═══════════ */
const multer = require('multer');
const _hubUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 52428800, files: 3 } });

app.get('/api/hub/posts', async (req, res) => {
  try {
    const { page=0, limit=12, type='', search='' } = req.query;
    const pg = parseInt(page), lim = Math.min(parseInt(limit), 50);
    let q = supabase.from('hub_posts').select('*').eq('is_approved', true)
      .order('created_at', { ascending: false })
      .range(pg*lim, (pg+1)*lim-1);
    if (type)   q = q.eq('post_type', type);
    if (search) q = q.or(`game.ilike.%${search}%,server_name.ilike.%${search}%,content.ilike.%${search}%,author_name.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ posts: data||[], page: pg, hasMore: (data||[]).length >= lim });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/hub/posts/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('hub_posts').select('*')
      .eq('id', req.params.id).eq('is_approved', true).single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    await supabase.from('hub_posts').update({ views: (data.views||0)+1 }).eq('id', req.params.id);
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/hub/posts', _hubUpload.array('media', 3), async (req, res) => {
  try {
    const { author_name, game, server_name, discord_invite, website, region, post_type, content } = req.body;
    if (!author_name || !game || !content)
      return res.status(400).json({ error: 'author_name, game, content required' });

    const platforms = [].concat(req.body['platforms[]']||[]).filter(Boolean);
    const tagArr    = [].concat(req.body['tags[]']||[]).filter(Boolean);
    const sp        = [].concat(req.body['share_platforms[]']||[]).filter(Boolean);

    const media_urls = [];
    for (const file of (req.files||[])) {
      const ext = file.originalname.split('.').pop();
      const fname = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: ue } = await supabase.storage.from('hub-media').upload(fname, file.buffer, { contentType: file.mimetype });
      if (!ue) {
        const { data: { publicUrl } } = supabase.storage.from('hub-media').getPublicUrl(fname);
        media_urls.push(publicUrl);
      }
    }

    const { data: post, error: ie } = await supabase.from('hub_posts').insert({
      author_name, game,
      server_name: server_name||null, discord_invite: discord_invite||null,
      website: website||null, region: region||null,
      platforms, post_type: post_type||'other', content, tags: tagArr, media_urls,
    }).select().single();
    if (ie) return res.status(500).json({ error: ie.message });

    const social_posted = {};
    const frontendUrl = process.env.FRONTEND_URL || 'https://theconclavedominion.com';
    const postUrl = `${frontendUrl}/hub.html?post=${post.id}`;
    const summary = `${author_name} — ${game}${server_name?' ('+server_name+')':''}`;

    if (sp.includes('discord') && process.env.HUB_DISCORD_WEBHOOK) {
      try {
        await axios.post(process.env.HUB_DISCORD_WEBHOOK, {
          embeds: [{
            title: summary.slice(0,256),
            description: content.slice(0,300)+(content.length>300?'…':''),
            color: 0x7B2FFF, url: postUrl,
            fields: [
              ...(server_name    ? [{name:'🏰 Server',    value:server_name,     inline:true}] : []),
              ...(discord_invite ? [{name:'📨 Discord',   value:discord_invite,  inline:true}] : []),
              ...(platforms.length?[{name:'🎮 Platforms', value:platforms.join(', '), inline:true}] : []),
            ],
            footer: { text: 'World Hub · theconclavedominion.com' },
            timestamp: new Date().toISOString(),
          }]
        });
        social_posted.discord = true;
      } catch(e) { social_posted.discord_error = e.message; }
    }

    if (sp.includes('bluesky') && process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD) {
      try {
        const sess = await axios.post('https://bsky.social/xrpc/com.atproto.server.createSession',
          { identifier: process.env.BLUESKY_HANDLE, password: process.env.BLUESKY_APP_PASSWORD });
        const bskyText = `🎮 ${summary}\n\n${content.slice(0,220)}${content.length>220?'…':''}\n\n${postUrl}`.slice(0,300);
        await axios.post('https://bsky.social/xrpc/com.atproto.repo.createRecord',
          { repo: sess.data.did, collection: 'app.bsky.feed.post',
            record: { $type:'app.bsky.feed.post', text: bskyText, createdAt: new Date().toISOString() }},
          { headers: { Authorization: `Bearer ${sess.data.accessJwt}` }});
        social_posted.bluesky = true;
      } catch(e) { social_posted.bluesky_error = e.message; }
    }

    if (Object.keys(social_posted).length)
      await supabase.from('hub_posts').update({ social_posted }).eq('id', post.id);

    const share_links = {
      twitter:  `https://twitter.com/intent/tweet?text=${encodeURIComponent(summary+'\n\n'+postUrl)}`,
      reddit:   `https://www.reddit.com/submit?url=${encodeURIComponent(postUrl)}&title=${encodeURIComponent(summary)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`,
    };
    res.json({ post: { ...post, social_posted }, share_links });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/hub/posts/:id/boost', async (req, res) => {
  try {
    const { data } = await supabase.from('hub_posts').select('boost_count').eq('id', req.params.id).single();
    if (!data) return res.status(404).json({ error: 'Not found' });
    const n = (data.boost_count||0)+1;
    await supabase.from('hub_posts').update({ boost_count: n }).eq('id', req.params.id);
    res.json({ success: true, boost_count: n });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/discord/guild-emojis', verifyToken, async (req, res) => {
  try {
    const r = await axios.get(`https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/emojis`,
      { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } });
    res.json({ emojis: r.data.map(e => ({ id: e.id, name: e.name,
      url: `https://cdn.discordapp.com/emojis/${e.id}.${e.animated?'gif':'webp'}?size=32` })) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
/* ═══════════ END WORLD HUB ROUTES ═══════════ */


app.listen(APP_PORT, () => {
  console.log(`🚀 Conclave Aegis API v7.0 running on port ${APP_PORT}`);
  console.log(`   FRONTEND: ${FRONTEND}`);
  console.log(`   Supabase: ${SUPABASE_URL ? '✅ connected' : '❌ missing'}`);
  console.log(`   Anthropic: ${ANTHROPIC_API_KEY ? '✅ connected' : '⚠️  not set'}`);
  console.log(`   BattleMetrics: ${BATTLEMETRICS_TOKEN ? '✅' : '⚠️  no token'}`);
  console.log(`   Discord API: ${DISCORD_BOT_TOKEN ? '✅ bot token set' : '⚠️  missing BOT_TOKEN'}`);
  console.log(`   Webhook: ${DISCORD_WEBHOOK_URL ? '✅ configured' : '⚠️  not set'}`);
});

// FIX: bot.js import wrapped in try/catch — API stays alive even if bot fails
try {
  require('./bot.js');
  console.log('🤖 Bot loaded successfully');
} catch (err) {
  console.error('⚠️  bot.js failed to load — API running without bot:', err.message);
}

process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully');
  process.exit(0);
});

// ═══════════════════════════════════════════════════════════════
// AEGIS LEARNING ENGINE — v5.2 additions
// Auto-save Q&A, web search integration, knowledge management
// ═══════════════════════════════════════════════════════════════

// ─── AEGIS CHAT WITH LEARNING ─────────────────────────────────────
// Public chat endpoint — saves every exchange to knowledge base
app.post('/api/aegis/chat', async (req, res) => {
  const { message, context, sessionId } = req.body;
  if (!message) return res.status(400).json({ error: 'No message' });
  if (!anthropic) return res.status(503).json({ error: 'AI not configured' });

  try {
    const sys = await buildPrompt(context ? `\n\nContext mode: ${context}` : '');

    // Use web_search tool so AEGIS can look things up in real-time
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: sys,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search'
      }],
      messages: [{ role: 'user', content: message }]
    });

    // Extract text from response (may include tool use blocks)
    const textContent = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    const usedSearch = response.content.some(b => b.type === 'tool_use');

    // Auto-save to knowledge base if this is a meaningful Q&A
    if (textContent.length > 80 && message.length > 10) {
      const key = `auto_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      supabase.from('aegis_knowledge').insert({
        category: 'auto_learned',
        key,
        title: message.slice(0, 120),
        content: textContent.slice(0, 1000),
        added_by: 'AEGIS_AUTO',
        source: usedSearch ? 'web_search' : 'inference',
        updated_at: new Date().toISOString()
      }).then(() => {}).catch(() => {}); // fire and forget
    }

    return res.json({
      reply: textContent,
      usedSearch,
      stopReason: response.stop_reason
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── MANUAL LEARN ENDPOINT ────────────────────────────────────────
// Council can manually teach AEGIS a fact
app.post('/api/aegis/learn', verifyToken, checkAdmin, async (req, res) => {
  const { category, title, content, key } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'title and content required' });

  const entryKey = key || `manual_${Date.now().toString(36)}`;
  const { error } = await supabase.from('aegis_knowledge').upsert(
    { category: category || 'manual', key: entryKey, title, content, added_by: req.user.username, source: 'manual', updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true, key: entryKey });
});

// ─── KNOWLEDGE STATS ──────────────────────────────────────────────
app.get('/api/aegis/stats', verifyToken, checkAdmin, async (_req, res) => {
  const { data: knowledge } = await supabase.from('aegis_knowledge').select('category, source, updated_at').order('updated_at', { ascending: false });
  const total   = knowledge?.length || 0;
  const bySource = {};
  const byCat   = {};
  knowledge?.forEach(k => {
    bySource[k.source || 'unknown'] = (bySource[k.source || 'unknown'] || 0) + 1;
    byCat[k.category] = (byCat[k.category] || 0) + 1;
  });
  const latest = knowledge?.slice(0, 5).map(k => ({ category: k.category, updated_at: k.updated_at }));
  return res.json({ total, bySource, byCategory: byCat, latest });
});

// ─── WEB SEARCH PROXY ─────────────────────────────────────────────
// Let AEGIS-AI frontend trigger a search and get back results
app.post('/api/aegis/search', verifyToken, checkAdmin, async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'No query' });
  if (!anthropic) return res.status(503).json({ error: 'AI not configured' });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: 'You are a research assistant. Use web search to find the answer. Return only the key facts, concise and accurate.',
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: query }]
    });
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    return res.json({ result: text, usedSearch: response.content.some(b => b.type === 'tool_use') });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── PRUNE OLD AUTO-LEARNED ENTRIES ───────────────────────────────
// Keep knowledge base clean — admin can purge low-value auto entries
app.delete('/api/aegis/knowledge/purge-auto', verifyToken, checkAdmin, async (_req, res) => {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days old
  const { error, count } = await supabase
    .from('aegis_knowledge')
    .delete()
    .eq('category', 'auto_learned')
    .lt('updated_at', cutoff);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true, deleted: count });
});
