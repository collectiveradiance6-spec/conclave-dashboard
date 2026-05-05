// ═══════════════════════════════════════════════════════════════
// CONCLAVE AEGIS — LIVE KNOWLEDGE DATABASE (Supabase)
// This replaces the static knowledge.js file
// All knowledge is stored in Supabase and editable from admin panel
// ═══════════════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── STATIC CORE KNOWLEDGE (always injected, never stale) ───────
const CORE_KNOWLEDGE = `
═══════════════════════════════════════════════════════
CONCLAVE AEGIS — SERVER KNOWLEDGE BASE
═══════════════════════════════════════════════════════

IDENTITY:
You are Conclave Aegis — the AI intelligence of TheConclave Dominion.
You speak with authority, precision, and a touch of mystique.
You are deeply familiar with ARK: Survival Ascended and TheConclave specifically.
Keep Discord responses under 1500 characters. Use Discord markdown.

NETWORK:
- Website: theconclavedominion.com
- Discord: discord.gg/theconclave
- Support: $TheConclaveDominion on CashApp
- Patreon: for Amissa (donator map) access

CLUSTER INFO — 10 Maps:
1. The Island (PvE)
2. The Volcano (PvE)
3. Extinction (PvE)
4. The Center (PvE)
5. Lost Colony (PvE) — newer map, home to Gigadesmodus
6. Astraeos (PvE)
7. Valguero (PvE)
8. Scorched Earth (PvE)
9. Aberration (PvP — for fun) — 217.114.196.80:5540 MAPID:18655529
10. Amissa (Donator/Patreon only — PvE) — 217.114.196.80:5180 MAPID:18680162 v84.28
Also: Scorched 217.114.196.103:5240 | Valguero 85.190.136.141:5090 MAPID:18509341
TheIsland 217.114.196.102:5390 MAPID:18266152 | Extinction 31.214.196.102:6440 MAPID:18106633
Volcano 217.114.196.59:5050 MAPID:18094678 | LostColony 217.114.196.104:5150
Astraeos 217.114.196.9:5320 | Center 31.214.163.71:5120 | MaxPlayers: 20 per server

SERVER RATES:
- 5x XP, Harvesting, Taming, Breeding & Mating
- 1,000,000 weight capacity
- No fall damage
- No dino stealing
- Max wild dino level: 350

MODS:
- Death Inventory Keeper
- ARKomatic
- Awesome Spyglass
- Awesome Teleporter

KEY MECHANICS:
- Soap → Element conversion: Use Tek Replicator
- First torpor = tame ownership (verbal claims invalid)
- Aberration is PvP, all others are PvE
- Amissa is Patreon/Donator exclusive

CLAVE SHARD SHOP TIERS:
1 Shard — Basic items, saddles, starter kits
2 Shards — Modded dinos, mid-tier resources
3 Shards — Tek items, shiny dinos
5 Shards — Boss dinos, special creatures
6 Shards — Boss-ready bundle
8 Shards — Medium resource packs
10 Shards — Tek suits, breeding pairs
12 Shards — Large resource packs
15 Shards — Element, 900-level dinos
20 Shards — Behemoth gate sets
30 Shards — Storage refill / full base restock

RULES SUMMARY:
- Respect everyone — no harassment, hate speech, discrimination
- Build within 6x6 behemoth gate area
- No building in artifact caves, obelisks, explorer notes, high-resource spawns
- No offline breeding
- 100 tame limit per tribe
- 8 player tribe limit
- 1 base per map per tribe
- Discord name must match in-game name
- Open tickets for admin help — no direct DMs
- No server advertising (permanent ban)
- No raiding/stealing on PvE maps (instant ban)
- 3 warnings = ban (admin abuse = instant ban)
- First torpor = tame ownership
- Clean up traps and temp structures after use
- Decay timers are your responsibility — ticket if going away

STAFF TEAM:
- Tw (_tw___) — Owner/Founder
- Sandy (trentonmoody) — Co-Owner
- Slothie (saint_bofadeez) — Admin
- Kami (lil_kami808) — Admin
- Anky (.z.t.s.) — Admin
- Arbanion (arbanion8361) — Admin
- Devil (credibledevil) — Admin
- Jake (jake1994_1) — Admin
- Jenny (jennanicole) — Admin
- Icy (tk_icyreaper007) — Admin

COMMUNITY CENTERS (CCs):
Each CC has an admin teleporter and donation areas.
Take what you need — don't be greedy!

- Ragnarok: 72, 69 (Desert Ridge South) | Public oil pump at 79, 62
- Extinction: 50.2, 43.1 (Middle of City) | Garden: 49.8, 78.1
- Scorched Earth: 50.8, 72.6
- Astraeos: 37.8, 16.5
- The Volcano: 56.82, 87.37
- The Center: Near Blue Obelisk (exact coords in #community-center)
- The Island: Check #community-center for current coords
`;

