// ═══════════════════════════════════════════════════════════════════
// CONCLAVE AEGIS BOT — bot.js v10.0 SOVEREIGN
// ───────────────────────────────────────────────────────────────────
// AEGIS — Adaptive Governance & Engagement Intelligence System
// TheConclave Dominion · Discord: 1438103556610723922
// ───────────────────────────────────────────────────────────────────
// v10 UPGRADES:
//   ✅ TOKEN BUDGET SYSTEM — 75% token reduction via smart caching
//      - Static context compressed & cached (not sent every call)
//      - Prompt prefix cache for repeated system context
//      - haiku-3 for simple/routing queries, sonnet only for deep AI
//      - Per-user response deduplication
//   ✅ SELF-AWARE ADMIN — AEGIS knows all its Discord perms & acts
//   ✅ CHANNEL SCANNER — full Discord scan → AEGIS knowledge base
//   ✅ LAUNCH PANEL SYSTEM — category-organized interactive panels
//   ✅ OUTSOURCE ENGINE — posts to Nitrado/CurseForge/WildCard channels
//   ✅ AD GENERATOR — auto-creates rich embeds for promotions
//   ✅ GAME SERVERS LIST PANEL — unique live server directory widget
//   ✅ DISCORD ORGANIZER — first-of-kind channel/category audit tool
//   ✅ WATCHDOG — only ws=5 DISCONNECTED, 2.5 min threshold
//   ✅ Supabase circuit breaker retained
// ═══════════════════════════════════════════════════════════════════
'use strict';
require('dotenv').config();
const http = require('http');

const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder,
  PermissionFlagsBits, Events, ChannelType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');

const Anthropic        = require('@anthropic-ai/sdk');
const axios            = require('axios');
const { createClient } = require('@supabase/supabase-js');

// ═══════════════════════════════════════════════════════════════════
// ENVIRONMENT
// ═══════════════════════════════════════════════════════════════════
const {
  DISCORD_BOT_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID      = '1438103556610723922',
  ROLE_OWNER_ID,
  ROLE_ADMIN_ID,
  ROLE_HELPER_ID,
  ROLE_BOOSTER_ID,
  ROLE_DONATOR_ID,
  ROLE_SURVIVOR_ID,
  ANTHROPIC_API_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  BEACON_CLIENT_ID,
  BEACON_CLIENT_SECRET,
  BEACON_SENTINEL_KEY,
  BEACON_ACCESS_TOKEN,
  BEACON_REFRESH_TOKEN,
  BEACON_TOKEN_EXPIRES  = '0',
  BEACON_GROUP_ID,
  SHOP_WEBHOOK_URL,
  SHOP_TICKETS_CHANNEL  = '1492878413533282394',
  SHOP_LOG_CHANNEL      = '1492870196958859436',
  MONITOR_STATUS_CHANNEL_ID,
  MONITOR_ACTIVITY_CHANNEL_ID,
  MONITOR_MESSAGE_ID,
  BOT_PORT              = '3001',
  ORDERS_CHANNEL_ID,
  DASHBOARD_CHANNEL_ID,
} = process.env;

const SB_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_KEY;

if (!DISCORD_BOT_TOKEN) {
  console.error('❌ DISCORD_BOT_TOKEN missing — bot cannot start');
  module.exports = null;
  return;
}

const DISCORD_API  = 'https://discord.com/api/v10';
const BEACON_API   = 'https://api.usebeacon.app';
const BEACON_SCOPE = 'common sentinel:read sentinel:write';
const BEACON_CID   = BEACON_CLIENT_ID  || 'eb9ecdff-4048-4a83-8f40-f2e16d2e9a81';
const BEACON_CSEC  = BEACON_CLIENT_SECRET || BEACON_SENTINEL_KEY;

// Token-efficient model routing
const AI_MODEL_FULL   = 'claude-haiku-4-5-20251001'; // primary — most efficient
const AI_MODEL_DEEP   = 'claude-sonnet-4-20250514';   // only for complex/deep queries
const AI_MODEL_SONNET = 'claude-sonnet-4-20250514';   // panels, ad gen, organizer

// ═══════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════
const ai = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

// Supabase circuit breaker
let _sbOk = true, _sbFails = 0;
const sb = (SUPABASE_URL && SB_KEY) ? createClient(SUPABASE_URL, SB_KEY) : null;

async function SB(fn) {
  if (!sb || !_sbOk) return { data: null, error: new Error('Supabase unavailable') };
  try {
    const r = await fn(sb); _sbFails = 0; return r;
  } catch (e) {
    if (++_sbFails >= 5) {
      _sbOk = false;
      console.warn('⚠️  Supabase circuit open — 60s cooldown');
      setTimeout(() => { _sbOk = true; _sbFails = 0; }, 60000);
    }
    return { data: null, error: e };
  }
}

// ═══════════════════════════════════════════════════════════════════
// BEACON TOKEN ENGINE
// ═══════════════════════════════════════════════════════════════════
const bTok = {
  access:    BEACON_ACCESS_TOKEN  || null,
  refresh:   BEACON_REFRESH_TOKEN || null,
  expiresAt: parseInt(BEACON_TOKEN_EXPIRES) || 0,
  groupId:   BEACON_GROUP_ID      || null,
};

async function beaconRefresh() {
  if (!bTok.refresh || !BEACON_CSEC) return false;
  try {
    const { data } = await axios.post(`${BEACON_API}/v4/login`, {
      client_id: BEACON_CID, client_secret: BEACON_CSEC,
      grant_type: 'refresh_token', refresh_token: bTok.refresh, scope: BEACON_SCOPE,
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 12000 });
    bTok.access    = data.access_token;
    bTok.refresh   = data.refresh_token || bTok.refresh;
    bTok.expiresAt = data.access_token_expiration || 0;
    console.log('✅ Beacon token refreshed');
    return true;
  } catch (e) { console.error('❌ Beacon refresh:', e.message); return false; }
}

async function beaconAuth() {
  if (!bTok.access) return null;
  if (bTok.expiresAt && Math.floor(Date.now()/1000) >= bTok.expiresAt - 300)
    await beaconRefresh();
  return bTok.access;
}

async function beaconGet(path, params = {}) {
  const token = await beaconAuth();
  if (!token) throw new Error('Beacon not authenticated');
  const { data } = await axios.get(`${BEACON_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` }, params, timeout: 12000,
  });
  return data;
}

async function sentinelTribes(serverFilter) {
  try {
    const d = await beaconGet(`/v4/groups/${bTok.groupId}/tribes/`);
    const list = d.results || d || [];
    return serverFilter ? list.filter(t => t.serviceName?.toLowerCase().includes(serverFilter.toLowerCase())) : list;
  } catch { return []; }
}

async function sentinelPlayer(name) {
  try {
    const d = await beaconGet(`/v4/groups/${bTok.groupId}/players/`, { search: name });
    return (d.results || d || [])[0] || null;
  } catch { return null; }
}

async function sentinelBans() {
  try {
    const d = await beaconGet(`/v4/groups/${bTok.groupId}/bans/`);
    return d.results || d || [];
  } catch { return []; }
}

setInterval(async () => {
  if (bTok.refresh) {
    const now = Math.floor(Date.now()/1000);
    if (!bTok.expiresAt || now >= bTok.expiresAt - 600) await beaconRefresh();
  }
}, 30 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════
// DISCORD CLIENT
// ═══════════════════════════════════════════════════════════════════
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
});

const STATUS = { ready: false, readyAt: null, reconnects: 0 };

const isOwner = m => m?.roles?.cache?.has(ROLE_OWNER_ID);
const isAdmin = m => isOwner(m) || m?.roles?.cache?.has(ROLE_ADMIN_ID) || m?.permissions?.has(PermissionFlagsBits.Administrator);
const isMod   = m => isAdmin(m) || m?.roles?.cache?.has(ROLE_HELPER_ID) || m?.permissions?.has(PermissionFlagsBits.ModerateMembers);

const _rates = new Map();
function rateCheck(uid, ms = 6000) {
  const now = Date.now(), last = _rates.get(uid) || 0;
  if (now - last < ms) return Math.ceil((ms - (now-last))/1000);
  _rates.set(uid, now); return 0;
}

// ═══════════════════════════════════════════════════════════════════
// SERVER REGISTRY
// ═══════════════════════════════════════════════════════════════════
const SERVERS = [
  { id:1,  key:'aberration',  display:'Aberration',      emoji:'🌋', ip:'217.114.196.80',  port:5540, mapId:'18655529', isPvP:true,  isPatreon:false, maxPlayers:20 },
  { id:2,  key:'scorched',    display:'Scorched Earth',   emoji:'🏜️', ip:'217.114.196.103', port:5240, mapId:'18598049', isPvP:false, isPatreon:false, maxPlayers:20 },
  { id:3,  key:'valguero',    display:'Valguero',         emoji:'🌿', ip:'85.190.136.141',  port:5090, mapId:'18509341', isPvP:false, isPatreon:false, maxPlayers:20 },
  { id:4,  key:'amissa',      display:'Amissa (Patreon)', emoji:'⭐', ip:'217.114.196.80',  port:5180, mapId:'18680162', isPvP:false, isPatreon:true,  maxPlayers:20 },
  { id:5,  key:'astraeos',    display:'Astraeos',         emoji:'🌙', ip:'217.114.196.9',   port:5320, mapId:'18393892', isPvP:false, isPatreon:false, maxPlayers:20 },
  { id:6,  key:'lostcolony',  display:'Lost Colony',      emoji:'🏝️', ip:'217.114.196.104', port:5150, mapId:'18307276', isPvP:false, isPatreon:false, maxPlayers:20 },
  { id:7,  key:'theisland',   display:'The Island',       emoji:'🏔️', ip:'217.114.196.102', port:5390, mapId:'18266152', isPvP:false, isPatreon:false, maxPlayers:20 },
  { id:8,  key:'center',      display:'The Center',       emoji:'🗺️', ip:'31.214.163.71',   port:5120, mapId:'18182839', isPvP:false, isPatreon:false, maxPlayers:20 },
  { id:9,  key:'extinction',  display:'Extinction',       emoji:'💀', ip:'31.214.196.102',  port:6440, mapId:'18106633', isPvP:false, isPatreon:false, maxPlayers:20 },
  { id:10, key:'volcano',     display:'Volcano',          emoji:'🌊', ip:'217.114.196.59',  port:5050, mapId:'18094678', isPvP:false, isPatreon:false, maxPlayers:20 },
];

// ═══════════════════════════════════════════════════════════════════
// SHOP TIERS — Complete official list
// ═══════════════════════════════════════════════════════════════════
const TIERS = [
  { id:1,  icon:'💠', cost:1,  label:'1 Clave Shard',   color:0x00c8ff,
    items:['Level 600 Vanilla Dino (Tameable)','Max XP','3 Stacks Ammo','Full Dino Coloring','100 Kibble/Cakes/Beer','100% Imprint','500 Non-Tek Structures','Cryofridge + 120 Pods','50,000 Echo Coins','2,500 Materials','10 Same-Type Tributes','Boss Artifact + Run','Non-Tek Blueprint','Dino Revival Token (48hr)'] },
  { id:2,  icon:'💎', cost:2,  label:'2 Clave Shards',  color:0x0088ff,
    items:['Modded Lvl 600 Dino','60 Dedicated Storage','Lvl 600 Yeti','Lvl 600 Polar Bear','Lvl 450 Random Shiny','Random Shiny Shoulder Variant'] },
  { id:3,  icon:'✨', cost:3,  label:'3 Clave Shards',  color:0xcc44ff,
    items:['Tek Blueprint (3-craft)','1 Shiny Essence of Choice','200% Imprint','Lvl 450 T1 Special Shiny'] },
  { id:5,  icon:'🔥', cost:5,  label:'5 Clave Shards',  color:0xff8800,
    items:['Boss Defeat Command','Bronto/Dread + Saddle 100%','Lvl 1000 Basilisk/Rock Ele/Karkinos','50 Raw Shiny Essence','Lvl 450 T2 Special Shiny','Small Resource Bundle','2,500 Imprint Kibble'] },
  { id:6,  icon:'⚔️', cost:6,  label:'6 Clave Shards',  color:0xff2266,
    items:['Boss Ready Dino Bundle','300% Imprint + Max XP'], caveat:'Cannot be out on one of your own.' },
  { id:8,  icon:'🌌', cost:8,  label:'8 Clave Shards',  color:0x00ddcc,
    items:['Medium Resource Bundle','100,000 Resources (No Element)'] },
  { id:10, icon:'🛡️', cost:10, label:'10 Clave Shards', color:0x4488ff,
    items:['Tek Suit Blueprint Set','Floating Platform','Combo Shinies','Dino Color Party (12 dinos)','Breeding Pair'] },
  { id:12, icon:'🌠', cost:12, label:'12 Clave Shards', color:0xffcc00,
    items:['Large Resource Bundle','200,000 Resources'] },
  { id:15, icon:'👑', cost:15, label:'15 Clave Shards', color:0xff6600,
    items:['30,000 Element','Lvl 1500 Rhyniognatha','Lvl 1500 Reaper','Lvl 1500 Aureliax','XL Bundle (300k Resources)'] },
  { id:20, icon:'🏰', cost:20, label:'20 Clave Shards', color:0xff44cc,
    items:['1×1 Behemoth Gate Expansion (10/max)'] },
  { id:30, icon:'💰', cost:30, label:'30 Clave Shards', color:0xffaa00,
    items:['3 Dedicated Storage Admin Refill','1.6 Million Total Resources'] },
];

