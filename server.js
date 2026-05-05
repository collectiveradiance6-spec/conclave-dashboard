// ═══════════════════════════════════════════════════════════════════════
// CONCLAVE AEGIS API — server.js v9.0 SOVEREIGN EDITION
// Full Express API · Discord OAuth · Supabase · Music Nexus · Shop Fix
// THIS IS THE COMPLETE FILE — replace your existing server.js with this
// ═══════════════════════════════════════════════════════════════════════
'use strict';
require('dotenv').config();

const express        = require('express');
const cors           = require('cors');
const jwt            = require('jsonwebtoken');
const axios          = require('axios');
const session        = require('express-session');
const crypto         = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ─── ENV ──────────────────────────────────────────────────────────────
const {
  PORT                  = 5001,
  NODE_ENV              = 'development',
  FRONTEND_URL          = 'https://theconclavedominion.com',
  JWT_SECRET,
  SESSION_SECRET        = 'conclave-session-secret',
  // Discord
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI  = 'https://api.theconclavedominion.com/auth/discord/callback',
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID      = '1438103556610723922',
  DISCORD_WEBHOOK_URL,
  // Roles
  ROLE_OWNER_ID,
  ROLE_ADMIN_ID,
  ROLE_HELPER_ID,
  ROLE_BOOSTER_ID,
  ROLE_DONATOR_ID,
  ROLE_SURVIVOR_ID,
  // Beacon
  BEACON_CLIENT_ID,
  BEACON_CLIENT_SECRET,
  BEACON_SENTINEL_KEY,
  BEACON_ACCESS_TOKEN,
  BEACON_REFRESH_TOKEN,
  BEACON_TOKEN_EXPIRES  = '0',
  BEACON_GROUP_ID,
  // Supabase
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  // Shop
  SHOP_WEBHOOK_URL,
  SHOP_TICKETS_CHANNEL  = '1492878413533282394',
  SHOP_LOG_CHANNEL      = '1492870196958859436',
  // Nitrado
  NITRADO_TOKEN,
} = process.env;

const IS_PROD     = NODE_ENV === 'production';
const DISCORD_API = 'https://discord.com/api/v10';
const BEACON_API  = 'https://api.usebeacon.app';
const BEACON_CID  = BEACON_CLIENT_ID  || 'eb9ecdff-4048-4a83-8f40-f2e16d2e9a81';
const BEACON_CSEC = BEACON_CLIENT_SECRET || BEACON_SENTINEL_KEY;
const BEACON_SCOPE = 'common sentinel:read sentinel:write';
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_KEY;

// ─── REQUIRED ENV CHECKS ──────────────────────────────────────────────
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_KEY missing');
if (!JWT_SECRET)     console.warn('⚠️  JWT_SECRET missing — auth routes will fail');

// ─── CLIENTS ──────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'x-application-name': 'conclave-aegis-api-v9' } },
});

// ─── EXPRESS ──────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);

