// ═══════════════════════════════════════════════════════════════
// CONCLAVE AEGIS BOT — bot.js v8.0 ULTIMATE OMNI
// ═══════════════════════════════════════════════════════════════
// Architecture:
//   ∙ Standalone process · Built-in HTTP health server (:3001)
//   ∙ Discord WS watchdog — auto-reconnect on disconnect
//   ∙ Supabase circuit breaker — 5-fail threshold, 60s reset
//   ∙ Knowledge cache 60s TTL — zero Supabase hit per AI call
//   ∙ Per-user conversation memory (6 exchanges)
//   ∙ Smart web search — only on time-sensitive queries
//   ∙ Per-command error isolation
//   ∙ Rate limiter with stale-entry cleanup
//   ∙ Memory monitor + graceful SIGTERM/SIGINT
//   ∙ Exponential backoff login (5s→15s→30s→60s→120s)
//
// Commands (38):
//   Economy: /wallet /curr /clvsd /weekly /shop /order /shard /fulfill
//   AI/Info: /aegis /ask /servers /map /info /rules /forums /group
//   Social:  /profile /rank /leaderboard /activity /rep /weekly
//   Admin:   /announce /event /warn /ban /timeout /role /ticket
//   Tools:   /poll /giveaway /remind /roll /coinflip /calc
//   Util:    /help /ping /whois /serverinfo /patreon /report
// ═══════════════════════════════════════════════════════════════
'use strict';
require('dotenv').config();

const http = require('http');
const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  EmbedBuilder, PermissionFlagsBits, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  AttachmentBuilder
} = require('discord.js');
const Anthropic = require('@anthropic-ai/sdk');
const axios     = require('axios');
const { createClient } = require('@supabase/supabase-js');

// ─── ENV ───────────────────────────────────────────────────────
const {
  DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID,
  ROLE_OWNER_ID, ROLE_ADMIN_ID, ROLE_HELPER_ID,
  ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  AEGIS_CHANNEL_ID, ADMIN_TOKEN
} = process.env;

if (!DISCORD_BOT_TOKEN) { console.error('❌ DISCORD_BOT_TOKEN missing'); process.exit(1); }

const API_BASE  = (process.env.API_URL || 'https://api.theconclavedominion.com').replace(/\/$/, '');
const AEGIS_CH  = AEGIS_CHANNEL_ID || '';
const MODEL     = 'claude-sonnet-4-5';
const BOT_PORT  = parseInt(process.env.BOT_PORT || '3001');

// ─── CLIENTS ───────────────────────────────────────────────────
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;
const sb = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { 'x-application-name': 'conclave-aegis-bot' } }
    })
  : null;

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences,
  ],
  rest: { timeout: 15000 },
  allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
});

// ─── ROLE HELPERS ──────────────────────────────────────────────
const isOwner = m => m?.roles?.cache?.has(ROLE_OWNER_ID) || m?.permissions?.has(PermissionFlagsBits.Administrator);
const isAdmin = m => isOwner(m) || m?.roles?.cache?.has(ROLE_ADMIN_ID);
const isMod   = m => isAdmin(m) || m?.roles?.cache?.has(ROLE_HELPER_ID) || m?.permissions?.has(PermissionFlagsBits.ModerateMembers);

// ─── RATE LIMITER ──────────────────────────────────────────────
const rates = new Map();
function checkRate(uid, ms = 8000) {
  const l = rates.get(uid) || 0, n = Date.now();
  if (n - l < ms) return Math.ceil((ms - (n - l)) / 1000);
  rates.set(uid, n); return 0;
}
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [k, v] of rates) if (v < cutoff) rates.delete(k);
}, 5 * 60_000);

// ─── SUPABASE CIRCUIT BREAKER ──────────────────────────────────
const CB = { failures: 0, openUntil: 0, threshold: 5, resetMs: 60_000 };
const sbOk = () => Date.now() >= CB.openUntil;
function sbFail() {
  CB.failures++;
  if (CB.failures >= CB.threshold) {
    CB.openUntil = Date.now() + CB.resetMs;
    console.error(`⚡ Supabase CB OPEN (${CB.failures} failures)`);
  }
}
function sbSucc() { CB.failures = 0; CB.openUntil = 0; }

async function sbQuery(fn) {
  if (!sb) throw new Error('Supabase not configured');
  if (!sbOk()) throw new Error('Database temporarily unavailable');
  try { const r = await fn(sb); sbSucc(); return r; }
  catch (e) { sbFail(); throw e; }
}

// ─── WALLET ENGINE ─────────────────────────────────────────────
async function getWallet(id, tag) {
  return sbQuery(async sb => {
    const { data, error } = await sb.from('aegis_wallets')
      .upsert({ discord_id: id, discord_tag: tag, updated_at: new Date().toISOString() },
        { onConflict: 'discord_id', ignoreDuplicates: false })
      .select().single();
    if (error) throw new Error('Wallet error: ' + error.message);
    return data;
  });
}

async function logTx(id, tag, action, amount, balAfter, note = '', actorId = '', actorTag = '') {
  if (!sb || !sbOk()) return;
  try {
    await sb.from('aegis_wallet_ledger').insert({
      discord_id: id, action, amount,
      balance_wallet_after: balAfter,
      note: note || null, actor_discord_id: actorId || null, actor_tag: actorTag || null
    });
  } catch {}
}

async function depositToBank(id, tag, amount) {
  const w = await getWallet(id, tag);
  if (w.wallet_balance < amount) throw new Error(`Need **${amount}** in wallet. You have **${w.wallet_balance}** 💎.`);
  return sbQuery(async sb => {
    const { data, error } = await sb.from('aegis_wallets')
      .update({ wallet_balance: w.wallet_balance - amount, bank_balance: w.bank_balance + amount, updated_at: new Date().toISOString() })
      .eq('discord_id', id).select().single();
    if (error) throw new Error(error.message);
    await logTx(id, tag, 'deposit', amount, data.bank_balance, `Deposited ${amount} to bank`, id, tag);
    return data;
  });
}

async function withdrawFromBank(id, tag, amount) {
  const w = await getWallet(id, tag);
  if (w.bank_balance < amount) throw new Error(`Need **${amount}** in bank. You have **${w.bank_balance}** 💎.`);
  return sbQuery(async sb => {
    const { data, error } = await sb.from('aegis_wallets')
      .update({ wallet_balance: w.wallet_balance + amount, bank_balance: w.bank_balance - amount, updated_at: new Date().toISOString() })
      .eq('discord_id', id).select().single();
    if (error) throw new Error(error.message);
    await logTx(id, tag, 'withdraw', amount, data.wallet_balance, `Withdrew ${amount} from bank`, id, tag);
    return data;
  });
}

async function transferShards(fromId, fromTag, toId, toTag, amount) {
  if (fromId === toId) throw new Error('Cannot transfer to yourself.');
  const sender = await getWallet(fromId, fromTag);
  if (sender.wallet_balance < amount) throw new Error(`Need **${amount}** in wallet. You have **${sender.wallet_balance}** 💎.`);
  return sbQuery(async sb => {
    await sb.from('aegis_wallets').update({ wallet_balance: sender.wallet_balance - amount, lifetime_spent: (sender.lifetime_spent || 0) + amount, updated_at: new Date().toISOString() }).eq('discord_id', fromId);
    await getWallet(toId, toTag);
    const { data: r } = await sb.from('aegis_wallets').select('wallet_balance,lifetime_earned').eq('discord_id', toId).single();
    const { data: updated } = await sb.from('aegis_wallets').update({ wallet_balance: (r.wallet_balance || 0) + amount, lifetime_earned: (r.lifetime_earned || 0) + amount, updated_at: new Date().toISOString() }).eq('discord_id', toId).select().single();
    const note = `${fromTag} → ${toTag}`;
    await logTx(fromId, fromTag, 'transfer_out', amount, sender.wallet_balance - amount, note, fromId, fromTag);
    await logTx(toId, toTag, 'transfer_in', amount, updated.wallet_balance, note, fromId, fromTag);
    return { sent: sender.wallet_balance - amount, received: updated.wallet_balance };
  });
}

async function grantShards(toId, toTag, amount, reason, actorId, actorTag) {
  await getWallet(toId, toTag);
  return sbQuery(async sb => {
    const { data: curr } = await sb.from('aegis_wallets').select('wallet_balance,lifetime_earned').eq('discord_id', toId).single();
    const { data, error } = await sb.from('aegis_wallets').update({ wallet_balance: (curr.wallet_balance || 0) + amount, lifetime_earned: (curr.lifetime_earned || 0) + amount, updated_at: new Date().toISOString() }).eq('discord_id', toId).select().single();
    if (error) throw new Error(error.message);
    await logTx(toId, toTag, 'grant', amount, data.wallet_balance, reason || 'Admin grant', actorId, actorTag);
    return data;
  });
}

async function deductShards(fromId, fromTag, amount, reason, actorId, actorTag) {
  const w = await getWallet(fromId, fromTag);
  const nb = Math.max(0, (w.wallet_balance || 0) - amount);
  return sbQuery(async sb => {
    const { data, error } = await sb.from('aegis_wallets').update({ wallet_balance: nb, lifetime_spent: (w.lifetime_spent || 0) + amount, updated_at: new Date().toISOString() }).eq('discord_id', fromId).select().single();
    if (error) throw new Error(error.message);
    await logTx(fromId, fromTag, 'deduct', amount, data.wallet_balance, reason || 'Admin deduct', actorId, actorTag);
    return data;
  });
}