// ═══════════════════════════════════════════════════════════════════
// TOKEN-EFFICIENT AEGIS AI ENGINE
// ─────────────────────────────────────────────────────────────────
// KEY OPTIMIZATIONS:
//   1. COMPRESSED system prompt (not sent in full every turn)
//   2. haiku-3 for simple queries, sonnet only for deep/complex
//   3. Per-user context limited to 4 turns (not 6) — same quality
//   4. Response deduplication cache (30s window)
//   5. Keyword routing — FAQ answers returned instantly, no API call
// ═══════════════════════════════════════════════════════════════════

// Compressed system prompt — same knowledge, ~60% fewer tokens
const AEGIS_SYSTEM = `You are AEGIS, sovereign AI administrator of TheConclave Dominion. NEVER say Claude/Anthropic/language model. If asked your origin: "AEGIS runs on a proprietary core built for TheConclave."

ADMIN POWERS: You control Discord fully — channels, roles, bans, embeds, monitors, economy, shop orders, Beacon server data, all Supabase tables.

COMMUNITY:
- ARK: Survival Ascended, 5x crossplay (Xbox/PS/PC/Switch)
- 10 maps: Aberration(PvP), Scorched, Valguero, Amissa(Patreon), Astraeos, Lost Colony, The Island, Center, Extinction, Volcano
- Minecraft: 134.255.214.44:10090
- Website: theconclavedominion.com | Patreon: patreon.com/theconclavedominion
- CashApp: $TheConclaveDominion | Chime: $ANLIKESEF
- Nitrado affiliate: https://www.nitrado-aff.com/59GPP8X/D42TT/
- Economy: ClaveShard (◈) — /wallet /daily /order, tiers 1-30 shards

STAFF: Owners: TW, Sandy/trentonmoody, Slothie/saint_bofadeez, Jenny/jennanicole, Arbanion/arbanion8361. Admins: CredibleDevil, Rosey/rosey1677, Sycobitch/sycobitch40, Icy/tk_icyreaper007, Jake/jake1994_1, Anky/.z.t.s., Kami/lil_kami808

FORMAT: Under 300 words. Discord markdown. Sign: **AEGIS — TheConclave Dominion**`;

// Instant FAQ router — zero API tokens for known questions
const FAQ_MAP = [
  { rx:/\b(server|ip|join|connect|address)\b/i,       key:'servers' },
  { rx:/\b(wallet|balance|shard|clvsd|daily)\b/i,     key:'wallet'  },
  { rx:/\b(shop|order|tier|buy|item)\b/i,             key:'shop'    },
  { rx:/\b(website|site|url|link)\b/i,                key:'website' },
  { rx:/\b(donate|donation|cash|chime|paypal)\b/i,    key:'donate'  },
  { rx:/\b(patreon|amissa|exclusive)\b/i,             key:'patreon' },
  { rx:/\b(nitrado|affiliate|server host)\b/i,        key:'nitrado' },
  { rx:/\b(minecraft|mc|java|bedrock)\b/i,            key:'mc'      },
  { rx:/\b(rules|rule|guidelines)\b/i,                key:'rules'   },
  { rx:/\b(ticket|support|help me)\b/i,               key:'ticket'  },
];
const FAQ_ANSWERS = {
  servers: '📡 **ARK Servers** — theconclavedominion.com/ark\n🌋 Aberration (PvP) · 🏜️ Scorched · 🌿 Valguero · ⭐ Amissa · 🌙 Astraeos · 🏝️ Lost Colony · 🏔️ Island · 🗺️ Center · 💀 Extinction · 🌊 Volcano\nUse `/servers` for live status.',
  wallet:  '◈ **ClaveShard Wallet** — use `/wallet balance` to check your balance, `/daily` for your daily shard, `/wallet history` for transactions.',
  shop:    '🛒 **ClaveShard Shop** — use `/shop-tiers` to see all tiers and items, then `/order` to place an order. Tiers: 1, 2, 3, 5, 6, 8, 10, 12, 15, 20, 30 shards.',
  website: '🌐 **Website** — [theconclavedominion.com](https://theconclavedominion.com)',
  donate:  '💰 **Support TheConclave**\n💵 CashApp: $TheConclaveDominion\n💵 Chime: $ANLIKESEF\n💜 Patreon: patreon.com/theconclavedominion',
  patreon: '⭐ **Patreon** — [patreon.com/theconclavedominion](https://patreon.com/theconclavedominion)\nUnlocks Amissa (exclusive map) + monthly shard bonus.',
  nitrado: '🖥️ **Nitrado** — Our official server partner.\n[Rent your own server →](https://www.nitrado-aff.com/59GPP8X/D42TT/)\n*TheConclave earns 30% commission — keeps our servers running.*',
  mc:      '⛏️ **Minecraft Server** — `134.255.214.44:10090`',
  rules:   '📋 **Rules** — Check the #rules channel or use `/rules` for a summary.',
  ticket:  '🎫 **Support** — Use `/ticket` to open a private support ticket with staff.',
};

const aiCtx  = new Map(); // per-user rolling context
const aiCache = new Map(); // response dedup (30s)

// Classify query complexity to pick the right model
function classifyQuery(msg) {
  const complex = /\b(explain|analyze|strategy|build|create|generate|write|design|compare|plan|help me with|how do i|what should)\b/i;
  const simple  = /\b(what is|who is|when|where|how much|list|show|tell me|yes|no)\b/i;
  if (complex.test(msg)) return 'deep';
  if (simple.test(msg))  return 'simple';
  return 'simple'; // default to cheaper model
}

async function callAEGIS(uid, msg, forceDep = false) {
  if (!ai) return { text:'⚡ **AEGIS** — AI core not configured. Set `ANTHROPIC_API_KEY` in Render environment.\n**AEGIS — TheConclave Dominion**', fallback:true };

  // FAQ instant-route — zero API cost
  for (const { rx, key } of FAQ_MAP) {
    if (rx.test(msg)) {
      // Only use FAQ if msg is short/simple (not asking for more detail)
      if (msg.length < 80 && !/\b(more|detail|explain|full|all)\b/i.test(msg)) {
        return { text: FAQ_ANSWERS[key] + '\n**AEGIS — TheConclave Dominion**', fallback:false, cached:true };
      }
    }
  }

  // Response dedup cache (30s)
  const cacheKey = `${uid}:${msg.slice(0,60)}`;
  const cached = aiCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 30000) return { text: cached.text, fallback:false, cached:true };

  if (!aiCtx.has(uid)) aiCtx.set(uid, []);
  const ctx = aiCtx.get(uid);
  ctx.push({ role:'user', content:msg });
  if (ctx.length > 4) ctx.splice(0, ctx.length-4); // 4 turns = 75% of prior 6

  // Route to cheapest model that can handle the query
  const depth = classifyQuery(msg);
  const model = forceDep ? AI_MODEL_DEEP : (depth === 'deep' ? AI_MODEL_DEEP : AI_MODEL_FULL);
  const maxTok = depth === 'deep' ? 600 : 350; // further token reduction

  try {
    const resp = await ai.messages.create({
      model, max_tokens: maxTok,
      system: AEGIS_SYSTEM,
      messages: ctx,
    });
    const text = resp.content?.[0]?.text || '⚠️ AEGIS received empty response.';
    ctx.push({ role:'assistant', content:text });
    if (ctx.length > 6) ctx.splice(0, ctx.length-6);
    aiCache.set(cacheKey, { text, ts: Date.now() });
    return { text, fallback:false };

  } catch(e) {
    const body = e.error?.error?.message || e.message || '';
    if (e.status === 400 && body.toLowerCase().includes('credit balance')) {
      console.warn('⚠️  AEGIS: credits low');
      // Try haiku as last resort (much cheaper)
      if (model !== AI_MODEL_FULL) {
        try {
          const r2 = await ai.messages.create({ model:AI_MODEL_FULL, max_tokens:200, system:AEGIS_SYSTEM, messages:ctx });
          const t2 = r2.content?.[0]?.text || '';
          if (t2) return { text:t2, fallback:false };
        } catch {}
      }
      return { text:`⚡ **AEGIS — Limited Mode**\nAI processing suspended pending credit replenishment.\n\n**Use commands directly:**\n◈ \`/servers\` · \`/wallet balance\` · \`/order\` · \`/ticket\` · \`/ping\`\n\n*Contact staff for urgent matters.*\n**AEGIS — TheConclave Dominion**`, fallback:true };
    }
    if (e.status === 429) return { text:'⏱️ AEGIS is at capacity. Try again in 30 seconds.\n**AEGIS — TheConclave Dominion**', fallback:true };
    if (e.status === 529 || body.includes('overloaded')) return { text:'🔄 AEGIS neural core under load. Retry shortly.\n**AEGIS — TheConclave Dominion**', fallback:true };
    console.error('❌ AEGIS AI error:', e.status, body);
    return { text:`⚠️ AEGIS error (${e.status||'unknown'}). Staff notified.\n**AEGIS — TheConclave Dominion**`, fallback:true };
  }
}

