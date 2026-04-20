// ═══════════════════════════════════════════════════════════════════════
// AEGIS MUSIC NEXUS — API ROUTES v1.0
// Add these routes to your server.js BEFORE the error handler
// Handles: session state, history, rooms, votes, playlists
// ═══════════════════════════════════════════════════════════════════════

// ─── MUSIC SESSION (bot pushes state here every 15s) ───────────────────
app.post('/api/music/session', async (req, res) => {
  try {
    const {guild_id, now_playing, queue_count, mood, volume, loop, shuffle, autoplay, updated_at} = req.body;
    if (!guild_id) return res.status(400).json({ error: 'guild_id required' });
    const { error } = await supabase.from('aegis_music_sessions').upsert({
      guild_id, now_playing: now_playing || null, queue_count: queue_count || 0,
      mood: mood || null, volume: volume || 80, loop: loop || false,
      shuffle: shuffle || false, autoplay: autoplay || false,
      updated_at: updated_at || new Date().toISOString(),
    }, { onConflict: 'guild_id' });
    if (error) throw error;

    // Log to history if now_playing
    if (now_playing?.url) {
      supabase.from('aegis_music_history').insert({
        guild_id,
        title:        now_playing.title || 'Unknown',
        url:          now_playing.url,
        duration:     now_playing.duration || 0,
        thumbnail:    now_playing.thumbnail || null,
        source:       now_playing.source || 'youtube',
        requested_by: now_playing.requestedBy || 'AutoPlay',
        mood:         mood || null,
      }).then(() => {}).catch(() => {});
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET CURRENT SESSION (frontend polls this) ────────────────────────
app.get('/api/music/session/:guildId', async (req, res) => {
  try {
    const { guildId } = req.params;
    const { data, error } = await supabase
      .from('aegis_music_sessions')
      .select('*')
      .eq('guild_id', guildId)
      .single();
    if (error || !data) return res.json({ active: false });
    const staleMs = Date.now() - new Date(data.updated_at).getTime();
    res.json({ ...data, active: staleMs < 30000, stale: staleMs > 30000 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MUSIC HISTORY ────────────────────────────────────────────────────
app.get('/api/music/history/:guildId', async (req, res) => {
  try {
    const { guildId } = req.params;
    const limit = Math.min(parseInt(req.query.limit || '20'), 100);
    const { data, error } = await supabase
      .from('aegis_music_history')
      .select('title,url,duration,thumbnail,source,requested_by,mood,played_at')
      .eq('guild_id', guildId)
      .order('played_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ALL SESSIONS (room browser) ──────────────────────────────────────
app.get('/api/music/sessions', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('aegis_music_sessions')
      .select('guild_id,now_playing,queue_count,mood,volume,updated_at')
      .gt('updated_at', new Date(Date.now() - 60000).toISOString()) // active in last 60s
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PLAYLISTS (public read, auth write) ──────────────────────────────
app.get('/api/music/playlists/:guildId', async (req, res) => {
  try {
    const { guildId } = req.params;
    const { data, error } = await supabase
      .from('aegis_music_playlists')
      .select('id,name,created_by,track_count,updated_at')
      .eq('guild_id', guildId)
      .order('updated_at', { ascending: false })
      .limit(25);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/music/playlists/:guildId/:name', async (req, res) => {
  try {
    const { guildId, name } = req.params;
    const { data, error } = await supabase
      .from('aegis_music_playlists')
      .select('*')
      .eq('guild_id', guildId)
      .eq('name', decodeURIComponent(name))
      .single();
    if (error || !data) return res.status(404).json({ error: 'Playlist not found' });
    res.json({ ...data, tracks: JSON.parse(data.tracks || '[]') });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MUSIC VOTES (community queue voting) ─────────────────────────────
app.post('/api/music/vote', verifyToken, async (req, res) => {
  try {
    const { guild_id, track_url, track_title } = req.body;
    const voter_id = req.user?.id || req.user?.discordId;
    const voter_tag = req.user?.username;
    if (!guild_id || !track_url || !voter_id) return res.status(400).json({ error: 'Missing fields' });
    const { error } = await supabase.from('aegis_music_votes').upsert({
      guild_id, track_url, track_title, voter_id, voter_tag,
    }, { onConflict: 'guild_id,track_url,voter_id', ignoreDuplicates: true });
    if (error) throw error;
    // Get vote count
    const { count } = await supabase.from('aegis_music_votes').select('*', { count:'exact',head:true }).eq('guild_id', guild_id).eq('track_url', track_url);
    res.json({ success: true, votes: count || 1 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/music/votes/:guildId', async (req, res) => {
  try {
    const { guildId } = req.params;
    const { data, error } = await supabase
      .from('aegis_music_votes')
      .select('track_url,track_title,voter_id')
      .eq('guild_id', guildId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if (error) throw error;
    // Group by track
    const grouped = {};
    for (const v of (data || [])) {
      if (!grouped[v.track_url]) grouped[v.track_url] = { track_url: v.track_url, track_title: v.track_title, votes: 0 };
      grouped[v.track_url].votes++;
    }
    res.json(Object.values(grouped).sort((a, b) => b.votes - a.votes));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MUSIC ROOMS (admin managed permanent rooms) ───────────────────────
app.get('/api/music/rooms/:guildId', async (req, res) => {
  try {
    const { guildId } = req.params;
    const { data, error } = await supabase
      .from('aegis_music_rooms')
      .select('*')
      .eq('guild_id', guildId)
      .eq('active', true);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/music/rooms', verifyToken, checkAdmin, async (req, res) => {
  try {
    const { guild_id, name, mood, voice_channel_id, text_channel_id } = req.body;
    const { data, error } = await supabase.from('aegis_music_rooms').insert({
      guild_id, name, mood, voice_channel_id, text_channel_id,
      created_by: req.user?.username || 'admin',
    }).select().single();
    if (error) throw error;
    res.json({ success: true, room: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── NEXUS PUBLIC STATS ────────────────────────────────────────────────
app.get('/api/music/stats', async (req, res) => {
  try {
    const [sessionsRes, historyRes, playlistsRes] = await Promise.all([
      supabase.from('aegis_music_sessions').select('*', { count:'exact', head:true }),
      supabase.from('aegis_music_history').select('*', { count:'exact', head:true }),
      supabase.from('aegis_music_playlists').select('*', { count:'exact', head:true }),
    ]);
    res.json({
      active_sessions: sessionsRes.count || 0,
      tracks_played:   historyRes.count || 0,
      saved_playlists: playlistsRes.count || 0,
      ts: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── SHOP ORDERS PAGE (fix for frontend not showing orders) ───────────
// This route supports the shop.html order submission form directly
app.post('/api/shop/submit', async (req, res) => {
  try {
    const {
      discord_username, character_name, tier, tier_cost,
      platform, server, items, notes, discord_id
    } = req.body;

    if (!character_name || !tier || !server)
      return res.status(400).json({ error: 'Missing required fields: character_name, tier, server' });

    const ref = 'ORD-' + Date.now().toString(36).toUpperCase();
    const itemsList = Array.isArray(items) ? items : [tier];

    // Save to Supabase
    const { data, error } = await supabase.from('aegis_orders').insert({
      ref,
      discord_id:   discord_id || null,
      discord_tag:  discord_username || 'Unknown',
      tier:         `Tier ${tier}`,
      shards:       parseInt(tier_cost) || parseInt(tier) || 0,
      platform:     platform || 'Unknown',
      server:       server,
      notes:        notes || itemsList.join(', '),
      status:       'pending',
    }).select().single();
    if (error) throw error;

    // Discord webhook notification
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL || process.env.SHOP_WEBHOOK_URL;
    if (webhookUrl) {
      const tierColors = { 1:0x00c8ff,2:0x0088ff,3:0xcc44ff,5:0xff8800,6:0xff2266,8:0x00ddcc,10:0x4488ff,12:0xffcc00,15:0xff6600,20:0xff44cc,30:0xffaa00 };
      const color = tierColors[parseInt(tier)] || 0xFFB800;
      await axios.post(webhookUrl, {
        username: 'ClaveShard Shop',
        embeds: [{
          title:  `🛒 New Order — Tier ${tier}`,
          color,
          fields: [
            { name: '👤 Player',   value: character_name,           inline: true },
            { name: '🎮 Platform', value: platform || 'Unknown',    inline: true },
            { name: '🗺️ Server',   value: server,                   inline: true },
            { name: '💎 Cost',     value: `${tier_cost || tier} Shards`, inline: true },
            { name: '🔖 Ref',      value: `\`${ref}\``,             inline: true },
            { name: '💬 Discord',  value: discord_username || 'N/A',inline: true },
            { name: '📋 Items',    value: itemsList.map(i=>`• ${i}`).join('\n').slice(0,500), inline: false },
            { name: '📝 Notes',    value: notes || '—', inline: false },
          ],
          footer:    { text: 'TheConclave Dominion • ClaveShard Shop' },
          timestamp: new Date().toISOString(),
        }],
      }).catch(e => console.error('[shop webhook]', e.message));
    }

    res.json({ success: true, ref, order_id: data.id });
  } catch (e) {
    console.error('[shop/submit]', e.message);
    res.status(500).json({ error: 'Order submission failed: ' + e.message });
  }
});

// Get orders for a specific Discord user (for order history page)
app.get('/api/shop/my-orders', verifyToken, async (req, res) => {
  try {
    const discord_id = req.user?.id || req.user?.discordId;
    if (!discord_id) return res.status(400).json({ error: 'Not authenticated' });
    const { data, error } = await supabase
      .from('aegis_orders')
      .select('ref,tier,shards,platform,server,notes,status,fulfilled_at,created_at')
      .eq('discord_id', discord_id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Public order status lookup by ref
app.get('/api/shop/order/:ref', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('aegis_orders')
      .select('ref,tier,platform,server,status,fulfillment_note,created_at,fulfilled_at')
      .eq('ref', req.params.ref.toUpperCase())
      .single();
    if (error || !data) return res.status(404).json({ error: 'Order not found' });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