async function getHistory(id, limit = 15) {
  return sbQuery(async sb => {
    const { data, error } = await sb.from('aegis_wallet_ledger')
      .select('action,amount,balance_wallet_after,note,actor_tag,created_at')
      .eq('discord_id', id).order('created_at', { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return data || [];
  });
}

async function getLeaderboard(limit = 10) {
  return sbQuery(async sb => {
    const { data } = await sb.from('aegis_wallets')
      .select('discord_id,discord_tag,wallet_balance,bank_balance,lifetime_earned')
      .order('wallet_balance', { ascending: false }).limit(limit);
    return data || [];
  });
}

async function getSupply() {
  return sbQuery(async sb => {
    const { data } = await sb.from('aegis_wallets').select('wallet_balance,bank_balance');
    if (!data?.length) return { walletTotal: 0, bankTotal: 0, holders: 0 };
    return { walletTotal: data.reduce((s, r) => s + (r.wallet_balance || 0), 0), bankTotal: data.reduce((s, r) => s + (r.bank_balance || 0), 0), holders: data.length };
  });
}

// Weekly ClaveShard claim
async function claimDaily(id, tag) {
  return sbQuery(async sb => {
    const { data: w } = await sb.from('aegis_wallets').select('*').eq('discord_id', id).single();
    if (!w) { await getWallet(id, tag); return claimDaily(id, tag); }
    const now = new Date();
    const lastClaim = w.last_daily_claim ? new Date(w.last_daily_claim) : null;
    const WEEK_HOURS = 168; // 7 days
    const diff = lastClaim ? (now - lastClaim) / (1000 * 60 * 60) : 999;
    if (diff < WEEK_HOURS) {
      const nextClaim = new Date(lastClaim.getTime() + WEEK_HOURS * 60 * 60 * 1000);
      throw new Error(`⏳ Already claimed this week. Next claim: <t:${Math.floor(nextClaim / 1000)}:R>`);
    }
    const amount = 3;
    const streak = (w.daily_streak || 0) + 1;
    const { data, error } = await sb.from('aegis_wallets').update({
      wallet_balance: (w.wallet_balance || 0) + amount,
      lifetime_earned: (w.lifetime_earned || 0) + amount,
      last_daily_claim: now.toISOString(),
      daily_streak: streak,
      updated_at: now.toISOString()
    }).eq('discord_id', id).select().single();
    if (error) throw new Error(error.message);
    await logTx(id, tag, 'daily_claim', amount, data.wallet_balance, `Week ${streak} claim`, 'SYSTEM', 'AEGIS');
    return { data, amount, streak, bonus: 0 };
  });
}


// ─── LIVE MONITOR ENGINE ──────────────────────────────────────
// Stores: { guildId: { statusChannelId, activityChannelId, messageId, servers: [...] } }
const monitorState = new Map();

const MONITOR_SERVERS = [
  { id: 'island',     name: 'The Island',    fullName: 'TheConclave-TheIsland-5xCrossplay',      nitradoId: 18266152, emoji: '🌿', ip: '217.114.196.102', port: 5390, pvp: false, patreon: false },
  { id: 'volcano',    name: 'Volcano',        fullName: 'TheConclave-Volcano-5xCrossplay',        nitradoId: 18094678, emoji: '🌋', ip: '217.114.196.59',  port: 5050, pvp: false, patreon: false },
  { id: 'extinction', name: 'Extinction',     fullName: 'TheConclave-Extinction-5Xcrossplay',     nitradoId: 18106633, emoji: '🌑', ip: '31.214.196.102',  port: 6440, pvp: false, patreon: false },
  { id: 'center',     name: 'The Center',     fullName: 'TheConclave-Center-5xCrossplay',         nitradoId: 18182839, emoji: '🏔️', ip: '31.214.163.71',   port: 5120, pvp: false, patreon: false },
  { id: 'lostcolony', name: 'Lost Colony',    fullName: 'TheConclave-LostColony-5xCrossplay',     nitradoId: 18307276, emoji: '🪐', ip: '217.114.196.104', port: 5150, pvp: false, patreon: false },
  { id: 'astraeos',   name: 'Astraeos',       fullName: 'TheConclave-Astreos-5xCrossplay',        nitradoId: 18393892, emoji: '✨', ip: '217.114.196.9',   port: 5320, pvp: false, patreon: false },
  { id: 'valguero',   name: 'Valguero',       fullName: 'TheConclave-Valguero-5xCrossplay',       nitradoId: 18509341, emoji: '🏞️', ip: '85.190.136.141',  port: 5090, pvp: false, patreon: false },
  { id: 'scorched',   name: 'Scorched Earth', fullName: 'TheConclave-Scorched-5xCrossplay',       nitradoId: 18598049, emoji: '☀️', ip: '217.114.196.103', port: 5240, pvp: false, patreon: false },
  { id: 'aberration', name: 'Aberration',     fullName: 'TheConclave-Aberration-5xCrossplay',     nitradoId: 18655529, emoji: '⚔️', ip: '217.114.196.80',  port: 5540, pvp: true,  patreon: false },
  { id: 'amissa',     name: 'Amissa',         fullName: 'TheConclave-Amissa-Patreon-5xCrossplay', nitradoId: 18680162, emoji: '⭐', ip: '217.114.196.80',  port: 5180, pvp: false, patreon: true  },
];

// ─── NITRADO DIRECT PULL ──────────────────────────────────────
// Pulls live player counts directly from Nitrado API — no BattleMetrics middleman
const NITRADO_API = 'https://api.nitrado.net';

async function fetchNitradoServer(nitradoId) {
  if (!process.env.NITRADO_API_KEY) return null;
  try {
    const res = await axios.get(`${NITRADO_API}/services/${nitradoId}/gameservers`, {
      headers: { Authorization: `Bearer ${process.env.NITRADO_API_KEY}` },
      timeout: 10000
    });
    const gs = res.data?.data?.gameserver;
    if (!gs) return null;
    return {
      status:     gs.status === 'started' ? 'online' : 'offline',
      players:    gs.query?.player_current  ?? 0,
      maxPlayers: gs.query?.player_max      ?? 20,
      version:    gs.game_specific?.version ?? null,
    };
  } catch (e) {
    console.error(`❌ Nitrado fetch ${nitradoId}:`, e.message);
    return null;
  }
}

async function fetchRCONPlayers(nitradoId) {
  if (!process.env.NITRADO_API_KEY) return [];
  try {
    const res = await axios.post(
      `${NITRADO_API_URL}/services/${nitradoId}/gameservers/rcon`,
      { command: 'ListPlayers' },
      { headers: { Authorization: `Bearer ${process.env.NITRADO_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 8000 }
    );
    const raw = res.data?.data?.response || '';
    // Parse response: "0. PlayerName, steamid\n1. PlayerName2, steamid\n"
    const players = [];
    for (const line of raw.split('\n')) {
      const match = line.match(/^\d+\.\s+(.+?),/);
      if (match) players.push(match[1].trim());
    }
    return players;
  } catch { return []; }
}


// ─── BEACON SENTINEL INTEGRATION ─────────────────────────────
const BEACON_API_URL = 'https://api.usebeacon.app';
const beaconState = {
  access: null, refresh: null, expiresAt: 0, groupId: null,
  deviceSessions: new Map(),
};

function beaconVerifier() {
  const { randomBytes } = require('crypto');
  return randomBytes(48).toString('base64url').slice(0, 96);
}
function beaconChallenge(v) {
  const { createHash } = require('crypto');
  return createHash('sha256').update(v).digest('base64url');
}

async function beaconEnsureToken() {
  if (!beaconState.access) return null;
  const now = Math.floor(Date.now() / 1000);
  if (beaconState.expiresAt && now >= beaconState.expiresAt - 300) {
    try {
      const r = await axios.post(`${BEACON_API_URL}/v4/login`, {
        client_id:     process.env.BEACON_CLIENT_ID || 'eb9ecdff-4048-4a83-8f40-f2e16d2e9a81',
        client_secret: process.env.BEACON_CLIENT_SECRET || process.env.BEACON_SENTINEL_KEY,
        grant_type:    'refresh_token',
        refresh_token: beaconState.refresh,
        scope:         'common sentinel:read sentinel:write',
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
      beaconState.access    = r.data.access_token;
      beaconState.refresh   = r.data.refresh_token;
      beaconState.expiresAt = r.data.access_token_expiration;
    } catch { return null; }
  }
  return beaconState.access;
}

async function beaconFetch(path, params = {}) {
  const token = await beaconEnsureToken();
  if (!token) return null;
  try {
    const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
    const r = await axios.get(`${BEACON_API_URL}${path}${qs}`, {
      headers: { Authorization: `Bearer ${token}` }, timeout: 12000
    });
    return r.data;
  } catch { return null; }
}

async function beaconGroup() {
  if (beaconState.groupId) return beaconState.groupId;
  const data = await beaconFetch('/v4/sentinel/groups');
  if (data?.results?.[0]) {
    beaconState.groupId = data.results[0].groupId;
  }
  return beaconState.groupId;
}

async function sentinelOnlinePlayers() {
  if (!beaconState.access) return [];
  const data = await beaconFetch('/v4/sentinel/characters', { online: 'true', pageSize: 250 });
  return data?.results || [];
}

async function sentinelTribes(serverFilter) {
  if (!beaconState.access) return [];
  const params = { pageSize: 250 };
  const data = await beaconFetch('/v4/sentinel/tribes', params);
  let tribes = data?.results || [];
  if (serverFilter) tribes = tribes.filter(t => (t.serviceName||'').toLowerCase().includes(serverFilter.toLowerCase()));
  return tribes;
}

async function sentinelBans() {
  if (!beaconState.access) return [];
  const data = await beaconFetch('/v4/sentinel/bans', { pageSize: 100 });
  return data?.results || [];
}

async function sentinelPlayer(name) {
  if (!beaconState.access) return null;
  const data = await beaconFetch('/v4/sentinel/players', { search: name, pageSize: 5 });
  return data?.results?.[0] || null;
}

// Load tokens from env on boot
if (process.env.BEACON_ACCESS_TOKEN) {
  beaconState.access    = process.env.BEACON_ACCESS_TOKEN;
  beaconState.refresh   = process.env.BEACON_REFRESH_TOKEN || null;
  beaconState.expiresAt = parseInt(process.env.BEACON_TOKEN_EXPIRES || '0');
  beaconState.groupId   = process.env.BEACON_GROUP_ID     || null;
  console.log('📡 Beacon Sentinel: token loaded from env');
}

async function fetchNitradoStatus(servers) {
  const results = [];
  await Promise.all(servers.map(async srv => {
    if (!srv.nitradoId) {
      results.push({ ...srv, status: 'unknown', players: 0, maxPlayers: 20 });
      return;
    }
    const data = await fetchNitradoServer(srv.nitradoId);
    const isOnline = (data?.status ?? 'unknown') === 'online';
    const playerNames = isOnline && (data?.players ?? 0) > 0
      ? await fetchRCONPlayers(srv.nitradoId)
      : [];
    results.push({
      ...srv,
      status:      data?.status     ?? 'unknown',
      players:     data?.players    ?? 0,
      maxPlayers:  data?.maxPlayers ?? 20,
      version:     data?.version    ?? null,
      playerNames,
    });
  }));
  return results;
}

// Keep BattleMetrics as fallback if Nitrado key missing
async function fetchBMStatus(servers) {
  const results = [];
  await Promise.all(servers.map(async srv => {
    try {
      const searchTerm = srv.fullName || srv.name;
      const search = encodeURIComponent(searchTerm);
      const url = `https://api.battlemetrics.com/servers?filter[search]=${search}&filter[game]=arksa&fields[server]=name,players,maxPlayers,status,ip,port&page[size]=5`;
      const headers = BATTLEMETRICS_TOKEN ? { Authorization: `Bearer ${BATTLEMETRICS_TOKEN}` } : {};
      const res = await axios.get(url, { headers, timeout: 8000 });
      const data = res.data?.data || [];
      const match =
        data.find(s => String(s.attributes.port) === String(srv.port) && s.attributes.ip === srv.ip) ||
        data.find(s => String(s.attributes.port) === String(srv.port)) ||
        data[0];
      results.push({
        ...srv,
        status:     match?.attributes?.status === 'online' ? 'online' : 'offline',
        players:    match?.attributes?.players    || 0,
        maxPlayers: match?.attributes?.maxPlayers || 20,
      });
    } catch {
      results.push({ ...srv, status: 'unknown', players: 0, maxPlayers: 20 });
    }
  }));
  return results;
}

// Smart fetch — Nitrado if key present, BattleMetrics fallback
async function fetchServerStatus(servers) {
  if (process.env.NITRADO_API_KEY) return fetchNitradoStatus(servers);
  return fetchBMStatus(servers);
}

function buildMonitorEmbed(servers) {
  const online  = servers.filter(s => s.status === 'online');
  const offline = servers.filter(s => s.status !== 'online');
  const totalPlayers = online.reduce((sum, s) => sum + s.players, 0);

  const lines = [
    ...online.map(s => {
      const tag = s.pvp ? ' ⚔️' : s.patreon ? ' ⭐' : '';
      const bar = s.players > 0 ? '`' + s.players + '/' + s.maxPlayers + '`' : '`0/' + s.maxPlayers + '`';
      const names = s.playerNames?.length ? ' — ' + s.playerNames.join(', ') : '';
      return `🟢 **${s.emoji} ${s.name}**${tag} ${bar}${names}`;
    }),
    ...offline.map(s => `🔴 **${s.emoji} ${s.name}** · Offline`),
  ].join('\n');

  return new EmbedBuilder()
    .setTitle('⚔️ TheConclave — Live Cluster Monitor')
    .setColor(totalPlayers > 0 ? 0x35ED7E : 0xFF4500)
    .setDescription(lines || 'No servers configured.')
    .addFields(
      { name: '🟢 Online',        value: `${online.length}/${servers.length}`,      inline: true },
      { name: '👥 Total Players', value: `${totalPlayers}`,                          inline: true },
      { name: '⏰ Last Updated',  value: `<t:${Math.floor(Date.now()/1000)}:R>`,    inline: true },
    )
    .setFooter({ text: 'TheConclave Dominion • Auto-refreshes every 5 min', iconURL: 'https://theconclavedominion.com/conclave-badge.png' })
    .setTimestamp();
}

// Update voice channel names with live stats (sidebar display)
// Discord rate limit: 2 channel name updates per 10 min — we batch smartly
async function updateStatChannels(guild, statChannelIds, servers) {
  const online = servers.filter(s => s.status === 'online');
  const total  = online.reduce((sum, s) => sum + s.players, 0);
  const peak   = online.sort((a, b) => b.players - a.players)[0];

  const stats = [
    { id: statChannelIds.totalOnline,  name: `⚔️ Servers: ${online.length}/${servers.length} Online` },
    { id: statChannelIds.totalPlayers, name: `👥 Players: ${total} Live` },
    { id: statChannelIds.peak,         name: peak ? `🏆 Peak: ${peak.emoji} ${peak.name} (${peak.players})` : `🏆 Peak: No players` },
    ...servers.map(s => ({
      id: statChannelIds[s.id],
      name: s.status === 'online'
        ? `${s.emoji} ${s.name}: ${s.players}/${s.maxPlayers}`
        : `🔴 ${s.name}: Offline`
    }))
  ];

  for (const stat of stats) {
    if (!stat.id) continue;
    try {
      const ch = await guild.channels.fetch(stat.id).catch(() => null);
      if (ch && ch.name !== stat.name) {
        await ch.setName(stat.name);
        await new Promise(r => setTimeout(r, 600)); // stagger to avoid rate limit
      }
    } catch {}
  }
}

async function refreshMonitor(guild) {
  const state = monitorState.get(guild.id);
  if (!state || !state.statusChannelId || !state.messageId) return;
  try {
    const ch = await guild.channels.fetch(state.statusChannelId).catch(() => null);
    if (!ch) return;
    const servers = state.servers?.length ? state.servers : MONITOR_SERVERS;
    const statuses = await fetchServerStatus(servers);
    const embed = buildMonitorEmbed(statuses);
    const msg = await ch.messages.fetch(state.messageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed] });
    } else {
      const newMsg = await ch.send({ embeds: [embed] });
      state.messageId = newMsg.id;
    }
    // Update sidebar stat channels
    if (state.statChannelIds) {
      await updateStatChannels(guild, state.statChannelIds, statuses);
    }
    // Update existing per-server status channel names
    await updateExistingStatusChannels(guild, statuses);

    // Save previous statuses for join/leave detection
    if (state.prevStatuses) {
      for (const srv of statuses) {
        const prev = state.prevStatuses.find(p => p.id === srv.id);
        if (prev && prev.players !== srv.players && state.activityChannelId) {
          const actCh = await guild.channels.fetch(state.activityChannelId).catch(() => null);
          if (actCh) {
            const diff = srv.players - prev.players;
            const sign = diff > 0 ? `+${diff}` : `${diff}`;
            const color = diff > 0 ? 0x35ED7E : 0xFF4500;
            await actCh.send({ embeds: [
              new EmbedBuilder()
                .setColor(color)
                .setDescription(`${srv.emoji} **${srv.name}** · ${sign} player${Math.abs(diff) !== 1 ? 's' : ''} · now **${srv.players}/${srv.maxPlayers}**`)
                .setTimestamp()
            ]}).catch(() => {});
          }
        }
      }
    }
    state.prevStatuses = statuses;
  } catch (e) {
    console.error('❌ Monitor refresh:', e.message);
  }
}

// Auto-refresh all guilds every 3 minutes
setInterval(async () => {
  // Always update per-server status channel names regardless of monitor state
  if (DISCORD_GUILD_ID) {
    try {
      const guild = await bot.guilds.fetch(DISCORD_GUILD_ID).catch(() => null);
      if (guild) {
        const statuses = await fetchServerStatus(MONITOR_SERVERS);
        await updateExistingStatusChannels(guild, statuses);
      }
    } catch {}
  }
  // Also refresh monitor embeds
  for (const [guildId, state] of monitorState) {
    if (!state.statusChannelId || !state.messageId) continue;
    try {
      const guild = await bot.guilds.fetch(guildId).catch(() => null);
      if (guild) await refreshMonitor(guild);
    } catch {}
  }
}, 5 * 60_000);

// ─── AEGIS AI ENGINE ───────────────────────────────────────────
const CORE = `You are AEGIS — the living intelligence of TheConclave Dominion, a 5x crossplay ARK: Survival Ascended community run by Jake and co-owners TW, Slothie, and Sandy.

SERVERS (10 maps):
• The Island — 217.114.196.102:5390 | Volcano — 217.114.196.59:5050
• Extinction — 31.214.196.102:6440 | The Center — 31.214.163.71:5120
• Lost Colony — 217.114.196.104:5150 | Astraeos — 217.114.196.9:5320
• Valguero — 85.190.136.141:5090 | Scorched Earth — 217.114.196.103:5240
• Aberration — 217.114.196.80:5540 (PvP-enabled) | Amissa — 217.114.196.80:5180 (Patreon-exclusive)

RATES: 5x XP/Harvest/Taming/Breeding · 1M weight · No fall damage · Max wild dino level 350
MODS: Death Inventory Keeper · ARKomatic · Awesome Spyglass · Teleporter
ECONOMY: /wallet balance · /weekly for free shards · /order to shop · /shop for catalog
PAYMENTS: CashApp $TheConclaveDominion · Chime $ANLIKESEF
MINECRAFT: 134.255.214.44:10090 (Bedrock crossplay)
PATREON: patreon.com/theconclavedominion — Amissa access at Elite $20/mo tier
LINKS: discord.gg/theconclave | theconclavedominion.com

COUNCIL: Jake (Founder/Owner), TW (Co-Owner/High Curator), Slothie (Co-Owner/Archmaestro), Sandy (Co-Owner/Wildheart), Arbanion, Jenny, Icyreaper, Okami, Credibledevil, Rookiereaper

Respond concisely for Discord (under 1800 chars). Be accurate, authoritative, community-warm. You are the realm's intelligence — speak with subtle cosmic gravitas.`;

// Knowledge cache (60s TTL)
let _kCache = null, _kCacheTs = 0;
const K_TTL = 60_000;

async function getKnowledge() {
  const now = Date.now();
  if (_kCache !== null && (now - _kCacheTs) < K_TTL) return _kCache;
  if (!sb || !sbOk()) { _kCache = ''; return ''; }
  try {
    const { data } = await sb.from('aegis_knowledge')
      .select('category,title,content')
      .neq('category', 'auto_learned')
      .order('category').limit(80);
    _kCache = data?.length ? '\n\nKNOWLEDGE:\n' + data.map(r => `[${r.category}] ${r.title}: ${r.content}`).join('\n') : '';
    _kCacheTs = now;
    return _kCache;
  } catch { _kCache = ''; return ''; }
}

// Conversation memory per user
const convMem = new Map();
function getHist(uid) { return convMem.get(uid) || []; }
function addHist(uid, role, content) {
  const h = convMem.get(uid) || [];
  h.push({ role, content: content.slice(0, 600) });
  if (h.length > 12) h.splice(0, h.length - 12);
  convMem.set(uid, h);
}
function clearHist(uid) { convMem.delete(uid); }
setInterval(() => { for (const [k] of convMem) if (!convMem.get(k)?.length) convMem.delete(k); }, 30 * 60_000);

const SEARCH_RE = /latest|current|today|news|update|patch|new|recent|just|now|2025|2026|version|release|price|announce|who is|when did|what happened/i;

