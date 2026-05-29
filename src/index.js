const {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials
} = require("discord.js");
const { handleClassesCommand, handleReactionRole } = require("./classes");
const { getConfig } = require("./config");
const { handleReminderCommand, startReminderLoop } = require("./reminders");

function createClient() {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User]
  });
}

async function replyWithError(interaction, error) {
  const message = `エラー: ${error.message || "処理に失敗しました。"}`;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(message).catch(() => null);
  } else {
    await interaction
      .reply({
        content: message,
        flags: MessageFlags.Ephemeral
      })
      .catch(() => null);
  }
}

async function main() {
  const config = getConfig();
  const client = createClient();

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
    console.log(`Guild target: ${config.guildId}`);
    startReminderLoop(readyClient);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
      if (interaction.commandName === "classes") {
        await handleClassesCommand(interaction, config);
        return;
      }
      if (interaction.commandName === "reminder") {
        await handleReminderCommand(interaction, config);
      }
    } catch (error) {
      console.error(error);
      await replyWithError(interaction, error);
    }
  });

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    await handleReactionRole(reaction, user, true).catch((error) => {
      console.error("Failed to add reaction role:", error);
    });
  });

  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    await handleReactionRole(reaction, user, false).catch((error) => {
      console.error("Failed to remove reaction role:", error);
    });
  });

  await client.login(config.token);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
