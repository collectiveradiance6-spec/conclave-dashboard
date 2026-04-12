/* ═══════════════════════════════════════════════════════════════════
   THECONCLAVE DOMINION — DISCORD BOT SLASH COMMANDS
   Add to your Render server.js (conclave-dashboard repo)
   Run deploy-commands.js once to register with Discord
   
   GUILD_ID: 1438103556610723922
   Bot invite: https://discord.com/api/oauth2/authorize?client_id=YOUR_BOT_ID&permissions=8&scope=bot+applications.commands
═══════════════════════════════════════════════════════════════════ */

const { Client, GatewayIntentBits, EmbedBuilder,
        REST, Routes, SlashCommandBuilder } = require('discord.js');

const GUILD_ID  = '1438103556610723922';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CONCLAVE_GOLD   = 0xFFB800;
const CONCLAVE_PLASMA = 0x7B2FFF;
const CONCLAVE_GREEN  = 0x35ED7E;
const CONCLAVE_RED    = 0xFF4500;

/* ── COMMAND DEFINITIONS ── */
const commands = [
  new SlashCommandBuilder()
    .setName('conclave')
    .setDescription('AEGIS Command Suite — TheConclave Dominion')
    .addSubcommand(sub => sub
      .setName('group')
      .setDescription('Group channels into a named quick-access panel')
      .addStringOption(o => o.setName('name').setDescription('Group name').setRequired(true))
      .addChannelOption(o => o.setName('channel1').setDescription('Channel 1').setRequired(true))
      .addChannelOption(o => o.setName('channel2').setDescription('Channel 2'))
      .addChannelOption(o => o.setName('channel3').setDescription('Channel 3'))
      .addChannelOption(o => o.setName('channel4').setDescription('Channel 4'))
      .addChannelOption(o => o.setName('channel5').setDescription('Channel 5'))
      .addStringOption(o => o.setName('description').setDescription('Group description'))
    )
    .addSubcommand(sub => sub
      .setName('forum')
      .setDescription('Post a formatted forum thread with rich AEGIS embed')
      .addStringOption(o => o.setName('title').setDescription('Thread title').setRequired(true))
      .addStringOption(o => o.setName('body').setDescription('Thread content (markdown supported)').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Target forum channel').setRequired(true))
      .addStringOption(o => o.setName('tags').setDescription('Comma-separated forum tags'))
    )
    .addSubcommand(sub => sub
      .setName('panel')
      .setDescription('Deploy a quick-click info panel to a channel')
      .addStringOption(o => o.setName('type').setDescription('Panel type').setRequired(true)
        .addChoices(
          {name: 'Server Status (all 10 maps)',   value: 'server-status'},
          {name: 'ClaveShard Shop',                value: 'shard-shop'},
          {name: 'Rules Summary',                  value: 'rules'},
          {name: 'How to Connect',                 value: 'connect'},
          {name: 'Council Contacts',               value: 'council'},
          {name: 'Donation Methods',               value: 'donate'},
        ))
      .addChannelOption(o => o.setName('channel').setDescription('Where to deploy').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('Post live ARK server status for all 10 maps')
      .addChannelOption(o => o.setName('channel').setDescription('Where to post (defaults to current)'))
      .addBooleanOption(o => o.setName('show_offline').setDescription('Show offline servers?'))
    )
    .addSubcommand(sub => sub
      .setName('shards')
      .setDescription('Log a ClaveShard order and notify the Council')
      .addStringOption(o => o.setName('player').setDescription('Player in-game name').setRequired(true))
      .addIntegerOption(o => o.setName('tier').setDescription('Shard tier (1-30, or 99 for insurance)').setRequired(true).setMinValue(1).setMaxValue(99))
      .addStringOption(o => o.setName('server').setDescription('Which ARK server').setRequired(true))
      .addStringOption(o => o.setName('platform').setDescription('Platform').addChoices({name:'Xbox',value:'Xbox'},{name:'PlayStation',value:'PlayStation'},{name:'PC',value:'PC'}))
      .addStringOption(o => o.setName('notes').setDescription('Any notes about the order'))
    )
    .addSubcommand(sub => sub
      .setName('announce')
      .setDescription('Broadcast a styled AEGIS announcement')
      .addStringOption(o => o.setName('message').setDescription('Announcement content').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Where to post').setRequired(true))
      .addRoleOption(o => o.setName('ping').setDescription('Role to ping (optional)'))
      .addStringOption(o => o.setName('title').setDescription('Embed title'))
    )
    .addSubcommand(sub => sub
      .setName('pin')
      .setDescription('Pin an important message with AEGIS formatting')
      .addStringOption(o => o.setName('message').setDescription('Message to pin').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
    ),
].map(cmd => cmd.toJSON());

/* ── DEPLOY COMMANDS (run once) ── */
async function deployCommands() {
  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('Slash commands registered!');
  } catch (e) {
    console.error('Deploy error:', e);
  }
}

/* ── BOT CLIENT ── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ]
});

client.once('ready', () => {
  console.log(`AEGIS online — ${client.user.tag}`);
  client.user.setActivity('TheConclave Dominion | /conclave', { type: 'PLAYING' });
});

/* ── INTERACTION HANDLER ── */
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options } = interaction;
  if (commandName !== 'conclave') return;

  const sub = options.getSubcommand();
  await interaction.deferReply({ ephemeral: sub === 'shards' });

  try {
    switch (sub) {
      case 'group':     await handleGroup(interaction); break;
      case 'forum':     await handleForum(interaction); break;
      case 'panel':     await handlePanel(interaction); break;
      case 'status':    await handleStatus(interaction); break;
      case 'shards':    await handleShards(interaction); break;
      case 'announce':  await handleAnnounce(interaction); break;
      case 'pin':       await handlePin(interaction); break;
      default: await interaction.editReply({ content: 'Unknown command.' });
    }
  } catch (e) {
    console.error(e);
    await interaction.editReply({ content: '⚠️ An error occurred. Check AEGIS logs.' });
  }
});