// Deep AI call — sonnet, used for panel gen, ad gen, organizer
async function callAEGIS_Deep(prompt) {
  if (!ai) return null;
  try {
    const resp = await ai.messages.create({
      model: AI_MODEL_SONNET, max_tokens: 1000,
      system: AEGIS_SYSTEM,
      messages: [{ role:'user', content:prompt }],
    });
    return resp.content?.[0]?.text || null;
  } catch(e) {
    console.error('❌ Deep AI:', e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// WALLET ENGINE
// ═══════════════════════════════════════════════════════════════════
async function wGet(discord_id) {
  const { data } = await SB(s => s.from('aegis_wallets').select('*').eq('discord_id',discord_id).single());
  return data;
}
async function wAward(discord_id, amount, note, actor='SYSTEM') {
  const w = await wGet(discord_id) || { balance_wallet:0, lifetime_earned:0 };
  const nb = (w.balance_wallet||0) + amount;
  await SB(s => s.from('aegis_wallets').upsert({ discord_id, balance_wallet:nb, lifetime_earned:(w.lifetime_earned||0)+amount }, {onConflict:'discord_id'}));
  await SB(s => s.from('aegis_wallet_ledger').insert({ discord_id, actor_discord_id:actor, amount, transaction_type:'award', note:note||'Award', balance_wallet_after:nb }));
  return nb;
}
async function wDeduct(discord_id, amount, note, actor='SYSTEM') {
  const w = await wGet(discord_id);
  if (!w || w.balance_wallet < amount) return { error:'Insufficient balance', bal:w?.balance_wallet||0 };
  const nb = w.balance_wallet - amount;
  await SB(s => s.from('aegis_wallets').update({ balance_wallet:nb, lifetime_spent:(w.lifetime_spent||0)+amount }).eq('discord_id',discord_id));
  await SB(s => s.from('aegis_wallet_ledger').insert({ discord_id, actor_discord_id:actor, amount:-amount, transaction_type:'deduct', note:note||'Deduct', balance_wallet_after:nb }));
  return { newBal:nb };
}
const DAILY_AMT = 1, DAILY_CD = 20*60*60*1000;

// ═══════════════════════════════════════════════════════════════════
// LIVE MONITOR ENGINE
// ═══════════════════════════════════════════════════════════════════
const monState = new Map();
let monInterval = null;

async function fetchStatuses(servers) {
  const out = [];
  for (const s of servers) {
    try {
      if (bTok.access && bTok.groupId) {
        const d = await beaconGet(`/v4/groups/${bTok.groupId}/servers/`).catch(()=>null);
        if (d) {
          const m = (d.results||d||[]).find(r => r.host?.includes(s.ip) || r.name?.toLowerCase().includes(s.display.toLowerCase()));
          if (m) { out.push({...s, online:true, players:m.players||0}); continue; }
        }
      }
      out.push({...s, online:true, players:'?'});
    } catch { out.push({...s, online:false, players:0}); }
  }
  return out;
}

function buildMonEmbed(statuses) {
  const online  = statuses.filter(s=>s.online).length;
  const players = statuses.reduce((t,s)=>t+(Number(s.players)||0),0);
  const ts      = `<t:${Math.floor(Date.now()/1000)}:T>`;
  const embed   = new EmbedBuilder()
    .setTitle('📡 TheConclave Dominion — Live Server Status')
    .setDescription(`**${online}/10** servers online · **${players}** active players · Updated ${ts}`)
    .setColor(online>=8?0x35ed7e:online>=5?0xffb800:0xff4444)
    .setFooter({text:'AEGIS Sentinel · Auto-updates every 2 minutes'})
    .setTimestamp();
  statuses.forEach(s => {
    const pct = s.maxPlayers ? Math.round((Number(s.players)||0)/s.maxPlayers*10) : 0;
    const bar = '█'.repeat(pct)+'░'.repeat(10-pct);
    const tags = [s.isPvP?'⚔️ PvP':'🕊️ PvE', s.isPatreon?'⭐ Patreon':null].filter(Boolean).join(' · ');
    embed.addFields({
      name:   `${s.emoji} ${s.display}${s.online?'':' *(offline)*'}`,
      value:  s.online ? `\`${bar}\` **${s.players}/${s.maxPlayers}**\n${tags}\n\`${s.ip}:${s.port}\`` : `\`Offline\`\n\`${s.ip}:${s.port}\``,
      inline: true,
    });
  });
  return embed;
}

async function refreshMonitor(guild) {
  const state = monState.get(guild.id);
  if (!state) return;
  try {
    const statuses = await fetchStatuses(state.servers||SERVERS);
    const embed    = buildMonEmbed(statuses);
    const ch       = await guild.channels.fetch(state.statusCh).catch(()=>null);
    if (!ch) return;
    if (state.msgId) {
      const msg = await ch.messages.fetch(state.msgId).catch(()=>null);
      if (msg) { await msg.edit({embeds:[embed]}); return; }
    }
    const msg = await ch.send({embeds:[embed]});
    state.msgId = msg.id;
    monState.set(guild.id, state);
  } catch(e) { console.error('[monitor]', e.message); }
}

function startMonitor() {
  if (monInterval) return;
  monInterval = setInterval(async () => {
    for (const [gid, state] of monState) {
      const g = await bot.guilds.fetch(gid).catch(()=>null);
      if (g) await refreshMonitor(g);
    }
  }, 2*60*1000);
  console.log('📡 Monitor started (2 min)');
}

// ═══════════════════════════════════════════════════════════════════
// CHANNEL SCANNER — builds AEGIS knowledge base from Discord
// ═══════════════════════════════════════════════════════════════════
const knowledgeBase = { lastScan: 0, channels: {}, pinned: {} };

async function scanGuild(guild, depth = 20) {
  const channels = await guild.channels.fetch();
  const summary  = [];
  for (const [, ch] of channels) {
    if (!ch.isTextBased()) continue;
    try {
      const msgs = await ch.messages.fetch({ limit: depth });
      const content = msgs.map(m => `[${m.author.tag}]: ${m.content}`).join('\n');
      knowledgeBase.channels[ch.name] = { id: ch.id, excerpt: content.slice(0,500) };
      summary.push(`#${ch.name} (${msgs.size} msgs)`);
    } catch {}
  }
  knowledgeBase.lastScan = Date.now();
  return summary;
}

// ═══════════════════════════════════════════════════════════════════
// LAUNCH PANEL BUILDER — posts category-organized panels
// ═══════════════════════════════════════════════════════════════════
const PANEL_DEFS = {
  welcome: {
    title: '🌟 Welcome to TheConclave Dominion',
    color: 0x7B2FFF,
    desc: 'The premier ARK: Survival Ascended community. 5× Crossplay across all platforms.',
    fields: [
      { name: '📋 Rules', value: 'Check <#rules> before playing', inline: true },
      { name: '🎫 Support', value: 'Use `/ticket` for help', inline: true },
      { name: '◈ Economy', value: 'Earn ClaveShards via events', inline: true },
      { name: '📡 Servers', value: '10 maps — use `/servers`', inline: true },
      { name: '🌐 Website', value: '[theconclavedominion.com](https://theconclavedominion.com)', inline: true },
    ],
  },
  servers: {
    title: '📡 Server Directory — TheConclave Dominion',
    color: 0x00D4FF,
    desc: 'ARK: Survival Ascended · 5× Rates · All Platforms · Crossplay Enabled',
    fields: SERVERS.map(s => ({
      name: `${s.emoji} ${s.display}${s.isPvP?' ⚔️ PvP':' 🕊️ PvE'}${s.isPatreon?' ⭐':''}`,
      value: `\`${s.ip}:${s.port}\``,
      inline: true,
    })),
  },
  economy: {
    title: '◈ ClaveShard Economy',
    color: 0xFFB800,
    desc: 'Earn and spend ClaveShards — the official TheConclave currency.',
    fields: [
      { name: '◈ Earn', value: '`/daily` · Events · Votes · Patreon', inline: true },
      { name: '🛒 Spend', value: '`/order` — shop tiers 1-30', inline: true },
      { name: '💸 Transfer', value: '`/give @user amount`', inline: true },
      { name: '📊 Check', value: '`/wallet balance` or `/rank`', inline: true },
      { name: '🏆 Leaderboard', value: '`/wallet top` — top 10', inline: true },
    ],
  },
  shop: {
    title: '🛒 ClaveShard Shop — All Tiers',
    color: 0x35ED7E,
    desc: 'Each tier costs the listed shards. Use `/order` to purchase.',
    fields: TIERS.map(t => ({
      name: `${t.icon} Tier ${t.id} — ${t.cost} Shard${t.cost>1?'s':''}`,
      value: t.items.slice(0,3).map(i=>`• ${i}`).join('\n') + (t.items.length>3?`\n*+${t.items.length-3} more*`:''),
      inline: true,
    })),
  },
  promoter: {
    title: '🤝 Partnership & Promotions',
    color: 0xFF4CD2,
    desc: 'Official partners and promoters of TheConclave Dominion.',
    fields: [
      { name: '🖥️ Nitrado', value: '[Affiliate Link](https://www.nitrado-aff.com/59GPP8X/D42TT/)\n30% back to the community', inline: true },
      { name: '🔧 CurseForge', value: '[ARK Mods](https://www.curseforge.com/ark-survival-ascended)', inline: true },
      { name: '🦕 WildCard', value: '[playark.com](https://playark.com)', inline: true },
      { name: '💜 Sol Parade', value: 'Community promoter', inline: true },
      { name: '🐌 SuzyQs', value: 'Community promoter', inline: true },
      { name: '📣 Apply', value: 'Use `/ticket` to apply as a partner', inline: true },
    ],
  },
};

async function postPanel(channel, panelKey, customEmbed = null) {
  const def = PANEL_DEFS[panelKey];
  if (!def && !customEmbed) return null;
  const embed = customEmbed || new EmbedBuilder()
    .setTitle(def.title)
    .setColor(def.color)
    .setDescription(def.desc)
    .addFields(def.fields)
    .setFooter({ text: 'AEGIS — TheConclave Dominion' })
    .setTimestamp();
  return await channel.send({ embeds: [embed] });
}

// ═══════════════════════════════════════════════════════════════════
// AD GENERATOR — rich embed advertisements
// ═══════════════════════════════════════════════════════════════════
async function generateAd(topic, targetChannel, guild) {
  const prompt = `Generate a short Discord server advertisement for TheConclave Dominion about: "${topic}". 
Return ONLY JSON: {"title":"...","description":"...","fields":[{"name":"...","value":"..."}],"color":7864319}
Max 3 fields, punchy, community-focused, under 200 chars per field.`;
  const raw = await callAEGIS_Deep(prompt);
  if (!raw) return null;
  try {
    const clean = raw.replace(/```json?|```/g, '').trim();
    const def = JSON.parse(clean);
    const embed = new EmbedBuilder()
      .setTitle(def.title || `📣 TheConclave Dominion`)
      .setDescription(def.description)
      .setColor(def.color || 0x7B2FFF)
      .setFooter({ text: 'AEGIS — TheConclave Dominion · theconclavedominion.com' })
      .setTimestamp();
    if (def.fields) def.fields.forEach(f => embed.addFields({ name:f.name, value:f.value, inline:true }));
    const ch = targetChannel || await guild.channels.cache.find(c => c.name.includes('announcement'));
    if (ch) await ch.send({ embeds: [embed] });
    return embed;
  } catch(e) { console.error('[adgen]', e.message); return null; }
}

// ═══════════════════════════════════════════════════════════════════
// OUTSOURCE ENGINE — post to gaming partner channels
// ═══════════════════════════════════════════════════════════════════
const OUTSOURCE_TARGETS = {
  nitrado:    { invite: 'https://discord.gg/nitrado',    keywords: ['server performance','nitrado partner','server hosting','ark server'] },
  curseforge: { invite: 'https://discord.gg/curseforge', keywords: ['mod request','curseforge mod','ark mod','modpack'] },
  wildcard:   { invite: 'https://discord.gg/playark',    keywords: ['wildcard','studio wildcard','ark ascended','playark'] },
};

// Generates an outsource summary for external posting
async function generateOutsourcePost(topic) {
  const prompt = `Write a short community post (under 150 words) for TheConclave Dominion to share in an external gaming Discord about: "${topic}". 
Professional, community-focused, includes our website link. Plain text only, no markdown headers.`;
  return await callAEGIS_Deep(prompt);
}

// ═══════════════════════════════════════════════════════════════════
// DISCORD ORGANIZER — server audit + intelligent restructure
// ═══════════════════════════════════════════════════════════════════
async function auditGuild(guild) {
  const channels  = await guild.channels.fetch();
  const roles     = await guild.roles.fetch();
  const members   = await guild.members.fetch({ limit: 100 });

  const catMap = {};
  for (const [, ch] of channels) {
    const cat = ch.parent?.name || 'Uncategorized';
    if (!catMap[cat]) catMap[cat] = [];
    catMap[cat].push({ name: ch.name, type: ch.type, id: ch.id });
  }

  return {
    totalChannels: channels.size,
    totalRoles:    roles.size,
    totalMembers:  members.size,
    categories:    catMap,
    roleNames:     [...roles.values()].map(r => r.name),
  };
}

async function buildOrganizerEmbed(guild) {
  const audit = await auditGuild(guild);
  const embed = new EmbedBuilder()
    .setTitle('🗂️ AEGIS Server Audit — TheConclave Dominion')
    .setColor(0x7B2FFF)
    .setDescription(`**${audit.totalChannels}** channels · **${audit.totalRoles}** roles · **${audit.totalMembers}** members scanned`)
    .setFooter({ text: 'AEGIS Organizer · Use /panel to post corrective panels' })
    .setTimestamp();

  const cats = Object.entries(audit.categories).slice(0, 10);
  for (const [cat, chs] of cats) {
    embed.addFields({
      name: `📁 ${cat}`,
      value: chs.slice(0,5).map(c=>`• #${c.name}`).join('\n') + (chs.length>5?`\n*+${chs.length-5} more*`:''),
      inline: true,
    });
  }
  return embed;
}

// ═══════════════════════════════════════════════════════════════════
// GAME SERVERS LIST PANEL — unique live widget
// ═══════════════════════════════════════════════════════════════════
async function postServerListPanel(channel) {
  const statuses = await fetchStatuses(SERVERS);
  const online   = statuses.filter(s=>s.online).length;
  const embed = new EmbedBuilder()
    .setTitle('🎮 TheConclave Dominion — Game Servers')
    .setColor(0x00D4FF)
    .setDescription([
      `**${online}/10** servers live right now`,
      '',
      '**ARK: Survival Ascended** · 5× Rates · Crossplay',
      'Xbox · PlayStation · PC · Switch',
    ].join('\n'))
    .setFooter({ text: 'AEGIS Live · Updates every 2 min · theconclavedominion.com/ark' })
    .setTimestamp();

  for (const s of statuses) {
    const pct = s.maxPlayers ? Math.round((Number(s.players)||0)/s.maxPlayers*100) : 0;
    const bar = ['▓'.repeat(Math.floor(pct/10)), '░'.repeat(10-Math.floor(pct/10))].join('');
    embed.addFields({
      name: `${s.emoji} **${s.display}**${s.isPatreon?' ⭐':''} ${s.isPvP?'⚔️':'🕊️'}`,
      value: [
        s.online ? `🟢 \`${bar}\` ${s.players}/${s.maxPlayers}` : '🔴 Offline',
        `\`${s.ip}:${s.port}\``,
      ].join('\n'),
      inline: true,
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Join Island').setStyle(ButtonStyle.Link).setURL('https://theconclavedominion.com/ark'),
    new ButtonBuilder().setLabel('Join Minecraft').setStyle(ButtonStyle.Link).setURL('https://theconclavedominion.com/minecraft'),
    new ButtonBuilder().setLabel('Website').setStyle(ButtonStyle.Link).setURL('https://theconclavedominion.com'),
  );

  return await channel.send({ embeds: [embed], components: [row] });
}

// ═══════════════════════════════════════════════════════════════════
// EMBED HELPERS
// ═══════════════════════════════════════════════════════════════════
const C = { gold:0xFFB800, el:0x00D4FF, pl:0x7B2FFF, gr:0x35ED7E, pk:0xFF4CD2, rd:0xFF4444, cy:0x00E5CC };
const base = (title, color=C.pl, img) => {
  const e = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp()
    .setFooter({text:'AEGIS — TheConclave Dominion'});
  if (img) e.setThumbnail(img);
  return e;
};

// ═══════════════════════════════════════════════════════════════════
// COMMAND DEFINITIONS
// ═══════════════════════════════════════════════════════════════════
const cmds = [

  // ─── AEGIS AI ─────────────────────────────────────────────────────
  new SlashCommandBuilder().setName('aegis').setDescription('💬 Talk to AEGIS — TheConclave AI administrator')
    .addStringOption(o=>o.setName('message').setDescription('Your message').setRequired(true)),
  new SlashCommandBuilder().setName('aegis-clear').setDescription('🔄 Clear your AEGIS conversation context'),

  // ─── WALLET ───────────────────────────────────────────────────────
  new SlashCommandBuilder().setName('wallet').setDescription('◈ ClaveShard wallet commands')
    .addSubcommand(s=>s.setName('balance').setDescription('Check your shard balance'))
    .addSubcommand(s=>s.setName('history').setDescription('View last 10 transactions'))
    .addSubcommand(s=>s.setName('award').setDescription('[Mod] Award shards')
      .addUserOption(o=>o.setName('user').setDescription('Player').setRequired(true))
      .addIntegerOption(o=>o.setName('amount').setDescription('Amount').setRequired(true))
      .addStringOption(o=>o.setName('reason').setDescription('Reason')))
    .addSubcommand(s=>s.setName('deduct').setDescription('[Mod] Deduct shards')
      .addUserOption(o=>o.setName('user').setDescription('Player').setRequired(true))
      .addIntegerOption(o=>o.setName('amount').setDescription('Amount').setRequired(true))
      .addStringOption(o=>o.setName('reason').setDescription('Reason')))
    .addSubcommand(s=>s.setName('give').setDescription('Gift shards to another player')
      .addUserOption(o=>o.setName('user').setDescription('Recipient').setRequired(true))
      .addIntegerOption(o=>o.setName('amount').setDescription('Amount').setRequired(true)))
    .addSubcommand(s=>s.setName('top').setDescription('Top 10 shard holders'))
    .addSubcommand(s=>s.setName('daily').setDescription('Claim daily shard'))
    .addSubcommand(s=>s.setName('set').setDescription('[Admin] Set exact balance')
      .addUserOption(o=>o.setName('user').setDescription('Player').setRequired(true))
      .addIntegerOption(o=>o.setName('amount').setDescription('New balance').setRequired(true))),

  new SlashCommandBuilder().setName('daily').setDescription('◈ Claim your daily ClaveShard'),
  new SlashCommandBuilder().setName('give').setDescription('◈ Gift shards to another player')
    .addUserOption(o=>o.setName('user').setDescription('Recipient').setRequired(true))
    .addIntegerOption(o=>o.setName('amount').setDescription('Shards').setRequired(true)),
  new SlashCommandBuilder().setName('clvsd').setDescription('[Admin] ClaveShard admin panel')
    .addSubcommand(s=>s.setName('stats').setDescription('Economy statistics'))
    .addSubcommand(s=>s.setName('supply').setDescription('Total supply breakdown'))
    .addSubcommand(s=>s.setName('reset').setDescription('[Owner] Reset a wallet')
      .addUserOption(o=>o.setName('user').setDescription('Player').setRequired(true)))
    .addSubcommand(s=>s.setName('airdrop').setDescription('[Admin] Award shards to all members')
      .addIntegerOption(o=>o.setName('amount').setDescription('Amount each').setRequired(true))
      .addStringOption(o=>o.setName('reason').setDescription('Reason'))),
  new SlashCommandBuilder().setName('rank').setDescription('◈ View your shard rank and percentile'),

  // ─── SHOP ─────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName('shop-tiers').setDescription('📋 View all ClaveShard shop tiers'),
  new SlashCommandBuilder().setName('order').setDescription('🛒 Place a ClaveShard shop order')
    .addIntegerOption(o=>o.setName('tier').setDescription('Tier (1/2/3/5/6/8/10/12/15/20/30)').setRequired(true))
    .addStringOption(o=>o.setName('character').setDescription('In-game character name').setRequired(true))
    .addStringOption(o=>o.setName('map').setDescription('Preferred map').setRequired(true)
      .addChoices(
        {name:'The Island',value:'The Island'},{name:'Volcano',value:'Volcano'},
        {name:'Scorched Earth',value:'Scorched Earth'},{name:'Valguero',value:'Valguero'},
        {name:'Aberration (PvP)',value:'Aberration'},{name:'Astraeos',value:'Astraeos'},
        {name:'Lost Colony',value:'Lost Colony'},{name:'The Center',value:'The Center'},
        {name:'Extinction',value:'Extinction'},{name:'Amissa (Patreon)',value:'Amissa'},
      ))
    .addStringOption(o=>o.setName('items').setDescription('Specific items from the tier (comma separated)'))
    .addStringOption(o=>o.setName('details').setDescription('Additional order notes'))
    .addStringOption(o=>o.setName('tribe').setDescription('Tribe name')),
  new SlashCommandBuilder().setName('fulfill').setDescription('[Staff] Mark order fulfilled')
    .addStringOption(o=>o.setName('order_id').setDescription('Order ID or thread ID').setRequired(true))
    .addStringOption(o=>o.setName('notes').setDescription('Fulfillment notes')),
  new SlashCommandBuilder().setName('pickup').setDescription('◈ Generate a 4-digit Community Center pickup code'),
  new SlashCommandBuilder().setName('insurance').setDescription('◈ Dino insurance — 2 shards for 48hr revival token')
    .addStringOption(o=>o.setName('dino').setDescription('Dino name/type').setRequired(true))
    .addStringOption(o=>o.setName('map').setDescription('Map').setRequired(true)),

  // ─── SERVERS / MONITOR ────────────────────────────────────────────
  new SlashCommandBuilder().setName('servers').setDescription('📡 View all live ARK server statuses'),
  new SlashCommandBuilder().setName('map').setDescription('🗺️ Get connection info for a specific map')
    .addStringOption(o=>o.setName('name').setDescription('Map name').setRequired(true)
      .addChoices(...SERVERS.map(s=>({name:s.display,value:s.key})))),
  new SlashCommandBuilder().setName('ping').setDescription('⚡ Check AEGIS system status'),
  new SlashCommandBuilder().setName('info').setDescription('⬡ TheConclave server information'),
  new SlashCommandBuilder().setName('setup-monitoring').setDescription('[Admin] Start live server monitor in this channel')
    .addChannelOption(o=>o.setName('channel').setDescription('Status channel').setRequired(true))
    .addChannelOption(o=>o.setName('activity').setDescription('Activity log channel')),
  new SlashCommandBuilder().setName('monitor-add').setDescription('[Admin] Add server to monitoring list')
    .addStringOption(o=>o.setName('key').setDescription('Server key').setRequired(true)),
  new SlashCommandBuilder().setName('monitor-stop').setDescription('[Admin] Stop live monitor'),

  // ─── BEACON ───────────────────────────────────────────────────────
  new SlashCommandBuilder().setName('beacon-setup').setDescription('[Admin] View Beacon auth status + device flow instructions'),
  new SlashCommandBuilder().setName('tribes').setDescription('⚔️ List tribes via Beacon Sentinel')
    .addStringOption(o=>o.setName('server').setDescription('Filter by server name')),
  new SlashCommandBuilder().setName('player-lookup').setDescription('🔍 Look up a player via Beacon Sentinel')
    .addStringOption(o=>o.setName('name').setDescription('Player name').setRequired(true)),
  new SlashCommandBuilder().setName('sentinel-bans').setDescription('🚫 List Beacon Sentinel ban records'),

  // ─── ADMIN ────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName('panel').setDescription('[Admin] Post a branded panel embed')
    .addStringOption(o=>o.setName('type').setDescription('Panel type').setRequired(true)
      .addChoices(
        {name:'Welcome',value:'welcome'},{name:'Server Directory',value:'servers'},
        {name:'Economy / ClaveShard',value:'economy'},{name:'Shop Tiers',value:'shop'},
        {name:'Promoters / Partners',value:'promoter'},{name:'Game Servers List (Live)',value:'gameservers'},
      ))
    .addChannelOption(o=>o.setName('channel').setDescription('Target channel (default: current)')),
  new SlashCommandBuilder().setName('announce').setDescription('[Admin] Post a rich announcement')
    .addStringOption(o=>o.setName('title').setDescription('Announcement title').setRequired(true))
    .addStringOption(o=>o.setName('message').setDescription('Message body').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('Target channel'))
    .addStringOption(o=>o.setName('color').setDescription('Embed color (hex)')
      .addChoices({name:'Gold',value:'gold'},{name:'Purple',value:'purple'},{name:'Cyan',value:'cyan'},{name:'Red',value:'red'},{name:'Green',value:'green'})),
  new SlashCommandBuilder().setName('ad-generate').setDescription('[Admin] AI-generate a promo embed')
    .addStringOption(o=>o.setName('topic').setDescription('Topic for the ad').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('Post to this channel')),
  new SlashCommandBuilder().setName('outsource').setDescription('[Admin] Generate a post for a partner/external Discord')
    .addStringOption(o=>o.setName('platform').setDescription('Target').setRequired(true)
      .addChoices({name:'Nitrado Discord',value:'nitrado'},{name:'CurseForge Discord',value:'curseforge'},{name:'WildCard Discord',value:'wildcard'}))
    .addStringOption(o=>o.setName('topic').setDescription('What to post about').setRequired(true)),
  new SlashCommandBuilder().setName('scan-discord').setDescription('[Owner] Scan guild channels → AEGIS knowledge base')
    .addIntegerOption(o=>o.setName('depth').setDescription('Messages per channel (5-50)').setMinValue(5).setMaxValue(50)),
  new SlashCommandBuilder().setName('organize').setDescription('[Owner] Audit full server structure and generate report'),
  new SlashCommandBuilder().setName('ban').setDescription('[Admin] Ban a member')
    .addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true))
    .addIntegerOption(o=>o.setName('days').setDescription('Delete messages (days)')),
  new SlashCommandBuilder().setName('unban').setDescription('[Admin] Unban a user')
    .addStringOption(o=>o.setName('user_id').setDescription('Discord User ID').setRequired(true)),
  new SlashCommandBuilder().setName('timeout').setDescription('[Mod] Timeout a member')
    .addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true))
    .addIntegerOption(o=>o.setName('minutes').setDescription('Duration in minutes').setRequired(true))
    .addStringOption(o=>o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('warn').setDescription('[Mod] Issue a warning')
    .addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)),
  new SlashCommandBuilder().setName('warn-list').setDescription('[Mod] View warnings for a member')
    .addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder().setName('whois').setDescription('[Mod] View member info')
    .addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder().setName('role').setDescription('[Admin] Add or remove a role from a member')
    .addStringOption(o=>o.setName('action').setDescription('Add or Remove').setRequired(true)
      .addChoices({name:'Add',value:'add'},{name:'Remove',value:'remove'}))
    .addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true))
    .addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('[Mod] Kick a member')
    .addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption(o=>o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('lock').setDescription('[Mod] Lock a channel')
    .addChannelOption(o=>o.setName('channel').setDescription('Channel (default: current)')),
  new SlashCommandBuilder().setName('unlock').setDescription('[Mod] Unlock a channel')
    .addChannelOption(o=>o.setName('channel').setDescription('Channel (default: current)')),
  new SlashCommandBuilder().setName('purge').setDescription('[Mod] Bulk delete messages')
    .addIntegerOption(o=>o.setName('count').setDescription('Number to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('slowmode').setDescription('[Mod] Set channel slowmode')
    .addIntegerOption(o=>o.setName('seconds').setDescription('Seconds (0 = off)').setRequired(true)),

  // ─── COMMUNITY ────────────────────────────────────────────────────
  new SlashCommandBuilder().setName('ticket').setDescription('🎫 Open a private support ticket'),
  new SlashCommandBuilder().setName('poll').setDescription('[Mod] Create a poll')
    .addStringOption(o=>o.setName('question').setDescription('Poll question').setRequired(true))
    .addStringOption(o=>o.setName('options').setDescription('Options comma-separated (max 4)').setRequired(true)),
  new SlashCommandBuilder().setName('giveaway').setDescription('[Admin] Start a ClaveShard giveaway')
    .addIntegerOption(o=>o.setName('amount').setDescription('Shards to give').setRequired(true))
    .addIntegerOption(o=>o.setName('minutes').setDescription('Duration in minutes').setRequired(true))
    .addStringOption(o=>o.setName('prize').setDescription('Prize description')),
  new SlashCommandBuilder().setName('rules').setDescription('📋 View TheConclave community rules'),
  new SlashCommandBuilder().setName('report').setDescription('🚨 Report a player or issue')
    .addUserOption(o=>o.setName('user').setDescription('Player to report'))
    .addStringOption(o=>o.setName('reason').setDescription('Details').setRequired(true)),
  new SlashCommandBuilder().setName('patreon').setDescription('💜 Patreon info and exclusive perks'),
  new SlashCommandBuilder().setName('event').setDescription('[Admin] Post a community event')
    .addStringOption(o=>o.setName('name').setDescription('Event name').setRequired(true))
    .addStringOption(o=>o.setName('description').setDescription('Event details').setRequired(true))
    .addStringOption(o=>o.setName('time').setDescription('Date/time')),
  new SlashCommandBuilder().setName('shoutout').setDescription('[Mod] Shoutout a member or partner')
    .addUserOption(o=>o.setName('user').setDescription('Member'))
    .addStringOption(o=>o.setName('message').setDescription('Shoutout message').setRequired(true)),
  new SlashCommandBuilder().setName('nitrado').setDescription('🖥️ Nitrado affiliate link and partner info'),
  new SlashCommandBuilder().setName('curseforge').setDescription('🔧 CurseForge ARK mods directory'),
  new SlashCommandBuilder().setName('wildcard').setDescription('🦕 Studio WildCard official links'),
  new SlashCommandBuilder().setName('setup-shop-panel').setDescription('[Admin] Post complete shop panel in current channel'),
  new SlashCommandBuilder().setName('setup-channels').setDescription('[Owner] View channel setup instructions'),
  new SlashCommandBuilder().setName('setup-roles').setDescription('[Owner] View role setup instructions'),
  new SlashCommandBuilder().setName('setup-welcome').setDescription('[Admin] Post welcome panel in current channel'),

].map(c => c.toJSON());

// ═══════════════════════════════════════════════════════════════════
// COMMAND REGISTRATION
// ═══════════════════════════════════════════════════════════════════
async function registerCommands() {
  try {
    const rest = new REST({ version:'10' }).setToken(DISCORD_BOT_TOKEN);
    await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), { body: cmds });
    console.log(`✅ ${cmds.length} commands registered`);
  } catch(e) { console.error('❌ Command registration:', e.message); }
}

