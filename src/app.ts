import express from "express";
import dotenv from "dotenv";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Interaction,
} from "discord.js";

// ==========================
// 🔐 ENVIRONMENT SETUP
// ==========================
dotenv.config();

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  PORT,
  NODE_ENV,
} = process.env;

if (!DISCORD_TOKEN) throw new Error("❌ DISCORD_TOKEN missing");
if (!CLIENT_ID) throw new Error("❌ CLIENT_ID missing");

const APP_PORT = Number(PORT) || 5001;
const IS_PROD = NODE_ENV === "production";

// ==========================
// 🛡 EXPRESS SERVER
// ==========================
const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.status(200).json({
    name: "Conclave Aegis",
    status: "online",
    environment: NODE_ENV || "development",
  });
});

// Future dashboard API route example
app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

// ==========================
// 🤖 DISCORD CLIENT
// ==========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

// ==========================
// ⚔️ SLASH COMMANDS
// ==========================
const commands = [
  {
    name: "ping",
    description: "Check Aegis latency",
  },
  {
    name: "status",
    description: "Check bot & server status",
  },
];

async function deploySlashCommands() {
  console.log("🔄 Deploying slash commands...");

  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN!);

  try {
    if (!IS_PROD && GUILD_ID) {
      // Faster deploy for dev
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID!, GUILD_ID),
        { body: commands }
      );
      console.log("✅ Guild commands deployed (dev mode)");
    } else {
      await rest.put(
        Routes.applicationCommands(CLIENT_ID!),
        { body: commands }
      );
      console.log("✅ Global commands deployed (production)");
    }
  } catch (error) {
    console.error("❌ Slash command deployment failed:", error);
  }
}

// ==========================
// 🧠 INTERACTION HANDLER
// ==========================
client.on("interactionCreate", async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case "ping":
        await interaction.reply({
          content: `🏓 Pong! ${client.ws.ping}ms`,
          ephemeral: true,
        });
        break;

      case "status":
        await interaction.reply({
          content: `🛡 Aegis is operational.\nEnvironment: ${
            NODE_ENV || "development"
          }\nLatency: ${client.ws.ping}ms`,
          ephemeral: true,
        });
        break;

      default:
        await interaction.reply({
          content: "Command not recognized.",
          ephemeral: true,
        });
    }
  } catch (error) {
    console.error("❌ Interaction error:", error);
  }
});

// ==========================
// 🚀 STARTUP SEQUENCE
// ==========================
async function start() {
  try {
    await deploySlashCommands();
    await client.login(DISCORD_TOKEN);
    console.log("🤖 Discord client connected");

    app.listen(APP_PORT, () => {
      console.log(
        `🚀 Express server running on port ${APP_PORT} (${NODE_ENV || "dev"})`
      );
    });
  } catch (error) {
    console.error("❌ Startup failed:", error);
    process.exit(1);
  }
}

start();

// ==========================
// 🛑 GRACEFUL SHUTDOWN
// ==========================
process.on("SIGINT", async () => {
  console.log("🛑 Shutting down Aegis...");
  await client.destroy();
  process.exit(0);
});