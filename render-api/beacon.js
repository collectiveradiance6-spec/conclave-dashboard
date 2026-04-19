// ═══════════════════════════════════════════════════════════════
// BEACON SENTINEL ENGINE — beacon.js v1.0
// OAuth 2.1 + Sentinel API for TheConclave Dominion
// Handles: token lifecycle, device auth, player/tribe/server data
// ═══════════════════════════════════════════════════════════════
'use strict';

const crypto = require('crypto');
const axios  = require('axios');

const BEACON_API   = 'https://api.usebeacon.app';
const CLIENT_ID    = process.env.BEACON_CLIENT_ID    || 'eb9ecdff-4048-4a83-8f40-f2e16d2e9a81';
const CLIENT_SECRET= process.env.BEACON_CLIENT_SECRET|| process.env.BEACON_SENTINEL_KEY || '';
const SCOPE        = 'common sentinel:read sentinel:write';

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
    const res = await axios.post(`${BEACON_API}/v4/login`, {
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type:    'refresh_token',
      refresh_token: _refreshToken,
      scope:         SCOPE,
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
      client_id:             CLIENT_ID,
      client_secret:         CLIENT_SECRET,
      scope:                 SCOPE,
      code_challenge:        challenge,
      code_challenge_method: 'S256',
    });
    const res = await axios.post(`${BEACON_API}/v4/device`, params.toString(), {
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
    const res = await axios.post(`${BEACON_API}/v4/login`, {
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
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
  const res = await axios.get(`${BEACON_API}/v4/sentinel${path}`, {
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
  await axios.post(`${BEACON_API}/v4/sentinel/bans`, {
    playerId, reason
  }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
}

async function unbanPlayer(banId) {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated with Beacon');
  await axios.delete(`${BEACON_API}/v4/sentinel/bans/${banId}`, {
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
  const res = await axios.post(`${BEACON_API}/v4/sentinel/game-commands`, {
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

module.exports = {
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
