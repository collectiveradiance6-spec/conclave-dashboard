require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 5001;

// ─── ENV ─────────────────────────────────────────────
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
} = process.env;

const DISCORD_API = "https://discord.com/api/v10";
const IS_PROD = NODE_ENV === "production";
const FRONTEND = FRONTEND_URL || "http://localhost:3000";

// ─── MIDDLEWARE ───────────────────────────────────────
app.use(cors({
  origin: [FRONTEND, "https://theconclave.pages.dev", "https://theconclavedominion.com"],
  credentials: true,
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "conclave-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: IS_PROD, maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));

// ─── IN-MEMORY STORE ──────────────────────────────────
// Replace with a DB later if needed
let donationData = { goal: 200, raised: 0, donors: [], month: getCurrentMonth() };
let announcements = [];
let events = [];
let serverCache = {};
let lastServerFetch = 0;

function getCurrentMonth() {
  return new Date().toLocaleString("default", { month: "long", year: "numeric" });
}

// ─── AUTH MIDDLEWARE ──────────────────────────────────
const verifyToken = (req, res, next) => {
  // Check JWT in Authorization header OR session
  const authHeader = req.headers.authorization;
  const sessionUser = req.session?.user;

  if (sessionUser) {
    req.user = sessionUser;
    return next();
  }

  if (!authHeader) return res.status(401).json({ message: "No token provided" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

const checkAdmin = (req, res, next) => {
  const role = req.user?.role;
  if (role === "owner" || role === "admin") return next();
  return res.status(403).json({ message: "Access denied — Admin only" });
};

const checkOwner = (req, res, next) => {
  if (req.user?.role === "owner") return next();
  return res.status(403).json({ message: "Access denied — Owner only" });
};

// ─── DISCORD SERVICE ──────────────────────────────────
const generateAuthUrl = () => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds.members.read",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
};

const getAccessToken = async (code) => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: DISCORD_REDIRECT_URI,
  });
  const res = await axios.post(`${DISCORD_API}/oauth2/token`, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.data.access_token;
};

const getUserData = async (accessToken) => {
  const res = await axios.get(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.data;
};

const getUserGuildRole = async (accessToken) => {
  try {
    const res = await axios.get(`${DISCORD_API}/users/@me/guilds/${DISCORD_GUILD_ID}/member`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const memberRoles = res.data.roles || [];

    const roleMap = {
      [ROLE_OWNER_ID]:      "owner",
      [ROLE_ADMIN_ID]:      "admin",
      [ROLE_HELPER_ID]:     "helper",
      [ROLE_BOOSTER_ID]:    "booster",
      [ROLE_DONATOR_ID]:    "donator",
      [ROLE_ADVERTISER_ID]: "advertiser",
      [ROLE_SURVIVOR_ID]:   "survivor",
    };

    for (const [roleId, roleName] of Object.entries(roleMap)) {
      if (roleId && memberRoles.includes(roleId)) return roleName;
    }
    return "member";
  } catch {
    return "guest";
  }
};

const getGuildMemberCount = async () => {
  const res = await axios.get(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}?with_counts=true`, {
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
  });
  return res.data.approximate_member_count;
};

// ─── SERVER STATUS ────────────────────────────────────
const SERVERS = [
  { id: "island",     name: "The Island",     ip: "217.114.196.102", port: 5390, beaconId: 18266152, mode: "PvE",     maxPlayers: 20 },
  { id: "volcano",    name: "The Volcano",    ip: "217.114.196.55",  port: 5200, beaconId: 18094678, mode: "PvE",     maxPlayers: 20 },
  { id: "extinction", name: "Extinction",     ip: "31.214.196.102",  port: 6440, beaconId: 18106633, mode: "PvE",     maxPlayers: 20 },
  { id: "center",     name: "The Center",     ip: "31.214.163.71",   port: 5120, beaconId: 18182839, mode: "PvE",     maxPlayers: 20 },
  { id: "lostcolony", name: "Lost Colony",    ip: "217.114.196.104", port: 5150, beaconId: 18307276, mode: "PvE",     maxPlayers: 20 },
  { id: "astraeos",   name: "Astraeos",       ip: "217.114.196.78",  port: 5680, beaconId: 18393892, mode: "PvE",     maxPlayers: 20 },
  { id: "valguero",   name: "Valguero",       ip: "85.190.136.141",  port: 5090, beaconId: 18509341, mode: "PvE",     maxPlayers: 20 },
  { id: "scorched",   name: "Scorched Earth", ip: "217.114.196.103", port: 5240, beaconId: 18598049, mode: "PvE",     maxPlayers: 20 },
  { id: "aberration", name: "Aberration",     ip: "217.114.196.80",  port: 5540, beaconId: 18655529, mode: "PvP",     maxPlayers: 20 },
  { id: "amissa",     name: "Amissa",         ip: "217.114.196.80",  port: 5180, beaconId: 18680162, mode: "Donator", maxPlayers: 20 },
];

// ─── BEACON API ───────────────────────────────────────
let beaconToken = null;
let beaconTokenExpiry = 0;

// Beacon project IDs from your Beacon app
const BEACON_PROJECTS = [
  "77c831cd-69b8-4349-8e84-a4fb8d760950", // TheConclaveOfficial (main)
  "34ce310e-d900-48b7-91ef-d65db8b767db", // TheConclaveAbb (Aberration)
  "cfa85471-c740-4552-98a3-0ef5dfb45b27", // TheConclave-Volcano
  "e29f22f0-e578-4f9b-b195-7b7c2e028fe1", // Donator Map (Amissa)
];

const getBeaconToken = async () => {
  if (beaconToken && Date.now() < beaconTokenExpiry) return beaconToken;
  try {
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.BEACON_CLIENT_ID,
      client_secret: process.env.BEACON_CLIENT_SECRET,
    });
    const res = await axios.post(
      "https://api.usebeacon.app/v4/token",
      params.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000 }
    );
    beaconToken = res.data.access_token;
    beaconTokenExpiry = Date.now() + ((res.data.expires_in || 3600) * 1000) - 60000;
    console.log("✅ Beacon token obtained");
    return beaconToken;
  } catch (e) {
    console.error("❌ Beacon token error:", e.response?.data || e.message);
    return null;
  }
};

const fetchServerStatuses = async () => {
  if (Date.now() - lastServerFetch < 60000 && Object.keys(serverCache).length) {
    return serverCache;
  }
  const results = {};
  try {
    const token = await getBeaconToken();
    if (!token) throw new Error("No Beacon token");

    // Fetch servers from all projects
    let allServers = [];
    for (const projectId of BEACON_PROJECTS) {
      try {
        const res = await axios.get(
          `https://api.usebeacon.app/v4/projects/${projectId}/servers`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
        );
        const servers = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.servers || []);
        console.log(`📡 Project ${projectId.slice(0,8)}: ${servers.length} servers`);
        if (servers.length > 0) console.log("Keys:", Object.keys(servers[0]));
        allServers = allServers.concat(servers);
      } catch (e) {
        console.error(`❌ Project ${projectId.slice(0,8)} failed:`, e.response?.data || e.message);
      }
    }

    console.log(`📊 Total servers from Beacon: ${allServers.length}`);

    // Match each of our servers by IP and port
    SERVERS.forEach(srv => {
      const match = allServers.find(s => {
        const addr = String(s.address || s.ip || s.host || "");
        const port = String(s.port || s.gamePort || s.queryPort || "");
        return (addr.includes(srv.ip) && port === String(srv.port)) ||
               String(s.nitradoId || s.serverId || "") === String(srv.nitradoId);
      });

      if (match) {
        const statusStr = String(match.status || match.state || "").toLowerCase();
        const isOnline = ["online","running","active","connected","started"].includes(statusStr) || match.online === true;
        results[srv.id] = {
          ...srv,
          status: isOnline ? "online" : "offline",
          players: match.onlinePlayers ?? match.playerCount ?? match.players ?? match.currentPlayers ?? 0,
          maxPlayers: srv.maxPlayers,
          version: match.version || "v84.16",
        };
        console.log(`✅ Matched ${srv.name}: ${results[srv.id].status} (${results[srv.id].players}/${srv.maxPlayers})`);
      } else {
        console.log(`⚠️ No match for ${srv.name} (${srv.ip}:${srv.port})`);
        results[srv.id] = { ...srv, status: "unknown", players: 0, maxPlayers: srv.maxPlayers };
      }
    });

  } catch (e) {
    console.error("❌ Beacon API failed:", e.response?.data || e.message);
    SERVERS.forEach(srv => {
      results[srv.id] = { ...srv, status: "unknown", players: 0, maxPlayers: srv.maxPlayers };
    });
  }
  serverCache = results;
  lastServerFetch = Date.now();
  return results;
};