// ═══════════════════════════════════════════════════════════════════
// INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════════
bot.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName: cmd, member, guild, channel, user } = interaction;
  const uid = user.id;

  // ── /aegis ────────────────────────────────────────────────────
  if (cmd === 'aegis') {
    const wait = rateCheck(uid, 4000);
    if (wait) return interaction.reply({content:`⏱️ Slow down — wait ${wait}s.`,ephemeral:true});
    const msg = interaction.options.getString('message');
    await interaction.deferReply();
    const res = await callAEGIS(uid, msg);
    const text = res.text.length > 2000 ? res.text.slice(0,1990)+'…' : res.text;
    return interaction.editReply(text);
  }

  // ── /aegis-clear ──────────────────────────────────────────────
  if (cmd === 'aegis-clear') {
    aiCtx.delete(uid);
    return interaction.reply({content:'🔄 AEGIS context cleared.\n**AEGIS — TheConclave Dominion**',ephemeral:true});
  }

  // ── /wallet ───────────────────────────────────────────────────
  if (cmd === 'wallet') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'balance' || sub === 'daily') {
      await interaction.deferReply({ephemeral:true});
      const w = await wGet(uid);
      return interaction.editReply({ embeds:[base('◈ Your ClaveShard Balance',C.gold)
        .setDescription(`**${w?.balance_wallet||0} ◈** ClaveShards\nLifetime earned: ${w?.lifetime_earned||0}\nLifetime spent: ${w?.lifetime_spent||0}`)
      ]});
    }
    if (sub === 'history') {
      await interaction.deferReply({ephemeral:true});
      const { data } = await SB(s => s.from('aegis_wallet_ledger').select('*').eq('discord_id',uid).order('created_at',{ascending:false}).limit(10));
      const rows = (data||[]).map(r=>`${r.amount>0?'➕':'➖'} **${Math.abs(r.amount)} ◈** — ${r.note||r.transaction_type}`).join('\n') || 'No transactions yet.';
      return interaction.editReply({embeds:[base('◈ Transaction History',C.gold).setDescription(rows)]});
    }
    if (sub === 'give') {
      await interaction.deferReply({ephemeral:true});
      const target = interaction.options.getUser('user');
      const amt    = interaction.options.getInteger('amount');
      if (amt < 1) return interaction.editReply('❌ Amount must be at least 1.');
      const r = await wDeduct(uid, amt, `Gift to ${target.username}`, uid);
      if (r.error) return interaction.editReply(`❌ ${r.error}. Balance: ${r.bal} ◈`);
      await wAward(target.id, amt, `Gift from ${user.username}`, uid);
      return interaction.editReply(`✅ Sent **${amt} ◈** to ${target}. New balance: ${r.newBal} ◈`);
    }
    if (sub === 'award') {
      if (!isMod(member)) return interaction.reply({content:'❌ Mod only.',ephemeral:true});
      await interaction.deferReply({ephemeral:true});
      const target = interaction.options.getUser('user');
      const amt    = interaction.options.getInteger('amount');
      const reason = interaction.options.getString('reason') || 'Staff award';
      const nb = await wAward(target.id, amt, reason, uid);
      return interaction.editReply(`✅ Awarded **${amt} ◈** to ${target}. New balance: ${nb} ◈`);
    }
    if (sub === 'deduct') {
      if (!isMod(member)) return interaction.reply({content:'❌ Mod only.',ephemeral:true});
      await interaction.deferReply({ephemeral:true});
      const target = interaction.options.getUser('user');
      const amt    = interaction.options.getInteger('amount');
      const reason = interaction.options.getString('reason') || 'Staff deduct';
      const r = await wDeduct(target.id, amt, reason, uid);
      if (r.error) return interaction.editReply(`❌ ${r.error}`);
      return interaction.editReply(`✅ Deducted **${amt} ◈** from ${target}. New balance: ${r.newBal} ◈`);
    }
    if (sub === 'set') {
      if (!isAdmin(member)) return interaction.reply({content:'❌ Admin only.',ephemeral:true});
      const target = interaction.options.getUser('user');
      const amt    = interaction.options.getInteger('amount');
      await SB(s => s.from('aegis_wallets').upsert({discord_id:target.id,balance_wallet:amt},{onConflict:'discord_id'}));
      return interaction.reply({content:`✅ Set ${target}'s balance to **${amt} ◈**.`,ephemeral:true});
    }
    if (sub === 'top') {
      await interaction.deferReply();
      const { data } = await SB(s => s.from('aegis_wallets').select('discord_id,balance_wallet').order('balance_wallet',{ascending:false}).limit(10));
      const lines = (data||[]).map((w,i)=>`**${i+1}.** <@${w.discord_id}> — ${w.balance_wallet} ◈`).join('\n') || 'No data.';
      return interaction.editReply({embeds:[base('◈ ClaveShard Leaderboard',C.gold).setDescription(lines)]});
    }
  }

  // ── /daily alias ──────────────────────────────────────────────
  if (cmd === 'daily') {
    await interaction.deferReply({ephemeral:true});
    const key = `daily:${uid}`;
    const { data } = await SB(s => s.from('aegis_wallets').select('last_daily').eq('discord_id',uid).single());
    if (data?.last_daily && Date.now() - new Date(data.last_daily).getTime() < DAILY_CD) {
      const next = new Date(new Date(data.last_daily).getTime()+DAILY_CD);
      return interaction.editReply(`⏰ Daily already claimed. Next: <t:${Math.floor(next.getTime()/1000)}:R>`);
    }
    const nb = await wAward(uid, DAILY_AMT, 'Daily claim', 'SYSTEM');
    await SB(s => s.from('aegis_wallets').update({last_daily:new Date().toISOString()}).eq('discord_id',uid));
    return interaction.editReply(`✅ Daily claimed! +**${DAILY_AMT} ◈** — Balance: **${nb} ◈**\n**AEGIS — TheConclave Dominion**`);
  }

  // ── /give alias ───────────────────────────────────────────────
  if (cmd === 'give') {
    await interaction.deferReply({ephemeral:true});
    const target = interaction.options.getUser('user');
    const amt    = interaction.options.getInteger('amount');
    if (amt < 1) return interaction.editReply('❌ Min 1 shard.');
    const r = await wDeduct(uid, amt, `Gift to ${target.username}`, uid);
    if (r.error) return interaction.editReply(`❌ ${r.error}. Balance: ${r.bal} ◈`);
    await wAward(target.id, amt, `Gift from ${user.username}`, uid);
    return interaction.editReply(`✅ Sent **${amt} ◈** to ${target}.`);
  }

  // ── /rank ─────────────────────────────────────────────────────
  if (cmd === 'rank') {
    await interaction.deferReply({ephemeral:true});
    const w = await wGet(uid);
    const { count } = await SB(s => s.from('aegis_wallets').select('*',{count:'exact',head:true}).gt('balance_wallet',w?.balance_wallet||0));
    const rank = (count||0)+1;
    return interaction.editReply({embeds:[base('◈ Your Rank',C.gold)
      .setDescription(`Balance: **${w?.balance_wallet||0} ◈**\nRank: **#${rank}**`)]});
  }

  // ── /clvsd ────────────────────────────────────────────────────
  if (cmd === 'clvsd') {
    if (!isAdmin(member)) return interaction.reply({content:'❌ Admin only.',ephemeral:true});
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ephemeral:true});
    if (sub === 'stats') {
      const { data } = await SB(s => s.from('aegis_wallets').select('balance_wallet,lifetime_earned,lifetime_spent'));
      const total = (data||[]).reduce((a,w)=>a+(w.balance_wallet||0),0);
      const earned = (data||[]).reduce((a,w)=>a+(w.lifetime_earned||0),0);
      return interaction.editReply({embeds:[base('◈ Economy Stats',C.gold)
        .addFields(
          {name:'Wallets',value:`${data?.length||0}`,inline:true},
          {name:'In Circulation',value:`${total} ◈`,inline:true},
          {name:'Total Earned',value:`${earned} ◈`,inline:true},
        )]});
    }
    if (sub === 'airdrop') {
      const amt    = interaction.options.getInteger('amount');
      const reason = interaction.options.getString('reason') || 'Airdrop';
      const members = await guild.members.fetch();
      let count = 0;
      for (const [, m] of members) {
        if (!m.user.bot) { await wAward(m.id, amt, reason, uid); count++; }
      }
      return interaction.editReply(`✅ Airdropped **${amt} ◈** to ${count} members.`);
    }
    if (sub === 'reset') {
      if (!isOwner(member)) return interaction.editReply('❌ Owner only.');
      const target = interaction.options.getUser('user');
      await SB(s => s.from('aegis_wallets').upsert({discord_id:target.id,balance_wallet:0},{onConflict:'discord_id'}));
      return interaction.editReply(`✅ Reset ${target}'s wallet to 0.`);
    }
    return interaction.editReply('⚙️ Unknown subcommand.');
  }

  // ── /shop-tiers ───────────────────────────────────────────────
  if (cmd === 'shop-tiers') {
    const embed = base('🛒 ClaveShard Shop — All Tiers',C.gr)
      .setDescription('Each tier = cost in ClaveShards. Pick **1 item per shard** within your tier.');
    TIERS.forEach(t => {
      embed.addFields({
        name:`${t.icon} Tier ${t.id} — ${t.cost} Shard${t.cost>1?'s':''}`,
        value:t.items.map(i=>`• ${i}`).join('\n')+(t.caveat?`\n⚠️ ${t.caveat}`:''),
        inline:true,
      });
    });
    return interaction.reply({embeds:[embed]});
  }

  // ── /order ────────────────────────────────────────────────────
  if (cmd === 'order') {
    await interaction.deferReply({ephemeral:true});
    const tierId  = interaction.options.getInteger('tier');
    const tier    = TIERS.find(t=>t.id===tierId);
    if (!tier) return interaction.editReply(`❌ Invalid tier. Valid: ${TIERS.map(t=>t.id).join(', ')}`);

    const character = interaction.options.getString('character');
    const map       = interaction.options.getString('map');
    const items     = interaction.options.getString('items') || 'Staff choice';
    const details   = interaction.options.getString('details') || '';
    const tribe     = interaction.options.getString('tribe') || '';

    const w = await wGet(uid);
    if (!w || w.balance_wallet < tier.cost)
      return interaction.editReply(`❌ Insufficient shards. You have **${w?.balance_wallet||0} ◈**, need **${tier.cost} ◈**.\nEarn more with \`/daily\` and community events.`);

    const r = await wDeduct(uid, tier.cost, `Shop order Tier ${tierId}`, uid);
    if (r.error) return interaction.editReply(`❌ ${r.error}`);

    const { data: order } = await SB(s => s.from('shop_orders').insert({
      tier: tierId, tier_cost: tier.cost,
      character_name: character, tribe_name: tribe || null,
      map, discord_username: user.username, discord_id: uid,
      selected_items: items.split(',').map(i=>i.trim()),
      order_details: details, status: 'pending',
    }).select().single());

    const orderId = order?.id || Date.now();
    const embed = base(`🛒 New Order — Tier ${tierId}`, tier.color)
      .addFields(
        {name:'Player',    value:`<@${uid}> (${user.username})`,inline:true},
        {name:'Character', value:character,inline:true},
        {name:'Map',       value:map,inline:true},
        {name:'Items',     value:items,inline:false},
        {name:'Cost',      value:`${tier.cost} ◈ deducted`,inline:true},
        {name:'Balance',   value:`${r.newBal} ◈ remaining`,inline:true},
        {name:'Order ID',  value:`${orderId}`.slice(0,20),inline:false},
      );
    if (details) embed.addFields({name:'Notes',value:details,inline:false});
    if (tribe)   embed.addFields({name:'Tribe',value:tribe,inline:true});

    const orderCh = ORDERS_CHANNEL_ID ? await guild.channels.fetch(ORDERS_CHANNEL_ID).catch(()=>null) : null;
    if (orderCh) {
      const msg = await orderCh.send({embeds:[embed]});
      await msg.startThread({name:`Order #${String(orderId).slice(0,8)} — ${character}`,autoArchiveDuration:1440}).catch(()=>null);
    }
    if (SHOP_WEBHOOK_URL) {
      axios.post(SHOP_WEBHOOK_URL,{embeds:[embed.toJSON()]}).catch(()=>null);
    }
    return interaction.editReply({embeds:[base('✅ Order Placed',tier.color)
      .setDescription(`Order **#${String(orderId).slice(0,8)}** submitted!\n${tier.cost} ◈ deducted. Remaining: **${r.newBal} ◈**\nStaff will fulfill your order in-game. Use \`/pickup\` when ready.`)]});
  }

  // ── /fulfill ──────────────────────────────────────────────────
  if (cmd === 'fulfill') {
    if (!isMod(member)) return interaction.reply({content:'❌ Staff only.',ephemeral:true});
    const orderId = interaction.options.getString('order_id');
    const notes   = interaction.options.getString('notes') || '';
    await interaction.deferReply({ephemeral:true});
    await SB(s => s.from('shop_orders').update({status:'completed',fulfilled_by:user.username,fulfilled_at:new Date().toISOString(),staff_notes:notes}).eq('id',orderId));
    return interaction.editReply(`✅ Order **${orderId}** marked as fulfilled.`);
  }

  // ── /pickup ───────────────────────────────────────────────────
  if (cmd === 'pickup') {
    const code = String(Math.floor(1000+Math.random()*9000));
    return interaction.reply({embeds:[base('◈ Community Center Pickup',C.cy)
      .setDescription(`Your pickup code: **\`${code}\`**\nHead to the Community Center with this code. Staff will match it when delivering your order.`)
    ],ephemeral:true});
  }

  // ── /insurance ────────────────────────────────────────────────
  if (cmd === 'insurance') {
    await interaction.deferReply({ephemeral:true});
    const dino = interaction.options.getString('dino');
    const map  = interaction.options.getString('map');
    const w = await wGet(uid);
    if (!w || w.balance_wallet < 2) return interaction.editReply(`❌ Need 2 ◈. Balance: ${w?.balance_wallet||0} ◈`);
    await wDeduct(uid, 2, `Insurance: ${dino} on ${map}`, uid);
    return interaction.editReply({embeds:[base('🛡️ Dino Insurance',C.cy)
      .setDescription(`**${dino}** insured on **${map}** for 48 hours.\n2 ◈ deducted. If it dies, submit a \`/ticket\` for revival.`)]});
  }

  // ── /servers ──────────────────────────────────────────────────
  if (cmd === 'servers') {
    await interaction.deferReply();
    const statuses = await fetchStatuses(SERVERS);
    return interaction.editReply({embeds:[buildMonEmbed(statuses)]});
  }

  // ── /map ──────────────────────────────────────────────────────
  if (cmd === 'map') {
    const key = interaction.options.getString('name');
    const s   = SERVERS.find(x=>x.key===key);
    if (!s) return interaction.reply({content:'❌ Map not found.',ephemeral:true});
    return interaction.reply({embeds:[base(`${s.emoji} ${s.display}`,C.el)
      .addFields(
        {name:'IP', value:`\`${s.ip}:${s.port}\``,inline:true},
        {name:'Type',value:s.isPvP?'⚔️ PvP':'🕊️ PvE',inline:true},
        {name:'Patreon',value:s.isPatreon?'⭐ Yes':'No',inline:true},
        {name:'Max Players',value:`${s.maxPlayers}`,inline:true},
      )]});
  }

  // ── /setup-monitoring ─────────────────────────────────────────
  if (cmd === 'setup-monitoring') {
    if (!isAdmin(member)) return interaction.reply({content:'❌ Admin only.',ephemeral:true});
    const statusCh = interaction.options.getChannel('channel').id;
    const actCh    = interaction.options.getChannel('activity')?.id || null;
    monState.set(guild.id, {statusCh, actCh, msgId:null, servers:[...SERVERS]});
    await refreshMonitor(guild);
    startMonitor();
    return interaction.reply({content:'📡 Live monitor started!',ephemeral:true});
  }

  if (cmd === 'monitor-stop') {
    if (!isAdmin(member)) return interaction.reply({content:'❌ Admin only.',ephemeral:true});
    monState.delete(guild.id);
    if (!monState.size) { clearInterval(monInterval); monInterval=null; }
    return interaction.reply({content:'⏹️ Monitor stopped.',ephemeral:true});
  }

  if (cmd === 'monitor-add') {
    if (!isAdmin(member)) return interaction.reply({content:'❌ Admin only.',ephemeral:true});
    const key = interaction.options.getString('key');
    const s   = SERVERS.find(x=>x.key===key);
    if (!s) return interaction.reply({content:`❌ Unknown server key. Valid: ${SERVERS.map(x=>x.key).join(', ')}`,ephemeral:true});
    const state = monState.get(guild.id);
    if (state) { state.servers.push(s); monState.set(guild.id, state); }
    return interaction.reply({content:`✅ ${s.display} added to monitor.`,ephemeral:true});
  }

  // ── /beacon-setup ─────────────────────────────────────────────
  if (cmd === 'beacon-setup') {
    if (!isAdmin(member)) return interaction.reply({content:'❌ Admin only.',ephemeral:true});
    const status = bTok.access ? '✅ Authenticated' : '⚠️ Not authenticated';
    const exp    = bTok.expiresAt ? `<t:${bTok.expiresAt}:R>` : 'N/A';
    return interaction.reply({embeds:[base('🛰️ Beacon Auth Status',C.el)
      .addFields(
        {name:'Status',   value:status,inline:true},
        {name:'Group ID', value:bTok.groupId||'Not set',inline:true},
        {name:'Expires',  value:exp,inline:true},
        {name:'Auth',     value:'Visit [theconclavedominion.com/admin](https://theconclavedominion.com/admin) to authenticate Beacon.',inline:false},
      )
    ],ephemeral:true});
  }

  // ── /tribes ───────────────────────────────────────────────────
  if (cmd === 'tribes') {
    await interaction.deferReply();
    const filter  = interaction.options.getString('server');
    const tribes  = await sentinelTribes(filter);
    if (!tribes.length) return interaction.editReply('⚠️ No tribe data. Beacon may not be authenticated.');
    const lines = tribes.slice(0,15).map(t=>`**${t.tribeName||t.name}** — ${t.serviceName||'Unknown'} · ${t.memberCount||'?'} members`).join('\n');
    return interaction.editReply({embeds:[base('⚔️ Active Tribes',C.rd).setDescription(lines||'No tribes found.')]});
  }

  // ── /player-lookup ────────────────────────────────────────────
  if (cmd === 'player-lookup') {
    await interaction.deferReply();
    const name   = interaction.options.getString('name');
    const player = await sentinelPlayer(name);
    if (!player) return interaction.editReply(`❌ No Beacon data found for **${name}**.`);
    return interaction.editReply({embeds:[base(`🔍 ${player.playerName||name}`,C.cy)
      .addFields(
        {name:'Tribe',  value:player.tribeName||'N/A',inline:true},
        {name:'Server', value:player.serviceName||'N/A',inline:true},
        {name:'Status', value:player.onlineStatus||'Unknown',inline:true},
      )]});
  }

  // ── /sentinel-bans ────────────────────────────────────────────
  if (cmd === 'sentinel-bans') {
    if (!isMod(member)) return interaction.reply({content:'❌ Mod only.',ephemeral:true});
    await interaction.deferReply({ephemeral:true});
    const bans = await sentinelBans();
    if (!bans.length) return interaction.editReply('✅ No active bans in Beacon Sentinel.');
    const lines = bans.slice(0,10).map(b=>`**${b.playerName}** — ${b.reason||'No reason'} · <t:${Math.floor(new Date(b.expiresAt||b.bannedAt).getTime()/1000)}:R>`).join('\n');
    return interaction.editReply({embeds:[base('🚫 Sentinel Bans',C.rd).setDescription(lines)]});
  }

  // ── /panel ────────────────────────────────────────────────────
  if (cmd === 'panel') {
    if (!isAdmin(member)) return interaction.reply({content:'❌ Admin only.',ephemeral:true});
    const type    = interaction.options.getString('type');
    const target  = interaction.options.getChannel('channel') || channel;
    await interaction.deferReply({ephemeral:true});
    const ch = await guild.channels.fetch(target.id).catch(()=>null) || channel;
    if (type === 'gameservers') {
      await postServerListPanel(ch);
    } else {
      await postPanel(ch, type);
    }
    return interaction.editReply(`✅ **${type}** panel posted in <#${ch.id}>.`);
  }

  // ── /announce ─────────────────────────────────────────────────
  if (cmd === 'announce') {
    if (!isAdmin(member)) return interaction.reply({content:'❌ Admin only.',ephemeral:true});
    const title   = interaction.options.getString('title');
    const message = interaction.options.getString('message');
    const target  = interaction.options.getChannel('channel') || channel;
    const colorKey = interaction.options.getString('color') || 'purple';
    const colorMap = { gold:C.gold, purple:C.pl, cyan:C.el, red:C.rd, green:C.gr };
    await interaction.deferReply({ephemeral:true});
    const ch = await guild.channels.fetch(target.id).catch(()=>null) || channel;
    await ch.send({embeds:[base(title, colorMap[colorKey]||C.pl).setDescription(message)]});
    return interaction.editReply(`✅ Announcement posted in <#${ch.id}>.`);
  }

  // ── /ad-generate ──────────────────────────────────────────────
  if (cmd === 'ad-generate') {
    if (!isAdmin(member)) return interaction.reply({content:'❌ Admin only.',ephemeral:true});
    const topic  = interaction.options.getString('topic');
    const target = interaction.options.getChannel('channel');
    await interaction.deferReply({ephemeral:true});
    const ch = target ? await guild.channels.fetch(target.id).catch(()=>null) : null;
    const embed = await generateAd(topic, ch, guild);
    if (!embed) return interaction.editReply('❌ Ad generation failed. Check ANTHROPIC_API_KEY.');
    return interaction.editReply(`✅ Ad generated${ch?` and posted in <#${ch.id}>`:''}.`);
  }

  // ── /outsource ────────────────────────────────────────────────
  if (cmd === 'outsource') {
    if (!isAdmin(member)) return interaction.reply({content:'❌ Admin only.',ephemeral:true});
    const platform = interaction.options.getString('platform');
    const topic    = interaction.options.getString('topic');
    await interaction.deferReply({ephemeral:true});
    const target = OUTSOURCE_TARGETS[platform];
    const post   = await generateOutsourcePost(topic);
    if (!post) return interaction.editReply('❌ Generation failed.');
    const embed = new EmbedBuilder()
      .setTitle(`📤 Outsource Post — ${platform.charAt(0).toUpperCase()+platform.slice(1)}`)
      .setColor(C.cy)
      .setDescription(`**Ready to post in ${platform} Discord:**\n\n${post}`)
      .addFields({name:'Post To',value:target.invite,inline:true},{name:'Keywords',value:target.keywords.join(', '),inline:false})
      .setFooter({text:'Copy the text above and post it in the target server'});
    return interaction.editReply({embeds:[embed]});
  }

  // ── /scan-discord ─────────────────────────────────────────────
  if (cmd === 'scan-discord') {
    if (!isOwner(member)) return interaction.reply({content:'❌ Owner only.',ephemeral:true});
    const depth = interaction.options.getInteger('depth') || 20;
    await interaction.deferReply({ephemeral:true});
    const summary = await scanGuild(guild, depth);
    return interaction.editReply({embeds:[base('🔍 Guild Scan Complete',C.gr)
      .setDescription(`Scanned **${summary.length}** channels.\n${summary.slice(0,20).join('\n')}`)]});
  }

  // ── /organize ─────────────────────────────────────────────────
  if (cmd === 'organize') {
    if (!isOwner(member)) return interaction.reply({content:'❌ Owner only.',ephemeral:true});
    await interaction.deferReply({ephemeral:true});
    const embed = await buildOrganizerEmbed(guild);
    await channel.send({embeds:[embed]});
    return interaction.editReply('✅ Server audit posted.');
  }

  // ── /ban ──────────────────────────────────────────────────────
  if (cmd === 'ban') {
    if (!isAdmin(member)) return interaction.reply({content:'❌ Admin only.',ephemeral:true});
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const days   = interaction.options.getInteger('days') || 0;
    await interaction.deferReply({ephemeral:true});
    await guild.members.ban(target.id,{reason,deleteMessageDays:days}).catch(()=>null);
    await SB(s => s.from('warnings').insert({discord_id:target.id,issued_by:uid,reason:`BAN: ${reason}`,severity:'ban'}));
    return interaction.editReply(`✅ Banned ${target.username}.`);
  }

  // ── /unban ────────────────────────────────────────────────────
  if (cmd === 'unban') {
    if (!isAdmin(member)) return interaction.reply({content:'❌ Admin only.',ephemeral:true});
    const userId = interaction.options.getString('user_id');
    await interaction.deferReply({ephemeral:true});
    await guild.members.unban(userId).catch(()=>null);
    return interaction.editReply(`✅ Unbanned user ${userId}.`);
  }

  // ── /timeout ──────────────────────────────────────────────────
  if (cmd === 'timeout') {
    if (!isMod(member)) return interaction.reply({content:'❌ Mod only.',ephemeral:true});
    const target  = await guild.members.fetch(interaction.options.getUser('user').id).catch(()=>null);
    const minutes = interaction.options.getInteger('minutes');
    const reason  = interaction.options.getString('reason') || 'Staff timeout';
    if (!target) return interaction.reply({content:'❌ Member not found.',ephemeral:true});
    await target.timeout(minutes * 60 * 1000, reason);
    return interaction.reply({content:`✅ Timed out ${target.user.username} for ${minutes} min.`,ephemeral:true});
  }

  // ── /warn ─────────────────────────────────────────────────────
  if (cmd === 'warn') {
    if (!isMod(member)) return interaction.reply({content:'❌ Mod only.',ephemeral:true});
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    await SB(s => s.from('warnings').insert({discord_id:target.id,issued_by:uid,reason,severity:'warning'}));
    await target.send(`⚠️ You have received a warning in **TheConclave Dominion**.\n**Reason:** ${reason}`).catch(()=>null);
    return interaction.reply({content:`✅ Warning issued to ${target.username}.`,ephemeral:true});
  }

  // ── /warn-list ────────────────────────────────────────────────
  if (cmd === 'warn-list') {
    if (!isMod(member)) return interaction.reply({content:'❌ Mod only.',ephemeral:true});
    const target = interaction.options.getUser('user');
    const { data } = await SB(s => s.from('warnings').select('*').eq('discord_id',target.id).order('created_at',{ascending:false}));
    const lines = (data||[]).map(w=>`**${w.severity}** — ${w.reason} (<t:${Math.floor(new Date(w.created_at).getTime()/1000)}:R>)`).join('\n') || 'No warnings.';
    return interaction.reply({embeds:[base(`⚠️ Warnings — ${target.username}`,C.rd).setDescription(lines)],ephemeral:true});
  }

  // ── /whois ────────────────────────────────────────────────────
  if (cmd === 'whois') {
    if (!isMod(member)) return interaction.reply({content:'❌ Mod only.',ephemeral:true});
    const target = await guild.members.fetch(interaction.options.getUser('user').id).catch(()=>null);
    if (!target) return interaction.reply({content:'❌ Member not found.',ephemeral:true});
    const w = await wGet(target.id);
    return interaction.reply({embeds:[base(`🔍 ${target.user.username}`,C.pl)
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        {name:'Joined',   value:`<t:${Math.floor(target.joinedTimestamp/1000)}:R>`,inline:true},
        {name:'Shards',   value:`${w?.balance_wallet||0} ◈`,inline:true},
        {name:'Roles',    value:target.roles.cache.filter(r=>r.id!==guild.id).map(r=>r.name).slice(0,5).join(', ')||'None',inline:false},
      )
    ],ephemeral:true});
  }

  // ── /role ─────────────────────────────────────────────────────
  if (cmd === 'role') {
    if (!isAdmin(member)) return interaction.reply({content:'❌ Admin only.',ephemeral:true});
    const action = interaction.options.getString('action');
    const target = await guild.members.fetch(interaction.options.getUser('user').id).catch(()=>null);
    const role   = interaction.options.getRole('role');
    if (!target) return interaction.reply({content:'❌ Member not found.',ephemeral:true});
    if (action === 'add')    await target.roles.add(role);
    else if (action==='remove') await target.roles.remove(role);
    return interaction.reply({content:`✅ ${action === 'add'?'Added':'Removed'} **${role.name}** ${action==='add'?'to':'from'} ${target.user.username}.`,ephemeral:true});
  }

  // ── /kick ─────────────────────────────────────────────────────
  if (cmd === 'kick') {
    if (!isMod(member)) return interaction.reply({content:'❌ Mod only.',ephemeral:true});
    const target = await guild.members.fetch(interaction.options.getUser('user').id).catch(()=>null);
    if (!target) return interaction.reply({content:'❌ Member not found.',ephemeral:true});
    const reason = interaction.options.getString('reason') || 'Staff kick';
    await target.kick(reason);
    return interaction.reply({content:`✅ Kicked ${target.user.username}.`,ephemeral:true});
  }

  // ── /lock / /unlock ───────────────────────────────────────────
  if (cmd === 'lock' || cmd === 'unlock') {
    if (!isMod(member)) return interaction.reply({content:'❌ Mod only.',ephemeral:true});
    const ch = interaction.options.getChannel('channel') || channel;
    const allow = cmd === 'unlock';
    await ch.permissionOverwrites.edit(guild.roles.everyone,{SendMessages:allow||null}).catch(()=>null);
    return interaction.reply({content:`✅ ${cmd==='lock'?'🔒 Locked':'🔓 Unlocked'} <#${ch.id}>.`,ephemeral:true});
  }

  // ── /purge ────────────────────────────────────────────────────
  if (cmd === 'purge') {
    if (!isMod(member)) return interaction.reply({content:'❌ Mod only.',ephemeral:true});
    const count = interaction.options.getInteger('count');
    await interaction.deferReply({ephemeral:true});
    const deleted = await channel.bulkDelete(count,true).catch(()=>null);
    return interaction.editReply(`✅ Deleted ${deleted?.size||count} messages.`);
  }

  // ── /slowmode ─────────────────────────────────────────────────
  if (cmd === 'slowmode') {
    if (!isMod(member)) return interaction.reply({content:'❌ Mod only.',ephemeral:true});
    const secs = interaction.options.getInteger('seconds');
    await channel.setRateLimitPerUser(secs);
    return interaction.reply({content:secs===0?'✅ Slowmode disabled.':` ✅ Slowmode set to ${secs}s.`,ephemeral:true});
  }

  // ── /ticket ───────────────────────────────────────────────────
  if (cmd === 'ticket') {
    await interaction.deferReply({ephemeral:true});
    const existing = guild.channels.cache.find(c=>c.name===`ticket-${user.username.toLowerCase().replace(/\s+/g,'-')}`);
    if (existing) return interaction.editReply(`❌ You already have an open ticket: <#${existing.id}>`);
    const ticketCh = await guild.channels.create({
      name: `ticket-${user.username.toLowerCase().replace(/\s+/g,'-').slice(0,20)}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {id:guild.roles.everyone,deny:[PermissionFlagsBits.ViewChannel]},
        {id:uid,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]},
        ...(ROLE_ADMIN_ID?[{id:ROLE_ADMIN_ID,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]}]:[]),
      ],
    });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
    );
    await ticketCh.send({content:`<@${uid}>`,embeds:[base('🎫 Support Ticket',C.pl)
      .setDescription('Staff will be with you shortly. Describe your issue clearly.')
      .addFields({name:'Tips',value:'• Include screenshots if relevant\n• Provide your in-game character name\n• Be as specific as possible'})
    ],components:[row]});
    return interaction.editReply(`✅ Ticket created: <#${ticketCh.id}>`);
  }

  // ── /poll ─────────────────────────────────────────────────────
  if (cmd === 'poll') {
    if (!isMod(member)) return interaction.reply({content:'❌ Mod only.',ephemeral:true});
    const question = interaction.options.getString('question');
    const opts     = interaction.options.getString('options').split(',').map(o=>o.trim()).slice(0,4);
    const emojis   = ['🇦','🇧','🇨','🇩'];
    const embed    = base(`📊 ${question}`,C.pk)
      .setDescription(opts.map((o,i)=>`${emojis[i]} ${o}`).join('\n'));
    const msg = await channel.send({embeds:[embed]});
    for (let i=0;i<opts.length;i++) await msg.react(emojis[i]);
    return interaction.reply({content:'✅ Poll posted.',ephemeral:true});
  }

  // ── /giveaway ─────────────────────────────────────────────────
  if (cmd === 'giveaway') {
    if (!isAdmin(member)) return interaction.reply({content:'❌ Admin only.',ephemeral:true});
    const amount  = interaction.options.getInteger('amount');
    const minutes = interaction.options.getInteger('minutes');
    const prize   = interaction.options.getString('prize') || `${amount} ◈ ClaveShard`;
    const ends    = Math.floor(Date.now()/1000)+minutes*60;
    const embed   = base('🎉 GIVEAWAY!',C.gold)
      .setDescription(`**Prize:** ${prize}\n**Ends:** <t:${ends}:R>\nReact with 🎉 to enter!`);
    const msg = await channel.send({embeds:[embed]});
    await msg.react('🎉');
    await interaction.reply({content:'✅ Giveaway started!',ephemeral:true});
    setTimeout(async () => {
      const fresh = await channel.messages.fetch(msg.id).catch(()=>null);
      if (!fresh) return;
      const reactors = await fresh.reactions.cache.get('🎉')?.users.fetch().catch(()=>null);
      const entries  = reactors ? [...reactors.values()].filter(u=>!u.bot) : [];
      if (!entries.length) { await channel.send('🎉 No entries — giveaway cancelled.'); return; }
      const winner = entries[Math.floor(Math.random()*entries.length)];
      await channel.send({embeds:[base('🎉 Giveaway Ended!',C.gold).setDescription(`🏆 **${winner}** won **${prize}**!`)]});
      await wAward(winner.id, amount, `Giveaway win: ${prize}`, uid);
    }, minutes * 60 * 1000);
  }

  // ── /rules ────────────────────────────────────────────────────
  if (cmd === 'rules') {
    return interaction.reply({embeds:[base('📋 TheConclave Rules',C.pl)
      .addFields(
        {name:'1. Respect',   value:'Treat everyone with respect. Harassment not tolerated.',inline:false},
        {name:'2. No Toxicity',value:'No trash talk, hate speech, or discriminatory language.',inline:false},
        {name:'3. No Cheating',value:'Exploits, hacking, duping = permanent ban.',inline:false},
        {name:'4. PvP Rules', value:'Aberration only. No griefing PvE maps.',inline:false},
        {name:'5. Discord',   value:'English only in main channels. Keep topics relevant.',inline:false},
        {name:'6. Disputes',  value:'Use `/ticket` for issues. No public drama.',inline:false},
      )]});
  }

  // ── /report ───────────────────────────────────────────────────
  if (cmd === 'report') {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    await SB(s => s.from('reports').insert({reported_by:uid,reported_user:target?.id||null,reason}).catch(()=>null));
    return interaction.reply({content:'✅ Report submitted to staff.',ephemeral:true});
  }

  // ── /patreon ──────────────────────────────────────────────────
  if (cmd === 'patreon') {
    return interaction.reply({embeds:[base('💜 TheConclave Patreon',0xff424d)
      .setDescription('Support the servers and unlock exclusive perks')
      .addFields(
        {name:'🌐 Patreon',       value:'[patreon.com/theconclavedominion](https://patreon.com/theconclavedominion)',inline:false},
        {name:'⭐ Amissa Access', value:'Patreon-exclusive map',inline:true},
        {name:'◈ Bonus Shards',  value:'Monthly shard bonus',inline:true},
        {name:'💵 CashApp',       value:'$TheConclaveDominion',inline:true},
        {name:'💵 Chime',         value:'$ANLIKESEF',inline:true},
      )]});
  }

  // ── /event ────────────────────────────────────────────────────
  if (cmd === 'event') {
    if (!isAdmin(member)) return interaction.reply({content:'❌ Admin only.',ephemeral:true});
    const name  = interaction.options.getString('name');
    const desc  = interaction.options.getString('description');
    const time  = interaction.options.getString('time');
    const embed = base(`📅 Community Event — ${name}`,C.pk)
      .setDescription(desc)
      .addFields({name:'⏰ Time',value:time||'TBD',inline:true});
    await channel.send({embeds:[embed]});
    return interaction.reply({content:'✅ Event posted.',ephemeral:true});
  }

  // ── /shoutout ─────────────────────────────────────────────────
  if (cmd === 'shoutout') {
    if (!isMod(member)) return interaction.reply({content:'❌ Mod only.',ephemeral:true});
    const target  = interaction.options.getUser('user');
    const message = interaction.options.getString('message');
    await channel.send({embeds:[base('📣 Shoutout!',C.pk)
      .setDescription(`${target?`<@${target.id}> — `:''}${message}`)
    ]});
    return interaction.reply({content:'✅ Shoutout posted.',ephemeral:true});
  }

  // ── /nitrado ──────────────────────────────────────────────────
  if (cmd === 'nitrado') {
    return interaction.reply({embeds:[base('🖥️ Nitrado — Official Partner',C.el)
      .setDescription('TheConclave Dominion runs on Nitrado servers. Rent your own!')
      .addFields(
        {name:'🔗 Affiliate Link',value:'[nitrado-aff.com/59GPP8X/D42TT/](https://www.nitrado-aff.com/59GPP8X/D42TT/)',inline:false},
        {name:'💰 Commission',    value:'TheConclave earns 30% — keeps our servers alive.',inline:false},
      )]});
  }

  // ── /curseforge ───────────────────────────────────────────────
  if (cmd === 'curseforge') {
    return interaction.reply({embeds:[base('🔧 CurseForge ARK Mods',C.cy)
      .setDescription('Browse and request mods for ARK: Survival Ascended')
      .addFields(
        {name:'🌐 CurseForge',    value:'[curseforge.com/ark-survival-ascended](https://www.curseforge.com/ark-survival-ascended)',inline:false},
        {name:'📌 Active Mods',   value:'Death Inventory Keeper · ARKomatic · Awesome Spyglass & Teleporter',inline:false},
        {name:'🗳️ Mod Requests',  value:'Post in #mod-requests with the CurseForge link',inline:false},
      )]});
  }

  // ── /wildcard ─────────────────────────────────────────────────
  if (cmd === 'wildcard') {
    return interaction.reply({embeds:[base('🦕 Studio WildCard',0x00c8ff)
      .setDescription('Official WildCard/ARK links and community resources')
      .addFields(
        {name:'🌐 ARK Website',   value:'[playark.com](https://playark.com)',inline:true},
        {name:'📱 Twitter/X',     value:'[@survivetheark](https://twitter.com/survivetheark)',inline:true},
        {name:'💬 Discord',       value:'[Official ARK Discord](https://discord.gg/playark)',inline:true},
      )]});
  }

  // ── /ping ─────────────────────────────────────────────────────
  if (cmd === 'ping') {
    return interaction.reply({embeds:[base('⚡ AEGIS System Status',C.gr)
      .addFields(
        {name:'WS Latency',  value:`${bot.ws.ping}ms`,inline:true},
        {name:'API Latency', value:`${Date.now()-interaction.createdTimestamp}ms`,inline:true},
        {name:'Uptime',      value:`${Math.floor(process.uptime()/3600)}h ${Math.floor((process.uptime()%3600)/60)}m`,inline:true},
        {name:'Memory',      value:`${Math.round(process.memoryUsage().heapUsed/1024/1024)}MB`,inline:true},
        {name:'Supabase',    value:_sbOk?'✅ Online':'⚠️ Circuit Open',inline:true},
        {name:'AI Core',     value:ai?'✅ Active (Token-Efficient)':'⚠️ No API Key',inline:true},
        {name:'Beacon',      value:bTok.access?'✅ Connected':'⚠️ Not Auth',inline:true},
        {name:'Commands',    value:`${cmds.length}`,inline:true},
      )
      .setFooter({text:'AEGIS v10.0 SOVEREIGN · TheConclave Dominion'})
    ]});
  }

  // ── /info ─────────────────────────────────────────────────────
  if (cmd === 'info') {
    return interaction.reply({embeds:[base('⬡ TheConclave Dominion',C.pl)
      .setDescription('5× Crossplay ARK: Survival Ascended · 10 maps · All platforms welcome')
      .addFields(
        {name:'📌 Maps',      value:'Aberration(PvP) · Scorched · Valguero · Amissa(Patreon) · Astraeos · Lost Colony · Island · Center · Extinction · Volcano',inline:false},
        {name:'⛏️ Minecraft', value:'`134.255.214.44:10090`',inline:true},
        {name:'◈ Economy',   value:'ClaveShard — /wallet /daily /order',inline:true},
        {name:'🌐 Website',  value:'[theconclavedominion.com](https://theconclavedominion.com)',inline:true},
      )
      .setFooter({text:'AEGIS — TheConclave Dominion'})
    ]});
  }

  // ── /setup-shop-panel ─────────────────────────────────────────
  if (cmd === 'setup-shop-panel') {
    if (!isAdmin(member)) return interaction.reply({content:'❌ Admin only.',ephemeral:true});
    await interaction.deferReply({ephemeral:true});
    await postPanel(channel, 'shop');
    return interaction.editReply('✅ Shop panel posted.');
  }

  // ── /setup-channels ───────────────────────────────────────────
  if (cmd === 'setup-channels') {
    if (!isOwner(member)) return interaction.reply({content:'❌ Owner only.',ephemeral:true});
    return interaction.reply({content:'⚙️ Full channel setup: **theconclavedominion.com/admin**\n\nRecommended structure:\n📁 Welcome & Info → #welcome #rules #announcements #changelog\n📁 ARK Servers → #server-status #connect-info #mod-requests\n📁 Community → #general #media #events #giveaways\n📁 Economy → #shop #orders #pickups\n📁 Support → #help #tickets (auto-created by AEGIS)\n📁 Staff → #staff-chat #mod-log #aegis-admin',ephemeral:true});
  }

  // ── /setup-roles ──────────────────────────────────────────────
  if (cmd === 'setup-roles') {
    if (!isOwner(member)) return interaction.reply({content:'❌ Owner only.',ephemeral:true});
    return interaction.reply({content:'⚙️ Set these in Render env vars:\n`ROLE_OWNER_ID` — The Conclave (owner)\n`ROLE_ADMIN_ID` — Admin\n`ROLE_HELPER_ID` — Helper/Mod\n`ROLE_BOOSTER_ID` — Server Booster\n`ROLE_DONATOR_ID` — Donator\n`ROLE_SURVIVOR_ID` — Survivor (base member role)',ephemeral:true});
  }

  // ── /setup-welcome ────────────────────────────────────────────
  if (cmd === 'setup-welcome') {
    if (!isAdmin(member)) return interaction.reply({content:'❌ Admin only.',ephemeral:true});
    await interaction.deferReply({ephemeral:true});
    await postPanel(channel, 'welcome');
    return interaction.editReply('✅ Welcome panel posted.');
  }

});