/* ══════════════════════════════════════
   COMMAND HANDLERS
══════════════════════════════════════ */

async function handleGroup(interaction) {
  const name = interaction.options.getString('name');
  const desc = interaction.options.getString('description') || 'Quick-access channel panel';
  const channels = [1,2,3,4,5]
    .map(n => interaction.options.getChannel(`channel${n}`))
    .filter(Boolean);

  const embed = new EmbedBuilder()
    .setColor(CONCLAVE_PLASMA)
    .setTitle(`🗂️ ${name}`)
    .setDescription(desc)
    .addFields(
      channels.map(ch => ({
        name: `${ch.type === 15 ? '💬' : ch.type === 5 ? '📢' : '#'} ${ch.name}`,
        value: `<#${ch.id}>`,
        inline: true,
      }))
    )
    .setFooter({ text: `TheConclave Dominion · Created by ${interaction.user.username}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleForum(interaction) {
  const title  = interaction.options.getString('title');
  const body   = interaction.options.getString('body');
  const channel = interaction.options.getChannel('channel');
  const tags   = interaction.options.getString('tags');

  const embed = new EmbedBuilder()
    .setColor(CONCLAVE_GOLD)
    .setTitle(title)
    .setDescription(body)
    .setFooter({ text: `Posted by ${interaction.user.username} via AEGIS` })
    .setTimestamp();

  if (tags) embed.addFields({ name: 'Tags', value: tags.split(',').map(t => `\`${t.trim()}\``).join(' ') });

  if (channel.isThread() || channel.type === 15) {
    // Forum channel — create thread
    await channel.threads.create({ name: title, message: { embeds: [embed] } });
    await interaction.editReply({ content: `✅ Forum thread created in <#${channel.id}>`, ephemeral: true });
  } else {
    await channel.send({ embeds: [embed] });
    await interaction.editReply({ content: `✅ Posted to <#${channel.id}>`, ephemeral: true });
  }
}