app.use(cors({
  origin: [
    FRONTEND_URL,
    'https://theconclave.pages.dev',
    'https://theconclavedominion.com',
    'https://www.theconclavedominion.com',
    'http://localhost:3000',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret:            SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: { secure: IS_PROD, sameSite: IS_PROD ? 'none' : 'lax', maxAge: 8 * 60 * 60 * 1000 },
}));

// ─── HEALTH ───────────────────────────────────────────────────────────
app.get('/',       (_q, r) => r.json({ name: 'Conclave AEGIS API', version: '9.0', status: 'online' }));
app.get('/health', (_q, r) => r.json({ status: 'ok', ts: new Date().toISOString() }));
app.get('/ping',   (_q, r) => r.send('pong'));

// ══════════════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════
function verifyToken(req, res, next) {
  // Session first (OAuth flow)
  if (req.session?.user) { req.user = req.session.user; return next(); }
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(header.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

function checkAdmin(req, res, next) {
  const role = req.user?.role;
  const roles = req.user?.roles || [];
  if (role === 'owner' || role === 'admin') return next();
  const adminRoles = [ROLE_OWNER_ID, ROLE_ADMIN_ID].filter(Boolean);
  if (!adminRoles.length || adminRoles.some(r => roles.includes(r))) return next();
  res.status(403).json({ error: 'Admin only' });
}

function checkMod(req, res, next) {
  const role = req.user?.role;
  const roles = req.user?.roles || [];
  if (['owner','admin','helper'].includes(role)) return next();
  const modRoles = [ROLE_OWNER_ID, ROLE_ADMIN_ID, ROLE_HELPER_ID].filter(Boolean);
  if (!modRoles.length || modRoles.some(r => roles.includes(r))) return next();
  res.status(403).json({ error: 'Mod only' });
}

// ══════════════════════════════════════════════════════════════════════
// DISCORD OAUTH
// ══════════════════════════════════════════════════════════════════════
app.get('/auth/discord', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  if (req.query.dest) req.session.oauthDest = req.query.dest;
  const params = new URLSearchParams({
    client_id:     DISCORD_CLIENT_ID,
    redirect_uri:  DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope:         'identify guilds guilds.members.read',
    state,
  });
  res.redirect(`${DISCORD_API}/oauth2/authorize?${params}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect(`${FRONTEND_URL}?error=no_code`);
  if (state && req.session.oauthState && state !== req.session.oauthState)
    return res.redirect(`${FRONTEND_URL}?error=state_mismatch`);

  try {
    const tokenRes = await axios.post(`${DISCORD_API}/oauth2/token`,
      new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: DISCORD_REDIRECT_URI }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const { access_token } = tokenRes.data;
    const [userRes, guildsRes] = await Promise.all([
      axios.get(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${access_token}` } }),
      axios.get(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bearer ${access_token}` } }),
    ]);
    const user = userRes.data;
    if (!guildsRes.data.some(g => g.id === DISCORD_GUILD_ID))
      return res.redirect(`${FRONTEND_URL}?error=not_member`);

    let roles = [], role = 'member';
    try {
      const mr = await axios.get(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members/${user.id}`, { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } });
      roles = mr.data.roles || [];
      const roleMap = { [ROLE_OWNER_ID]:'owner', [ROLE_ADMIN_ID]:'admin', [ROLE_HELPER_ID]:'helper', [ROLE_BOOSTER_ID]:'booster', [ROLE_DONATOR_ID]:'donator', [ROLE_SURVIVOR_ID]:'survivor' };
      for (const [id, name] of Object.entries(roleMap)) { if (id && roles.includes(id)) { role = name; break; } }
    } catch {}

    const token = jwt.sign({ id: user.id, username: user.username, avatar: user.avatar, role, roles }, JWT_SECRET, { expiresIn: '8h' });
    req.session.user = { id: user.id, username: user.username, avatar: user.avatar, role, roles };

    const dest = req.session.oauthDest || 'admin';
    delete req.session.oauthDest;
    const targetPath = dest === 'aegis-admin' ? '/aegis-admin/' : '/admin/';
    res.redirect(`${FRONTEND_URL}${targetPath}?token=${token}&login=success`);
  } catch (e) {
    console.error('❌ Discord OAuth error:', e.response?.data || e.message);
    res.redirect(`${FRONTEND_URL}?error=oauth_failed`);
  }
});

app.get('/auth/logout', (req, res) => { req.session.destroy(() => res.redirect(FRONTEND_URL)); });

app.get('/auth/me', (req, res) => {
  if (req.session?.user) return res.json({ loggedIn: true, user: req.session.user });
  const h = req.headers.authorization;
  if (!h) return res.json({ loggedIn: false });
  try { return res.json({ loggedIn: true, user: jwt.verify(h.slice(7), JWT_SECRET) }); }
  catch { return res.json({ loggedIn: false }); }
});

app.get('/api/me', verifyToken, (req, res) => res.json({ user: req.user }));

// ══════════════════════════════════════════════════════════════════════
// BEACON SENTINEL
// ══════════════════════════════════════════════════════════════════════
const beaconToken = {
  access:    BEACON_ACCESS_TOKEN  || null,
  refresh:   BEACON_REFRESH_TOKEN || null,
  expiresAt: parseInt(BEACON_TOKEN_EXPIRES) || 0,
  groupId:   BEACON_GROUP_ID      || null,
};
const beaconSessions = new Map();

async function beaconRefresh() {
  if (!beaconToken.refresh) return false;
  try {
    const r = await axios.post(`${BEACON_API}/v4/login`, { client_id: BEACON_CID, client_secret: BEACON_CSEC, grant_type: 'refresh_token', refresh_token: beaconToken.refresh, scope: BEACON_SCOPE }, { headers: { 'Content-Type': 'application/json' }, timeout: 12000 });
    beaconToken.access = r.data.access_token; beaconToken.refresh = r.data.refresh_token || beaconToken.refresh; beaconToken.expiresAt = r.data.access_token_expiration || 0;
    console.log('✅ Beacon token refreshed'); return true;
  } catch (e) { console.error('❌ Beacon refresh:', e.response?.data || e.message); return false; }
}

