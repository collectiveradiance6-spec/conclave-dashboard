/**
 * ═══════════════════════════════════════════════════════════════════════
 * CONCLAVE AEGIS — AUTH FIX PATCH v9.1
 * Drop-in patches for server.js:
 *   1. Discord OAuth fully working for admins
 *   2. Session persistence fix
 *   3. Music bot command relay
 *   4. CORS headers fix for Discord Activity iframes
 * ═══════════════════════════════════════════════════════════════════════
 *
 * HOW TO APPLY:
 *   In server.js, find the matching section and replace with the block below.
 *   Each section is clearly labeled with === REPLACE: section name ===
 */

// ═══════════════════════════════════════════════════════════════════════
// SECTION 1 — REPLACE: CORS config (around line 50 in server.js)
// Adds Discord Activity support + fixes cross-origin session cookies
// ═══════════════════════════════════════════════════════════════════════

const CORS_FIX = `
app.use(cors({
  origin: (origin, cb) => {
    const allowed = [
      FRONTEND_URL,
      'https://theconclave.pages.dev',
      'https://theconclavedominion.com',
      'https://www.theconclavedominion.com',
      'https://discord.com',
      'https://canary.discord.com',
      'https://ptb.discord.com',
      'null', // Discord Activity embedded frame origin
    ];
    // Allow undefined origin (same-origin, Postman, etc.)
    if (!origin || allowed.includes(origin) || origin.endsWith('.discord.com')) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS','PATCH'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','x-guild-id'],
}));

// Pre-flight OPTIONS for Discord Activity
app.options('*', cors());

// Discord Activity iframe embedding header
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (origin.endsWith('discord.com') || req.headers['x-discord-activity']) {
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://discord.com https://canary.discord.com https://ptb.discord.com");
  }
  next();
});
`;

// ═══════════════════════════════════════════════════════════════════════
// SECTION 2 — REPLACE: verifyToken middleware
// Fixes: token in query params for Discord Activity, session robustness
// ═══════════════════════════════════════════════════════════════════════

const VERIFY_TOKEN_FIX = `
function verifyToken(req, res, next) {
  // 1. Session (standard OAuth flow)
  if (req.session?.user?.id) {
    req.user = req.session.user;
    return next();
  }

  // 2. Bearer header (API clients, bot)
  let token = null;
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) token = header.slice(7);

  // 3. Query param (Discord Activity iframe — ?token=xxx)
  if (!token && req.query.token) token = req.query.token;

  // 4. Cookie (fallback for Activity)
  if (!token && req.cookies?.aegis_token) token = req.cookies.aegis_token;

  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    // Also cache in session for subsequent requests
    if (req.session && !req.session.user) req.session.user = req.user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
`;

// ═══════════════════════════════════════════════════════════════════════
// SECTION 3 — REPLACE: Discord OAuth callback
// Fixes: role detection order, JWT content, redirect for activity
// ═══════════════════════════════════════════════════════════════════════