// ═══════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════

// ─── BEACON DEBUG (remove after testing) ──────────────
app.get("/api/beacon-debug", async (_req, res) => {
  try {
    const token = await getBeaconToken();
    if (!token) return res.json({ error: "No token" });
    const r = await axios.get("https://api.usebeacon.app/v4/sentinel/services", {
      headers: { Authorization: `Bearer ${token}` }, timeout: 15000
    });
    res.json({ status: "ok", data: r.data });
  } catch (e) {
    res.json({ error: e.message, response: e.response?.data });
  }
});

// ─── PUBLIC ───────────────────────────────────────────
app.get("/", (_req, res) => res.json({
  name: "Conclave Aegis",
  status: "online",
  environment: NODE_ENV || "development",
}));

app.get("/health", (_req, res) => res.send("OK"));

app.get("/api/members", async (_req, res, next) => {
  try {
    const count = await getGuildMemberCount();
    res.json({ count });
  } catch (err) { next(err); }
});

// ─── AUTH ─────────────────────────────────────────────
app.get("/auth/discord", (_req, res) => {
  res.redirect(generateAuthUrl());
});

app.get("/auth/discord/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect(`${FRONTEND}?error=no_code`);

  try {
    const accessToken = await getAccessToken(code);
    const userData = await getUserData(accessToken);
    const role = await getUserGuildRole(accessToken);

    const isAdmin = role === "owner" || role === "admin";

    // Store in session
    req.session.user = {
      id: userData.id,
      username: userData.username,
      avatar: userData.avatar,
      role,
      isAdmin,
    };

    // Also sign a JWT for the frontend HTML pages
    const token = jwt.sign(
      { discordId: userData.id, username: userData.username, avatar: userData.avatar, role, isAdmin },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    // Redirect back to frontend — admins go to admin page, others go to home
    const redirectPage = isAdmin ? "/admin.html" : "/";
    res.redirect(`${FRONTEND}${redirectPage}?token=${token}&login=success`);
  } catch (err) {
    console.error("Auth error:", err);
    res.redirect(`${FRONTEND}?error=auth_failed`);
  }
});