async function beaconAuth() {
  if (!beaconToken.access) return null;
  if (beaconToken.expiresAt && Math.floor(Date.now()/1000) >= beaconToken.expiresAt - 300) {
    if (!await beaconRefresh()) return null;
  }
  return beaconToken.access;
}

async function beaconDiscoverGroup() {
  const token = await beaconAuth(); if (!token) return;
  try { const r = await axios.get(`${BEACON_API}/v4/groups/`, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }); const groups = r.data?.results || []; if (groups.length) { beaconToken.groupId = groups[0].id; console.log(`✅ Beacon group: ${beaconToken.groupId}`); } } catch {}
}

function genVerifier()     { return crypto.randomBytes(48).toString('base64url').slice(0, 96); }
function genChallenge(v)   { return crypto.createHash('sha256').update(v).digest('base64url'); }

app.get('/auth/beacon', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const verifier = genVerifier();
  beaconSessions.set(state, { verifier, ts: Date.now() });
  const p = new URLSearchParams({ client_id: BEACON_CID, redirect_uri: 'https://api.theconclavedominion.com/auth/beacon/callback', response_type: 'code', scope: BEACON_SCOPE, state, code_challenge: genChallenge(verifier), code_challenge_method: 'S256' });
  res.redirect(`${BEACON_API}/oauth2/authorize?${p}`);
});

app.get('/auth/beacon/callback', async (req, res) => {
  const { code, state } = req.query; if (!code) return res.redirect(`${FRONTEND_URL}/admin/?beacon_error=no_code`);
  const sess = beaconSessions.get(state);
  try {
    const r = await axios.post(`${BEACON_API}/v4/login`, { client_id: BEACON_CID, client_secret: BEACON_CSEC, grant_type: 'authorization_code', code, redirect_uri: 'https://api.theconclavedominion.com/auth/beacon/callback', scope: BEACON_SCOPE, ...(sess ? { code_verifier: sess.verifier } : {}) }, { headers: { 'Content-Type': 'application/json' }, timeout: 12000 });
    beaconToken.access = r.data.access_token; beaconToken.refresh = r.data.refresh_token; beaconToken.expiresAt = r.data.access_token_expiration || 0;
    if (state) beaconSessions.delete(state);
    await beaconDiscoverGroup().catch(() => {});
    res.redirect(`${FRONTEND_URL}/admin/?beacon_auth=success`);
  } catch (e) { console.error('❌ Beacon callback:', e.response?.data || e.message); res.redirect(`${FRONTEND_URL}/admin/?beacon_error=failed`); }
});

app.get('/api/beacon/status', async (_req, res) => {
  const token = await beaconAuth();
  res.json({ authenticated: !!token, groupId: beaconToken.groupId, expiresAt: beaconToken.expiresAt, hasRefresh: !!beaconToken.refresh });
});

app.post('/api/beacon/refresh', verifyToken, checkAdmin, async (_req, res) => {
  const ok = await beaconRefresh(); res.json({ success: ok, expiresAt: beaconToken.expiresAt });
});

setInterval(async () => {
  if (beaconToken.refresh && (!beaconToken.expiresAt || Math.floor(Date.now()/1000) >= beaconToken.expiresAt - 600)) await beaconRefresh();
}, 30 * 60 * 1000);

