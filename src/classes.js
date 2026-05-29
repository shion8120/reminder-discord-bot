const { ChannelType, EmbedBuilder, MessageFlags } = require("discord.js");
const { readState, updateState, writeState } = require("./storage");

const DEFAULT_EXCLUDED_NAMES = new Set([
  "general",
  "bot",
  "bot-commands",
  "reminder",
  "reminders",
  "雑談",
  "リマインド",
  "お知らせ"
]);

const PANEL_EMOJIS = [
  "1️⃣",
  "2️⃣",
  "3️⃣",
  "4️⃣",
  "5️⃣",
  "6️⃣",
  "7️⃣",
  "8️⃣",
  "9️⃣",
  "🔟",
  "🇦",
  "🇧",
  "🇨",
  "🇩",
  "🇪",
  "🇫",
  "🇬",
  "🇭",
  "🇮",
  "🇯"
];

function parseExcludeNames(input) {
  const names = new Set(DEFAULT_EXCLUDED_NAMES);
  for (const item of String(input || "").split(/[,\n、]+/)) {
    const name = item.trim();
    if (name) names.add(name);
  }
  return names;
}

function parseColor(input) {
  const normalized = String(input || "#4f8cff").trim();
  if (!/^#[0-9a-f]{6}$/i.test(normalized)) {
    throw new Error("ロール色は `#4f8cff` のような 6 桁の16進カラーで入力してください。");
  }
  return Number.parseInt(normalized.slice(1), 16);
}

async function fetchGuildCaches(guild) {
  await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
}

function getTextChannels(guild, categoryId, excludeNames) {
  return [...guild.channels.cache.values()]
    .filter((channel) => channel.type === ChannelType.GuildText)
    .filter((channel) => !categoryId || channel.parentId === categoryId)
    .filter((channel) => !excludeNames.has(channel.name))
    .sort((a, b) => {
      if ((a.parentId || "") !== (b.parentId || "")) return (a.parentId || "").localeCompare(b.parentId || "");
      return a.position - b.position;
    });
}

function getStoredRole(guild, state, channelId) {
  const roleId = state.classRoles[channelId]?.roleId;
  return roleId ? guild.roles.cache.get(roleId) : null;
}

function findRoleByName(guild, name) {
  return guild.roles.cache.find((role) => !role.managed && role.name === name) || null;
}

async function ensureRoleForChannel(guild, channel, state, color) {
  let role = getStoredRole(guild, state, channel.id) || findRoleByName(guild, channel.name);
  const changes = [];

  if (!role) {
    role = await guild.roles.create({
      name: channel.name,
      color,
      mentionable: true,
      reason: `Class role for #${channel.name}`
    });
    changes.push("created");
  } else {
    if (role.name !== channel.name) {
      role = await role.setName(channel.name, `Sync class role name with #${channel.name}`);
      changes.push("renamed");
    }
    if (!role.mentionable) {
      role = await role.setMentionable(true, "Allow class reminders to mention this role");
      changes.push("mentionable");
    }
  }

  state.classRoles[channel.id] = {
    guildId: guild.id,
    channelId: channel.id,
    channelName: channel.name,
    roleId: role.id,
    roleName: role.name,
    updatedAt: new Date().toISOString()
  };

  return { role, changes };
}

async function resolveClassRole(guild, channel, state) {
  const role = getStoredRole(guild, state, channel.id) || findRoleByName(guild, channel.name);
  if (!role) {
    return null;
  }

  state.classRoles[channel.id] = {
    guildId: guild.id,
    channelId: channel.id,
    channelName: channel.name,
    roleId: role.id,
    roleName: role.name,
    updatedAt: new Date().toISOString()
  };

  return role;
}

function toEmojiKey(reaction) {
  return reaction.emoji.id || reaction.emoji.name;
}