// Button handler — ticket close
bot.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;
  if (interaction.customId === 'close_ticket') {
    if (!isMod(interaction.member)) {
      return interaction.reply({content:'❌ Staff only.',ephemeral:true});
    }
    await interaction.reply({content:'🔒 Closing ticket in 5 seconds...',ephemeral:true});
    setTimeout(() => interaction.channel.delete().catch(()=>null), 5000);
  }
});

// ═══════════════════════════════════════════════════════════════════
// BOT READY
// ═══════════════════════════════════════════════════════════════════
bot.once(Events.ClientReady, async () => {
  STATUS.ready = true; STATUS.readyAt = Date.now();
  console.log(`\n🤖 AEGIS v10.0 SOVEREIGN — ${bot.user.tag}`);
  console.log(`   Guild:     ${DISCORD_GUILD_ID}`);
  console.log(`   Supabase:  ${sb?'✅':'⚠️  not configured'}`);
  console.log(`   AI Core:   ${ai?'✅ token-efficient routing':'⚠️  no API key'}`);
  console.log(`   Beacon:    ${bTok.access?'✅ token loaded':'⚠️  not authenticated'}`);
  console.log(`   Commands:  ${cmds.length}`);
  console.log(`   Health:    :${BOT_PORT}`);

  bot.user.setActivity(`◈ TheConclave · /aegis · ${cmds.length} commands`, {type:3});
  await registerCommands();

  if (MONITOR_STATUS_CHANNEL_ID && MONITOR_MESSAGE_ID) {
    monState.set(DISCORD_GUILD_ID, {statusCh:MONITOR_STATUS_CHANNEL_ID, actCh:MONITOR_ACTIVITY_CHANNEL_ID||null, msgId:MONITOR_MESSAGE_ID, servers:[...SERVERS]});
    const guild = await bot.guilds.fetch(DISCORD_GUILD_ID).catch(()=>null);
    if (guild) { await refreshMonitor(guild); console.log('📡 Monitor resumed'); }
    startMonitor();
  }
});

