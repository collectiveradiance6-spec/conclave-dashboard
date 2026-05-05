/**
 * ═══════════════════════════════════════════════════════════
 * THECONCLAVE DOMINION — MASTER SERVER REGISTRY
 * Single source of truth — import this everywhere
 * Last verified: 2026-03-26
 * ═══════════════════════════════════════════════════════════
 */

export const CONCLAVE_SERVERS = [
  {
    id: 1,
    key: "aberration",
    name: "TheConclave-Aberration-5xCrossplay",
    display: "Aberration",
    map: "Aberration",
    emoji: "🌋",
    version: "v84.16",
    ip: "217.114.196.80",
    port: 5540,
    address: "217.114.196.80:5540",
    mapId: "18655529",
    isPatreon: false,
    isPvP: true,   // Aberration is the PvP map
    notes: "PvP map",
    platform: "crossplay",
    cluster: "dominion",
    maxPlayers: 20,
  },
  {
    id: 2,
    key: "scorched",
    name: "TheConclave-Scorched-5xCrossplay",
    display: "Scorched Earth",
    map: "ScorchedEarth_P",
    emoji: "🏜️",
    version: "v84.16",
    ip: "217.114.196.103",
    port: 5240,
    address: "217.114.196.103:5240",
    mapId: "18598049",
    isPatreon: false,
    isPvP: false,
    platform: "crossplay",
    cluster: "dominion",
    maxPlayers: 20,
  },
  {
    id: 3,
    key: "valguero",
    name: "TheConclave-Valguero-5xCrossplay",
    display: "Valguero",
    map: "Valguero_P",
    emoji: "🌿",
    version: "v84.16",
    ip: "85.190.136.141",
    port: 5090,
    address: "85.190.136.141:5090",
    mapId: "18509341",           // ← CORRECTED (was 10509341)
    isPatreon: false,
    isPvP: false,
    platform: "crossplay",
    cluster: "dominion",
    maxPlayers: 20,
  },
  {
    id: 4,
    key: "amissa",
    name: "TheConclave-Amissa-Patreon-5xCrossplay",
    display: "Amissa (Patreon)",
    map: "Amissa",
    emoji: "⭐",
    version: "v84.28",           // ← CORRECTED (was v84.16)
    ip: "217.114.196.80",
    port: 5180,                  // ← CORRECTED (was 5100)
    address: "217.114.196.80:5180",
    mapId: "18680162",
    isPatreon: true,
    isPvP: false,
    notes: "Patreon subscribers only — free mod map",
    platform: "crossplay",
    cluster: "dominion",
    maxPlayers: 20,
  },
  {
    id: 5,
    key: "astraeos",
    name: "TheConclave-Astraeos-5xCrossplay",
    display: "Astraeos",
    map: "Astraeos",
    emoji: "🌙",
    version: "v84.28",
    ip: "217.114.196.9",
    port: 5320,
    address: "217.114.196.9:5320",
    mapId: "18393892",
    isPatreon: false,
    isPvP: false,
    platform: "crossplay",
    cluster: "dominion",
    maxPlayers: 20,
  },
  {
    id: 6,
    key: "lostcolony",
    name: "TheConclave-LostColony-5xCrossplay",
    display: "Lost Colony",
    map: "LostColony",
    emoji: "🏝️",
    version: "v84.28",
    ip: "217.114.196.104",
    port: 5150,
    address: "217.114.196.104:5150",
    mapId: "18307276",
    isPatreon: false,
    isPvP: false,
    platform: "crossplay",
    cluster: "dominion",
    maxPlayers: 20,
  },
  {
    id: 7,
    key: "theisland",
    name: "TheConclave-TheIsland-5xCrossplay",
    display: "The Island",
    map: "TheIsland",
    emoji: "🏔️",
    version: "v84.28",
    ip: "217.114.196.102",
    port: 5390,                  // ← CORRECTED (was 5300)
    address: "217.114.196.102:5390",
    mapId: "18266152",
    isPatreon: false,
    isPvP: false,
    platform: "crossplay",
    cluster: "dominion",
    maxPlayers: 20,
  },
  {
    id: 8,
    key: "center",
    name: "TheConclave-Center-5xCrossplay",
    display: "The Center",
    map: "TheCenter",
    emoji: "🗺️",
    version: "v84.28",
    ip: "31.214.163.71",
    port: 5120,
    address: "31.214.163.71:5120",
    mapId: "18182839",
    isPatreon: false,
    isPvP: false,
    platform: "crossplay",
    cluster: "dominion",
    maxPlayers: 20,
  },
  {
    id: 9,
    key: "extinction",
    name: "TheConclave-Extinction-5xCrossplay",
    display: "Extinction",
    map: "Extinction",
    emoji: "💀",
    version: "v84.28",
    ip: "31.214.196.102",        // ← CORRECTED (was 217.114.196.102)
    port: 6440,
    address: "31.214.196.102:6440",
    mapId: "18106633",
    isPatreon: false,
    isPvP: false,
    platform: "crossplay",
    cluster: "dominion",
    maxPlayers: 20,
  },
  {
    id: 10,
    key: "volcano",
    name: "TheConclave-Volcano-5xCrossplay",
    display: "Volcano",
    map: "Volcano",
    emoji: "🌊",
    version: "v84.28",
    ip: "217.114.196.59",
    port: 5050,
    address: "217.114.196.59:5050",
    mapId: "18094678",           // ← CORRECTED (was 10094878)
    isPatreon: false,
    isPvP: false,
    platform: "crossplay",
    cluster: "dominion",
    maxPlayers: 20,
  },
];

// ── QUICK LOOKUPS ────────────────────────────────────────────────
export const SERVER_BY_KEY = Object.fromEntries(
  CONCLAVE_SERVERS.map(s => [s.key, s])
);

export const SERVER_BY_ID = Object.fromEntries(
  CONCLAVE_SERVERS.map(s => [s.id, s])
);

export const PATREON_SERVERS = CONCLAVE_SERVERS.filter(s => s.isPatreon);
export const PUBLIC_SERVERS   = CONCLAVE_SERVERS.filter(s => !s.isPatreon);
export const PVP_SERVERS      = CONCLAVE_SERVERS.filter(s => s.isPvP);

// ── CLUSTER METADATA ─────────────────────────────────────────────
export const CLUSTER_META = {
  name: "TheConclave Dominion",
  shortName: "TCD",
  tagline: "We didn't wait for the light. We became it.",
  discord: "discord.gg/theconclave",
  rates: {
    xp: 5, harvest: 5, taming: 5, breeding: 5, mating: 5,
    weight: "1M", fallDamage: false, dinoStealing: false,
    maxWildDinos: 350,
  },
  mods: [
    "Death Inventory Keeper",
    "ARKomatic",
    "Awesome Spyglass & Teleporter",
  ],
  totalServers: 10,
  publicServers: 9,
  patreonServers: 1,
};

// ── CORRECTIONS LOG ──────────────────────────────────────────────
export const CORRECTIONS_2026_03_26 = [
  { server: "Valguero (#3)",   field: "mapId",   old: "10509341",         new: "18509341" },
  { server: "Amissa (#4)",     field: "port",    old: "5100",             new: "5180" },
  { server: "Amissa (#4)",     field: "version", old: "v84.16",           new: "v84.28" },
  { server: "TheIsland (#7)",  field: "port",    old: "5300",             new: "5390" },
  { server: "Extinction (#9)", field: "ip",      old: "217.114.196.102",  new: "31.214.196.102" },
  { server: "Volcano (#10)",   field: "mapId",   old: "10094878",         new: "18094678" },
];