// ══════════════════════════════════════════════════════════════════════
// SERVER STATUS
// ══════════════════════════════════════════════════════════════════════
const SERVERS = [
  {id:'island',     name:'The Island',    ip:'217.114.196.102',port:5390, nitradoId:18266152, emoji:'🌿', pvp:false,patreon:false},
  {id:'volcano',    name:'Volcano',       ip:'217.114.196.59', port:5050, nitradoId:18094678, emoji:'🌋', pvp:false,patreon:false},
  {id:'extinction', name:'Extinction',    ip:'31.214.196.102', port:6440, nitradoId:18106633, emoji:'🌑', pvp:false,patreon:false},
  {id:'center',     name:'The Center',    ip:'31.214.163.71',  port:5120, nitradoId:18182839, emoji:'🏔️', pvp:false,patreon:false},
  {id:'lostcolony', name:'Lost Colony',   ip:'217.114.196.104',port:5150, nitradoId:18307276, emoji:'🪐', pvp:false,patreon:false},
  {id:'astraeos',   name:'Astraeos',      ip:'217.114.196.9',  port:5320, nitradoId:18393892, emoji:'✨', pvp:false,patreon:false},
  {id:'valguero',   name:'Valguero',      ip:'85.190.136.141', port:5090, nitradoId:18509341, emoji:'🏞️', pvp:false,patreon:false},
  {id:'scorched',   name:'Scorched Earth',ip:'217.114.196.103',port:5240, nitradoId:18598049, emoji:'☀️', pvp:false,patreon:false},
  {id:'aberration', name:'Aberration',    ip:'217.114.196.80', port:5540, nitradoId:18655529, emoji:'⚔️', pvp:true, patreon:false},
  {id:'amissa',     name:'Amissa',        ip:'217.114.196.80', port:5180, nitradoId:18680162, emoji:'⭐', pvp:false,patreon:true},
];

let serverCache = {}, lastServerFetch = 0;
async function getServerStatuses() {
  if (Date.now() - lastServerFetch < 60000 && Object.keys(serverCache).length) return Object.values(serverCache);
  if (!NITRADO_TOKEN) return SERVERS.map(s => ({ ...s, status:'unknown', players:0, maxPlayers:20 }));
  const results = [];
  await Promise.all(SERVERS.map(async srv => {
    try {
      const r = await axios.get(`https://api.nitrado.net/services/${srv.nitradoId}/gameservers`, { headers: { Authorization: `Bearer ${NITRADO_TOKEN}` }, timeout: 10000 });
      const gs = r.data?.data?.gameserver;
      results.push({ ...srv, status: gs?.status === 'started' ? 'online' : 'offline', players: gs?.query?.player_current ?? 0, maxPlayers: gs?.query?.player_max ?? 20 });
    } catch { results.push({ ...srv, status: 'unknown', players: 0, maxPlayers: 20 }); }
  }));
  serverCache = Object.fromEntries(results.map(s => [s.id, s]));
  lastServerFetch = Date.now();
  return results;
}

app.get('/servers', async (_req, res) => {
  try { res.json(await getServerStatuses()); } catch { res.json(SERVERS.map(s => ({ ...s, status: 'unknown' }))); }
});

app.get('/servers/status', async (_req, res) => {
  const servers = await getServerStatuses().catch(() => SERVERS.map(s => ({ ...s, status:'unknown' })));
  res.json({ servers, online: servers.filter(s=>s.status==='online').length, total: servers.length, ts: new Date().toISOString() });
});

// ══════════════════════════════════════════════════════════════════════
// WALLET / ECONOMY
// ══════════════════════════════════════════════════════════════════════
app.get('/wallet/balance', async (req, res) => {
  const { discord_id } = req.query; if (!discord_id) return res.status(400).json({ error: 'discord_id required' });
  try {
    const { data } = await supabase.from('aegis_wallets').select('wallet_balance,bank_balance,lifetime_earned,daily_streak').eq('discord_id', discord_id).single();
    res.json(data || { wallet_balance: 0, bank_balance: 0 });
  } catch { res.json({ wallet_balance: 0, bank_balance: 0 }); }
});

app.get('/wallet/leaderboard', async (_req, res) => {
  try {
    const { data } = await supabase.from('aegis_wallets').select('discord_tag,wallet_balance,bank_balance,lifetime_earned').order('wallet_balance', { ascending: false }).limit(10);
    res.json(data || []);
  } catch { res.json([]); }
});

