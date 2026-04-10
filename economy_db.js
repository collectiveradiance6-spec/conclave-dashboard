// ═══════════════════════════════════════════════════════════════
// CONCLAVE AEGIS — CLAVESHARDS ECONOMY DATABASE (Supabase)
// Wallet + bank balances + immutable ledger
// ═══════════════════════════════════════════════════════════════
const { supabase } = require('./knowledge_db');

function nowIso(){ return new Date().toISOString(); }
function toInt(v){ const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : 0; }

async function ensureWallet(discordId, discordTag='') {
  const { data: existing } = await supabase.from('aegis_wallets').select('*').eq('discord_id', discordId).maybeSingle();
  if (existing) {
    if (discordTag && existing.discord_tag !== discordTag) {
      await supabase.from('aegis_wallets').update({ discord_tag: discordTag, updated_at: nowIso() }).eq('discord_id', discordId);
      existing.discord_tag = discordTag;
    }
    return existing;
  }
  const seed = {
    discord_id: discordId,
    discord_tag: discordTag,
    wallet_balance: 0,
    bank_balance: 0,
    lifetime_earned: 0,
    lifetime_spent: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  const { data, error } = await supabase.from('aegis_wallets').upsert(seed, { onConflict: 'discord_id' }).select().single();
  if (error) throw error;
  return data;
}

async function getWallet(discordId, discordTag='') { return ensureWallet(discordId, discordTag); }

async function writeLedger({ discordId, action, amount, source='', note='', actorDiscordId=null, actorTag='', orderRef=null, walletAfter=0, bankAfter=0 }) {
  await supabase.from('aegis_wallet_ledger').insert({
    discord_id: discordId,
    action,
    amount,
    source,
    note,
    actor_discord_id: actorDiscordId,
    actor_tag: actorTag,
    order_ref: orderRef,
    balance_wallet_after: walletAfter,
    balance_bank_after: bankAfter,
    created_at: nowIso(),
  });
}

async function depositShards(discordId, amount, actor={}) {
  amount = toInt(amount);
  if (amount <= 0) throw new Error('Deposit amount must be greater than zero.');
  const wallet = await ensureWallet(discordId, actor.targetTag || '');
  if (wallet.wallet_balance < amount) throw new Error('Not enough shards in wallet.');
  const next = { wallet_balance: wallet.wallet_balance - amount, bank_balance: wallet.bank_balance + amount, updated_at: nowIso() };
  const { data, error } = await supabase.from('aegis_wallets').update(next).eq('discord_id', discordId).select().single();
  if (error) throw error;
  await writeLedger({ discordId, action: 'deposit', amount, source: 'self', note: 'Wallet → bank', actorDiscordId: actor.actorDiscordId || discordId, actorTag: actor.actorTag || '', walletAfter: data.wallet_balance, bankAfter: data.bank_balance });
  return data;
}

async function withdrawShards(discordId, amount, actor={}) {
  amount = toInt(amount);
  if (amount <= 0) throw new Error('Withdraw amount must be greater than zero.');
  const wallet = await ensureWallet(discordId, actor.targetTag || '');
  if (wallet.bank_balance < amount) throw new Error('Not enough shards in bank.');
  const next = { wallet_balance: wallet.wallet_balance + amount, bank_balance: wallet.bank_balance - amount, updated_at: nowIso() };
  const { data, error } = await supabase.from('aegis_wallets').update(next).eq('discord_id', discordId).select().single();
  if (error) throw error;
  await writeLedger({ discordId, action: 'withdraw', amount, source: 'self', note: 'Bank → wallet', actorDiscordId: actor.actorDiscordId || discordId, actorTag: actor.actorTag || '', walletAfter: data.wallet_balance, bankAfter: data.bank_balance });
  return data;
}

async function grantShards(discordId, amount, actor={}, reason='') {
  amount = toInt(amount);
  if (amount <= 0) throw new Error('Grant amount must be greater than zero.');
  const wallet = await ensureWallet(discordId, actor.targetTag || '');
  const next = { wallet_balance: wallet.wallet_balance + amount, lifetime_earned: wallet.lifetime_earned + amount, updated_at: nowIso() };
  const { data, error } = await supabase.from('aegis_wallets').update(next).eq('discord_id', discordId).select().single();
  if (error) throw error;
  await writeLedger({ discordId, action: 'grant', amount, source: actor.source || 'admin', note: reason || 'Admin grant', actorDiscordId: actor.actorDiscordId || null, actorTag: actor.actorTag || '', walletAfter: data.wallet_balance, bankAfter: data.bank_balance });
  return data;
}

async function deductShards(discordId, amount, actor={}, reason='') {
  amount = toInt(amount);
  if (amount <= 0) throw new Error('Deduct amount must be greater than zero.');
  const wallet = await ensureWallet(discordId, actor.targetTag || '');
  if (wallet.wallet_balance < amount) throw new Error('User does not have enough wallet shards.');
  const next = { wallet_balance: wallet.wallet_balance - amount, lifetime_spent: wallet.lifetime_spent + amount, updated_at: nowIso() };
  const { data, error } = await supabase.from('aegis_wallets').update(next).eq('discord_id', discordId).select().single();
  if (error) throw error;
  await writeLedger({ discordId, action: 'deduct', amount, source: actor.source || 'admin', note: reason || 'Admin deduction', actorDiscordId: actor.actorDiscordId || null, actorTag: actor.actorTag || '', walletAfter: data.wallet_balance, bankAfter: data.bank_balance });
  return data;
}

async function getShardLeaderboard(limit=10) {
  const { data, error } = await supabase.from('aegis_wallets').select('*').order('wallet_balance', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []).sort((a,b)=>(b.wallet_balance+b.bank_balance)-(a.wallet_balance+a.bank_balance)).slice(0, limit);
}

async function getWalletHistory(discordId, limit=10) {
  const { data, error } = await supabase.from('aegis_wallet_ledger').select('*').eq('discord_id', discordId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

module.exports = { ensureWallet, getWallet, depositShards, withdrawShards, grantShards, deductShards, getShardLeaderboard, getWalletHistory };