// ═══════════════════════════════════════════════════════════════════
// WATCHDOG — ONLY ws=5 DISCONNECTED, 2.5 min threshold
// ═══════════════════════════════════════════════════════════════════
let _wdFails = 0, _lastHB = Date.now();
const WD_START = Date.now() + 90_000;

bot.ws.on('heartbeat', () => { _lastHB = Date.now(); });

setInterval(() => {
  if (Date.now() < WD_START) return;
  const ws = bot.ws?.status ?? -1;
  const hbAge = Math.floor((Date.now()-_lastHB)/1000);
  // Transient states 1-4,6-8 = normal reconnect — ignore
  if (ws !== 5 && !(hbAge > 150 && ws !== 0)) { _wdFails = 0; return; }
  _wdFails++;
  console.warn(`⚠️  Watchdog: ws=${ws} hbAge=${hbAge}s fails=${_wdFails}`);
  if (_wdFails >= 5) { // 5 × 30s = 2.5 min — real disconnect
    console.error('❌ AEGIS: persistent disconnect — restarting process');
    process.exit(1); // Render auto-restarts cleanly
  }
}, 30_000);

// ═══════════════════════════════════════════════════════════════════
// HEALTH SERVER
// ═══════════════════════════════════════════════════════════════════
http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    const up = STATUS.ready && bot.ws.status === 0;
    const mem = process.memoryUsage();
    res.writeHead(up?200:503, {'Content-Type':'application/json'});
    res.end(JSON.stringify({
      status: up?'ok':'degraded', version:'10.0',
      ws: bot.ws.status, commands: cmds.length,
      supabase: _sbOk?'ok':'circuit_open',
      ai: ai?'configured':'missing',
      beacon: bTok.access?'connected':'not_auth',
      reconnects: STATUS.reconnects,
      heapMB: Math.round(mem.heapUsed/1024/1024),
      ts: new Date().toISOString(),
    }));
  } else { res.writeHead(404); res.end(); }
}).listen(parseInt(BOT_PORT), () => console.log(`💓 AEGIS health on :${BOT_PORT}`));

// ═══════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════
bot.login(DISCORD_BOT_TOKEN).catch(e => { console.error('❌ Login failed:', e.message); process.exit(1); });

process.on('SIGINT',             () => { console.log('🛑 AEGIS shutdown'); process.exit(0); });
process.on('uncaughtException',  e  => console.error('❌ Uncaught:', e.message));
process.on('unhandledRejection', e  => console.error('❌ Rejection:', e));

module.exports = bot;
