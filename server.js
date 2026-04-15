// ═══════════════════════════════════════════════════════════════
// CONCLAVE AEGIS API — server.js v8.0
// Fixes: _BCL_SCOPE undefined, Beacon 403 refresh, port binding
// Routes: Discord OAuth · Beacon · Wallet · Shop · Nitrado · Admin
// ═══════════════════════════════════════════════════════════════
'use strict';
require('dotenv').config();

const express        = require('express');
const cors           = require('cors');
const jwt            = require('jsonwebtoken');
const axios          = require('axios');
const session        = require('express-session');
const crypto         = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ─── ENV ──────────────────────────────────────────────────────────
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

  // Shop
  SHOP_WEBHOOK_URL,
  SHOP_TICKETS_CHANNEL  = '1492878413533282394',
  SHOP_LOG_CHANNEL      = '1492870196958859436',

  // Nitrado
  NITRADO_TOKEN,
} = process.env;

const API_BASE_URL = (process.env.API_BASE_URL || 'https://api.theconclavedominion.com').replace(/\/$/, '');
const ADMIN_URL = (process.env.ADMIN_URL || `${FRONTEND_URL}/admin`).replace(/\/$/, '');
const BEACON_REDIRECT_URI = process.env.BEACON_REDIRECT_URI || `${API_BASE_URL}/auth/beacon/callback`;
const DISCORD_CALLBACK_URL = DISCORD_REDIRECT_URI || `${API_BASE_URL}/auth/discord/callback`;

const IS_PROD    = NODE_ENV === 'production';
const DISCORD_API = 'https://discord.com/api/v10';
const BEACON_API  = 'https://api.usebeacon.app';
const BEACON_CID  = BEACON_CLIENT_ID  || 'eb9ecdff-4048-4a83-8f40-f2e16d2e9a81';
const BEACON_CSEC = BEACON_CLIENT_SECRET || BEACON_SENTINEL_KEY;
// ─── FIX: _BCL_SCOPE was undefined — now a constant ──────────────
const BEACON_SCOPE = 'common sentinel:read sentinel:write';

// ─── SUPABASE ─────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── BEACON TOKEN STORE ───────────────────────────────────────────
// Persisted via Render env vars on first auth; reloaded on every boot
const beaconToken = {
  access:    BEACON_ACCESS_TOKEN  || null,
  refresh:   BEACON_REFRESH_TOKEN || null,
  expiresAt: parseInt(BEACON_TOKEN_EXPIRES) || 0,
  groupId:   BEACON_GROUP_ID      || null,
};
const beaconDeviceSessions = new Map();

// ─── EXPRESS ──────────────────────────────────────────────────────
const app = express();