async function askAegis(msg, uid = null, extraContext = '') {
  if (!anthropic) return '⚠️ AI not configured.';
  try {
    const knowledge = await getKnowledge();
    const system = CORE + knowledge + (extraContext ? '\n\n' + extraContext : '');
    const history = uid ? getHist(uid) : [];
    const useSearch = SEARCH_RE.test(msg);
    const req = {
      model: MODEL, max_tokens: 800,
      system,
      messages: [...history, { role: 'user', content: msg }],
    };
    if (useSearch) req.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    const res = await anthropic.messages.create(req);
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    const searched = res.content.some(b => b.type === 'tool_use');
    if (!text) return '⚠️ Empty response. Try rephrasing.';
    if (uid) { addHist(uid, 'user', msg); addHist(uid, 'assistant', text); }
    // Auto-learn fire-and-forget
    if (sb && sbOk() && text.length > 120 && msg.length > 20) {
      (async () => { try { await sb.from('aegis_knowledge').insert({ category: 'auto_learned', key: `auto_${Date.now().toString(36)}`, title: msg.slice(0, 120), content: text.slice(0, 900), added_by: 'AEGIS_BOT', source: searched ? 'web_search' : 'inference', updated_at: new Date().toISOString() }); } catch {} })();
    }
    return (searched ? '🔍 *[web search]*\n\n' : '') + text;
  } catch (e) {
    if (e.message?.includes('overloaded')) return '⚠️ AEGIS is momentarily overloaded. Try again shortly.';
    if (e.message?.includes('rate')) return '⚠️ Rate limit. Try again in 30 seconds.';
    return '⚠️ AEGIS error: ' + e.message.slice(0, 100);
  }
}

async function fetchServers() {
  // Use Nitrado direct if key present, fall back to API (which uses BattleMetrics)
  if (process.env.NITRADO_API_KEY) {
    const results = await fetchNitradoStatus(MONITOR_SERVERS);
    return results.map(s => ({
      id: s.id, name: s.name, ip: s.ip, port: s.port,
      status: s.status, players: s.players, maxPlayers: s.maxPlayers,
      mode: s.pvp ? 'PvP' : s.patreon ? 'Patreon' : 'PvE',
    }));
  }
  try { const r = await axios.get(`${API_BASE}/api/servers`, { timeout: 8000 }); return r.data.servers || []; }
  catch { return []; }
}

// ─── EMBEDS ────────────────────────────────────────────────────
const C = { gold: 0xFFB800, pl: 0x7B2FFF, cy: 0x00D4FF, gr: 0x35ED7E, rd: 0xFF4500, pk: 0xFF4CD2, bl: 0x5865F2 };
const FT = { text: 'TheConclave Dominion • 5x Crossplay • 10 Maps', iconURL: 'https://theconclavedominion.com/conclave-badge.png' };
const base = (title, color = C.pl) => new EmbedBuilder().setTitle(title).setColor(color).setFooter(FT).setTimestamp();
const TX_ICO = { deposit: '🏦', withdraw: '💸', transfer_out: '➡️', transfer_in: '⬅️', grant: '🎁', deduct: '⬇️', daily_claim: '🌟', spend: '🛒', earn: '✨', admin_set: '🔧', warn: '⚠️' };

function walletEmbed(title, w, color = C.pl) {
  const total = (w.wallet_balance || 0) + (w.bank_balance || 0);
  return base(title, color)
    .setDescription(`**${w.discord_tag || w.discord_id}**`)
    .addFields(
      { name: '💎 Wallet', value: `**${(w.wallet_balance || 0).toLocaleString()}**`, inline: true },
      { name: '🏦 Bank', value: `**${(w.bank_balance || 0).toLocaleString()}**`, inline: true },
      { name: '📊 Total', value: `**${total.toLocaleString()}**`, inline: true },
      { name: '📈 Lifetime Earned', value: `${(w.lifetime_earned || 0).toLocaleString()}`, inline: true },
      { name: '📉 Lifetime Spent', value: `${(w.lifetime_spent || 0).toLocaleString()}`, inline: true },
      { name: '🔥 Weekly Streak', value: `${w.daily_streak || 0} days`, inline: true },
    );
}

// ─── WALLET SUBCOMMAND BUILDER ─────────────────────────────────
function wSub(b) {
  return b
    .addSubcommand(s => s.setName('balance').setDescription('Check your or another member\'s shard balance').addUserOption(o => o.setName('user').setDescription('Member (blank = yourself)').setRequired(false)))
    .addSubcommand(s => s.setName('deposit').setDescription('Move shards from wallet → bank').addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('withdraw').setDescription('Move shards from bank → wallet').addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('transfer').setDescription('Send shards to another player')
      .addUserOption(o => o.setName('user').setDescription('Recipient').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('note').setDescription('Message').setRequired(false)))
    .addSubcommand(s => s.setName('history').setDescription('Transaction history')
      .addUserOption(o => o.setName('user').setDescription('Member (admins only for others)').setRequired(false))
      .addIntegerOption(o => o.setName('count').setDescription('Entries (max 25)').setRequired(false).setMinValue(1).setMaxValue(25)))
    .addSubcommand(s => s.setName('leaderboard').setDescription('Top ClaveShard holders'))
    .addSubcommand(s => s.setName('supply').setDescription('Total economy supply stats'))
    .addSubcommand(s => s.setName('grant').setDescription('[ADMIN] Grant shards')
      .addUserOption(o => o.setName('user').setDescription('Recipient').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)))
    .addSubcommand(s => s.setName('deduct').setDescription('[ADMIN] Deduct shards')
      .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)));
}

// ─── COMMAND DEFINITIONS ───────────────────────────────────────
const cmds = [
  // ECONOMY
  wSub(new SlashCommandBuilder().setName('wallet').setDescription('💎 ClaveShard wallet — balance, transfer, history')),
  wSub(new SlashCommandBuilder().setName('curr').setDescription('💎 ClaveShard wallet (alias)')),
  new SlashCommandBuilder().setName('clvsd').setDescription('💎 Admin economy tools')
    .addSubcommand(s => s.setName('grant').setDescription('[ADMIN] Grant').addUserOption(o => o.setName('user').setDescription('Recipient').setRequired(true)).addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)).addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)))
    .addSubcommand(s => s.setName('deduct').setDescription('[ADMIN] Deduct').addUserOption(o => o.setName('user').setDescription('Target').setRequired(true)).addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)).addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)))
    .addSubcommand(s => s.setName('check').setDescription('[ADMIN] Check wallet').addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)))
    .addSubcommand(s => s.setName('set').setDescription('[ADMIN] Set balance').addUserOption(o => o.setName('user').setDescription('Target').setRequired(true)).addIntegerOption(o => o.setName('amount').setDescription('New balance').setRequired(true).setMinValue(0)).addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)))
    .addSubcommand(s => s.setName('top').setDescription('Top 15 holders'))
    .addSubcommand(s => s.setName('stats').setDescription('[ADMIN] Full economy stats')),
  new SlashCommandBuilder().setName('weekly').setDescription('🌟 Claim your weekly ClaveShard reward — 3 shards every 7 days!'),
  new SlashCommandBuilder().setName('order').setDescription('📦 Submit a ClaveShard order')
    .addIntegerOption(o => o.setName('tier').setDescription('Tier 1-30').setRequired(true).setMinValue(1).setMaxValue(30))
    .addStringOption(o => o.setName('platform').setDescription('Platform').setRequired(true).addChoices({ name: 'Xbox', value: 'Xbox' }, { name: 'PlayStation', value: 'PlayStation' }, { name: 'PC', value: 'PC' }))
    .addStringOption(o => o.setName('server').setDescription('Which server?').setRequired(true))
    .addStringOption(o => o.setName('notes').setDescription('Special requests').setRequired(false)),
  new SlashCommandBuilder().setName('fulfill').setDescription('[ADMIN] Mark order fulfilled').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addStringOption(o => o.setName('ref').setDescription('Order ref').setRequired(true)).addStringOption(o => o.setName('note').setDescription('Note to player').setRequired(false)),
  new SlashCommandBuilder().setName('shard').setDescription('💠 View ClaveShard tier list and pricing'),
  new SlashCommandBuilder().setName('shop').setDescription('🛍 Browse the live ClaveShard item catalog'),
  // AI / INFO
  new SlashCommandBuilder().setName('aegis').setDescription('🧠 Ask AEGIS AI — the Dominion\'s intelligence').addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),
  new SlashCommandBuilder().setName('ask').setDescription('🧠 Ask AEGIS anything (alias for /aegis)').addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),
  new SlashCommandBuilder().setName('forget').setDescription('🧠 Clear your AEGIS conversation history'),
  new SlashCommandBuilder().setName('servers').setDescription('🗺️ Live ARK cluster status').addStringOption(o => o.setName('map').setDescription('Filter by map name').setRequired(false)),
  new SlashCommandBuilder().setName('map').setDescription('🗺️ Detailed info for a specific ARK map').addStringOption(o => o.setName('name').setDescription('Map').setRequired(true).addChoices(
    { name: 'The Island', value: 'island' }, { name: 'Volcano', value: 'volcano' },
    { name: 'Extinction', value: 'extinction' }, { name: 'The Center', value: 'center' },
    { name: 'Lost Colony', value: 'lostcolony' }, { name: 'Astraeos', value: 'astraeos' },
    { name: 'Valguero', value: 'valguero' }, { name: 'Scorched Earth', value: 'scorched' },
    { name: 'Aberration (PvP)', value: 'aberration' }, { name: 'Amissa (Patreon)', value: 'amissa' }
  )),
  new SlashCommandBuilder().setName('info').setDescription('ℹ️ Server info, rates, and getting-started guide'),
  new SlashCommandBuilder().setName('rules').setDescription('📜 Post the Dominion rules'),
  new SlashCommandBuilder().setName('forums').setDescription('🗂️ Forum panel quick-nav'),
  new SlashCommandBuilder().setName('group').setDescription('📂 Show channel group panel').addStringOption(o => o.setName('name').setDescription('Group').setRequired(true).addChoices(
    { name: 'ARK', value: 'ark' }, { name: 'Council', value: 'council' },
    { name: 'Community', value: 'community' }, { name: 'ClaveShard', value: 'claveshard' }
  )),
  new SlashCommandBuilder().setName('help').setDescription('📖 Show all available commands with descriptions'),
  new SlashCommandBuilder().setName('ping').setDescription('🏓 Check bot latency and API response time'),
  // SOCIAL / PROFILE
  new SlashCommandBuilder().setName('profile').setDescription('🎖️ View your full Dominion profile').addUserOption(o => o.setName('user').setDescription('Member (blank = yourself)').setRequired(false)),
  new SlashCommandBuilder().setName('rank').setDescription('📊 Your ClaveShard rank and economy standing'),
  new SlashCommandBuilder().setName('rep').setDescription('⭐ Give reputation to a community member').addUserOption(o => o.setName('user').setDescription('Who to rep').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Why are you repping them?').setRequired(false)),
  // MODERATION
  new SlashCommandBuilder().setName('announce').setDescription('[ADMIN] Send a formatted announcement').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addStringOption(o => o.setName('title').setDescription('Title').setRequired(true)).addStringOption(o => o.setName('message').setDescription('Body').setRequired(true)).addBooleanOption(o => o.setName('ping').setDescription('Ping @everyone?').setRequired(false)),
  new SlashCommandBuilder().setName('event').setDescription('[ADMIN] Create and announce a server event').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addStringOption(o => o.setName('title').setDescription('Event title').setRequired(true)).addStringOption(o => o.setName('description').setDescription('Event details').setRequired(true)).addStringOption(o => o.setName('date').setDescription('Date & time (e.g. Saturday April 12 @ 8PM EST)').setRequired(false)).addBooleanOption(o => o.setName('ping').setDescription('Ping @everyone?').setRequired(false)),
  new SlashCommandBuilder().setName('warn').setDescription('[MOD] Issue a formal warning').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('[MOD] Ban a member').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),
  new SlashCommandBuilder().setName('timeout').setDescription('[MOD] Timeout a member').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration').setRequired(true).addChoices({ name: '5 min', value: '5m' }, { name: '1 hour', value: '1h' }, { name: '6 hours', value: '6h' }, { name: '24 hours', value: '24h' }, { name: '7 days', value: '7d' }))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),
  new SlashCommandBuilder().setName('role').setDescription('[ADMIN] Add or remove a role').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)).addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)).addStringOption(o => o.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' })),
  new SlashCommandBuilder().setName('ticket').setDescription('[ADMIN] Post support ticket panel').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('report').setDescription('🚨 Report a player or issue to Council').addStringOption(o => o.setName('reason').setDescription('What happened?').setRequired(true)).addUserOption(o => o.setName('player').setDescription('Player to report').setRequired(false)).addStringOption(o => o.setName('server').setDescription('Which server?').setRequired(false)),
  // TOOLS
  new SlashCommandBuilder().setName('poll').setDescription('[ADMIN] Create a poll').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addStringOption(o => o.setName('question').setDescription('Question').setRequired(true)).addStringOption(o => o.setName('options').setDescription('Options separated by |').setRequired(true)).addBooleanOption(o => o.setName('anonymous').setDescription('Hide who voted?').setRequired(false)),
  new SlashCommandBuilder().setName('giveaway').setDescription('[ADMIN] Start a giveaway').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('prize').setDescription('Prize').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration').setRequired(true).addChoices({ name: '30 min', value: '1800' }, { name: '1 hour', value: '3600' }, { name: '6 hours', value: '21600' }, { name: '24 hours', value: '86400' }, { name: '7 days', value: '604800' }))
    .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setRequired(false).setMinValue(1).setMaxValue(10))
    .addRoleOption(o => o.setName('required_role').setDescription('Role required to enter').setRequired(false)),
  new SlashCommandBuilder().setName('remind').setDescription('⏰ Set a reminder for yourself')
    .addStringOption(o => o.setName('message').setDescription('What to remind you').setRequired(true))
    .addStringOption(o => o.setName('time').setDescription('When (e.g. 30m, 2h, 1d)').setRequired(true)),
  new SlashCommandBuilder().setName('roll').setDescription('🎲 Roll dice').addStringOption(o => o.setName('dice').setDescription('Dice notation (e.g. 2d6, d20, 3d8+5)').setRequired(false)),
  new SlashCommandBuilder().setName('coinflip').setDescription('🪙 Flip a coin'),
  new SlashCommandBuilder().setName('calc').setDescription('🔢 Calculate an expression').addStringOption(o => o.setName('expression').setDescription('Math expression (e.g. 2+2, 100*5x)').setRequired(true)),
  // UTILITY
  new SlashCommandBuilder().setName('whois').setDescription('🔍 Look up a Discord member').addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder().setName('serverinfo').setDescription('🏠 View server statistics and info'),
  new SlashCommandBuilder().setName('patreon').setDescription('⭐ View Patreon perks and how to support'),
  new SlashCommandBuilder().setName('beacon-setup').setDescription('[ADMIN] Authenticate AEGIS with Beacon Sentinel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('tribes').setDescription('🏛️ List all tribes across the cluster').addStringOption(o => o.setName('server').setDescription('Filter by server name').setRequired(false)),
  new SlashCommandBuilder().setName('player-lookup').setDescription('🔍 Look up a player in Beacon Sentinel').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addStringOption(o => o.setName('name').setDescription('Player name').setRequired(true)),
  new SlashCommandBuilder().setName('sentinel-bans').setDescription('[ADMIN] View Beacon Sentinel ban list').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName('setup-monitoring').setDescription('[ADMIN] Build full live cluster monitoring UI in Discord').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('monitor-refresh').setDescription('[ADMIN] Force-refresh all live server stat channels').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('monitor-add').setDescription('[ADMIN] Add a server to live monitoring').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o => o.setName('name').setDescription('Display name (e.g. The Island)').setRequired(true))
    .addStringOption(o => o.setName('ip').setDescription('Server IP').setRequired(true))
    .addIntegerOption(o => o.setName('port').setDescription('Server port').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji (e.g. 🌿)').setRequired(false))
    .addBooleanOption(o => o.setName('pvp').setDescription('PvP server?').setRequired(false))
    .addBooleanOption(o => o.setName('patreon').setDescription('Patreon-only?').setRequired(false)),
].map(c => c.toJSON());

