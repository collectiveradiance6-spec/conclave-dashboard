// ═══════════════════════════════════════════════════════════════
// CONCLAVE AEGIS API — server.js v5.2
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
const FRONTEND    = (FRONTEND_URL || 'https://theconclavedominion.com').replace(/\/$/, '');
const API_BASE_URL = (process.env.API_BASE_URL || 'https://api.theconclavedominion.com').replace(/\/$/, '');
const ADMIN_URL   = (process.env.ADMIN_URL || `${FRONTEND}/admin`).replace(/\/$/, '');
const DISCORD_CALLBACK_URL = DISCORD_REDIRECT_URI || `${API_BASE_URL}/auth/discord/callback`;
const APP_PORT    = PORT || 5001;

// ─── REQUIRED ENV CHECKS ──────────────────────────────────────────
if (!SUPABASE_URL)              throw new Error('SUPABASE_URL missing');
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
if (!JWT_SECRET)     console.warn('⚠️  JWT_SECRET missing — auth routes will fail');
if (!SESSION_SECRET) console.warn('⚠️  SESSION_SECRET missing — using fallback');

// ─── CLIENTS ──────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
const generateAuthUrl = () => {
  const params = new URLSearchParams({
    client_id:     DISCORD_CLIENT_ID,
    redirect_uri:  DISCORD_CALLBACK_URL,
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
    redirect_uri:  DISCORD_CALLBACK_URL
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
  { id: 'island',     name: 'The Island',     ip: '217.114.196.102', port: 5390, mode: 'PvE',     maxPlayers: 20, mapId: '18266152', fullName: 'TheConclave-TheIsland-5xCrossplay'       },
  { id: 'volcano',    name: 'Volcano',         ip: '217.114.196.59',  port: 5050, mode: 'PvE',     maxPlayers: 20, mapId: '18094678', fullName: 'TheConclave:Volcano'                      },
  { id: 'extinction', name: 'Extinction',      ip: '31.214.196.102',  port: 6440, mode: 'PvE',     maxPlayers: 20, mapId: '18106633', fullName: 'TheConclave-Extinction-5Xcrossplay'       },
  { id: 'center',     name: 'The Center',      ip: '31.214.163.71',   port: 5120, mode: 'PvE',     maxPlayers: 20, mapId: '18182839', fullName: 'TheConclave-Center-5xCrossplay'           },
  { id: 'lostcolony', name: 'Lost Colony',     ip: '217.114.196.104', port: 5150, mode: 'PvE',     maxPlayers: 20, mapId: '18307276', fullName: 'TheConclave-LostColony-5xCrossplay'       },
  { id: 'astraeos',   name: 'Astraeos',        ip: '217.114.196.9',   port: 5320, mode: 'PvE',     maxPlayers: 20, mapId: '18393892', fullName: 'TheConclave-Astreos-5xCrossplay'          },
  { id: 'valguero',   name: 'Valguero',        ip: '85.190.136.141',  port: 5090, mode: 'PvE',     maxPlayers: 20, mapId: '18509341', fullName: 'TheConclave-Valguero-5xCrossplay'         },
  { id: 'scorched',   name: 'Scorched Earth',  ip: '217.114.196.103', port: 5240, mode: 'PvE',     maxPlayers: 20, mapId: '18598049', fullName: 'TheConclave-Scorched-5xCrossplay'         },
  { id: 'aberration', name: 'Aberration',      ip: '217.114.196.80',  port: 5540, mode: 'PvP',     maxPlayers: 20, mapId: '18655529', fullName: 'TheConclave-Aberration-5xCrossplay'       },
  { id: 'amissa',     name: 'Amissa',          ip: '217.114.196.80',  port: 5180, mode: 'Patreon', maxPlayers: 20, mapId: '18680162', fullName: 'TheConclave-Amissa-Patreon-5xCrossplay'   }
];

let serverCache = {};
let lastServerFetch = 0;

const fetchServerStatuses = async () => {
  if (Date.now() - lastServerFetch < 60000 && Object.keys(serverCache).length) {
    return serverCache;
  }

  const results = {};

  await Promise.all(
    SERVERS.map(async (srv) => {
      try {
        const searchTerm = encodeURIComponent(srv.fullName || `${srv.ip}:${srv.port}`);
        const url = `https://api.battlemetrics.com/servers?filter[search]=${searchTerm}&filter[game]=arksa&fields[server]=name,players,maxPlayers,status,ip,port&page[size]=5`;

        const headers = BATTLEMETRICS_TOKEN
          ? { Authorization: `Bearer ${BATTLEMETRICS_TOKEN}` }
          : {};

        const response = await axios.get(url, { headers, timeout: 10000 });
        const data = response.data?.data || [];

        const match =
          data.find(s => String(s.attributes.port) === String(srv.port) && s.attributes.ip === srv.ip) ||
          data.find(s => String(s.attributes.port) === String(srv.port))                                 ||
          data[0];

        results[srv.id] = match
          ? { ...srv, status: match.attributes.status === 'online' ? 'online' : 'offline', players: match.attributes.players || 0 }
          : { ...srv, status: 'unknown', players: 0 };

      } catch {
        results[srv.id] = { ...srv, status: 'unknown', players: 0 };
      }
    })
  );

  serverCache      = results;
  lastServerFetch  = Date.now();
  return results;
};

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

// ─── HEALTH / ROOT ────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ name: 'Conclave Aegis', status: 'online', version: '5.2' });
});

// FIX: UptimeRobot pings /health — must stay lean and fast
app.get('/health', (_req, res) => res.send('OK'));

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
  res.redirect(generateAuthUrl());
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect(`${ADMIN_URL}?error=no_code`);

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

    return res.redirect(`${ADMIN_URL}?token=${token}&login=success`);
  } catch (err) {
    console.error('❌ Auth callback error:', err.message);
    return res.redirect(`${ADMIN_URL}?error=auth_failed`);
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
  return res.json({ success: true });
});

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

// ─── ERROR HANDLER ────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({ message: err.message || 'Server Error' });
});

// ─── START ────────────────────────────────────────────────────────
app.listen(APP_PORT, () => {
  console.log(`🚀 Conclave Aegis API v5.2 running on port ${APP_PORT}`);
  console.log(`   FRONTEND: ${FRONTEND}`);
  console.log(`   Supabase: ${SUPABASE_URL ? '✅ connected' : '❌ missing'}`);
  console.log(`   Anthropic: ${ANTHROPIC_API_KEY ? '✅ connected' : '⚠️  not set'}`);
  console.log(`   BattleMetrics: ${BATTLEMETRICS_TOKEN ? '✅' : '⚠️  no token (public rate limits apply)'}`);
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