app.use(cors({
  origin: [
    FRONTEND_URL,
    'https://theconclave.pages.dev',
    'https://theconclavedominion.com',
    'https://www.theconclavedominion.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret:            SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: { secure: IS_PROD, sameSite: IS_PROD ? 'none' : 'lax', maxAge: 8 * 60 * 60 * 1000 },
}));

// ─── HEALTH ───────────────────────────────────────────────────────
app.get('/',        (_q, r) => r.json({ status: 'AEGIS API v8.0 online' }));
app.get('/health',  (_q, r) => r.json({ status: 'ok', ts: new Date().toISOString() }));
app.get('/ping',    (_q, r) => r.send('pong'));

// ═══════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════
function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function checkAdmin(req, res, next) {
  const roles = req.user?.roles || [];
  const adminRoles = [ROLE_OWNER_ID, ROLE_ADMIN_ID].filter(Boolean);
  if (!adminRoles.length || adminRoles.some(r => roles.includes(r))) return next();
  res.status(403).json({ error: 'Admin only' });
}

function checkMod(req, res, next) {
  const roles = req.user?.roles || [];
  const modRoles = [ROLE_OWNER_ID, ROLE_ADMIN_ID, ROLE_HELPER_ID].filter(Boolean);
  if (!modRoles.length || modRoles.some(r => roles.includes(r))) return next();
  res.status(403).json({ error: 'Mod only' });
}

// ═══════════════════════════════════════════════════════════════
// DISCORD OAUTH
// ═══════════════════════════════════════════════════════════════
app.get('/auth/discord', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id:     DISCORD_CLIENT_ID,
    redirect_uri:  DISCORD_CALLBACK_URL,
    response_type: 'code',
    scope:         'identify guilds guilds.members.read',
    state,
  });
  res.redirect(`${DISCORD_API}/oauth2/authorize?${params}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect(`${ADMIN_URL}?error=no_code`);
  if (state && req.session.oauthState && state !== req.session.oauthState)
    return res.redirect(`${ADMIN_URL}?error=state_mismatch`);

  try {
    // Exchange code for tokens
    const tokenRes = await axios.post(`${DISCORD_API}/oauth2/token`,
      new URLSearchParams({
        client_id:     DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  DISCORD_CALLBACK_URL,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token } = tokenRes.data;

    // Get user
    const [userRes, guildsRes] = await Promise.all([
      axios.get(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${access_token}` },
      }),
      axios.get(`${DISCORD_API}/users/@me/guilds`, {
        headers: { Authorization: `Bearer ${access_token}` },
      }),
    ]);

    const user = userRes.data;
    const inGuild = guildsRes.data.some(g => g.id === DISCORD_GUILD_ID);
    if (!inGuild) return res.redirect(`${ADMIN_URL}?error=not_member`);

    // Get member roles
    let roles = [];
    try {
      const memberRes = await axios.get(
        `${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members/${user.id}`,
        { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
      );
      roles = memberRes.data.roles || [];
    } catch { /* non-fatal */ }

    // Issue JWT
    const token = jwt.sign({
      id:            user.id,
      username:      user.username,
      discriminator: user.discriminator || '0',
      avatar:        user.avatar,
      roles,
    }, JWT_SECRET, { expiresIn: '8h' });

    res.redirect(`${ADMIN_URL}?token=${token}`);
  } catch (e) {
    console.error('❌ Discord OAuth error:', e.response?.data || e.message);
    res.redirect(`${ADMIN_URL}?error=oauth_failed`);
  }
});

app.get('/auth/me', verifyToken, (req, res) => res.json({ user: req.user }));

// ═══════════════════════════════════════════════════════════════
// BEACON SENTINEL
// ═══════════════════════════════════════════════════════════════

// ─── Token refresh — FIX: was using undefined _BCL_SCOPE ─────────
async function beaconRefresh() {
  if (!beaconToken.refresh) {
    console.warn('❌ Beacon refresh skipped: no refresh token');
    return false;
  }
  try {
    const res = await axios.post(
      `${BEACON_API}/v4/login`,
      {
        client_id:     BEACON_CID,
        client_secret: BEACON_CSEC,   // FIX: was undefined BEACON_CSEC
        grant_type:    'refresh_token',
        refresh_token: beaconToken.refresh,
        scope:         BEACON_SCOPE,  // FIX: was undefined _BCL_SCOPE
      },
      {
        headers: { 'Content-Type': 'application/json' }, // FIX: use JSON not form-encoded
        timeout: 12000,
      }
    );
    beaconToken.access    = res.data.access_token;
    beaconToken.refresh   = res.data.refresh_token   || beaconToken.refresh;
    beaconToken.expiresAt = res.data.access_token_expiration || 0;
    console.log('✅ Beacon token refreshed');
    return true;
  } catch (e) {
    console.error('❌ Beacon refresh failed:', e.response?.data || e.message);
    return false;
  }
}

// ─── Get valid access token, auto-refreshing if needed ───────────
async function beaconAuth() {
  if (!beaconToken.access) return null;
  const now = Math.floor(Date.now() / 1000);
  if (beaconToken.expiresAt && now >= beaconToken.expiresAt - 300) {
    const ok = await beaconRefresh();
    if (!ok) return null;
  }
  return beaconToken.access;
}