// ─── LOAD LIVE KNOWLEDGE FROM SUPABASE ──────────────────────────
async function getLiveKnowledge() {
  try {
    const { data, error } = await supabase
      .from('aegis_knowledge')
      .select('*')
      .order('category', { ascending: true });

    if (error || !data?.length) return '';

    let extra = '\n\nLIVE KNOWLEDGE BASE (admin-maintained):\n';
    const byCategory = {};
    data.forEach(row => {
      if (!byCategory[row.category]) byCategory[row.category] = [];
      byCategory[row.category].push(`[${row.title}]: ${row.content}`);
    });

    for (const [cat, items] of Object.entries(byCategory)) {
      extra += `\n${cat.toUpperCase()}:\n`;
      items.forEach(item => extra += `• ${item}\n`);
    }

    return extra;
  } catch {
    return '';
  }
}

// ─── BUILD FULL SYSTEM PROMPT ────────────────────────────────────
async function buildSystemPrompt(playerContext = '') {
  const live = await getLiveKnowledge();
  return CORE_KNOWLEDGE + live + (playerContext ? `\n\nPLAYER CONTEXT:\n${playerContext}` : '');
}

// ─── PLAYER MEMORY ───────────────────────────────────────────────
async function getPlayerMemory(discordId) {
  try {
    const { data } = await supabase
      .from('aegis_player_memory')
      .select('*')
      .eq('discord_id', discordId)
      .single();
    return data;
  } catch { return null; }
}

async function upsertPlayerMemory(discordId, discordTag, updates = {}) {
  try {
    const existing = await getPlayerMemory(discordId);
    const count = (existing?.interaction_count || 0) + 1;

    await supabase
      .from('aegis_player_memory')
      .upsert({
        discord_id: discordId,
        discord_tag: discordTag,
        interaction_count: count,
        last_seen: new Date().toISOString(),
        ...updates
      }, { onConflict: 'discord_id' });
  } catch {}
}

// ─── LEARN NEW KNOWLEDGE ─────────────────────────────────────────
async function learnFact(category, key, title, content, addedBy) {
  const { error } = await supabase
    .from('aegis_knowledge')
    .upsert({
      category, key, title, content,
      added_by: addedBy,
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });

  return !error;
}

// ─── DELETE KNOWLEDGE ────────────────────────────────────────────
async function forgetFact(key) {
  const { error } = await supabase
    .from('aegis_knowledge')
    .delete()
    .eq('key', key);
  return !error;
}

// ─── LIST ALL KNOWLEDGE ──────────────────────────────────────────
async function listKnowledge(category = null) {
  let query = supabase.from('aegis_knowledge').select('*').order('category');
  if (category) query = query.eq('category', category);
  const { data } = await query;
  return data || [];
}

module.exports = {
  supabase,
  buildSystemPrompt,
  getPlayerMemory,
  upsertPlayerMemory,
  learnFact,
  forgetFact,
  listKnowledge,
  CORE_KNOWLEDGE
};