// Also handle /auth/callback for legacy redirect URI
app.get("/auth/callback", async (req, res) => {
  req.url = "/auth/discord/callback";
  app._router.handle(req, res, () => {});
});

app.get("/auth/logout", (req, res) => {
  req.session.destroy();
  res.redirect(FRONTEND);
});

app.get("/api/me", (req, res) => {
  // Check session first
  if (req.session?.user) return res.json({ loggedIn: true, user: req.session.user });

  // Check JWT in Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.json({ loggedIn: false });

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ loggedIn: true, user: decoded });
  } catch {
    return res.json({ loggedIn: false });
  }
});

// ─── SHARD ORDER WEBHOOK ──────────────────────────────
app.post("/api/shard-order", async (req, res, next) => {
  try {
    const { username, item, quantity, discordId, tribeName, mapName, specifics } = req.body;
    if (!username || !item) return res.status(400).json({ message: "Missing required fields" });

    const webhookUrl = DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return res.status(500).json({ message: "Webhook not configured" });

    await axios.post(webhookUrl, {
      username: "Clave Shard Shop",
      content: "📬 **New shard order received!** React ✅ when fulfilled.",
      embeds: [{
        title: "🛒 New Clave Shard Order",
        color: 0x00d4ff,
        fields: [
          { name: "📦 Item / Tier",    value: item,                    inline: false },
          { name: "🎮 In-Game Name",   value: username,                inline: true },
          { name: "🛡️ Tribe",          value: tribeName || "Solo",     inline: true },
          { name: "💬 Discord",        value: discordId || "N/A",      inline: true },
          { name: "🗺️ Map",            value: mapName || "N/A",        inline: true },
          { name: "📝 Specifics",      value: specifics || "N/A",      inline: false },
        ],
        footer: { text: "TheConclave Dominion • Clave Shard Shop" },
        timestamp: new Date().toISOString(),
      }],
    });

    res.json({ message: "Order submitted successfully" });
  } catch (err) { next(err); }
});