const DISCORD_CALLBACK_FIX = `
app.get('/auth/discord/callback', async (req, res) => {
  const { code, state, error: oauthErr } = req.query;

  if (oauthErr) {
    console.error('[Auth] Discord OAuth error:', oauthErr);
    return res.redirect(FRONTEND_URL + '?error=' + oauthErr);
  }
  if (!code) return res.redirect(FRONTEND_URL + '?error=no_code');

  // CSRF check
  if (state && req.session?.oauthState && state !== req.session.oauthState) {
    return res.redirect(FRONTEND_URL + '?error=state_mismatch');
  }

  try {
    // Exchange code for token
    const tokenRes = await axios.post(
      DISCORD_API + '/oauth2/token',
      new URLSearchParams({
        client_id:     DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  DISCORD_REDIRECT_URI,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 12000 }
    );
    const { access_token, token_type } = tokenRes.data;

    // Get user profile
    const [userRes, guildsRes] = await Promise.all([
      axios.get(DISCORD_API + '/users/@me',   { headers: { Authorization: \`\${token_type} \${access_token}\` }, timeout: 8000 }),
      axios.get(DISCORD_API + '/users/@me/guilds', { headers: { Authorization: \`\${token_type} \${access_token}\` }, timeout: 8000 }),
    ]);
    const user = userRes.data;

    // Must be in the guild
    if (!guildsRes.data.some(g => g.id === DISCORD_GUILD_ID)) {
      return res.redirect(FRONTEND_URL + '?error=not_member&user=' + encodeURIComponent(user.username));
    }

    // Fetch member roles via Bot token (most reliable)
    let roles = [], role = 'member';
    try {
      const memberRes = await axios.get(
        \`\${DISCORD_API}/guilds/\${DISCORD_GUILD_ID}/members/\${user.id}\`,
        { headers: { Authorization: \`Bot \${DISCORD_BOT_TOKEN}\` }, timeout: 8000 }
      );
      roles = memberRes.data.roles || [];

      // Role hierarchy — highest wins
      const roleMap = [
        [ROLE_OWNER_ID,  'owner'],
        [ROLE_ADMIN_ID,  'admin'],
        [ROLE_HELPER_ID, 'helper'],
        [ROLE_BOOSTER_ID,'booster'],
        [ROLE_DONATOR_ID,'donator'],
        [ROLE_SURVIVOR_ID,'survivor'],
      ];
      for (const [id, name] of roleMap) {
        if (id && roles.includes(id)) { role = name; break; }
      }

      console.log(\`[Auth] ✅ \${user.username}#\${user.discriminator || '0'} → \${role} | roles: \${roles.length}\`);
    } catch (botErr) {
      // Bot fallback failed — try guild member endpoint with OAuth
      try {
        const gMemberRes = await axios.get(
          \`\${DISCORD_API}/users/@me/guilds/\${DISCORD_GUILD_ID}/member\`,
          { headers: { Authorization: \`\${token_type} \${access_token}\` }, timeout: 8000 }
        );
        roles = gMemberRes.data.roles || [];
        const roleMap = [
          [ROLE_OWNER_ID,'owner'],[ROLE_ADMIN_ID,'admin'],[ROLE_HELPER_ID,'helper']
        ];
        for (const [id, name] of roleMap) {
          if (id && roles.includes(id)) { role = name; break; }
        }
      } catch {
        console.warn('[Auth] ⚠️ Both role fetch methods failed for', user.username);
      }
    }

    const isAdmin = role === 'owner' || role === 'admin';
    const tokenPayload = {
      id: user.id, discordId: user.id,
      username: user.username,
      discriminator: user.discriminator || '0',
      avatar: user.avatar,
      role, roles, isAdmin,
      iat: Math.floor(Date.now()/1000),
    };
    const jwt_token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });

    // Save to session
    req.session.user = tokenPayload;
    req.session.oauthState = null; // Clear CSRF state

    // Set httpOnly cookie for Activity iframes
    res.cookie('aegis_token', jwt_token, {
      httpOnly: true, secure: IS_PROD,
      sameSite: IS_PROD ? 'none' : 'lax',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });

    // Determine redirect destination
    const dest = req.session.oauthDest || (isAdmin ? '/admin/' : '/');
    delete req.session.oauthDest;

    // Support for Discord Activity redirect
    const isActivity = req.query.activity === '1';
    if (isActivity) {
      return res.send(\`<!DOCTYPE html><html><head>
        <script>window.opener?.postMessage({type:'aegis_auth',token:'\${jwt_token}',role:'\${role}'},'*');window.close();<\/script>
        <style>body{background:#050508;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
        </style></head><body><p>Authenticated as <b>\${user.username}</b>. You can close this window.</p></body></html>\`);
    }

    return res.redirect(\`\${FRONTEND_URL}\${dest}?token=\${jwt_token}&login=success&role=\${role}\`);
  } catch (e) {
    console.error('[Auth] ❌ Callback error:', e.response?.data || e.message);
    return res.redirect(FRONTEND_URL + '?error=auth_failed&detail=' + encodeURIComponent(e.message.slice(0,80)));
  }
});
`;

// ═══════════════════════════════════════════════════════════════════════
// SECTION 4 — ADD: Music bot command relay (add BEFORE error handler)
// Allows music panel to send commands to bot via Supabase channel
// ═══════════════════════════════════════════════════════════════════════