async function handleClassesCommand(interaction, config) {
  if (interaction.guildId !== config.guildId) {
    await interaction.reply({
      content: "このBotは設定された1つのサーバーでだけ動く設定です。",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "sync") {
    await syncClassRoles(interaction);
    return;
  }
  if (subcommand === "panel") {
    await postReactionPanel(interaction);
    return;
  }
  if (subcommand === "status") {
    await showClassStatus(interaction);
  }
}

async function syncClassRoles(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const category = interaction.options.getChannel("category");
  const excludeNames = parseExcludeNames(interaction.options.getString("exclude_names"));
  const color = parseColor(interaction.options.getString("role_color"));

  await fetchGuildCaches(guild);
  const channels = getTextChannels(guild, category?.id || null, excludeNames);
  if (channels.length === 0) {
    await interaction.editReply("同期対象のテキストチャンネルが見つかりませんでした。");
    return;
  }

  const state = await readState();
  const results = [];
  const failures = [];

  for (const channel of channels) {
    try {
      const { role, changes } = await ensureRoleForChannel(guild, channel, state, color);
      results.push({
        channel,
        role,
        changes
      });
    } catch (error) {
      failures.push(`#${channel.name}: ${error.message}`);
    }
  }

  await writeState(state);

  const created = results.filter((result) => result.changes.includes("created")).length;
  const updated = results.filter((result) => result.changes.length > 0 && !result.changes.includes("created")).length;
  const unchanged = results.length - created - updated;
  const lines = [
    `同期完了: ${results.length}件`,
    `新規作成: ${created} / 更新: ${updated} / 変更なし: ${unchanged}`
  ];

  if (failures.length) {
    lines.push("", "失敗:", ...failures.slice(0, 8));
  }

  await interaction.editReply(lines.join("\n"));
}

async function postReactionPanel(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
  if (!targetChannel?.isTextBased() || typeof targetChannel.send !== "function") {
    throw new Error("パネル投稿先には、Botが送信できるテキストチャンネルを指定してください。");
  }
  await fetchGuildCaches(guild);

  const state = await readState();
  const entries = Object.values(state.classRoles)
    .map((entry) => {
      const channel = guild.channels.cache.get(entry.channelId);
      const role = guild.roles.cache.get(entry.roleId);
      return channel && role ? { ...entry, channel, role } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.channel.position - b.channel.position)
    .slice(0, PANEL_EMOJIS.length);

  if (entries.length === 0) {
    await interaction.editReply("授業ロールがまだ同期されていません。先に `/classes sync` を実行してください。");
    return;
  }

  const lines = entries.map((entry, index) => `${PANEL_EMOJIS[index]} <#${entry.channelId}>  <@&${entry.roleId}>`);
  const embed = new EmbedBuilder()
    .setColor(0x4f8cff)
    .setTitle("授業ロール")
    .setDescription(["参加したい授業のリアクションを押してください。もう一度外すとロールも外れます。", "", ...lines].join("\n"));

  const panelMessage = await targetChannel.send({ embeds: [embed] });
  const roles = [];

  for (let index = 0; index < entries.length; index += 1) {
    const emoji = PANEL_EMOJIS[index];
    await panelMessage.react(emoji);
    roles.push({
      emoji,
      channelId: entries[index].channelId,
      channelName: entries[index].channelName,
      roleId: entries[index].roleId,
      roleName: entries[index].roleName
    });
  }

  await updateState((nextState) => {
    nextState.reactionRoleMessages[panelMessage.id] = {
      guildId: guild.id,
      channelId: targetChannel.id,
      messageId: panelMessage.id,
      roles,
      createdAt: new Date().toISOString()
    };
  });

  await interaction.editReply(`リアクションロールパネルを <#${targetChannel.id}> に投稿しました。`);
}

async function showClassStatus(interaction) {
  const state = await readState();
  const entries = Object.values(state.classRoles).slice(0, 20);
  if (entries.length === 0) {
    await interaction.reply({
      content: "同期済みの授業ロールはありません。`/classes sync` から始めてください。",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const lines = entries.map((entry) => `<#${entry.channelId}> -> <@&${entry.roleId}>`);
  await interaction.reply({
    content: lines.join("\n"),
    flags: MessageFlags.Ephemeral
  });
}

async function handleReactionRole(reaction, user, shouldAdd) {
  if (user.bot) return;

  if (reaction.partial) {
    await reaction.fetch();
  }
  if (reaction.message.partial) {
    await reaction.message.fetch();
  }

  const state = await readState();
  const panel = state.reactionRoleMessages[reaction.message.id];
  if (!panel) return;

  const emojiKey = toEmojiKey(reaction);
  const mapping = panel.roles.find((role) => role.emoji === emojiKey);
  if (!mapping) return;

  const guild = reaction.message.guild || reaction.client.guilds.cache.get(panel.guildId);
  if (!guild) return;

  const member = await guild.members.fetch(user.id);
  const role = await guild.roles.fetch(mapping.roleId);
  if (!role) return;

  if (shouldAdd) {
    await member.roles.add(role, `Reaction role: ${mapping.roleName}`);
  } else {
    await member.roles.remove(role, `Reaction role removed: ${mapping.roleName}`);
  }
}

module.exports = {
  handleClassesCommand,
  handleReactionRole,
  resolveClassRole
};
