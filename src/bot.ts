import { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    Interaction 
} from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const TOKEN = process.env.DISCORD_BOT_TOKEN!;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID!;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// ============================
// READY EVENT
// ============================
client.once("ready", () => {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`🛡️ Conclave Aegis Online`);
    console.log(`🤖 Logged in as ${client.user?.tag}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━");
});

// ============================
// INTERACTION HANDLER
// ============================
client.on("interactionCreate", async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "ping") {
        await interaction.reply("🏓 Aegis responding.");
    }
});

// ============================
// DEPLOY SLASH COMMAND
// ============================
async function deployCommands() {
    const commands = [
        {
            name: "ping",
            description: "Check if the bot is alive",
        },
    ];

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    try {
        console.log("🔄 Deploying slash commands...");
        await rest.put(
            Routes.applicationGuildCommands(
  process.env.DISCORD_CLIENT_ID as string,
  process.env.DISCORD_GUILD_ID as string)
        );
        console.log("✅ Slash commands deployed.");
    } catch (error) {
        console.error(error);
    }
}

deployCommands();
console.log("Using token from:", process.env.DISCORD_BOT_TOKEN?.slice(0, 10));
client.login(TOKEN);