// ─── Discover group ───────────────────────────────────────────────
async function beaconDiscoverGroup() {
  const token = await beaconAuth();
  if (!token) return;
  try {
    const res = await axios.get(`${BEACON_API}/v4/groups/`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    const groups = res.data?.results || res.data || [];
    if (groups.length) {
      beaconToken.groupId = groups[0].id;
      console.log(`✅ Beacon group discovered: ${beaconToken.groupId}`);
    }
  } catch (e) {
    console.error('❌ Beacon group discovery failed:', e.message);
  }
}

// ─── Generic Beacon GET ───────────────────────────────────────────
async function beaconGet(path, params = {}) {
  const token = await beaconAuth();
  if (!token) throw new Error('Beacon not authenticated');
  const res = await axios.get(`${BEACON_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
    timeout: 12000,
  });
  return res.data;
}

// PKCE helpers for browser OAuth
function genVerifier()          { return crypto.randomBytes(48).toString('base64url').slice(0, 96); }
function genChallenge(verifier) { return crypto.createHash('sha256').update(verifier).digest('base64url'); }

// ─── Beacon OAuth (Browser PKCE) ─────────────────────────────────
app.get('/auth/beacon', (req, res) => {
  const state    = crypto.randomBytes(16).toString('hex');
  const verifier = genVerifier();
  const challenge = genChallenge(verifier);
  beaconDeviceSessions.set(state, { verifier, ts: Date.now() });

  const params = new URLSearchParams({
    client_id:             BEACON_CID,
    redirect_uri:          BEACON_REDIRECT_URI,
    response_type:         'code',
    scope:                 BEACON_SCOPE,
    state,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
  });
  res.redirect(`${BEACON_API}/oauth2/authorize?${params}`);
});

app.get('/auth/beacon/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect(`${ADMIN_URL}?beacon_error=no_code`);

  const session = beaconDeviceSessions.get(state);
  try {
    const body = {
      client_id:     BEACON_CID,
      client_secret: BEACON_CSEC,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  BEACON_REDIRECT_URI,
      scope:         BEACON_SCOPE,
      ...(session ? { code_verifier: session.verifier } : {}),
    };

    const r = await axios.post(`${BEACON_API}/v4/login`, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 12000,
    });

    beaconToken.access    = r.data.access_token;
    beaconToken.refresh   = r.data.refresh_token;
    beaconToken.expiresAt = r.data.access_token_expiration || 0;
    if (state) beaconDeviceSessions.delete(state);

    await beaconDiscoverGroup().catch(() => {});
    console.log('✅ Beacon browser OAuth complete');
    res.redirect(`${ADMIN_URL}?beacon_auth=success`);
  } catch (e) {
    console.error('❌ Beacon callback failed:', e.response?.data || e.message);
    res.redirect(`${ADMIN_URL}?beacon_error=token_exchange_failed`);
  }
});

// ─── Beacon API Routes ────────────────────────────────────────────
app.get('/api/beacon/status', async (_req, res) => {
  try {
    const token = await beaconAuth();
    if (!token) return res.json({ authenticated: false });
    const data = await beaconGet(`/v4/groups/${beaconToken.groupId}/`).catch(() => null);
    res.json({
      authenticated: true,
      groupId:       beaconToken.groupId,
      expiresAt:     beaconToken.expiresAt,
      expiresIn:     beaconToken.expiresAt
        ? Math.max(0, beaconToken.expiresAt - Math.floor(Date.now() / 1000)) + 's'
        : null,
      group: data,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/beacon/servers', async (_req, res) => {
  try {
    if (!beaconToken.groupId) await beaconDiscoverGroup();
    const data = await beaconGet(`/v4/groups/${beaconToken.groupId}/servers/`);
    res.json(data);
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

app.get('/api/beacon/players', async (req, res) => {
  try {
    if (!beaconToken.groupId) await beaconDiscoverGroup();
    const { server_id } = req.query;
    const path = server_id
      ? `/v4/servers/${server_id}/players/`
      : `/v4/groups/${beaconToken.groupId}/players/`;
    const data = await beaconGet(path);
    res.json(data);
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

app.post('/api/beacon/refresh', verifyToken, checkAdmin, async (_req, res) => {
  const ok = await beaconRefresh();
  res.json({ success: ok, expiresAt: beaconToken.expiresAt });
});

app.get('/api/beacon/token-status', verifyToken, checkAdmin, (_req, res) => {
  res.json({
    authenticated: !!beaconToken.access,
    groupId:       beaconToken.groupId || null,
    expiresAt:     beaconToken.expiresAt || null,
    expiresIn:     beaconToken.expiresAt
      ? Math.max(0, beaconToken.expiresAt - Math.floor(Date.now() / 1000)) + 's'
      : null,
    hasRefresh:    !!beaconToken.refresh,
  });
});

// ─── Auto-refresh Beacon token every 30 minutes ───────────────────
setInterval(async () => {
  if (beaconToken.refresh) {
    const now = Math.floor(Date.now() / 1000);
    if (!beaconToken.expiresAt || now >= beaconToken.expiresAt - 600) {
      await beaconRefresh();
    }
  }
}, 30 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════
// SHARD WALLET
// ═══════════════════════════════════════════════════════════════
app.get('/wallet/balance', async (req, res) => {
  const { discord_id } = req.query;
  if (!discord_id) return res.status(400).json({ error: 'discord_id required' });
  try {
    const { data, error } = await supabase
      .from('aegis_wallets')
      .select('discord_id, balance_wallet, lifetime_earned, lifetime_spent')
      .eq('discord_id', discord_id)
      .single();
    if (error) throw error;
    res.json({ balance: data?.balance_wallet ?? 0, lifetime_earned: data?.lifetime_earned ?? 0 });
  } catch {
    res.json({ balance: 0, lifetime_earned: 0 });
  }
});

app.post('/wallet/award', verifyToken, checkMod, async (req, res) => {
  const { discord_id, amount, note, actor_discord_id } = req.body;
  if (!discord_id || !amount) return res.status(400).json({ error: 'discord_id + amount required' });
  try {
    // Upsert wallet
    const { data: wallet } = await supabase
      .from('aegis_wallets')
      .upsert({ discord_id, balance_wallet: 0, lifetime_earned: 0, lifetime_spent: 0 }, { onConflict: 'discord_id' })
      .select()
      .single();

    const newBal = (wallet?.balance_wallet ?? 0) + Number(amount);
    await supabase.from('aegis_wallets').update({
      balance_wallet:  newBal,
      lifetime_earned: (wallet?.lifetime_earned ?? 0) + Number(amount),
    }).eq('discord_id', discord_id);

    await supabase.from('aegis_wallet_ledger').insert({
      discord_id,
      actor_discord_id: actor_discord_id || req.user?.id || 'SYSTEM',
      amount:           Number(amount),
      transaction_type: 'award',
      note:             note || 'Manual award',
      balance_wallet_after: newBal,
    });

    res.json({ success: true, balance: newBal });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/wallet/deduct', verifyToken, checkMod, async (req, res) => {
  const { discord_id, amount, note, actor_discord_id } = req.body;
  if (!discord_id || !amount) return res.status(400).json({ error: 'discord_id + amount required' });
  try {
    const { data: wallet } = await supabase
      .from('aegis_wallets')
      .select()
      .eq('discord_id', discord_id)
      .single();

    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    if (wallet.balance_wallet < Number(amount))
      return res.status(400).json({ error: 'Insufficient balance' });

    const newBal = wallet.balance_wallet - Number(amount);
    await supabase.from('aegis_wallets').update({
      balance_wallet:  newBal,
      lifetime_spent: (wallet.lifetime_spent ?? 0) + Number(amount),
    }).eq('discord_id', discord_id);

    await supabase.from('aegis_wallet_ledger').insert({
      discord_id,
      actor_discord_id: actor_discord_id || req.user?.id || 'SYSTEM',
      amount:           -Number(amount),
      transaction_type: 'deduct',
      note:             note || 'Manual deduct',
      balance_wallet_after: newBal,
    });

    res.json({ success: true, balance: newBal });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/wallet/ledger', verifyToken, async (req, res) => {
  const { discord_id, limit = 20 } = req.query;
  if (!discord_id) return res.status(400).json({ error: 'discord_id required' });
  try {
    const { data, error } = await supabase
      .from('aegis_wallet_ledger')
      .select('*')
      .eq('discord_id', discord_id)
      .order('created_at', { ascending: false })
      .limit(Number(limit));
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// SHOP ORDERS
// ═══════════════════════════════════════════════════════════════
const TIER_COLORS = {1:'#00c8ff',2:'#0088ff',3:'#cc44ff',5:'#ff8800',6:'#ff2266',
  8:'#00ddcc',10:'#4488ff',12:'#ffcc00',15:'#ff6600',20:'#ff44cc',30:'#ffaa00'};

app.post('/shop/order', async (req, res) => {
  try {
    const { tier, tier_cost, character_name, tribe_name, map,
            discord_username, selected_items, order_details } = req.body;

    if (!character_name || !map || !discord_username || !selected_items?.length)
      return res.status(400).json({ error: 'Missing required fields' });

    const { data, error } = await supabase
      .from('shop_orders')
      .insert([{
        tier:             tier ?? null,
        tier_cost:        tier_cost ?? null,
        character_name,
        tribe_name:       tribe_name || null,
        map,
        discord_username,
        selected_items,
        order_details:    order_details || null,
        status:           'pending',
      }])
      .select('id')
      .single();
    if (error) throw error;

    const orderId   = data.id;
    const tierLabel = tier ? `Tier ${tier}` : 'Dino Insurance';
    const colorHex  = parseInt((TIER_COLORS[tier] || '#00ccff').replace('#', ''), 16);
    const itemLines = selected_items.map(i => `> • ${i}`).join('\n');

    // Webhook → #clvsd-shop-tickets
    if (SHOP_WEBHOOK_URL) {
      fetch(SHOP_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `📦 **New Shop Order** — please review and open a ticket for **${discord_username}**`,
          embeds: [{
            title:  `🛒 ${tierLabel} — ${tier_cost ? tier_cost + ' Shard' + (tier_cost !== 1 ? 's' : '') : 'Insurance'}`,
            color:  colorHex,
            fields: [
              { name: '👤 Character',  value: character_name,          inline: true },
              { name: '🏹 Discord',    value: `@${discord_username}`,  inline: true },
              { name: '🗺️ Map',        value: map,                     inline: true },
              { name: '⚔️ Tribe',      value: tribe_name || 'Solo',    inline: true },
              { name: '💎 Cost',       value: tier_cost ? `${tier_cost} Shards` : 'Per Dino', inline: true },
              { name: '🔑 Order ID',   value: `\`${orderId}\``,        inline: true },
              { name: '📋 Items',      value: itemLines || '—',        inline: false },
              { name: '📝 Details',    value: order_details || '—',    inline: false },
            ],
            footer:    { text: 'TheConclave Dominion • ClaveShard Shop' },
            timestamp: new Date().toISOString(),
          }],
        }),
      }).catch(e => console.error('[shop webhook]', e.message));
    }

    // Bot posts + threads in #clvsd-shop-tickets
    if (DISCORD_BOT_TOKEN) {
      const msgRes = await fetch(
        `${DISCORD_API}/channels/${SHOP_TICKETS_CHANNEL}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `📦 **Shop Order** from **@${discord_username}** — ${tierLabel}`,
            embeds: [{
              title:  `Order #${orderId.slice(0, 8).toUpperCase()}`,
              color:  colorHex,
              fields: [
                { name: 'Character', value: character_name, inline: true },
                { name: 'Map',       value: map,            inline: true },
                { name: 'Cost',      value: tier_cost ? `${tier_cost} Shards` : 'Insurance', inline: true },
                { name: 'Items',     value: itemLines,      inline: false },
                { name: 'Details',   value: order_details || '—', inline: false },
              ],
              footer:    { text: `Full Order ID: ${orderId}` },
              timestamp: new Date().toISOString(),
            }],
          }),
        }
      );
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        fetch(`${DISCORD_API}/channels/${SHOP_TICKETS_CHANNEL}/messages/${msgData.id}/threads`, {
          method: 'POST',
          headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:                  `Order — ${discord_username} — ${tierLabel}`,
            auto_archive_duration: 1440,
          }),
        }).catch(() => {});
      }
    }

    res.json({ success: true, order_id: orderId });
  } catch (e) {
    console.error('[shop/order]', e);
    res.status(500).json({ error: 'Failed to submit order' });
  }
});

