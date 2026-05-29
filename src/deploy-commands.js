const { REST, Routes } = require("discord.js");
const { buildCommands } = require("./commands");
const { getConfig } = require("./config");

async function main() {
  const config = getConfig();
  const rest = new REST({ version: "10" }).setToken(config.token);
  const commands = buildCommands();

  console.log(`Deploying ${commands.length} guild slash command groups...`);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
    body: commands
  });
  console.log("Slash commands deployed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