// ─── DEBUG: see raw Beacon data ───────────────────────
app.get("/api/beacon-debug", async (_req, res) => {
  try {
    const token = await getBeaconToken();
    if (!token) return res.json({ error: "No token — check BEACON_CLIENT_ID and BEACON_CLIENT_SECRET env vars" });
    const results = {};
    for (const projectId of BEACON_PROJECTS) {
      try {
        const r = await axios.get(`https://api.usebeacon.app/v4/projects/${projectId}/servers`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
        results[projectId] = r.data;
      } catch (e) {
        results[projectId] = { error: e.response?.data || e.message, status: e.response?.status };
      }
    }
    res.json({ tokenOk: true, projects: results });
  } catch (e) {
    res.json({ error: e.response?.data || e.message });
  }
});

// ─── SERVER STATUS ────────────────────────────────────
app.get("/api/servers", async (_req, res, next) => {
  try {
    const statuses = await fetchServerStatuses();
    res.json({ servers: Object.values(statuses), lastUpdated: new Date().toISOString() });
  } catch (err) { next(err); }
});

// ─── DONATION ─────────────────────────────────────────
app.get("/api/donation", (_req, res) => {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = daysInMonth - now.getDate();
  const percentage = Math.min(100, Math.round((donationData.raised / donationData.goal) * 100));
  res.json({ ...donationData, daysRemaining, percentage });
});

app.post("/api/donation", verifyToken, checkAdmin, (req, res) => {
  const { goal, raised, donors } = req.body;
  if (goal !== undefined) donationData.goal = goal;
  if (raised !== undefined) donationData.raised = raised;
  if (donors !== undefined) donationData.donors = donors;
  donationData.month = getCurrentMonth();
  res.json({ success: true, data: donationData });
});

// ─── ANNOUNCEMENTS ────────────────────────────────────
app.get("/api/announcements", (_req, res) => res.json(announcements));

app.post("/api/announcements", verifyToken, checkAdmin, (req, res) => {
  const ann = { ...req.body, id: Date.now(), date: new Date().toISOString() };
  announcements.unshift(ann);
  res.json({ success: true, announcement: ann });
});

app.delete("/api/announcements/:id", verifyToken, checkAdmin, (req, res) => {
  announcements = announcements.filter(a => a.id !== parseInt(req.params.id));
  res.json({ success: true });
});

// ─── EVENTS ───────────────────────────────────────────
app.get("/api/events", (_req, res) => res.json(events));

app.post("/api/events", verifyToken, checkAdmin, (req, res) => {
  const ev = { ...req.body, id: Date.now() };
  events.unshift(ev);
  res.json({ success: true, event: ev });
});

app.delete("/api/events/:id", verifyToken, checkAdmin, (req, res) => {
  events = events.filter(e => e.id !== parseInt(req.params.id));
  res.json({ success: true });
});

// ─── ADMIN DASHBOARD ──────────────────────────────────
app.get("/admin/dashboard", verifyToken, checkAdmin, (_req, res) => {
  res.json({ message: "Welcome to the Conclave Admin Dashboard" });
});

// ─── ERROR HANDLER ────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("❌ Error:", err);
  res.status(500).json({ message: err.message || "Internal Server Error" });
});

// ─── START ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Conclave Aegis running on port ${PORT} (${NODE_ENV || "dev"})`);
});

process.on("SIGINT", () => {
  console.log("🛑 Shutting down Conclave Aegis...");
  process.exit(0);
});