async function handlePanel(interaction) {
  const type    = interaction.options.getString('type');
  const channel = interaction.options.getChannel('channel');

  const panels = {
    'server-status': () => new EmbedBuilder().setColor(CONCLAVE_GREEN)
      .setTitle('🟢 TheConclave ARK Servers')
      .setDescription('All 10 maps — 5x Crossplay — Xbox · PlayStation · PC')
      .addFields(
        { name: '🌋 Aberration (PvP)',  value: '`217.114.196.80:5540`',  inline: true },
        { name: '🏜️ Scorched Earth',    value: '`217.114.196.103:5240`', inline: true },
        { name: '🌿 Valguero',           value: '`85.190.136.141:5090`',  inline: true },
        { name: '⭐ Amissa (Patreon)',   value: '`217.114.196.80:5180`',  inline: true },
        { name: '🌙 Astraeos',           value: '`217.114.196.9:5320`',   inline: true },
        { name: '🏝️ Lost Colony',         value: '`217.114.196.104:5150`', inline: true },
        { name: '🏔️ The Island',          value: '`217.114.196.102:5390`', inline: true },
        { name: '🗺️ The Center',           value: '`31.214.163.71:5120`',  inline: true },
        { name: '💀 Extinction',          value: '`31.214.196.102:6440`', inline: true },
        { name: '🌊 Volcano',             value: '`217.114.196.59:5050`',  inline: true },
      )
      .setFooter({ text: 'TheConclave Dominion · theconclavedominion.com' }),
    'shard-shop': () => new EmbedBuilder().setColor(CONCLAVE_GOLD)
      .setTitle('💎 ClaveShard Shop')
      .setDescription('Purchase in-game packages from the Council. All orders fulfilled within 24-72 hours.')
      .addFields(
        { name: 'Payment',  value: 'CashApp: **$TheConclaveDominion**\nChime: **$ANLIKESEF**', inline: true },
        { name: 'Tiers',    value: '1 · 2 · 3 · 5 · 6 · 8 · 10 · 12 · 15 · 20 · 30\n🛡️ Dino Insurance', inline: true },
        { name: 'How to Order', value: 'Visit **theconclavedominion.com/ark** → Shard Shop', inline: false },
      )
      .setFooter({ text: 'All sales final · Council-verified' }),
    'rules': () => new EmbedBuilder().setColor(CONCLAVE_RED)
      .setTitle('📜 Conclave Codex — Rules')
      .setDescription('Read and follow these rules. Violations result in moderation action.')
      .addFields(
        { name: '1. No Griefing', value: 'Respect all builds and players' },
        { name: '2. No Cheating', value: 'Any exploit = immediate ban' },
        { name: '3. No Spam', value: 'Applies to chat and orders' },
        { name: '4. Respect the Council', value: 'Admin decisions are final' },
        { name: '5. English in main channels', value: 'Other languages in DMs/threads' },
      )
      .setFooter({ text: 'TheConclave Dominion · Zero tolerance' }),
    'connect': () => new EmbedBuilder().setColor(CONCLAVE_PLASMA)
      .setTitle('🎮 How to Connect')
      .setDescription('Join TheConclave Dominion in minutes.')
      .addFields(
        { name: '🌋 ARK: Survival Ascended', value: 'Open ARK → Unofficial Servers → Search "TheConclave"\nAll 10 maps available · Xbox · PS · PC crossplay' },
        { name: '⛏️ Minecraft Bedrock', value: 'Add Server → `134.255.214.44:10090`\nBedrock Edition only' },
        { name: '💬 Discord', value: 'You\'re already here! Check #get-started' },
      )
      .setFooter({ text: 'theconclavedominion.com · 5x Crossplay' }),
    'council': () => new EmbedBuilder().setColor(CONCLAVE_GOLD)
      .setTitle('🏛️ Meet The Council')
      .setDescription('The humans behind the Dominion.')
      .addFields(
        { name: 'Co-Founders',  value: '@TW · @SLOTHIE' },
        { name: 'Council Admin', value: '@ARBANION · @JENNY · @ICYREAPER · @SANDY' },
        { name: 'Admin Team',   value: '@JAKE · @ANKY · @KAMI · @CREDIBLEDEVIL · @ROSEY · @SYCOBITCH' },
        { name: 'Need Help?',   value: 'Open a ticket or ping @Admin' },
      )
      .setFooter({ text: 'TheConclave Dominion · theconclavedominion.com/meet' }),
    'donate': () => new EmbedBuilder().setColor(CONCLAVE_GOLD)
      .setTitle('💛 Support TheConclave Dominion')
      .setDescription('Every contribution keeps the servers running.')
      .addFields(
        { name: '💸 CashApp',  value: '**$TheConclaveDominion**' },
        { name: '💳 Chime',    value: '**$ANLIKESEF**' },
        { name: '🎁 Patreon',  value: 'patreon.com/theconclavedominion\n*Monthly recurring + Amissa access*' },
        { name: '🖥️ Nitrado',  value: 'server.nitrado.net/donations/donate/12326221' },
        { name: '🔗 30% Affiliate', value: 'Get a Nitrado server → nitrado-aff.com/59GPP8X/D42TT/\n*30% back to the Dominion at no cost to you*' },
      )
      .setFooter({ text: 'theconclavedominion.com/donate' }),
  };

  const embed = panels[type] ? panels[type]() : new EmbedBuilder().setTitle('Panel').setDescription('Type not found');
  await channel.send({ embeds: [embed] });
  await interaction.editReply({ content: `✅ Panel deployed to <#${channel.id}>`, ephemeral: true });
}