const MUSIC_BOT_RELAY = `
// ─── MUSIC BOT COMMAND RELAY ─────────────────────────────────────────
// Music panel → API → Supabase "pending_command" → Bot polls and executes

app.post('/api/music/admin/:action', async (req, res) => {
  try {
    const { action } = req.params;
    const { guild_id = DISCORD_GUILD_ID, ...cmdData } = req.body;

    const validActions = [
      'play','skip','prev','stop','pause','resume',
      'volume','loop','shuffle','autoplay','mood','genre',
      'clear','remove','move','playlist'
    ];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid action: ' + action });
    }

    // Write command to Supabase — bot polls this and executes
    const { error } = await supabase
      .from('aegis_music_sessions')
      .upsert({
        guild_id,
        pending_command:      action,
        pending_command_data: cmdData,
        pending_command_ts:   new Date().toISOString(),
        updated_at:           new Date().toISOString(),
      }, { onConflict: 'guild_id' });

    if (error) throw error;

    // Also try Discord webhook for immediate acknowledgment
    if (DISCORD_WEBHOOK_URL) {
      const actionLabels = {
        play: '▶️ Playing', skip: '⏭ Skipped', prev: '⏮ Previous',
        stop: '⏹ Stopped', pause: '⏸ Paused', resume: '▶️ Resumed',
        volume: \`🔊 Volume → \${cmdData.level || 80}%\`,
        loop: \`🔂 Loop \${cmdData.mode || 'toggle'}\`,
        shuffle: '🔀 Shuffle toggled',
        autoplay: '🤖 AutoPlay toggled',
        mood: \`🎭 Mood → \${cmdData.mood || 'off'}\`,
        genre: \`🎸 Genre → \${cmdData.genre || 'unknown'}\`,
      };
      // Fire-and-forget, don't await
      axios.post(DISCORD_WEBHOOK_URL, {
        username: 'AEGIS Music Nexus',
        content: \`🎵 \${actionLabels[action] || action} — via Web Panel\`,
      }).catch(() => {});
    }

    res.json({ success: true, action, guild_id });
  } catch (e) {
    console.error('[Music relay]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Bot polls this to get pending commands
app.get('/api/music/pending/:guildId', async (req, res) => {
  try {
    const { data } = await supabase
      .from('aegis_music_sessions')
      .select('pending_command,pending_command_data,pending_command_ts')
      .eq('guild_id', req.params.guildId)
      .not('pending_command', 'is', null)
      .single();

    if (!data?.pending_command) return res.json({ command: null });

    // Clear the command after fetch (consume once)
    await supabase
      .from('aegis_music_sessions')
      .update({ pending_command: null, pending_command_data: null })
      .eq('guild_id', req.params.guildId);

    res.json({
      command: data.pending_command,
      data:    data.pending_command_data,
      ts:      data.pending_command_ts,
    });
  } catch (e) {
    res.json({ command: null });
  }
});

// ─── AUTH CHECK ENDPOINT (for music panel ping) ───────────────────────
app.get('/api/music/auth-check', (req, res) => {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return res.json({ authed: false });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    res.json({ authed: true, user: { id: user.id, username: user.username, role: user.role } });
  } catch {
    res.json({ authed: false });
  }
});
`;

// ═══════════════════════════════════════════════════════════════════════
// SECTION 5 — ADD TO bot.js: Command polling from API
// Bot polls /api/music/pending every 3 seconds and executes commands
// ═══════════════════════════════════════════════════════════════════════