async function registerCommands() {
  if (!DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) { console.warn('⚠️  CLIENT_ID/GUILD_ID missing'); return; }
  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
    await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), { body: cmds });
    console.log(`✅ ${cmds.length} commands registered`);
  } catch (e) { console.error('❌ Command reg:', e.message); }
}

// ─── WALLET HANDLER ────────────────────────────────────────────
async function handleWallet(i) {
  const sub = i.options.getSubcommand();
  const target = i.options.getUser('user');
  const amount = i.options.getInteger('amount') || 0;
  const reason = i.options.getString('reason') || '';
  const note   = i.options.getString('note') || '';
  const count  = i.options.getInteger('count') || 15;
  const me = i.user;

  if (sub === 'balance') {
    const who = target || me;
    const w = await getWallet(who.id, who.tag || who.username);
    return i.editReply({ embeds: [walletEmbed(`💎 ${who.username}'s Wallet`, w, C.gold).setThumbnail(who.displayAvatarURL())] });
  }
  if (sub === 'deposit') {
    const w = await depositToBank(me.id, me.tag || me.username, amount);
    return i.editReply({ embeds: [walletEmbed(`🏦 Deposited ${amount.toLocaleString()} 💎`, w, C.gr).setDescription(`Moved **${amount.toLocaleString()}** shards wallet → bank.\n*Bank balance cannot be transferred directly — withdraw first.*`)] });
  }
  if (sub === 'withdraw') {
    const w = await withdrawFromBank(me.id, me.tag || me.username, amount);
    return i.editReply({ embeds: [walletEmbed(`💸 Withdrew ${amount.toLocaleString()} 💎`, w, C.cy)] });
  }
  if (sub === 'transfer') {
    if (!target) return i.editReply('⚠️ Specify a recipient.');
    const r = await transferShards(me.id, me.tag || me.username, target.id, target.tag || target.username, amount);
    return i.editReply({ embeds: [base(`➡️ Transferred ${amount.toLocaleString()} 💎`, C.cy).setDescription(`Sent **${amount.toLocaleString()}** shards to **${target.username}**${note ? `\n📝 *"${note}"*` : ''}`).addFields({ name: 'Your wallet', value: `${r.sent.toLocaleString()} 💎`, inline: true }, { name: `${target.username}'s wallet`, value: `${r.received.toLocaleString()} 💎`, inline: true })] });
  }
  if (sub === 'history') {
    const who = target || me;
    if (target && target.id !== me.id && !isAdmin(i.member)) return i.editReply('⛔ Admins only can view others.');
    const rows = await getHistory(who.id, count);
    if (!rows.length) return i.editReply(`📭 No history for **${who.username}** yet.`);
    const lines = rows.map(r => {
      const ico = TX_ICO[r.action] || '💠';
      const sign = ['transfer_in', 'grant', 'earn', 'daily_claim'].includes(r.action) ? '+' : '-';
      const ts = `<t:${Math.floor(new Date(r.created_at).getTime() / 1000)}:R>`;
      return `${ico} **${sign}${r.amount.toLocaleString()}** · ${r.note || r.action} · ${ts}`;
    }).join('\n');
    return i.editReply({ embeds: [base(`🧾 ${who.username}'s History`, C.pl).setDescription(lines.slice(0, 3900))] });
  }
  if (sub === 'leaderboard') {
    const rows = await getLeaderboard(10);
    if (!rows.length) return i.editReply('📭 No wallets yet.');
    const med = ['🥇', '🥈', '🥉'];
    const lines = rows.map((r, idx) => {
      const total = (r.wallet_balance || 0) + (r.bank_balance || 0);
      return `${med[idx] || `**${idx + 1}.**`} **${r.discord_tag || r.discord_id}** — **${total.toLocaleString()}** (💎 ${(r.wallet_balance || 0).toLocaleString()} · 🏦 ${(r.bank_balance || 0).toLocaleString()})`;
    }).join('\n');
    return i.editReply({ embeds: [base('🏆 ClaveShard Leaderboard', C.gold).setDescription(lines)] });
  }
  if (sub === 'supply') {
    const s = await getSupply();
    return i.editReply({ embeds: [base('📊 ClaveShard Supply', C.pk).addFields({ name: '💎 In Wallets', value: s.walletTotal.toLocaleString(), inline: true }, { name: '🏦 In Banks', value: s.bankTotal.toLocaleString(), inline: true }, { name: '∑ Total', value: (s.walletTotal + s.bankTotal).toLocaleString(), inline: true }, { name: '👥 Holders', value: s.holders + ' members', inline: true })] });
  }
  if (sub === 'grant') {
    if (!isAdmin(i.member)) return i.editReply('⛔ Admins only.');
    if (!target) return i.editReply('⚠️ Specify target.');
    const w = await grantShards(target.id, target.tag || target.username, amount, reason || 'Admin grant', me.id, me.tag || me.username);
    try { await target.send({ embeds: [base('💎 ClaveShard Received!', C.gr).setDescription(`**${me.username}** granted you **${amount.toLocaleString()} 💎 ClaveShard**\n📝 *${reason || 'Admin grant'}*`)] }); } catch {}
    return i.editReply({ embeds: [walletEmbed(`🎁 Granted ${amount.toLocaleString()} 💎 to ${target.username}`, w, C.gr).addFields({ name: '📝 Reason', value: reason || 'No reason' })] });
  }
  if (sub === 'deduct') {
    if (!isAdmin(i.member)) return i.editReply('⛔ Admins only.');
    if (!target) return i.editReply('⚠️ Specify target.');
    const w = await deductShards(target.id, target.tag || target.username, amount, reason || 'Admin deduct', me.id, me.tag || me.username);
    return i.editReply({ embeds: [walletEmbed(`⬇️ Deducted ${amount.toLocaleString()} 💎 from ${target.username}`, w, C.rd).addFields({ name: '📝 Reason', value: reason || 'No reason' })] });
  }
}