async function handleStatus(interaction) {
  // Fetch real data from your API
  let serverData;
  try {
    const res = await fetch('https://conclave-dashboard.onrender.com/servers');
    serverData = await res.json();
  } catch(e) {
    serverData = { servers: [] };
  }

  const channel = interaction.options.getChannel('channel') || interaction.channel;
  const showOffline = interaction.options.getBoolean('show_offline') ?? true;
  const servers = serverData.servers || [];

  const onlineCount = servers.filter(s => s.online).length;

  const embed = new EmbedBuilder()
    .setColor(onlineCount >= 8 ? CONCLAVE_GREEN : onlineCount >= 5 ? CONCLAVE_GOLD : CONCLAVE_RED)
    .setTitle(`${onlineCount >= 8 ? '🟢' : '🟡'} TheConclave Server Status`)
    .setDescription(`**${onlineCount}/${servers.length || 10} maps online** · 5x Crossplay · Xbox · PS · PC`)
    .addFields(
      servers
        .filter(s => showOffline || s.online)
        .map(s => ({
          name: `${s.online ? '🟢' : '🔴'} ${s.emoji || ''} ${s.display || s.name}`,
          value: s.online
            ? `\`${s.ip}:${s.port}\` · ${s.players || 0}/${s.maxPlayers || 20} players${s.isPvP ? ' · **PvP**' : ''}`
            : '`Offline`',
          inline: true,
        }))
    )
    .setFooter({ text: 'TheConclave Dominion · theconclavedominion.com' })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  await interaction.editReply({ content: `✅ Status posted to <#${channel.id}>`, ephemeral: true });
}

async function handleShards(interaction) {
  const player   = interaction.options.getString('player');
  const tier     = interaction.options.getInteger('tier');
  const server   = interaction.options.getString('server');
  const platform = interaction.options.getString('platform') || 'Unknown';
  const notes    = interaction.options.getString('notes') || 'None';

  // Log to Render API
  try {
    await fetch('https://conclave-dashboard.onrender.com/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player, tier: tier === 99 ? 'INS' : tier,
        shards: tier === 99 ? 5 : tier,
        platform, server: server, note: notes,
        source: 'discord-slash-command',
        requestedBy: interaction.user.username,
      }),
    });
  } catch(e) { /* API may be warming up */ }

  const embed = new EmbedBuilder()
    .setColor(CONCLAVE_GOLD)
    .setTitle(`💎 ClaveShard Order Logged`)
    .addFields(
      { name: 'Player',    value: player,                           inline: true  },
      { name: 'Tier',      value: tier === 99 ? '🛡️ Insurance' : `Tier ${tier}`, inline: true  },
      { name: 'Platform',  value: platform,                         inline: true  },
      { name: 'Server',    value: server,                           inline: true  },
      { name: 'Notes',     value: notes,                            inline: false },
      { name: 'Status',    value: '⏳ **Pending** — Council will fulfill within 24-72 hours', inline: false },
    )
    .setFooter({ text: `Ordered by ${interaction.user.username} via AEGIS` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  // Notify Council via webhook
  const councilWebhookUrl = process.env.DISCORD_WEBHOOK_ORDERS;
  if (councilWebhookUrl) {
    const notif = new EmbedBuilder()
      .setColor(CONCLAVE_GOLD)
      .setTitle('🛒 New ClaveShard Order')
      .setDescription(`**${player}** ordered **Tier ${tier}** on **${server}** (${platform})`)
      .setFooter({ text: 'Fulfill within 24-72 hours' });
    try {
      await fetch(councilWebhookUrl, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ embeds: [notif] }) });
    } catch(e) {}
  }
}

async function handleAnnounce(interaction) {
  const message = interaction.options.getString('message');
  const channel = interaction.options.getChannel('channel');
  const ping    = interaction.options.getRole('ping');
  const title   = interaction.options.getString('title') || '📢 TheConclave Announcement';

  const embed = new EmbedBuilder()
    .setColor(CONCLAVE_PLASMA)
    .setTitle(title)
    .setDescription(message)
    .setFooter({ text: `Posted by ${interaction.user.username} via AEGIS · TheConclave Dominion` })
    .setTimestamp();

  const content = ping ? `${ping}` : undefined;
  await channel.send({ content, embeds: [embed] });
  await interaction.editReply({ content: `✅ Announcement sent to <#${channel.id}>`, ephemeral: true });
}

async function handlePin(interaction) {
  const message = interaction.options.getString('message');
  const channel = interaction.options.getChannel('channel');

  const embed = new EmbedBuilder()
    .setColor(CONCLAVE_GOLD)
    .setTitle('📌 Pinned Notice')
    .setDescription(message)
    .setFooter({ text: `Pinned by ${interaction.user.username} · TheConclave Dominion` })
    .setTimestamp();

  const msg = await channel.send({ embeds: [embed] });
  try { await msg.pin(); } catch(e) {}
  await interaction.editReply({ content: `✅ Message pinned in <#${channel.id}>`, ephemeral: true });
}

/* ── LOGIN ── */
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--deploy') {
    deployCommands();
  } else {
    client.login(BOT_TOKEN);
  }
}

module.exports = { client, deployCommands };