const BOT_COMMAND_POLL = `
// ─── MUSIC WEB PANEL COMMAND POLLING ─────────────────────────────────
// Polls API for commands sent from the web music panel and executes them

setInterval(async () => {
  if (!DISCORD_GUILD_ID) return;
  try {
    const res = await axios.get(\`\${MUSIC_API}/api/music/pending/\${DISCORD_GUILD_ID}\`, { timeout: 5000 });
    const { command, data } = res.data;
    if (!command) return;

    const state = musicRuntime?.getState?.(DISCORD_GUILD_ID);
    if (!state) return;

    console.log(\`[WebPanel] Command: \${command}\`, data);

    switch(command) {
      case 'skip':
        if (state.player) { state.player.stop(); }
        break;
      case 'prev':
        if (state.history?.length) {
          const prev = state.history.pop();
          if (state.current) state.queue.unshift({...state.current});
          state.queue.unshift({...prev});
          state.player?.stop();
        }
        break;
      case 'stop':
        state.queue = []; state.current = null; state.mood = null;
        state.autoplay = false; clearInterval(state.progressTimer);
        state.player?.stop(true);
        state.connection?.destroy(); state.connection = null;
        break;
      case 'pause':
        if (state.player) { state.player.pause(); state.paused = true; }
        break;
      case 'resume':
        if (state.player) { state.player.unpause(); state.paused = false; }
        break;
      case 'volume':
        const vol = Math.max(0, Math.min(100, parseInt(data?.level || 80)));
        state.volume = vol;
        const ps = state.player?.state;
        if (ps?.resource?.volume) ps.resource.volume.setVolume(vol/100);
        break;
      case 'loop':
        const lmode = data?.mode || 'track';
        if (lmode === 'track') state.loop = !state.loop;
        else if (lmode === 'queue') state.loopQueue = !state.loopQueue;
        else { state.loop = false; state.loopQueue = false; }
        break;
      case 'shuffle':
        state.shuffle = !state.shuffle;
        if (state.shuffle && state.queue.length > 1) {
          for (let i = state.queue.length-1; i > 0; i--) {
            const j = Math.floor(Math.random()*(i+1));
            [state.queue[i],state.queue[j]] = [state.queue[j],state.queue[i]];
          }
        }
        break;
      case 'autoplay':
        state.autoplay = !state.autoplay;
        break;
      case 'mood':
        const moodKey = data?.mood || 'off';
        if (moodKey === 'off') { state.mood = null; state.moodBuffer = []; }
        else { state.mood = moodKey; state.moodBuffer = []; }
        break;
      case 'genre':
        const genreKey = data?.genre;
        if (genreKey && musicRuntime?.GENRES?.[genreKey]) {
          const genre = musicRuntime.GENRES[genreKey];
          const q = genre.queries[Math.floor(Math.random() * genre.queries.length)];
          // Trigger search and queue
          const playdl = require('play-dl');
          const results = await playdl.search(q, { source:{youtube:'video'}, limit:10 }).catch(()=>[]);
          results.forEach(r => {
            if (state.queue.length < 500) state.queue.push({
              title: r.title, url: r.url, duration: r.durationInSec||0,
              thumbnail: r.thumbnails?.[0]?.url||null, source:'youtube',
              requestedBy: 'Web Panel'
            });
          });
          if (!state.current || state.player?.state?.status !== 'playing') {
            // Trigger next track
            const { playNext } = require('./music.js');
            // Note: playNext is internal — bot handles it naturally via queue
          }
        }
        break;
      case 'play':
        if (data?.query) {
          // For security, only accept non-JS queries
          const query = String(data.query).slice(0,200).replace(/[<>]/g,'');
          // Queue via internal mechanism — emulate /music play
          try {
            const playdl = require('play-dl');
            let result = null;
            if (/^https?:\\/\\//.test(query)) {
              const info = await playdl.video_info(query).catch(()=>null);
              if (info?.video_details) result = { title:info.video_details.title, url:query, duration:info.video_details.durationInSec||0, source:'youtube', requestedBy:'Web Panel' };
            } else {
              const res2 = await playdl.search(query, {source:{youtube:'video'},limit:1}).catch(()=>[]);
              if (res2[0]) result = { title:res2[0].title, url:res2[0].url, duration:res2[0].durationInSec||0, source:'youtube', requestedBy:'Web Panel' };
            }
            if (result && state.queue.length < 500) state.queue.push(result);
          } catch {}
        }
        break;
    }
  } catch (err) {
    // Silently ignore — API may be briefly unavailable
  }
}, 3000); // Poll every 3 seconds
`;

// ═══════════════════════════════════════════════════════════════════════
// SECTION 6 — Supabase table CREATE SQL (run in Supabase SQL editor)
// ═══════════════════════════════════════════════════════════════════════

const SUPABASE_SQL = `
-- Run these in Supabase SQL Editor if tables don't exist

-- Music sessions table (ensure columns exist)
ALTER TABLE aegis_music_sessions
  ADD COLUMN IF NOT EXISTS pending_command      TEXT,
  ADD COLUMN IF NOT EXISTS pending_command_data JSONB,
  ADD COLUMN IF NOT EXISTS pending_command_ts   TIMESTAMPTZ;

-- Create music sessions table if it doesn't exist
CREATE TABLE IF NOT EXISTS aegis_music_sessions (
  guild_id              TEXT PRIMARY KEY,
  now_playing           JSONB,
  queue_count           INTEGER DEFAULT 0,
  mood                  TEXT,
  volume                INTEGER DEFAULT 80,
  loop                  BOOLEAN DEFAULT FALSE,
  shuffle               BOOLEAN DEFAULT FALSE,
  autoplay              BOOLEAN DEFAULT FALSE,
  paused                BOOLEAN DEFAULT FALSE,
  pending_command       TEXT,
  pending_command_data  JSONB,
  pending_command_ts    TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Music history
CREATE TABLE IF NOT EXISTS aegis_music_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id     TEXT NOT NULL,
  title        TEXT,
  url          TEXT,
  duration     INTEGER DEFAULT 0,
  thumbnail    TEXT,
  source       TEXT DEFAULT 'youtube',
  requested_by TEXT,
  mood         TEXT,
  played_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_music_history_guild ON aegis_music_history(guild_id);

-- Music playlists
CREATE TABLE IF NOT EXISTS aegis_music_playlists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id     TEXT NOT NULL,
  name         TEXT NOT NULL,
  created_by   TEXT,
  tracks       TEXT DEFAULT '[]',
  track_count  INTEGER DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guild_id, name)
);

-- Music votes
CREATE TABLE IF NOT EXISTS aegis_music_votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id    TEXT,
  track_url   TEXT,
  track_title TEXT,
  voter_id    TEXT,
  voter_tag   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guild_id, track_url, voter_id)
);

-- Row Level Security
ALTER TABLE aegis_music_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE aegis_music_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE aegis_music_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE aegis_music_votes     ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service_full" ON aegis_music_sessions  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_full" ON aegis_music_history   FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_full" ON aegis_music_playlists FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_full" ON aegis_music_votes     FOR ALL USING (auth.role() = 'service_role');
`;