// ─── MAIN INTERACTION HANDLER ──────────────────────────────────
bot.on(Events.InteractionCreate, async i => {
  if (!i.isChatInputCommand()) return;
  const cmd = i.commandName;
  try { await i.deferReply(); } catch { return; }

  try {
    // ── ECONOMY ──
    if (cmd === 'wallet' || cmd === 'curr') return await handleWallet(i);

    if (cmd === 'clvsd') {
      if (!isAdmin(i.member)) return i.editReply('⛔ Admins only.');
      const sub = i.options.getSubcommand();
      const target = i.options.getUser('user');
      const amount = i.options.getInteger('amount') || 0;
      const reason = i.options.getString('reason') || 'Admin action';
      const me = i.user;
      if (sub === 'grant') {
        const w = await grantShards(target.id, target.tag || target.username, amount, reason, me.id, me.tag || me.username);
        try { await target.send({ embeds: [base('💎 Shards Received!', C.gr).setDescription(`**${me.username}** granted you **${amount.toLocaleString()} 💎**\n📝 *${reason}*`)] }); } catch {}
        return i.editReply({ embeds: [walletEmbed(`🎁 Granted ${amount.toLocaleString()} to ${target.username}`, w, C.gr).addFields({ name: '📝 Reason', value: reason, inline: true }, { name: '👮 By', value: me.username, inline: true })] });
      }
      if (sub === 'deduct') {
        const w = await deductShards(target.id, target.tag || target.username, amount, reason, me.id, me.tag || me.username);
        return i.editReply({ embeds: [walletEmbed(`⬇️ Deducted ${amount.toLocaleString()} from ${target.username}`, w, C.rd).addFields({ name: '📝 Reason', value: reason })] });
      }
      if (sub === 'check') {
        const w = await getWallet(target.id, target.tag || target.username);
        const rows = await getHistory(target.id, 5);
        const embed = walletEmbed(`🔍 Admin — ${target.username}`, w, C.cy).setThumbnail(target.displayAvatarURL());
        if (rows.length) embed.addFields({ name: '🕓 Last 5', value: rows.map(r => `${TX_ICO[r.action] || '💠'} **${['transfer_in', 'grant', 'earn', 'daily_claim'].includes(r.action) ? '+' : '-'}${r.amount.toLocaleString()}** · ${r.note || r.action}`).join('\n') });
        return i.editReply({ embeds: [embed] });
      }
      if (sub === 'set') {
        await getWallet(target.id, target.tag || target.username);
        const { data: cur } = await sb.from('aegis_wallets').select('wallet_balance').eq('discord_id', target.id).single();
        const prev = cur?.wallet_balance || 0;
        const { data, error } = await sb.from('aegis_wallets').update({ wallet_balance: amount, updated_at: new Date().toISOString() }).eq('discord_id', target.id).select().single();
        if (error) return i.editReply(`⚠️ ${error.message}`);
        await logTx(target.id, target.tag || target.username, 'admin_set', Math.abs(amount - prev), amount, `Set to ${amount} (was ${prev}) — ${reason}`, me.id, me.tag || me.username);
        return i.editReply({ embeds: [base(`🔧 Wallet Set — ${target.username}`, C.pk).addFields({ name: '⬅️ Previous', value: `${prev.toLocaleString()} 💎`, inline: true }, { name: '➡️ New', value: `${amount.toLocaleString()} 💎`, inline: true }, { name: '📝 Reason', value: reason })] });
      }
      if (sub === 'top') {
        const rows = await getLeaderboard(15);
        const med = ['🥇', '🥈', '🥉'];
        const lines = rows.map((r, idx) => `${med[idx] || `**${idx + 1}.**`} **${r.discord_tag || r.discord_id}** — **${((r.wallet_balance || 0) + (r.bank_balance || 0)).toLocaleString()}**`).join('\n');
        return i.editReply({ embeds: [base('🏆 Top 15 Holders', C.gold).setDescription(lines || 'No wallets yet.')] });
      }
      if (sub === 'stats') {
        const s = await getSupply();
        const { data: recent } = await sb.from('aegis_wallet_ledger').select('action,amount,created_at').order('created_at', { ascending: false }).limit(5);
        const embed = base('📊 Economy Stats', C.pk).addFields({ name: '💎 Wallets', value: s.walletTotal.toLocaleString(), inline: true }, { name: '🏦 Banks', value: s.bankTotal.toLocaleString(), inline: true }, { name: '∑ Total', value: (s.walletTotal + s.bankTotal).toLocaleString(), inline: true }, { name: '👥 Holders', value: s.holders + '', inline: true });
        if (recent?.length) embed.addFields({ name: '🕓 Recent', value: recent.map(r => `${TX_ICO[r.action] || '💠'} **${r.action}** · ${r.amount.toLocaleString()}`).join('\n') });
        return i.editReply({ embeds: [embed] });
      }
    }

    if (cmd === 'weekly') {
      try {
        const { data: w, amount, streak, bonus } = await claimDaily(i.user.id, i.user.tag || i.user.username);
        const streakBar = '🔥'.repeat(Math.min(streak, 10)) + (streak > 10 ? `+${streak - 10}` : '');
        return i.editReply({ embeds: [base('🌟 Weekly ClaveShard Claimed!', C.gold)
          .setThumbnail(i.user.displayAvatarURL())
          .setDescription(`**${i.user.username}** claimed their weekly ClaveShard reward!`)
          .addFields(
            { name: '💎 Claimed', value: `**+${amount.toLocaleString()} shards**`, inline: true },
            { name: '🔥 Weekly Streak', value: `Week ${streak}`, inline: true },
            { name: '💰 Wallet Balance', value: `${(w.wallet_balance || 0).toLocaleString()} shards`, inline: true },
          )
          .setFooter({ text: `${streakBar} · Week ${streak} — Come back in 7 days!` })
        ] });
      } catch (e) { return i.editReply(e.message); }
    }

    if (cmd === 'order') {
      const tier = i.options.getInteger('tier'), plat = i.options.getString('platform'), srv = i.options.getString('server'), notes = i.options.getString('notes') || 'None';
      await axios.post(`${API_BASE}/orders`, { username: i.user.username, discordId: i.user.id, discordTag: i.user.tag || i.user.username, item: `Tier ${tier} ClaveShard Pack`, cost: 'See website', mapName: srv, specifics: `Platform: ${plat}\n${notes}` }).catch(() => {});
      return i.editReply({ embeds: [base('📦 Order Received!', C.gold)
        .setDescription(`Your Tier **${tier}** order has been submitted to the Council queue.`)
        .addFields(
          { name: '🎮 Platform', value: plat, inline: true }, { name: '🗺️ Server', value: srv, inline: true },
          { name: '📝 Notes', value: notes },
          { name: '💳 Payment', value: '**$TheConclaveDominion** CashApp\n**$ANLIKESEF** Chime\n\nInclude your username in the payment note!' },
          { name: '⏱️ Fulfillment', value: 'Council fulfills orders within 24-72 hours.' }
        )
      ] });
    }

    if (cmd === 'fulfill') {
      if (!isAdmin(i.member)) return i.editReply('⛔ Admins only.');
      const ref = i.options.getString('ref').toUpperCase();
      try {
        await axios.post(`${API_BASE}/api/orders/${ref}/fulfill`, { note: i.options.getString('note') || 'Fulfilled' }, { headers: { Authorization: `Bearer ${ADMIN_TOKEN || ''}` } });
        return i.editReply(`✅ Order **${ref}** marked as fulfilled.`);
      } catch { return i.editReply(`⚠️ Could not update **${ref}** — check the admin panel.`); }
    }

    if (cmd === 'shard') return i.editReply({ embeds: [base('💠 ClaveShard Shop', C.gold)
      .setDescription('Price = **Tier # in Shards per item**. Each tier item costs its tier number in ClaveShard.\nPay via **$TheConclaveDominion** CashApp or **$ANLIKESEF** Chime, then `/order`.\n🌐 theconclavedominion.com/shop.html')
      .addFields(
        { name: '💠 T1 · 1 Shard/Item', value: 'L600 Dino · Ammo · Coloring · Kibble · 100% Imprint · Structures · Cryofridge · ConCoins', inline: false },
        { name: '💎 T2 · 2 Shards/Item', value: 'L600 Vanilla & Modded Dino · L450 Shiny · L450 Shiny Shoulder · 60 Storage Boxes', inline: false },
        { name: '✨ T3 · 3 Shards/Item', value: 'Tek Blueprint · Shiny Essence · 200% Imprint · L500 T1 Shiny', inline: false },
        { name: '🔥 T5 · 5 Shards/Item', value: 'Boss Defeat Cmd · L1000 Dinos · Shiny Essence · Small Bundle (50k Resources) · Imprint Kibble', inline: false },
        { name: '⚔️ T6 · 6 | 🌌 T8 · 8', value: 'T6: Boss Ready Bundle · 300% Imprint · Max XP\nT8: 100,000 Resources Bundle', inline: false },
        { name: '🛡️ T10 · 10 Shards/Item', value: 'Astral Dino · Platform · Shiny Essence Set · Color Party (10 Dinos) · L1100 Breeding Pair', inline: false },
        { name: '🌠 T12 · 12 | 👑 T15 · 15', value: 'T12: 200k Resources\nT15: 30k Element · L1250 Multi-Class Dino · 300k Resources', inline: false },
        { name: '🏰 T20 · 20 | 💰 T30 · 30', value: 'T20: Base Expansion (+1 Behemoth Gate)\nT30: 1.5M Resources Admin Refill', inline: false },
        { name: '🛡️ Dino Insurance · Open Ticket', value: 'One-time use · Must be named · Backup may not save · Special cases may apply', inline: false },
      )
    ] });

    if (cmd === 'shop') {
      try {
        const r = await axios.get(`${API_BASE}/api/shop`, { timeout: 6000 });
        const items = r.data.items || [];
        if (!items.length) return i.editReply({ embeds: [base('🛍 ClaveShard Shop', C.gold).setDescription('Shop is being stocked. Visit theconclavedominion.com/shop.html or use `/shard`.')] });
        const fields = items.slice(0, 10).map(item => ({ name: `${item.image_emoji || '💎'} ${item.name}`, value: `${(item.description || '').slice(0, 60)}\n**${item.price_label || (item.price === 0 ? 'Free' : '$' + item.price)}**`, inline: true }));
        return i.editReply({ embeds: [base('🛍 ClaveShard Shop', C.gold).setDescription('Use `/order [tier]` to buy.\nFull catalog: theconclavedominion.com/shop.html').addFields(...fields)] });
      } catch {
        return i.editReply({ embeds: [base('🛍 ClaveShard Shop', C.gold).setDescription('Use `/shard` for tier list or visit theconclavedominion.com/shop.html')] });
      }
    }

    // ── AI / INFO ──
    if (cmd === 'aegis' || cmd === 'ask') {
      const w = checkRate(i.user.id, 6000);
      if (w) return i.editReply(`⏳ Slow down, Survivor. Retry in ${w}s.`);
      const r = await askAegis(i.options.getString('question'), i.user.id);
      return i.editReply(r.slice(0, 1990));
    }

    if (cmd === 'forget') {
      clearHist(i.user.id);
      return i.editReply('🧠 Your AEGIS conversation history has been cleared. Fresh start, Survivor.');
    }

    if (cmd === 'servers') {
      const servers = await fetchServers();
      const filter = i.options.getString('map')?.toLowerCase();
      const list = filter ? servers.filter(s => s.name.toLowerCase().includes(filter)) : servers;
      if (!list.length) return i.editReply('⚠️ Server API unreachable or no results for that filter.');
      const on = list.filter(s => s.status === 'online');
      const off = list.filter(s => s.status !== 'online');
      const lines = [
        ...on.map(s => `🟢 **${s.name}** · ${s.players || 0}/${s.maxPlayers || 20} players · \`${s.ip}:${s.port}\`${s.mode === 'PvP' ? ' ⚔️' : s.mode === 'Patreon' ? ' ⭐' : ''}`),
        ...off.map(s => `🔴 **${s.name}** · Offline`)
      ].join('\n');
      return i.editReply({ embeds: [base('⚔️ TheConclave — Live Cluster', C.gold)
        .setDescription(lines)
        .addFields({ name: '✅ Online', value: `${on.length}/${list.length}`, inline: true }, { name: '⏰ Updated', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true })
      ] });
    }

    if (cmd === 'map') {
      const MAPS = {
        island:     { title: '🌿 The Island',       ip: '217.114.196.102:5390', desc: 'Classic ARK experience. Beginner-friendly, all biomes, starter bosses.', tags: 'Beginner · All Resources · Boss Arenas', pvp: false, patreon: false },
        volcano:    { title: '🌋 Volcano',           ip: '217.114.196.59:5050',  desc: 'High-resource volcanic biome. Challenging terrain with rich mineral rewards.', tags: 'Intermediate · High Resources', pvp: false, patreon: false },
        extinction: { title: '🌑 Extinction',        ip: '31.214.196.102:6440',  desc: 'End-game content. Titan bosses, corrupted dinos, Element farming.', tags: 'End-Game · Titans · Element', pvp: false, patreon: false },
        center:     { title: '🏔️ The Center',        ip: '31.214.163.71:5120',   desc: 'Floating islands and vast ocean caves. Unique biomes and boss arena.', tags: 'Mid-Game · Unique Biomes', pvp: false, patreon: false },
        lostcolony: { title: '🪐 Lost Colony',       ip: '217.114.196.104:5150', desc: 'Post-colony world with aberrant creatures and unique loot.', tags: 'Custom · Unique Spawns', pvp: false, patreon: false },
        astraeos:   { title: '✨ Astraeos',           ip: '217.114.196.9:5320',   desc: 'Celestial landscape with rare crystal resources and spectral creatures.', tags: 'Custom · Rare Resources', pvp: false, patreon: false },
        valguero:   { title: '🏞️ Valguero',          ip: '85.190.136.141:5090',  desc: 'Massive aberration zones and Deinonychus nests. Beautiful landscape.', tags: 'Mid-Game · Deinonychus · Aberration Zone', pvp: false, patreon: false },
        scorched:   { title: '☀️ Scorched Earth',    ip: '217.114.196.103:5240', desc: 'Harsh desert survival. Wyverns, Manticore boss, dust storms.', tags: 'Wyverns · Desert · Manticore', pvp: false, patreon: false },
        aberration: { title: '⚔️ Aberration',        ip: '217.114.196.80:5540',  desc: 'Underground PvP server. Highest risk, highest reward. Rock Drakes and Reapers.', tags: '⚔️ PvP · Rock Drakes · Reapers', pvp: true, patreon: false },
        amissa:     { title: '⭐ Amissa',             ip: '217.114.196.80:5180',  desc: 'Exclusive Patreon-only map. Premium experience, small community, high quality.', tags: '⭐ Patreon Exclusive · Premium', pvp: false, patreon: true },
      };
      const m = MAPS[i.options.getString('name')];
      if (!m) return i.editReply('⚠️ Map not found.');
      const embed = base(m.title, m.pvp ? C.rd : m.patreon ? C.gold : C.cy)
        .addFields(
          { name: '🌐 Connect', value: `\`${m.ip}\``, inline: true },
          { name: '🏷️ Type', value: m.tags, inline: true },
          { name: '📝 About', value: m.desc },
        );
      if (m.pvp) embed.addFields({ name: '⚠️ PvP Notice', value: 'This server has PvP enabled. Full hazmat required underground. Highest risk in the cluster.' });
      if (m.patreon) embed.addFields({ name: '⭐ Patreon Required', value: 'Elite Patron ($20/mo) access only. Visit patreon.com/theconclavedominion' });
      embed.addFields({ name: '🔗 How to Join', value: 'ARK → Sessions → Join by IP → paste the IP above.' });
      return i.editReply({ embeds: [embed] });
    }

    if (cmd === 'info') return i.editReply({ embeds: [base('⚔️ TheConclave Dominion', C.pl)
      .setDescription('5x crossplay ARK: Survival Ascended — all platforms, all maps, one community.')
      .addFields(
        { name: '🌍 Crossplay', value: 'Xbox · PlayStation · PC', inline: true },
        { name: '⚡ Rates', value: '5x XP · Harvest · Taming · Breed', inline: true },
        { name: '⚙️ Config', value: '1M Weight · No Fall Dmg · Max Dino 350', inline: true },
        { name: '🗺️ 10 Maps', value: 'Island · Volcano · Extinction · Center · Lost Colony · Astraeos · Valguero · Scorched · Aberration (PvP) · Amissa (Patreon)' },
        { name: '🔧 Mods', value: 'Death Inventory Keeper · ARKomatic · Awesome Spyglass · Teleporter' },
        { name: '💎 Economy', value: '`/weekly` 3 free shards/week · `/wallet balance` · `/order` to shop' },
        { name: '🌐 Links', value: '[Website](https://theconclavedominion.com) · [Discord](https://discord.gg/theconclave) · [Patreon](https://patreon.com/theconclavedominion)' },
      )
    ] });

    if (cmd === 'rules') return i.editReply({ embeds: [base('📜 TheConclave Codex', C.pl)
      .setDescription('All members must follow these rules. Violations result in Warning → Timeout → Ban.')
      .addFields(
        { name: '1. Respect', value: 'No harassment, hate speech, racism, or toxic targeting. Community first.' },
        { name: '2. No Griefing', value: 'Do not destroy or steal from others. PvE is PvE everywhere except Aberration.' },
        { name: '3. No Cheating', value: 'No mesh builds, duplication, or exploit abuse. Instant permanent ban.' },
        { name: '4. Limits', value: 'Max 500 tamed dinos per tribe. Reasonable base footprint. Abandoned structures demolished after 2 weeks.' },
        { name: '5. Staff Final', value: 'Council rulings are final. Take disputes to #support-tickets privately.' },
        { name: '6. No Advertising', value: 'No other server promotion without explicit Council approval.' },
        { name: '⚠️ Penalties', value: 'Warning → 24h Timeout → 7d Timeout → Permanent Ban\nCheating/hate speech = immediate permanent ban.' },
        { name: '🌐 Full Codex', value: 'theconclavedominion.com/terms.html' },
      )
    ] });

    if (cmd === 'forums') return i.editReply({ embeds: [base('🗂️ Forum Panels', C.cy)
      .addFields(
        { name: '🌋 ARK Help', value: '#ark-help · #taming-guides · #base-builds · #mod-help', inline: true },
        { name: '💬 Community', value: '#general · #introductions · #media · #off-topic', inline: true },
        { name: '💎 ClaveShard', value: '#shard-requests · #trade-post · #giveaways', inline: true },
        { name: '👁️ Council', value: '#patch-notes · #server-updates · #announcements', inline: true },
        { name: '🎮 ARK Servers', value: '#server-status · #connection-help · #cluster-chat', inline: true },
        { name: '🎫 Support', value: '#open-a-ticket · #report-a-player · #appeals', inline: true },
      )
    ] });

    if (cmd === 'group') {
      const G = {
        ark:        { label: '🌋 ARK', ch: ['ark-general', 'ark-servers', 'ark-trading', 'ark-help', 'ark-media', 'ark-voice'] },
        council:    { label: '👁️ Council', ch: ['announcements', 'council-chamber', 'mod-log', 'audit-log'] },
        community:  { label: '💬 Community', ch: ['general', 'introductions', 'media', 'events', 'off-topic'] },
        claveshard: { label: '💎 ClaveShard', ch: ['shard-shop', 'order-queue', 'fulfilled-orders', 'economy-updates'] },
      };
      const g = G[i.options.getString('name')];
      if (!g) return i.editReply('Group not found.');
      return i.editReply({ embeds: [base(g.label, C.cy).setDescription(g.ch.map(c => `• <#${c}>`).join('\n'))] });
    }

    if (cmd === 'help') {
      const categories = [
        { name: '💎 Economy', value: '`/wallet` `/curr` `/clvsd` `/weekly` `/order` `/shard` `/shop` `/fulfill`' },
        { name: '🧠 AI & Info', value: '`/aegis` `/ask` `/forget` `/servers` `/map` `/info` `/rules` `/forums` `/group`' },
        { name: '🎖️ Profile', value: '`/profile` `/rank` `/rep` `/whois` `/serverinfo`' },
        { name: '📢 Moderation', value: '`/announce` `/event` `/warn` `/ban` `/timeout` `/role` `/ticket` `/report`' },
        { name: '🎲 Tools', value: '`/poll` `/giveaway` `/remind` `/roll` `/coinflip` `/calc`' },
        { name: '🔗 Links', value: '[Website](https://theconclavedominion.com) · [Discord](https://discord.gg/theconclave) · [Patreon](https://patreon.com/theconclavedominion)' },
      ];
      return i.editReply({ embeds: [base('📖 AEGIS Command Reference', C.pl).setDescription(`**${cmds.length} commands** available in TheConclave Dominion.\nUse \`/aegis [question]\` to ask me anything!`).addFields(...categories)] });
    }

    if (cmd === 'ping') {
      const start = Date.now();
      let apiMs = '—';
      try {
        const t = Date.now(); await axios.get(`${API_BASE}/health`, { timeout: 5000 }); apiMs = `${Date.now() - t}ms`;
      } catch {}
      const wsLatency = bot.ws.ping;
      const embed = base('🏓 Pong!', C.gr)
        .addFields(
          { name: '💓 WS Heartbeat', value: `${wsLatency}ms`, inline: true },
          { name: '🌐 API Latency', value: apiMs, inline: true },
          { name: '⚡ Command', value: `${Date.now() - start}ms`, inline: true },
          { name: '📊 Status', value: wsLatency < 100 ? '🟢 Excellent' : wsLatency < 200 ? '🟡 Good' : '🔴 Degraded', inline: true },
        );
      return i.editReply({ embeds: [embed] });
    }

    // ── PROFILE / SOCIAL ──
    if (cmd === 'profile') {
      const target = i.options.getUser('user') || i.user;
      try {
        const member = await i.guild.members.fetch(target.id).catch(() => null);
        let wallet = null;
        if (sb && sbOk()) { try { const { data } = await sb.from('aegis_wallets').select('*').eq('discord_id', target.id).single(); wallet = data; } catch {} }
        const roles = member?.roles.cache.filter(r => r.id !== i.guild.id).sort((a, b) => b.position - a.position).first(5).map(r => `<@&${r.id}>`).join(' ') || 'None';
        const joinedDays = member?.joinedAt ? Math.floor((Date.now() - member.joinedAt) / (1000 * 60 * 60 * 24)) : 0;
        const embed = base(`🎖️ ${target.username}'s Profile`, C.pl)
          .setThumbnail(target.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: '📅 Member Since', value: member?.joinedAt ? `<t:${Math.floor(member.joinedAt / 1000)}:D>` : 'Unknown', inline: true },
            { name: '📆 Days in Dominion', value: `${joinedDays} days`, inline: true },
            { name: '🆔 Discord ID', value: target.id, inline: true },
            { name: '🎖️ Top Roles', value: roles },
          );
        if (wallet) {
          const total = (wallet.wallet_balance || 0) + (wallet.bank_balance || 0);
          embed.addFields(
            { name: '💎 Wallet', value: `${(wallet.wallet_balance || 0).toLocaleString()}`, inline: true },
            { name: '🏦 Bank', value: `${(wallet.bank_balance || 0).toLocaleString()}`, inline: true },
            { name: '💰 Total Shards', value: `${total.toLocaleString()}`, inline: true },
            { name: '🔥 Weekly Streak', value: `${wallet.daily_streak || 0} days`, inline: true },
            { name: '📈 Lifetime Earned', value: `${(wallet.lifetime_earned || 0).toLocaleString()}`, inline: true },
            { name: '📉 Lifetime Spent', value: `${(wallet.lifetime_spent || 0).toLocaleString()}`, inline: true },
          );
        }
        if (member?.nickname) embed.addFields({ name: '🏷️ Nickname', value: member.nickname, inline: true });
        return i.editReply({ embeds: [embed] });
      } catch (e) { return i.editReply(`⚠️ ${e.message}`); }
    }

    if (cmd === 'rank') {
      if (!sb || !sbOk()) return i.editReply('⚠️ Database unavailable.');
      const { data: all } = await sb.from('aegis_wallets').select('discord_id,wallet_balance,bank_balance').order('wallet_balance', { ascending: false });
      const myWallet = await getWallet(i.user.id, i.user.tag || i.user.username);
      const pos = all?.findIndex(w => w.discord_id === i.user.id) ?? -1;
      const total = (myWallet.wallet_balance || 0) + (myWallet.bank_balance || 0);
      const rankTitle = total >= 10000 ? '⚜️ Shard Lord' : total >= 5000 ? '💎 Shard Master' : total >= 1000 ? '🔷 Shard Knight' : total >= 500 ? '🔹 Shard Warrior' : '⚪ Shard Novice';
      return i.editReply({ embeds: [base('📊 Your Rank', C.gold)
        .setThumbnail(i.user.displayAvatarURL())
        .setDescription(`**${i.user.username}**\n${rankTitle}`)
        .addFields(
          { name: '💎 Wallet', value: `${(myWallet.wallet_balance || 0).toLocaleString()}`, inline: true },
          { name: '🏦 Bank', value: `${(myWallet.bank_balance || 0).toLocaleString()}`, inline: true },
          { name: '💰 Total', value: `${total.toLocaleString()}`, inline: true },
          { name: '🏆 Server Rank', value: pos >= 0 ? `#${pos + 1} of ${all.length}` : 'Unranked', inline: true },
          { name: '🔥 Weekly Streak', value: `${myWallet.daily_streak || 0} days`, inline: true },
        )
      ] });
    }

    if (cmd === 'rep') {
      const target = i.options.getUser('user');
      const reason = i.options.getString('reason') || 'Being an awesome community member!';
      if (target.id === i.user.id) return i.editReply('❌ You cannot rep yourself!');
      if (target.bot) return i.editReply('❌ Bots don\'t need reputation... yet.');
      // Log rep as a small shard bonus
      if (sb && sbOk()) {
        try {
          await grantShards(target.id, target.tag || target.username, 10, `Rep from ${i.user.username}: ${reason}`, i.user.id, i.user.tag || i.user.username);
          try { await target.send({ embeds: [base('⭐ You\'ve Been Repped!', C.gold).setDescription(`**${i.user.username}** gave you a reputation point!\n📝 *"${reason}"*\n\n+10 ClaveShard bonus for being awesome!`)] }); } catch {}
        } catch {}
      }
      return i.editReply({ embeds: [base('⭐ Rep Given!', C.gold).setDescription(`**${i.user.username}** repped **${target.username}**!\n📝 *"${reason}"*`).addFields({ name: '💎 Bonus', value: '+10 ClaveShard to their wallet!', inline: true })] });
    }

    // ── MODERATION ──
    if (cmd === 'announce') {
      if (!isAdmin(i.member)) return i.editReply('⛔ Admins only.');
      const embed = new EmbedBuilder().setTitle(`📢 ${i.options.getString('title')}`).setDescription(i.options.getString('message')).setColor(C.gold).setFooter(FT).setTimestamp().setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
      const ch = i.guild.channels.cache.find(c => c.name === 'announcements') || i.channel;
      try { await ch.send({ content: i.options.getBoolean('ping') ? '@everyone' : undefined, embeds: [embed] }); }
      catch { await i.channel.send({ embeds: [embed] }); }
      // Save to API
      try { await axios.post(`${API_BASE}/api/announcements`, { title: i.options.getString('title'), body: i.options.getString('message'), author: i.user.username }, { headers: { Authorization: `Bearer ${ADMIN_TOKEN || ''}` } }); } catch {}
      return i.editReply(`✅ Announcement sent to ${ch}!`);
    }

    if (cmd === 'event') {
      if (!isAdmin(i.member)) return i.editReply('⛔ Admins only.');
      const title = i.options.getString('title');
      const description = i.options.getString('description');
      const date = i.options.getString('date') || 'Date TBD';
      const ping = i.options.getBoolean('ping') || false;
      try { await axios.post(`${API_BASE}/api/events`, { title, description, event_date: null, created_by: i.user.username }, { headers: { Authorization: `Bearer ${ADMIN_TOKEN || ''}` } }); } catch {}
      const embed = base(`📅 ${title}`, C.gold)
        .setDescription(description)
        .addFields({ name: '📆 When', value: date, inline: true }, { name: '📌 By', value: i.user.username, inline: true })
        .setAuthor({ name: 'TheConclave Event', iconURL: i.user.displayAvatarURL() })
        .setFooter({ text: 'React with 🎉 to show interest! • TheConclave Dominion' });
      const annCh = i.guild.channels.cache.find(c => c.name === 'announcements' || c.name === 'events') || i.channel;
      const msg = await annCh.send({ content: ping ? '@everyone' : undefined, embeds: [embed] });
      try { await msg.react('🎉'); } catch {}
      return i.editReply(`✅ Event posted to ${annCh}!`);
    }

    if (cmd === 'warn') {
      if (!isMod(i.member)) return i.editReply('⛔ Moderators only.');
      const target = i.options.getUser('user'), reason = i.options.getString('reason');
      const embed = base('⚠️ Formal Warning Issued', C.rd).setDescription(`**${target.username}** was warned by **${i.user.username}**`).addFields({ name: '📝 Reason', value: reason }, { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>` });
      try { await target.send({ embeds: [base('⚠️ Warning — TheConclave Dominion', C.rd).setDescription(`You received a formal warning.\n📝 **${reason}**\n\nFurther violations may result in a timeout or ban.`)] }); } catch {}
      try { const modCh = i.guild.channels.cache.find(c => c.name === 'mod-log'); if (modCh) await modCh.send({ embeds: [embed] }); } catch {}
      if (sb && sbOk()) (async () => { try { await sb.from('aegis_wallet_ledger').insert({ discord_id: target.id, action: 'warn', amount: 0, note: reason, actor_discord_id: i.user.id, actor_tag: i.user.tag || i.user.username }); } catch {} })();
      return i.editReply({ embeds: [embed] });
    }

    if (cmd === 'ban') {
      if (!isMod(i.member)) return i.editReply('⛔ Moderators only.');
      const t = i.options.getUser('user'), r = i.options.getString('reason');
      try {
        await i.guild.bans.create(t.id, { reason: `${i.user.username}: ${r}`, deleteMessageSeconds: 86400 });
        try { const modCh = i.guild.channels.cache.find(c => c.name === 'mod-log'); if (modCh) await modCh.send({ embeds: [base('🔨 Member Banned', C.rd).addFields({ name: '👤 User', value: `${t.username} (${t.id})`, inline: true }, { name: '👮 By', value: i.user.username, inline: true }, { name: '📝 Reason', value: r })] }); } catch {}
        return i.editReply(`✅ **${t.username}** has been banned. Reason: ${r}`);
      } catch (e) { return i.editReply(`⚠️ Ban failed: ${e.message}`); }
    }

    if (cmd === 'timeout') {
      if (!isMod(i.member)) return i.editReply('⛔ Moderators only.');
      const t = i.options.getUser('user'), d = i.options.getString('duration'), r = i.options.getString('reason') || 'No reason';
      const MS = { '5m': 300000, '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000 };
      try {
        const m = await i.guild.members.fetch(t.id);
        await m.timeout(MS[d] || 3600000, r);
        return i.editReply(`✅ **${t.username}** timed out for **${d}**. Reason: ${r}`);
      } catch (e) { return i.editReply(`⚠️ ${e.message}`); }
    }

    if (cmd === 'role') {
      if (!isAdmin(i.member)) return i.editReply('⛔ Admins only.');
      const t = i.options.getUser('user'), role = i.options.getRole('role'), act = i.options.getString('action');
      try {
        const m = await i.guild.members.fetch(t.id);
        if (act === 'add') { await m.roles.add(role); return i.editReply(`✅ Added **${role.name}** to **${t.username}**.`); }
        else { await m.roles.remove(role); return i.editReply(`✅ Removed **${role.name}** from **${t.username}**.`); }
      } catch (e) { return i.editReply(`⚠️ ${e.message}`); }
    }

    if (cmd === 'ticket') {
      if (!isAdmin(i.member)) return i.editReply('⛔ Admins only.');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('open_ticket').setLabel('🎫 Open a Ticket').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setLabel('📋 View Rules').setStyle(ButtonStyle.Link).setURL('https://theconclavedominion.com/terms.html'),
      );
      await i.channel.send({ embeds: [base('🎫 Support Center', C.cy)
        .setDescription('Need help? Click below to open a private support ticket.\nCouncil responds within 24 hours.')
        .addFields(
          { name: '🆘 General Support', value: 'Server issues, questions, help', inline: true },
          { name: '💎 ClaveShard Issues', value: 'Order problems, economy disputes', inline: true },
          { name: '🚨 Report a Player', value: 'Rules violations, griefing, toxicity', inline: true },
        )
      ], components: [row] });
      return i.editReply('✅ Ticket panel posted.');
    }

    if (cmd === 'report') {
      const player = i.options.getUser('player');
      const reason = i.options.getString('reason');
      const srv = i.options.getString('server') || 'Not specified';
      const ref = `RPT-${Date.now().toString(36).toUpperCase()}`;
      const embed = base('🚨 Player Report', C.rd)
        .setDescription(`**Reported by:** ${i.user.username} (${i.user.id})`)
        .addFields(
          { name: '👤 Reported', value: player ? `${player.username} (${player.id})` : 'Not specified', inline: true },
          { name: '🗺️ Server', value: srv, inline: true },
          { name: '📝 Reason', value: reason },
          { name: '📌 Ref', value: ref },
          { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>` },
        );
      try { const modCh = i.guild.channels.cache.find(c => c.name === 'mod-log' || c.name === 'council-chamber'); if (modCh) await modCh.send({ embeds: [embed] }); } catch {}
      return i.editReply({ embeds: [base('✅ Report Submitted', C.gr).setDescription('Your report has been logged and forwarded to Council.').addFields({ name: '📌 Reference', value: ref }, { name: '⏱️ Response Time', value: 'Typically within 24 hours' }, { name: '📬 Need urgent help?', value: 'Use `/ticket` to open a private support channel' })], ephemeral: true });
    }

    // ── TOOLS ──
    if (cmd === 'poll') {
      if (!isAdmin(i.member)) return i.editReply('⛔ Admins only.');
      const opts = i.options.getString('options').split('|').map(o => o.trim()).filter(Boolean).slice(0, 10);
      if (opts.length < 2) return i.editReply('⚠️ Need at least 2 options separated by |');
      const L = ['🇦', '🇧', '🇨', '🇩', '🇪', '🇫', '🇬', '🇭', '🇮', '🇯'];
      const embed = base(`📊 ${i.options.getString('question')}`, C.cy)
        .setDescription(opts.map((o, j) => `${L[j]} **${o}**`).join('\n\n'))
        .setFooter({ text: `Poll by ${i.user.username} • TheConclave Dominion` });
      const msg = await i.editReply({ embeds: [embed], fetchReply: true });
      for (let j = 0; j < opts.length; j++) { try { await msg.react(L[j]); } catch {} }
    }

    if (cmd === 'giveaway') {
      if (!isAdmin(i.member)) return i.editReply('⛔ Admins only.');
      const prize = i.options.getString('prize');
      const dur = parseInt(i.options.getString('duration') || '86400');
      const winners = i.options.getInteger('winners') || 1;
      const reqRole = i.options.getRole('required_role');
      const endsAt = new Date(Date.now() + dur * 1000);
      const embed = new EmbedBuilder()
        .setTitle('🎁 GIVEAWAY')
        .setColor(C.gold)
        .setDescription(`**Prize:** ${prize}\n\nReact with 🎉 to enter!${reqRole ? `\n\n⚠️ **Required role:** <@&${reqRole.id}>` : ''}`)
        .addFields(
          { name: '🏆 Winners', value: String(winners), inline: true },
          { name: '⏰ Ends', value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
          { name: '📌 Hosted By', value: i.user.username, inline: true },
        )
        .setTimestamp(endsAt).setFooter(FT);
      const msg = await i.editReply({ embeds: [embed], fetchReply: true });
      try { await msg.react('🎉'); } catch {}
    }

    if (cmd === 'remind') {
      const message = i.options.getString('message');
      const timeStr = i.options.getString('time');
      const parseTime = (str) => {
        const n = parseFloat(str);
        if (str.endsWith('d')) return n * 24 * 60 * 60 * 1000;
        if (str.endsWith('h')) return n * 60 * 60 * 1000;
        if (str.endsWith('m')) return n * 60 * 1000;
        if (str.endsWith('s')) return n * 1000;
        return null;
      };
      const ms = parseTime(timeStr);
      if (!ms || ms < 10000 || ms > 7 * 24 * 60 * 60 * 1000) return i.editReply('⚠️ Time must be between 10s and 7d. Examples: `30m`, `2h`, `1d`');
      const fireAt = new Date(Date.now() + ms);
      await i.editReply({ embeds: [base('⏰ Reminder Set!', C.cy).setDescription(`I'll ping you <t:${Math.floor(fireAt / 1000)}:R>!\n📝 *${message}*`)] });
      setTimeout(async () => {
        try {
          await i.user.send({ embeds: [base('⏰ Reminder!', C.cy).setDescription(`You asked me to remind you:\n📝 *${message}*`).setFooter({ text: 'TheConclave Dominion · AEGIS Reminder System' })] });
        } catch {
          const ch = i.channel;
          if (ch) await ch.send({ content: `<@${i.user.id}>`, embeds: [base('⏰ Reminder!', C.cy).setDescription(`📝 *${message}*`)] }).catch(() => {});
        }
      }, ms);
    }

    if (cmd === 'roll') {
      const notation = (i.options.getString('dice') || 'd6').toLowerCase().replace(/\s/g, '');
      const match = notation.match(/^(\d+)?d(\d+)([+-]\d+)?$/);
      if (!match) return i.editReply('⚠️ Invalid dice notation. Try `d6`, `2d10`, `3d8+5`');
      const count2 = Math.min(parseInt(match[1] || '1'), 20);
      const sides = Math.min(parseInt(match[2]), 1000);
      const mod = parseInt(match[3] || '0');
      if (sides < 2) return i.editReply('⚠️ Dice must have at least 2 sides.');
      const rolls = Array.from({ length: count2 }, () => Math.floor(Math.random() * sides) + 1);
      const sum = rolls.reduce((a, b) => a + b, 0) + mod;
      const display = rolls.length > 1 ? `[${rolls.join(', ')}]${mod !== 0 ? ` ${mod > 0 ? '+' : ''}${mod}` : ''}` : `${rolls[0]}${mod !== 0 ? ` ${mod > 0 ? '+' : ''}${mod}` : ''}`;
      return i.editReply({ embeds: [base(`🎲 ${notation.toUpperCase()}`, C.cy).setDescription(`**Result: ${sum}**\n${display}`).addFields({ name: 'Rolls', value: rolls.join(', '), inline: true }, { name: 'Total', value: `${sum}`, inline: true })] });
    }

    if (cmd === 'coinflip') {
      const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
      const emoji = result === 'Heads' ? '🌕' : '🌑';
      return i.editReply({ embeds: [base(`🪙 ${result}!`, C.gold).setDescription(`${emoji} The coin landed on **${result}**!`)] });
    }

    if (cmd === 'calc') {
      const expr = i.options.getString('expression');
      try {
        const sanitized = expr.replace(/[^0-9+\-*/().% ^]/g, '');
        if (!sanitized) return i.editReply('⚠️ Invalid expression.');
        const result = Function(`'use strict'; return (${sanitized.replace(/\^/g, '**')})`)();
        if (!isFinite(result)) return i.editReply('⚠️ Result is not finite.');
        return i.editReply({ embeds: [base('🔢 Calculator', C.cy).addFields({ name: 'Expression', value: `\`${expr}\``, inline: true }, { name: 'Result', value: `**${result.toLocaleString()}**`, inline: true })] });
      } catch { return i.editReply('⚠️ Invalid expression. Try: `100*5`, `2^10`, `(50+30)/4`'); }
    }

    // ── UTILITY ──
    if (cmd === 'whois') {
      const target = i.options.getUser('user');
      try {
        const member = await i.guild.members.fetch(target.id);
        const roles = member.roles.cache.filter(r => r.id !== i.guild.id).sort((a, b) => b.position - a.position).first(8).map(r => `<@&${r.id}>`).join(' ') || 'None';
        let wallet = null;
        if (sb && sbOk()) { try { const { data } = await sb.from('aegis_wallets').select('wallet_balance,bank_balance,daily_streak').eq('discord_id', target.id).single(); wallet = data; } catch {} }
        const embed = base(`🔍 ${target.username}`, C.cy)
          .setThumbnail(target.displayAvatarURL())
          .addFields(
            { name: '📅 Joined Server', value: member.joinedAt ? `<t:${Math.floor(member.joinedAt / 1000)}:D>` : 'Unknown', inline: true },
            { name: '📆 Account Created', value: `<t:${Math.floor(target.createdAt / 1000)}:D>`, inline: true },
            { name: '🆔 ID', value: target.id, inline: true },
            { name: '🎖️ Roles', value: roles },
          );
        if (wallet) embed.addFields({ name: '💎 ClaveShard', value: `${((wallet.wallet_balance || 0) + (wallet.bank_balance || 0)).toLocaleString()} total · 🔥 ${wallet.daily_streak || 0} day streak`, inline: true });
        if (member.nickname) embed.addFields({ name: '🏷️ Nickname', value: member.nickname, inline: true });
        return i.editReply({ embeds: [embed] });
      } catch (e) { return i.editReply(`⚠️ ${e.message}`); }
    }

    if (cmd === 'serverinfo') {
      const g = i.guild;
      await g.members.fetch().catch(() => {});
      const online = g.members.cache.filter(m => m.presence?.status === 'online' || m.presence?.status === 'dnd' || m.presence?.status === 'idle').size;
      const channels = g.channels.cache;
      return i.editReply({ embeds: [base(`🏠 ${g.name}`, C.pl)
        .setThumbnail(g.iconURL())
        .addFields(
          { name: '👥 Members', value: `${g.memberCount.toLocaleString()} total · ${online} online`, inline: true },
          { name: '📅 Created', value: `<t:${Math.floor(g.createdAt / 1000)}:D>`, inline: true },
          { name: '🆔 Guild ID', value: g.id, inline: true },
          { name: '📺 Channels', value: `${channels.filter(c => c.type === 0).size} text · ${channels.filter(c => c.type === 2).size} voice · ${channels.filter(c => c.type === 15).size} forum`, inline: true },
          { name: '🎭 Roles', value: `${g.roles.cache.size} roles`, inline: true },
          { name: '🌐 Region', value: 'North America', inline: true },
          { name: '🌟 Features', value: '5x crossplay ARK · ClaveShard Economy · AEGIS AI · 10 Maps', inline: false },
        )
      ] });
    }

    if (cmd === 'patreon') return i.editReply({ embeds: [base('⭐ Support on Patreon', C.gold)
      .setDescription('Help keep **10 servers** running for the entire community.')
      .addFields(
        { name: '🌟 Supporter · $5/mo', value: '● Supporter role\n● Early access to events\n● Special badge in Discord' },
        { name: '💎 Patron · $10/mo', value: '● All above\n● Monthly ClaveShard bonus\n● Exclusive Patron channel' },
        { name: '⭐ Elite Patron · $20/mo', value: '● All above\n● **Amissa server access** (exclusive map)\n● Priority support from Council\n● Name in credits' },
        { name: '🔗 Links', value: '[Patreon](https://patreon.com/theconclavedominion) · **$TheConclaveDominion** CashApp · **$ANLIKESEF** Chime' },
      )
    ] });



    // ── BEACON SENTINEL COMMANDS ──
    if (cmd === 'beacon-setup') {
      if (!isAdmin(i.member)) return i.editReply('⛔ Admins only.');
      try {
        const verifier   = beaconVerifier();
        const challenge  = beaconChallenge(verifier);
        const clientId   = process.env.BEACON_CLIENT_ID || 'eb9ecdff-4048-4a83-8f40-f2e16d2e9a81';
        const clientSec  = process.env.BEACON_CLIENT_SECRET || process.env.BEACON_SENTINEL_KEY || '';
        const form = new URLSearchParams({
          client_id:             clientId,
          client_secret:         clientSec,
          scope:                 'common sentinel:read sentinel:write',
          code_challenge:        challenge,
          code_challenge_method: 'S256',
        });
        const r = await axios.post('https://api.usebeacon.app/v4/device', form.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000
        });
        const { device_code, user_code, verification_uri_complete, expires_in } = r.data;
        beaconState.deviceSessions.set(device_code, { verifier, interval: r.data.interval || 5 });

        // DM the code to the admin
        try {
          await i.user.send({ embeds: [
            base('🔐 Beacon Sentinel Auth', C.cy)
              .setDescription('Visit the link below and enter the code to connect AEGIS to Beacon Sentinel.')
              .addFields(
                { name: '🔑 Your Code',    value: `\`${user_code}\``,                                         inline: true },
                { name: '⏰ Expires In',   value: `${Math.floor(expires_in / 60)} minutes`,                   inline: true },
                { name: '🌐 Auth Link',    value: `[Click here to authorize](${verification_uri_complete})` },
                { name: '📋 Instructions', value: '1. Click the link above\n2. Log in to Beacon\n3. Enter the code\n4. AEGIS polls automatically — watch your DMs for confirmation' },
              )
          ]});
        } catch { return i.editReply('⚠️ Could not DM you. Please enable DMs from server members.'); }

        await i.editReply('✅ Auth code sent to your DMs. Complete the steps there, then run `/beacon-setup` again to finish.');

        // Background poll loop
        const pollInterval = (r.data.interval || 5) * 1000;
        let attempts = 0;
        const maxAttempts = Math.floor(expires_in / (r.data.interval || 5));
        const poll = setInterval(async () => {
          attempts++;
          if (attempts > maxAttempts) { clearInterval(poll); return; }
          try {
            const t = await axios.post('https://api.usebeacon.app/v4/login', {
              client_id:     clientId,
              client_secret: clientSec || undefined,
              device_code,
              grant_type:    'urn:ietf:params:oauth:grant-type:device_code',
              code_verifier: verifier,
            }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
            clearInterval(poll);
            beaconState.access    = t.data.access_token;
            beaconState.refresh   = t.data.refresh_token;
            beaconState.expiresAt = t.data.access_token_expiration;
            await beaconGroup();
            // Notify admin
            try {
              // Send embed summary
              await i.user.send({ embeds: [
                base('✅ Beacon Sentinel Connected!', C.gr)
                  .setDescription('AEGIS is now authenticated with Beacon Sentinel.')
                  .addFields(
                    { name: '🏛️ Group ID',  value: beaconState.groupId || 'Discovering...', inline: true },
                    { name: '⏰ Expires',   value: `<t:${t.data.access_token_expiration}:R>`, inline: true },
                    { name: '⚠️ Next Step', value: 'Copy the tokens from the next message into Render env vars.' },
                  )
              ]});
              // Send FULL tokens as plain text (untruncated)
              await i.user.send([
                '**Paste these into Render Environment Variables:**',
                '```',
                `BEACON_ACCESS_TOKEN=${t.data.access_token}`,
                `BEACON_REFRESH_TOKEN=${t.data.refresh_token}`,
                `BEACON_TOKEN_EXPIRES=${t.data.access_token_expiration}`,
                `BEACON_GROUP_ID=${beaconState.groupId || ''}`,
                '```',
              ].join('\n'));
            } catch {}
          } catch (e) {
            const code = e.response?.data?.error;
            if (code === 'authorization_pending' || code === 'slow_down') return;
            clearInterval(poll);
          }
        }, pollInterval);
      } catch (e) { return i.editReply(`⚠️ ${e.response?.data?.error || e.message}`); }
    }

    if (cmd === 'tribes') {
      const srvFilter = i.options.getString('server') || '';
      if (!beaconState.access) return i.editReply('⚠️ Beacon Sentinel not connected. Admin must run `/beacon-setup` first.');
      const tribes = await sentinelTribes(srvFilter);
      if (!tribes.length) return i.editReply(`📭 No tribes found${srvFilter ? ` on **${srvFilter}**` : ''}.`);
      const lines = tribes.slice(0, 25).map((t, idx) =>
        `**${idx+1}.** ${t.tribeName || 'Unnamed'} · ${t.serviceDisplayName ? ` · *${t.serviceDisplayName}*` : ''}`
      ).join('\n');
      return i.editReply({ embeds: [
        base(`🏛️ Tribes${srvFilter ? ' — ' + srvFilter : ''}`, C.pl)
          .setDescription(lines)
          .addFields({ name: '📊 Total', value: `${tribes.length} tribe${tribes.length !== 1 ? 's' : ''}`, inline: true })
          .setFooter({ text: 'Powered by Beacon Sentinel • TheConclave Dominion' })
      ]});
    }

    if (cmd === 'player-lookup') {
      if (!isMod(i.member)) return i.editReply('⛔ Moderators only.');
      if (!beaconState.access) return i.editReply('⚠️ Beacon Sentinel not connected. Run `/beacon-setup` first.');
      const name = i.options.getString('name');
      const player = await sentinelPlayer(name);
      if (!player) return i.editReply(`📭 No player found matching **${name}**.`);
      const embed = base(`🔍 ${player.playerName || name}`, C.cy)
        .addFields(
          { name: '🆔 Player ID',   value: player.playerId   || 'Unknown', inline: true },
          { name: '👤 Name',        value: player.playerName || 'Unknown', inline: true },
          { name: '📅 Created',     value: player.createdAt  ? `<t:${Math.floor(new Date(player.createdAt)/1000)}:D>` : 'Unknown', inline: true },
          { name: '🕐 Last Active', value: player.updatedAt ? `<t:${Math.floor(new Date(player.updatedAt)/1000)}:R>` : 'Unknown', inline: true },
        );
      if (player.notes?.length) embed.addFields({ name: '📝 Notes', value: player.notes.slice(0,3).map(n => n.note).join('\n') });
      return i.editReply({ embeds: [embed] });
    }

    if (cmd === 'sentinel-bans') {
      if (!isAdmin(i.member)) return i.editReply('⛔ Admins only.');
      if (!beaconState.access) return i.editReply('⚠️ Beacon Sentinel not connected. Run `/beacon-setup` first.');
      const bans = await sentinelBans();
      if (!bans.length) return i.editReply('✅ No active bans on record.');
      const lines = bans.slice(0, 20).map((b, idx) =>
        `**${idx+1}.** ${b.playerName || b.playerId || 'Unknown'} · ${b.reason || 'No reason'}${b.createdAt ? ` · <t:${Math.floor(new Date(b.createdAt)/1000)}:R>` : ''}`
      ).join('\n');
      return i.editReply({ embeds: [
        base('🚫 Sentinel Ban List', C.rd)
          .setDescription(lines)
          .addFields({ name: '📊 Total', value: `${bans.length} ban${bans.length !== 1 ? 's' : ''}`, inline: true })
          .setFooter({ text: 'Powered by Beacon Sentinel • TheConclave Dominion' })
      ]});
    }

    // ── MONITORING ──
    if (cmd === 'setup-monitoring') {
      if (!isAdmin(i.member)) return i.editReply('⛔ Admins only.');
      await i.editReply('⚙️ Forging the Dominion Cluster Monitor...');
      try {
        const everyone = i.guild.roles.everyone;
        const readOnly = [
          { id: everyone, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions] },
          ...(ROLE_ADMIN_ID ? [{ id: ROLE_ADMIN_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] }] : []),
          ...(ROLE_OWNER_ID ? [{ id: ROLE_OWNER_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] }] : []),
        ];
        const voicePerms = [
          { id: everyone, deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.SendMessages] },
          ...(ROLE_ADMIN_ID ? [{ id: ROLE_ADMIN_ID, deny: [PermissionFlagsBits.Connect] }] : []),
          ...(ROLE_OWNER_ID ? [{ id: ROLE_OWNER_ID, deny: [PermissionFlagsBits.Connect] }] : []),
        ];

        // ── FETCH LIVE DATA FIRST ──
        const statuses = await fetchServerStatus(MONITOR_SERVERS);
        const onlineSrvs = statuses.filter(s => s.status === 'online');
        const totalPlayers = onlineSrvs.reduce((sum, s) => sum + s.players, 0);
        const peakSrv = [...onlineSrvs].sort((a,b) => b.players - a.players)[0];

        // ── CATEGORY ──
        const cat = await i.guild.channels.create({
          name: '⚡・DOMINION NETWORK',
          type: 4,
          permissionOverwrites: readOnly,
        });

        // ── SIDEBAR STAT VOICE CHANNELS (visible without clicking) ──
        const vOnline  = await i.guild.channels.create({ name: `🟢 Online: ${onlineSrvs.length} of 10`, type: 2, parent: cat.id, permissionOverwrites: voicePerms });
        await new Promise(r => setTimeout(r, 400));
        const vPlayers = await i.guild.channels.create({ name: `👥 Players: ${totalPlayers} Live`, type: 2, parent: cat.id, permissionOverwrites: voicePerms });
        await new Promise(r => setTimeout(r, 400));
        const vPeak    = await i.guild.channels.create({ name: peakSrv ? `🏆 ${peakSrv.name}: ${peakSrv.players} Players` : `🏆 Peak: Empty`, type: 2, parent: cat.id, permissionOverwrites: voicePerms });
        await new Promise(r => setTimeout(r, 400));
        await i.guild.channels.create({ name: `╔═══ ARK SERVERS ═══╗`, type: 2, parent: cat.id, permissionOverwrites: voicePerms });
        await new Promise(r => setTimeout(r, 400));

        // Per-server voice channels
        const statChannelIds = {
          totalOnline: vOnline.id,
          totalPlayers: vPlayers.id,
          peak: vPeak.id,
        };
        for (const srv of statuses) {
          const isOn = srv.status === 'online';
          const tag  = srv.pvp ? '⚔️' : srv.patreon ? '⭐' : '';
          const name = isOn
            ? `${srv.emoji}${tag} ${srv.name} · ${srv.players}/${srv.maxPlayers}`
            : `🔴 ${srv.name} · Offline`;
          const vCh = await i.guild.channels.create({ name, type: 2, parent: cat.id, permissionOverwrites: voicePerms });
          statChannelIds[srv.id] = vCh.id;
          await new Promise(r => setTimeout(r, 500));
        }

        // ── LIVE STATUS TEXT CHANNEL ──
        const statusCh = await i.guild.channels.create({
          name: '📡・cluster-status',
          type: 0,
          parent: cat.id,
          topic: '⚡ Live ARK cluster — Nitrado direct feed — auto-updates every 5 min',
          permissionOverwrites: readOnly,
        });

        // ── ACTIVITY FEED ──
        const actCh = await i.guild.channels.create({
          name: '📊・player-activity',
          type: 0,
          parent: cat.id,
          topic: 'Live player join/leave events across all 10 servers',
          permissionOverwrites: readOnly,
        });

        // ── POST MASTER EMBED ──
        const masterEmbed = buildMonitorEmbed(statuses);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('monitor_refresh').setLabel('🔄 Refresh Now').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('monitor_players').setLabel('👥 Who Is Online').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setLabel('🌐 Website').setStyle(ButtonStyle.Link).setURL('https://theconclavedominion.com'),
        );
        const msg = await statusCh.send({ embeds: [masterEmbed], components: [row] });

        // ── ACTIVITY WELCOME ──
        await actCh.send({ embeds: [
          new EmbedBuilder().setColor(0x7B2FFF)
            .setTitle('📊 Player Activity Feed')
            .setDescription('Player count changes across all 10 servers will appear here in real time.\n\nPowered by **Nitrado direct API** — no middlemen, exact counts.')
            .setFooter({ text: 'TheConclave Dominion • AEGIS Network Monitor' })
            .setTimestamp()
        ]});

        // ── SAVE STATE ──
        monitorState.set(i.guild.id, {
          statusChannelId: statusCh.id,
          activityChannelId: actCh.id,
          messageId: msg.id,
          servers: [...MONITOR_SERVERS],
          prevStatuses: statuses,
          statChannelIds,
        });

        return i.editReply({ embeds: [
          base('⚡ Dominion Network Online', 0x7B2FFF)
            .setDescription('Full live cluster monitor deployed. Sidebar stats visible to all members.')
            .addFields(
              { name: '🟢 Servers Online',   value: `${onlineSrvs.length}/10`,   inline: true },
              { name: '👥 Live Players',     value: `${totalPlayers}`,            inline: true },
              { name: '⏰ Refresh Rate',     value: 'Every 5 min',               inline: true },
              { name: '📡 Status Feed',      value: `${statusCh}`,               inline: true },
              { name: '📊 Activity Feed',    value: `${actCh}`,                  inline: true },
              { name: '🖥️ Sidebar Stats',   value: `${statuses.length + 3} live channels`, inline: true },
            )
        ]});
      } catch (e) {
        return i.editReply(`⚠️ Setup failed: ${e.message}`);
      }
    }

    if (cmd === 'monitor-add') {
      if (!isAdmin(i.member)) return i.editReply('⛔ Admins only.');
      const state = monitorState.get(i.guild.id);
      if (!state) return i.editReply('⚠️ Run `/setup-monitoring` first.');
      const name    = i.options.getString('name');
      const ip      = i.options.getString('ip');
      const port    = i.options.getInteger('port');
      const emoji   = i.options.getString('emoji') || '🖥️';
      const pvp     = i.options.getBoolean('pvp') || false;
      const patreon = i.options.getBoolean('patreon') || false;
      const id      = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const exists  = state.servers?.find(s => s.ip === ip && s.port === port);
      if (exists) return i.editReply(`⚠️ **${ip}:${port}** is already monitored.`);
      state.servers = [...(state.servers || MONITOR_SERVERS), { id, name, emoji, ip, port, pvp, patreon }];
      // Trigger immediate refresh
      await refreshMonitor(i.guild);
      return i.editReply({ embeds: [
        base(`✅ Added ${emoji} ${name}`, 0x35ED7E)
          .addFields(
            { name: '🌐 IP',   value: `\`${ip}:${port}\``, inline: true },
            { name: '⚔️ PvP', value: pvp ? 'Yes' : 'No',  inline: true },
            { name: '⭐ Patreon', value: patreon ? 'Yes' : 'No', inline: true },
          )
      ]});
    }

    if (cmd === 'monitor-refresh') {
      if (!isAdmin(i.member)) return i.editReply('⛔ Admins only.');
      const state = monitorState.get(i.guild.id);
      if (!state) return i.editReply('⚠️ No monitor active. Run `/setup-monitoring` first.');
      await i.editReply('🔄 Forcing cluster refresh...');
      await refreshMonitor(i.guild);
      return i.editReply('✅ All stat channels updated.');
    }

  } catch (e) {
    console.error(`❌ /${cmd}:`, e.message);
    try { await i.editReply(`⚠️ Something went wrong: ${e.message.slice(0, 200)}`); } catch {}
  }
});