app.post('/wallet/award', verifyToken, checkMod, async (req, res) => {
  const { discord_id, amount, note, actor_discord_id } = req.body;
  if (!discord_id || !amount) return res.status(400).json({ error: 'discord_id + amount required' });
  try {
    await supabase.from('aegis_wallets').upsert({ discord_id, wallet_balance: 0, bank_balance: 0, lifetime_earned: 0, lifetime_spent: 0 }, { onConflict: 'discord_id' });
    const { data: w } = await supabase.from('aegis_wallets').select('*').eq('discord_id', discord_id).single();
    const newBal = (w?.wallet_balance || 0) + Number(amount);
    await supabase.from('aegis_wallets').update({ wallet_balance: newBal, lifetime_earned: (w?.lifetime_earned||0)+Number(amount), updated_at: new Date().toISOString() }).eq('discord_id', discord_id);
    await supabase.from('aegis_wallet_ledger').insert({ discord_id, actor_discord_id: actor_discord_id || req.user?.id || 'SYSTEM', amount: Number(amount), action: 'grant', note: note || 'API award', balance_wallet_after: newBal, created_at: new Date().toISOString() });
    res.json({ success: true, balance: newBal });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════
// SHOP ORDERS — COMPLETE FIX
// The main /api/shop/submit endpoint that shop.html posts to.
// Saves to Supabase + fires Discord webhook in one request.
// ══════════════════════════════════════════════════════════════════════
const TIER_COLORS = {1:0x00c8ff,2:0x0088ff,3:0xcc44ff,5:0xff8800,6:0xff2266,8:0x00ddcc,10:0x4488ff,12:0xffcc00,15:0xff6600,20:0xff44cc,30:0xffaa00};

// Primary endpoint used by the new shop.html
app.post('/api/shop/submit', async (req, res) => {
  try {
    const { discord_username, character_name, tier, tier_cost, platform, server, items, notes, discord_id } = req.body;
    if (!character_name || !server) return res.status(400).json({ error: 'Missing required fields: character_name, server' });

    const ref = 'ORD-' + Date.now().toString(36).toUpperCase();
    const itemsList = Array.isArray(items) ? items : (tier ? [`Tier ${tier}`] : ['Custom Order']);
    const shards = parseInt(tier_cost || tier) || 0;

    // Save to Supabase
    const { data, error } = await supabase.from('aegis_orders').insert({
      ref,
      discord_id:   discord_id   || null,
      discord_tag:  discord_username || 'Unknown',
      tier:         tier ? `Tier ${tier}` : 'Dino Insurance',
      shards,
      platform:     platform || 'Unknown',
      server,
      notes:        notes || itemsList.join(', '),
      status:       'pending',
      created_at:   new Date().toISOString(),
    }).select().single();
    if (error) throw error;

    // Discord webhook
    const webhookUrl = DISCORD_WEBHOOK_URL || SHOP_WEBHOOK_URL;
    if (webhookUrl) {
      axios.post(webhookUrl, {
        username: 'ClaveShard Shop',
        embeds: [{
          title:  `🛒 New Order — ${tier ? `Tier ${tier}` : 'Dino Insurance'}`,
          color:  TIER_COLORS[parseInt(tier)] || 0xFFB800,
          fields: [
            { name:'👤 Player',   value: character_name,           inline: true },
            { name:'🎮 Platform', value: platform || 'Unknown',    inline: true },
            { name:'🗺️ Server',   value: server,                   inline: true },
            { name:'💎 Cost',     value: `${shards} Shards`,       inline: true },
            { name:'🔖 Ref',      value: `\`${ref}\``,             inline: true },
            { name:'💬 Discord',  value: discord_username || 'N/A',inline: true },
            { name:'📋 Items',    value: itemsList.slice(0,10).map(i=>`• ${i}`).join('\n').slice(0,800), inline: false },
            { name:'📝 Notes',    value: notes || '—', inline: false },
          ],
          footer:    { text: 'TheConclave Dominion • ClaveShard Shop' },
          timestamp: new Date().toISOString(),
        }],
      }).catch(e => console.error('[shop webhook]', e.message));
    }

    // Also post to the shop tickets Discord channel if bot token set
    if (DISCORD_BOT_TOKEN && SHOP_TICKETS_CHANNEL) {
      axios.post(`${DISCORD_API}/channels/${SHOP_TICKETS_CHANNEL}/messages`, {
        content: `📦 **Shop Order** from **@${discord_username || 'Unknown'}** — ${tier ? `Tier ${tier}` : 'Dino Insurance'}`,
        embeds: [{
          title: `Order \`${ref}\``, color: TIER_COLORS[parseInt(tier)] || 0xFFB800,
          fields: [{ name:'Player', value:character_name, inline:true }, { name:'Server', value:server, inline:true }, { name:'Items', value:itemsList.slice(0,5).join(', '), inline:false }],
          footer: { text: `Full ref: ${ref}` }, timestamp: new Date().toISOString(),
        }],
      }, { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' } }).catch(() => {});
    }

    res.json({ success: true, ref, order_id: data.id });
  } catch (e) {
    console.error('[shop/submit]', e.message);
    res.status(500).json({ error: 'Order submission failed: ' + e.message });
  }
});

// Legacy endpoints — kept for backward compat
app.post('/shop/order', async (req, res) => {
  const mapped = { character_name: req.body.character_name || req.body.char_name || req.body.player, tier: req.body.tier, tier_cost: req.body.tier_cost || req.body.tier, platform: req.body.platform, server: req.body.map || req.body.server, discord_username: req.body.discord_username || req.body.discordTag || req.body.username, notes: req.body.order_details || req.body.notes, items: req.body.selected_items || [] };
  req.body = { ...req.body, ...mapped };
  return app._router.handle({ ...req, url: '/api/shop/submit', path: '/api/shop/submit' }, res, () => res.status(500).json({ error: 'Router error' }));
});
app.post('/orders', async (req, res, next) => { req.url = '/api/shop/submit'; next(); });

// Order status lookup (public)
app.get('/api/shop/order/:ref', async (req, res) => {
  try {
    const { data } = await supabase.from('aegis_orders').select('ref,tier,platform,server,status,fulfillment_note,created_at,fulfilled_at').eq('ref', req.params.ref.toUpperCase()).single();
    if (!data) return res.status(404).json({ error: 'Order not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// My orders (authenticated)
app.get('/api/shop/my-orders', verifyToken, async (req, res) => {
  const id = req.user?.id || req.user?.discordId;
  if (!id) return res.status(400).json({ error: 'Not authenticated' });
  try {
    const { data } = await supabase.from('aegis_orders').select('ref,tier,shards,platform,server,status,created_at,fulfilled_at').eq('discord_id', id).order('created_at', { ascending: false }).limit(20);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin — list orders
app.get('/api/orders', verifyToken, checkAdmin, async (req, res) => {
  const status = req.query.status || 'pending';
  let q = supabase.from('aegis_orders').select('*').order('created_at', { ascending: false }).limit(50);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ orders: data || [] });
});

// Admin — fulfill order
app.post('/api/orders/:ref/fulfill', verifyToken, checkAdmin, async (req, res) => {
  const { error } = await supabase.from('aegis_orders').update({ status: 'fulfilled', fulfilled_at: new Date().toISOString(), fulfilled_by: req.user.username, fulfillment_note: req.body.note || 'Fulfilled' }).eq('ref', req.params.ref.toUpperCase());
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════════
// MUSIC NEXUS — COMPLETE ROUTES
// ══════════════════════════════════════════════════════════════════════

// Bot pushes session state every 15s
app.post('/api/music/session', async (req, res) => {
  try {
    const { guild_id, now_playing, queue_count, mood, volume, loop, shuffle, autoplay, updated_at } = req.body;
    if (!guild_id) return res.status(400).json({ error: 'guild_id required' });
    const { error } = await supabase.from('aegis_music_sessions').upsert({
      guild_id, now_playing: now_playing || null, queue_count: queue_count || 0, mood: mood || null,
      volume: volume || 80, loop: loop || false, shuffle: shuffle || false, autoplay: autoplay || false,
      updated_at: updated_at || new Date().toISOString(),
    }, { onConflict: 'guild_id' });
    if (error) throw error;
    // Log to history if playing
    if (now_playing?.url) {
      supabase.from('aegis_music_history').insert({ guild_id, title: now_playing.title||'Unknown', url: now_playing.url, duration: now_playing.duration||0, thumbnail: now_playing.thumbnail||null, source: now_playing.source||'youtube', requested_by: now_playing.requestedBy||'AutoPlay', mood: mood||null }).then(()=>{}).catch(()=>{});
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Frontend polls this every 15s
app.get('/api/music/session/:guildId', async (req, res) => {
  try {
    const { data } = await supabase.from('aegis_music_sessions').select('*').eq('guild_id', req.params.guildId).single();
    if (!data) return res.json({ active: false });
    const staleMs = Date.now() - new Date(data.updated_at).getTime();
    res.json({ ...data, active: staleMs < 30000, stale: staleMs > 30000 });
  } catch { res.json({ active: false }); }
});

// Play history
app.get('/api/music/history/:guildId', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit||'20'), 100);
    const { data } = await supabase.from('aegis_music_history').select('title,url,duration,thumbnail,source,requested_by,mood,played_at').eq('guild_id', req.params.guildId).order('played_at', { ascending: false }).limit(limit);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// All active sessions (room browser)
app.get('/api/music/sessions', async (_req, res) => {
  try {
    const { data } = await supabase.from('aegis_music_sessions').select('guild_id,now_playing,queue_count,mood,volume,updated_at').gt('updated_at', new Date(Date.now()-60000).toISOString()).order('updated_at', { ascending: false });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Playlists
app.get('/api/music/playlists/:guildId', async (req, res) => {
  try {
    const { data } = await supabase.from('aegis_music_playlists').select('id,name,created_by,track_count,updated_at').eq('guild_id', req.params.guildId).order('updated_at', { ascending: false }).limit(25);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/music/playlists/:guildId/:name', async (req, res) => {
  try {
    const { data } = await supabase.from('aegis_music_playlists').select('*').eq('guild_id', req.params.guildId).eq('name', decodeURIComponent(req.params.name)).single();
    if (!data) return res.status(404).json({ error: 'Playlist not found' });
    res.json({ ...data, tracks: JSON.parse(data.tracks || '[]') });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Vote on a track
app.post('/api/music/vote', verifyToken, async (req, res) => {
  try {
    const { guild_id, track_url, track_title } = req.body;
    const voter_id = req.user?.id || req.user?.discordId;
    if (!guild_id || !track_url || !voter_id) return res.status(400).json({ error: 'Missing fields' });
    await supabase.from('aegis_music_votes').upsert({ guild_id, track_url, track_title, voter_id, voter_tag: req.user?.username, created_at: new Date().toISOString() }, { onConflict: 'guild_id,track_url,voter_id', ignoreDuplicates: true });
    const { count } = await supabase.from('aegis_music_votes').select('*', { count:'exact', head:true }).eq('guild_id', guild_id).eq('track_url', track_url);
    res.json({ success: true, votes: count || 1 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/music/votes/:guildId', async (req, res) => {
  try {
    const { data } = await supabase.from('aegis_music_votes').select('track_url,track_title,voter_id').eq('guild_id', req.params.guildId).gte('created_at', new Date(Date.now()-24*60*60*1000).toISOString());
    const grouped = {};
    for (const v of (data || [])) { if (!grouped[v.track_url]) grouped[v.track_url] = { track_url: v.track_url, track_title: v.track_title, votes: 0 }; grouped[v.track_url].votes++; }
    res.json(Object.values(grouped).sort((a,b)=>b.votes-a.votes));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Rooms
app.get('/api/music/rooms/:guildId', async (req, res) => {
  try {
    const { data } = await supabase.from('aegis_music_rooms').select('*').eq('guild_id', req.params.guildId).eq('active', true);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/music/rooms', verifyToken, checkAdmin, async (req, res) => {
  try {
    const { guild_id, name, mood, voice_channel_id, text_channel_id } = req.body;
    const { data, error } = await supabase.from('aegis_music_rooms').insert({ guild_id, name, mood, voice_channel_id, text_channel_id, created_by: req.user?.username || 'admin' }).select().single();
    if (error) throw error;
    res.json({ success: true, room: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Public stats (used by music.html)
app.get('/api/music/stats', async (_req, res) => {
  try {
    const [s, h, p] = await Promise.all([
      supabase.from('aegis_music_sessions').select('*', { count:'exact', head:true }),
      supabase.from('aegis_music_history').select('*', { count:'exact', head:true }),
      supabase.from('aegis_music_playlists').select('*', { count:'exact', head:true }),
    ]);
    res.json({ active_sessions: s.count||0, tracks_played: h.count||0, saved_playlists: p.count||0, ts: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin ops (for music-admin-panel.html)
app.post('/api/music/admin/:action', verifyToken, checkAdmin, async (req, res) => {
  const { action } = req.params;
  const { guild_id, ...extra } = req.body;
  // These are relayed to the bot via the session table — bot polls for commands
  try {
    await supabase.from('aegis_music_sessions').upsert({
      guild_id: guild_id || '1438103556610723922',
      pending_command: action,
      pending_command_data: extra,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id' });
    res.json({ success: true, action });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE
// ══════════════════════════════════════════════════════════════════════
app.get('/api/knowledge', verifyToken, checkAdmin, async (_req, res) => {
  const { data, error } = await supabase.from('aegis_knowledge').select('*').order('category');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ knowledge: data || [] });
});

app.post('/api/knowledge', verifyToken, checkAdmin, async (req, res) => {
  const { category, key, title, content } = req.body;
  const { error } = await supabase.from('aegis_knowledge').upsert({ category, key, title, content, added_by: req.user.username, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.delete('/api/knowledge/:key', verifyToken, checkAdmin, async (req, res) => {
  const { error } = await supabase.from('aegis_knowledge').delete().eq('key', req.params.key);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════════
// DONATION GOAL
// ══════════════════════════════════════════════════════════════════════
async function getDonationData(_req, res) {
  try {
    const { data } = await supabase.from('donation_goals').select('*').order('created_at', { ascending: false }).limit(1).single();
    const days = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate();
    const raised = data?.current || data?.raised || 0;
    const goal   = data?.goal   || 500;
    res.json({ ...data, raised, days, daysRemaining: days, percentage: Math.min(100, Math.round((raised/goal)*100)) });
  } catch { res.json({ goal: 500, raised: 0, donors: 0, days: 0, percentage: 0 }); }
}

app.get('/api/donation-goal', getDonationData);
app.get('/donation-goal', getDonationData);
app.get('/api/donation', getDonationData);

app.post('/api/donation', verifyToken, checkAdmin, async (req, res) => {
  const { goal, raised, donors } = req.body;
  const update = { updated_at: new Date().toISOString() };
  if (goal   !== undefined) update.goal    = goal;
  if (raised !== undefined) update.current = raised;
  if (donors !== undefined) update.donors  = donors;
  const { error } = await supabase.from('donation_goals').update(update).neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════════
// EVENTS + ANNOUNCEMENTS
// ══════════════════════════════════════════════════════════════════════
app.get('/api/events', async (_req, res) => {
  try { const { data } = await supabase.from('events').select('*').order('event_date', { ascending: true }).limit(10); res.json(data || []); }
  catch { res.json([]); }
});

app.post('/api/events', verifyToken, checkAdmin, async (req, res) => {
  const { data, error } = await supabase.from('events').insert({ ...req.body, created_by: req.user.username }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, event: data });
});

app.get('/api/announcements', async (_req, res) => {
  try { const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20); res.json(data || []); }
  catch { res.json([]); }
});

app.post('/api/announcements', verifyToken, checkAdmin, async (req, res) => {
  const { data, error } = await supabase.from('announcements').insert({ ...req.body, author: req.user.username }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, announcement: data });
});

// ══════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD + WEBHOOKS
// ══════════════════════════════════════════════════════════════════════
app.get('/api/members', async (_req, res) => {
  try {
    const r = await axios.get(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}?with_counts=true`, { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } });
    res.json({ count: r.data.approximate_member_count });
  } catch { res.json({ count: 0 }); }
});

app.get('/admin/dashboard', verifyToken, checkAdmin, (_req, res) =>
  res.json({ message: 'Welcome Conclave Admin', ts: new Date().toISOString() })
);

app.post('/admin/webhook', verifyToken, checkAdmin, async (req, res) => {
  const { action, webhookUrl } = req.body;
  const url = webhookUrl || DISCORD_WEBHOOK_URL;
  if (!url) return res.status(400).json({ error: 'No webhook URL configured' });
  try {
    const messages = { boot_online: '⚡ **AEGIS NETWORK** — All systems ONLINE.', node4_online: '🟢 **NODE 4** — Now ONLINE.', pulse: '🔄 **SYSTEM PULSE** — All nodes operational.' };
    await axios.post(url, { username: 'Conclave AEGIS', content: messages[action] || `⚙️ Aegis: ${action}` });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════
// ERROR HANDLER
// ══════════════════════════════════════════════════════════════════════
app.use((err, _req, res, _next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ══════════════════════════════════════════════════════════════════════
// STARTUP
// ══════════════════════════════════════════════════════════════════════
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Conclave AEGIS API v9.0 — port ${PORT}`);
  console.log(`   Supabase: ${SUPABASE_URL ? '✅' : '❌'}`);
  console.log(`   Beacon:   ${beaconToken.access ? '✅ token loaded' : '⚠️  not authenticated'}`);
  if (beaconToken.access && !beaconToken.groupId) beaconDiscoverGroup().catch(() => {});
});

process.on('SIGINT',             () => { console.log('🛑 Shutting down'); process.exit(0); });
process.on('SIGTERM',            () => { console.log('🛑 Shutting down'); process.exit(0); });
process.on('uncaughtException',  e  => console.error('❌ Uncaught:', e));
process.on('unhandledRejection', e  => console.error('❌ Rejection:', e));