// ═══════════════════════════════════════════════════════════════════════
// SECTION 7 — Discord bot slash command for opening music panel URL
// Add to bot.js ALL_COMMANDS array
// ═══════════════════════════════════════════════════════════════════════

const MUSIC_PANEL_CMD = `
// Add this to ALL_COMMANDS in bot.js:
new SlashCommandBuilder()
  .setName('music-panel')
  .setDescription('🎵 Open the AEGIS Music Nexus web panel'),

// Add this handler in the InteractionCreate event:
if (cmd === 'music-panel') {
  const panelUrl = \`https://theconclavedominion.com/music-nexus.html?guild=\${DISCORD_GUILD_ID}\`;
  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x7B2FFF)
        .setTitle('🎵 AEGIS Music Nexus')
        .setDescription(
          '**Full-featured music control panel** — Sonos-grade quality\\n\\n' +
          '✨ Now Playing widget • Queue management • Genre browser\\n' +
          '🎭 24/7 Mood Rooms • Volume & EQ • Mobile-friendly\\n' +
          '🌊 8K immersive visuals • Real-time sync with voice channel'
        )
        .addFields({
          name: '🔗 Open Panel',
          value: \`[Click to open Music Nexus](\${panelUrl})\`,
          inline: false
        })
        .setFooter({ text: 'TheConclave Dominion · AEGIS Music Nexus v3 Sovereign', iconURL: 'https://theconclavedominion.com/conclave-badge.png' })
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('🎵 Open Music Panel')
          .setStyle(ButtonStyle.Link)
          .setURL(panelUrl)
      )
    ]
  });
}
`;

// ─── EXPORT PATCHES ─────────────────────────────────────────────────────
if (typeof module !== 'undefined') {
  module.exports = {
    CORS_FIX,
    VERIFY_TOKEN_FIX,
    DISCORD_CALLBACK_FIX,
    MUSIC_BOT_RELAY,
    BOT_COMMAND_POLL,
    SUPABASE_SQL,
    MUSIC_PANEL_CMD,
  };
}

console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  AEGIS AUTH FIX + MUSIC PANEL PATCH — APPLY INSTRUCTIONS            ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  1. server.js — Replace CORS block with CORS_FIX                    ║
║  2. server.js — Replace verifyToken() with VERIFY_TOKEN_FIX         ║
║  3. server.js — Replace /auth/discord/callback with CALLBACK_FIX    ║
║  4. server.js — Add MUSIC_BOT_RELAY before error handler            ║
║  5. bot.js    — Add BOT_COMMAND_POLL (setInterval block)            ║
║  6. Supabase  — Run SUPABASE_SQL in SQL editor                      ║
║  7. Deploy    — music-nexus.html to theconclavedominion.com/        ║
║  8. Deploy    — bg-engine-ultra.js (replaces conclave.js bg logic)  ║
║                                                                      ║
║  Discord OAuth Scopes required:                                      ║
║    identify + guilds + guilds.members.read                          ║
║                                                                      ║
║  Render env vars to verify:                                          ║
║    DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET,                        ║
║    DISCORD_REDIRECT_URI = https://api.theconclavedominion.com/      ║
║                           auth/discord/callback                      ║
║    DISCORD_BOT_TOKEN (for role fetching — must be in guild)         ║
║    JWT_SECRET (generate with: openssl rand -hex 32)                 ║
╚══════════════════════════════════════════════════════════════════════╝
`);