app.get('/shop/orders', verifyToken, checkMod, async (req, res) => {
  try {
    const { status = 'pending', limit = 50 } = req.query;
    const { data, error } = await supabase
      .from('shop_orders')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(Number(limit));
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/shop/orders/:id', verifyToken, checkMod, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, fulfilled_by, staff_notes } = req.body;
    const updates = { status };
    if (fulfilled_by)      updates.fulfilled_by  = fulfilled_by;
    if (staff_notes)       updates.staff_notes   = staff_notes;
    if (status === 'completed') updates.fulfilled_at = new Date().toISOString();

    const { error } = await supabase.from('shop_orders').update(updates).eq('id', id);
    if (error) throw error;

    // Log to shop log channel
    if (DISCORD_BOT_TOKEN && status === 'completed') {
      fetch(`${DISCORD_API}/channels/${SHOP_LOG_CHANNEL}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title:  '✅ Order Fulfilled',
            color:  0x00ff88,
            fields: [
              { name: 'Order ID',     value: `\`${id}\``,         inline: true },
              { name: 'Fulfilled By', value: fulfilled_by || '—', inline: true },
              { name: 'Notes',        value: staff_notes  || '—', inline: false },
            ],
            timestamp: new Date().toISOString(),
            footer: { text: 'TheConclave Dominion • ClaveShard Shop Log' },
          }],
        }),
      }).catch(() => {});
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// NITRADO / SERVER STATUS
// ═══════════════════════════════════════════════════════════════
const SERVERS = [
  {id:1,key:'theisland',  display:'The Island',    emoji:'🏔️', ip:'217.114.196.102',port:5390},
  {id:2,key:'volcano',    display:'Volcano',        emoji:'🌋', ip:'217.114.196.59', port:5050},
  {id:3,key:'extinction', display:'Extinction',     emoji:'💀', ip:'31.214.196.102', port:6440},
  {id:4,key:'center',     display:'The Center',     emoji:'🗺️', ip:'31.214.163.71',  port:5120},
  {id:5,key:'lostcolony', display:'Lost Colony',    emoji:'🏝️', ip:'217.114.196.104',port:5150},
  {id:6,key:'astraeos',   display:'Astraeos',       emoji:'🌙', ip:'217.114.196.9',  port:5320},
  {id:7,key:'valguero',   display:'Valguero',       emoji:'🌿', ip:'85.190.136.141', port:5090},
  {id:8,key:'scorched',   display:'Scorched Earth', emoji:'🏜️', ip:'217.114.196.103',port:5240},
  {id:9,key:'aberration', display:'Aberration',     emoji:'🌋', ip:'217.114.196.80', port:5540, isPvP:true},
  {id:10,key:'amissa',    display:'Amissa',         emoji:'⭐', ip:'217.114.196.80', port:5180, isPatreon:true},
];