// ─── BUTTON HANDLERS ───────────────────────────────────────────
bot.on(Events.InteractionCreate, async i => {
  if (!i.isButton()) return;

  if (i.customId === 'monitor_refresh') {
    await i.deferReply({ ephemeral: true });
    const state = monitorState.get(i.guild.id);
    if (!state) return i.editReply('⚠️ No monitor active. Run `/setup-monitoring` first.');
    await refreshMonitor(i.guild);
    return i.editReply('✅ Cluster stats refreshed.');
  }

  if (i.customId === 'monitor_players') {
    await i.deferReply({ ephemeral: true });
    let total = 0;
    let description = '';

    // Use Beacon Sentinel if connected — richest data
    if (beaconState.access) {
      try {
        const chars = await sentinelOnlinePlayers();
        if (!chars.length) return i.editReply('👻 No players online right now.');
        total = chars.length;
        // Group by server
        const byServer = {};
        for (const c of chars) {
          const srv = c.serviceDisplayName || 'Unknown';
          if (!byServer[srv]) byServer[srv] = [];
          byServer[srv].push(c.characterName || c.playerName || 'Unknown');
        }
        const fields = Object.entries(byServer).map(([srv, names]) => ({
          name: `🗺️ ${srv}`,
          value: names.map(n => `• ${n}`).join('\n').slice(0, 1024),
          inline: true,
        }));
        return i.editReply({ embeds: [
          base('👥 Who Is Online', 0x00D4FF)
            .setDescription(`**${total} survivor${total !== 1 ? 's' : ''}** across the Dominion.`)
            .addFields(...fields.slice(0, 25))
            .setFooter({ text: 'Powered by Beacon Sentinel • TheConclave Dominion' })
            .setTimestamp()
        ]});
      } catch {}
    }

    // Fall back to Nitrado RCON
    const statuses = await fetchServerStatus(MONITOR_SERVERS);
    const active = statuses.filter(s => s.status === 'online' && s.players > 0);
    if (!active.length) return i.editReply('👻 No players online right now.');
    const fields = active.map(s => ({
      name: `${s.emoji} ${s.name}${s.pvp ? ' ⚔️' : s.patreon ? ' ⭐' : ''}`,
      value: s.playerNames?.length
        ? s.playerNames.map(p => `• ${p}`).join('\n')
        : `${s.players} player${s.players !== 1 ? 's' : ''} (names unavailable)`,
      inline: true,
    }));
    total = active.reduce((sum, s) => sum + s.players, 0);
    return i.editReply({ embeds: [
      base('👥 Who Is Online', 0x00D4FF)
        .setDescription(`**${total} survivor${total !== 1 ? 's' : ''}** across the Dominion right now.`)
        .addFields(...fields.slice(0, 25))
        .setTimestamp()
    ]});
  }

  if (i.customId === 'open_ticket') {
    try {
      await i.deferReply({ ephemeral: true });
      const channelName = `ticket-${i.user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`;
      const ch = await i.guild.channels.create({
        name: channelName,
        topic: `Support ticket — ${i.user.tag} — Opened <t:${Math.floor(Date.now() / 1000)}:F>`,
        permissionOverwrites: [
          { id: i.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
          { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
          ...(ROLE_ADMIN_ID ? [{ id: ROLE_ADMIN_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
          ...(ROLE_OWNER_ID ? [{ id: ROLE_OWNER_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
        ]
      });
      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger),
      );
      await ch.send({
        content: `<@${i.user.id}> Welcome! Describe your issue below and a Council member will respond shortly.`,
        embeds: [base(`🎫 Ticket — ${i.user.username}`, C.gr)
          .setDescription('Please describe your issue in detail. Include relevant screenshots if possible.')
          .addFields(
            { name: '⏰ Opened', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            { name: '⚡ Expected Response', value: 'Within 24 hours', inline: true },
          )
        ],
        components: [closeRow]
      });
      await i.editReply({ content: `✅ Ticket created: ${ch}`, ephemeral: true });
    } catch (e) { try { await i.editReply({ content: `⚠️ Failed to create ticket: ${e.message}`, ephemeral: true }); } catch {} }
  }

  if (i.customId === 'close_ticket') {
    if (!isMod(i.member)) { await i.reply({ content: '⛔ Only moderators can close tickets.', ephemeral: true }); return; }
    await i.reply({ content: '🔒 Closing ticket in 5 seconds...' });
    setTimeout(() => i.channel.delete().catch(() => {}), 5000);
  }
});

// ─── AEGIS CHANNEL AUTO-REPLY ──────────────────────────────────
bot.on(Events.MessageCreate, async msg => {
  if (msg.author.bot) return;
  if (!AEGIS_CH || msg.channelId !== AEGIS_CH) return;
  const w = checkRate(msg.author.id, 8000);
  if (w) {
    const m = await msg.reply(`⏳ Slow down, Survivor. Retry in ${w}s.`).catch(() => null);
    if (m) setTimeout(() => m.delete().catch(() => {}), 4000);
    return;
  }
  msg.channel.sendTyping().catch(() => {});
  const r = await askAegis(msg.content, msg.author.id);
  msg.reply(r.slice(0, 1990)).catch(() => msg.channel.send(r.slice(0, 1990)).catch(() => {}));
});

// ─── WELCOME + WALLET AUTO-CREATE ──────────────────────────────
bot.on(Events.GuildMemberAdd, async member => {
  try {
    if (sb && sbOk()) (async () => {
      try { await sb.from('aegis_wallets').upsert({ discord_id: member.id, discord_tag: member.user.tag || member.user.username, updated_at: new Date().toISOString() }, { onConflict: 'discord_id', ignoreDuplicates: true }); } catch {}
    })();
    const ch = member.guild.channels.cache.find(c => c.name === 'welcome' || c.name === 'welcomes' || c.name === 'welcome-gate');
    if (!ch) return;
    await ch.send({ embeds: [base(`⚔️ Welcome to TheConclave, ${member.user.username}!`, C.pl)
      .setThumbnail(member.user.displayAvatarURL())
      .setDescription('You\'ve joined the Dominion — a 5x crossplay ARK: Survival Ascended community across **10 maps**.')
      .addFields(
        { name: '📌 First Stop', value: '#rules · Read the Codex', inline: true },
        { name: '🎮 Server IPs', value: '#ark-servers', inline: true },
        { name: '💎 Economy', value: '`/weekly` for free shards!', inline: true },
        { name: '💬 Say Hello', value: '#general', inline: true },
        { name: '🎫 Need Help?', value: '`/ticket` opens private support', inline: true },
        { name: '🧠 Ask AEGIS', value: '`/aegis [question]` for anything', inline: true },
      )
      .setFooter({ text: `Member #${member.guild.memberCount} • TheConclave Dominion` })
    ] });
  } catch (e) { console.error('❌ Welcome:', e.message); }
});

// ─── SHARD EVENTS ──────────────────────────────────────────────
bot.on('shardDisconnect', (e, id) => console.warn(`⚠️  Shard ${id} disconnected (code ${e.code})`));
bot.on('shardReconnecting', id => console.log(`🔄 Shard ${id} reconnecting...`));
bot.on('shardResume', (id, r) => console.log(`✅ Shard ${id} resumed (${r} events replayed)`));

// ─── HEALTH HTTP SERVER ─────────────────────────────────────────
const STATUS = { ready: false, readyAt: null, reconnects: 0 };
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    const up = STATUS.ready && bot.ws.status === 0;
    const mem = process.memoryUsage();
    res.writeHead(up ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: up ? 'ok' : 'degraded', bot: STATUS.ready ? 'ready' : 'not_ready',
      ws: bot.ws.status, wsLatency: bot.ws.ping,
      uptime: STATUS.readyAt ? Math.floor((Date.now() - STATUS.readyAt) / 1000) + 's' : '0s',
      reconnects: STATUS.reconnects, heapMB: Math.round(mem.heapUsed / 1024 / 1024),
      supabase: sb ? (sbOk() ? 'ok' : 'circuit_open') : 'not_configured',
      commands: cmds.length, ts: new Date().toISOString()
    }));
  } else if (req.url === '/commands') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ commands: cmds.map(c => ({ name: c.name, description: c.description })) }));
  } else {
    res.writeHead(404); res.end('Not found');
  }
});
healthServer.listen(BOT_PORT, () => console.log(`💓 Bot health: :${BOT_PORT}`));

// ─── WATCHDOG ──────────────────────────────────────────────────
let watchdogFails = 0, lastReady = Date.now();

setInterval(async () => {
  const wsStatus = bot.ws?.status;
  const heapMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  if (heapMB > 450) console.warn(`⚠️  High memory: ${heapMB}MB`);
  if (wsStatus === 0) { watchdogFails = 0; lastReady = Date.now(); return; }
  watchdogFails++;
  const downSec = Math.floor((Date.now() - lastReady) / 1000);
  console.warn(`⚠️  Watchdog: ws=${wsStatus} down=${downSec}s fails=${watchdogFails}`);
  if (watchdogFails >= 3) {
    STATUS.reconnects++;
    watchdogFails = 0;
    console.error(`❌ Reconnecting (attempt #${STATUS.reconnects})...`);
    try { bot.destroy(); await new Promise(r => setTimeout(r, 5000)); await bot.login(DISCORD_BOT_TOKEN); lastReady = Date.now(); console.log('✅ Watchdog reconnect OK'); }
    catch (e) { console.error('❌ Watchdog reconnect failed:', e.message); }
  }
}, 30_000);

// ─── PROCESS GUARDS ─────────────────────────────────────────────
const IGNORE = ['Unknown interaction', 'Unknown Message', 'Missing Access', 'Cannot send messages', 'Unknown Channel'];
process.on('unhandledRejection', r => { const m = r?.message || String(r); if (!IGNORE.some(e => m.includes(e))) console.error('❌ Rejection:', m); });
process.on('uncaughtException', (e, o) => console.error(`❌ Exception [${o}]:`, e.message));
process.on('SIGTERM', () => { STATUS.ready = false; healthServer.close(); bot.destroy(); setTimeout(() => process.exit(0), 3000); });
process.on('SIGINT',  () => { STATUS.ready = false; healthServer.close(); bot.destroy(); setTimeout(() => process.exit(0), 1000); });