app.get('/servers', async (_req, res) => {
  try {
    if (!NITRADO_TOKEN) return res.json(SERVERS.map(s => ({ ...s, status: 'unknown' })));
    const results = await Promise.allSettled(
      SERVERS.map(s =>
        axios.get(`https://api.nitrado.net/services`, {
          headers: { Authorization: `Bearer ${NITRADO_TOKEN}` },
          timeout: 8000,
        }).then(r => ({ ...s, status: 'online', data: r.data }))
          .catch(() => ({ ...s, status: 'offline' }))
      )
    );
    res.json(results.map(r => r.value || r.reason));
  } catch (e) {
    res.json(SERVERS.map(s => ({ ...s, status: 'unknown' })));
  }
});

app.get('/servers/status', async (_req, res) => {
  res.json({
    servers: SERVERS,
    online:  SERVERS.length,
    total:   SERVERS.length,
    ts:      new Date().toISOString(),
  });
});

// ═══════════════════════════════════════════════════════════════
// EVENTS (Supabase)
// ═══════════════════════════════════════════════════════════════
app.get('/api/events', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })
      .limit(10);
    if (error) throw error;
    res.json(data || []);
  } catch { res.json([]); }
});

// ═══════════════════════════════════════════════════════════════
// DONATION GOAL
// ═══════════════════════════════════════════════════════════════
app.get('/api/donation-goal', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('donation_goals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error) throw error;
    res.json(data || { current: 0, target: 500, donors: 0 });
  } catch {
    res.json({ current: 0, target: 500, donors: 0 });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN WEBHOOKS
// ═══════════════════════════════════════════════════════════════
app.post('/admin/webhook', verifyToken, checkAdmin, async (req, res) => {
  const { action, webhookUrl } = req.body;
  try {
    const url = webhookUrl || DISCORD_WEBHOOK_URL;
    if (!url) return res.status(400).json({ error: 'No webhook URL' });
    const messages = {
      boot_online:  '⚡ **AEGIS NETWORK** — Boot sequence complete. All systems ONLINE.',
      node4_online: '🟢 **NODE 4** — Now ONLINE. Cluster at full capacity.',
      pulse:        '🔄 **SYSTEM PULSE** — All nodes operational. AEGIS monitoring active.',
    };
    await axios.post(url, {
      username: 'Conclave AEGIS',
      content:  messages[action] || `⚙️ AEGIS trigger: ${action}`,
    });
    res.json({ success: true, action });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/admin/dashboard', verifyToken, checkAdmin, (_req, res) =>
  res.json({ message: 'Welcome Conclave Admin', ts: new Date().toISOString() })
);

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLER
// ═══════════════════════════════════════════════════════════════
app.use((err, _req, res, _next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ═══════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Conclave AEGIS API v8.0 — port ${PORT}`);
  console.log(`🔗 Frontend: ${FRONTEND_URL}`);
  console.log(`🔗 Admin: ${ADMIN_URL}`);
  console.log(`🔗 API: ${API_BASE_URL}`);
  console.log(`🔐 Beacon: ${beaconToken.access ? '✅ token loaded' : '⚠️  not authenticated'}`);
  // Attempt Beacon group discovery on boot if we have a token
  if (beaconToken.access && !beaconToken.groupId) {
    beaconDiscoverGroup().catch(() => {});
  }
});

// Load bot
try {
  require('./bot.js');
} catch (e) {
  console.error('❌ bot.js failed to load:', e.message);
}

process.on('SIGINT', () => { console.log('🛑 Graceful shutdown'); process.exit(0); });
process.on('uncaughtException',  e => console.error('❌ Uncaught:', e));
process.on('unhandledRejection', e => console.error('❌ Unhandled rejection:', e));