// ─── READY ─────────────────────────────────────────────────────
// ─── EXISTING STATUS CHANNEL IDs ─────────────────────────────
// Your pre-existing per-server STATUS channels in Discord
const EXISTING_STATUS_CHANNELS = {
  aberration: '1491714622959390830',
  amissa:     '1491714743797416056',
  astraeos:   '1491714926862008320',
  center:     '1491715233847316590',
  extinction: '1491715612911861790',
  lostcolony: '1491715764678299670',
  scorched:   '1491717247083876435',
  island:     '1491715445659799692',
  valguero:   '1491715929586008075',
  volcano:    '1491716283857633290',
};

async function updateExistingStatusChannels(guild, statuses) {
  for (const srv of statuses) {
    const chId = EXISTING_STATUS_CHANNELS[srv.id];
    if (!chId) continue;
    try {
      const ch = await guild.channels.fetch(chId).catch(() => null);
      if (!ch) continue;
      const isOn = srv.status === 'online';
      const tag  = srv.pvp ? '⚔️' : srv.patreon ? '⭐' : '';
      const newName = isOn
        ? `🟢${tag}・${srv.name}-${srv.players}p`
        : `🔴・${srv.name}-offline`;
      if (ch.name !== newName) {
        await ch.setName(newName);
        await new Promise(r => setTimeout(r, 600));
      }
    } catch (e) {
      console.error(`❌ Channel update ${srv.id}:`, e.message);
    }
  }
}

bot.once(Events.ClientReady, async () => {
  STATUS.ready = true; STATUS.readyAt = Date.now();
  console.log(`🤖 AEGIS v8.0 ULTIMATE — ${bot.user.tag}`);
  console.log(`   Supabase: ${sb ? '✅' : '⚠️'} · Anthropic: ${anthropic ? '✅' : '⚠️'} · Health: :${BOT_PORT}`);
  bot.user.setActivity(`💎 /weekly | ${cmds.length} commands`, { type: 3 });
  await registerCommands();

  // Auto-start live channel name updates on boot
  if (DISCORD_GUILD_ID) {
    const guild = await bot.guilds.fetch(DISCORD_GUILD_ID).catch(() => null);
    if (guild) {
      console.log('📡 Starting live channel status updates...');
      const statuses = await fetchServerStatus(MONITOR_SERVERS);
      await updateExistingStatusChannels(guild, statuses);
      console.log('✅ Status channels updated on boot');

      // Resume monitor embed if env vars set
      const monCh  = process.env.MONITOR_STATUS_CHANNEL_ID;
      const actCh  = process.env.MONITOR_ACTIVITY_CHANNEL_ID;
      const monMsg = process.env.MONITOR_MESSAGE_ID;
      if (monCh && monMsg) {
        monitorState.set(DISCORD_GUILD_ID, {
          statusChannelId: monCh, activityChannelId: actCh || null,
          messageId: monMsg, servers: [...MONITOR_SERVERS], prevStatuses: statuses,
        });
        await refreshMonitor(guild);
        console.log('📡 Monitor embed resumed');
      }
    }
  }
});

// ─── LOGIN ──────────────────────────────────────────────────────
let loginAttempt = 0;
const BACKOFF = [5, 15, 30, 60, 120, 120];
async function login() {
  loginAttempt++;
  try { await bot.login(DISCORD_BOT_TOKEN); loginAttempt = 0; }
  catch (e) {
    const delay = (BACKOFF[Math.min(loginAttempt - 1, BACKOFF.length - 1)]) * 1000;
    console.error(`❌ Login attempt ${loginAttempt} failed: ${e.message} — retry in ${delay / 1000}s`);
    setTimeout(login, delay);
  }
}
login();
module.exports = bot;
