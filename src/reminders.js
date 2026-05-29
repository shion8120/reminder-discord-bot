const crypto = require("crypto");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { resolveClassRole } = require("./classes");
const { readState, updateState, writeState } = require("./storage");
const {
  describeOffset,
  formatTokyo,
  parseOffsets,
  parseTokyoDateTime,
  toDiscordTimestamp
} = require("./time");

const STATUS_REACTIONS = ["✅", "🔄", "🕒"];
const REMINDER_CHECK_INTERVAL_MS = 30 * 1000;

let schedulerStarted = false;
let schedulerBusy = false;

function createReminderId() {
  return `rem-${Date.now().toString(36)}-${crypto.randomBytes(2).toString("hex")}`;
}

function typeLabel(type) {
  return type === "test" ? "テスト" : "課題";
}

function typeColor(type) {
  return type === "test" ? 0xe05252 : 0x37a169;
}

function getPendingSchedules(reminder) {
  return reminder.schedules.filter((schedule) => !schedule.sentAt && !schedule.failedAt);
}

function getNextSchedule(reminder) {
  return getPendingSchedules(reminder).sort((a, b) => new Date(a.remindAt) - new Date(b.remindAt))[0] || null;
}

async function handleReminderCommand(interaction, config) {
  if (interaction.guildId !== config.guildId) {
    await interaction.reply({
      content: "このBotは設定された1つのサーバーでだけ動く設定です。",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "create") {
    await createReminder(interaction, config);
    return;
  }
  if (subcommand === "list") {
    await listReminders(interaction);
    return;
  }
  if (subcommand === "delete") {
    await deleteReminder(interaction);
  }
}

async function createReminder(interaction, config) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const classChannel = interaction.options.getChannel("class_channel", true);
  const sendChannelOption = interaction.options.getChannel("send_channel");
  const type = interaction.options.getString("type", true);
  const title = interaction.options.getString("title", true).trim();
  const dueAtInput = interaction.options.getString("due_at", true);
  const remindPattern = interaction.options.getString("remind_pattern", true);
  const customOffsets = interaction.options.getString("custom_offsets");
  const details = interaction.options.getString("details")?.trim() || "";

  const dueAt = parseTokyoDateTime(dueAtInput);
  if (dueAt.getTime() <= Date.now()) {
    throw new Error("期限は現在より未来の日時にしてください。");
  }

  const offsets = parseOffsets(remindPattern, customOffsets);
  const now = Date.now();
  const skippedOffsets = [];
  const schedules = offsets
    .map((offsetMs) => {
      const remindAtMs = dueAt.getTime() - offsetMs;
      if (remindAtMs <= now + 5000) {
        skippedOffsets.push(offsetMs);
        return null;
      }
      return {
        id: `${describeOffset(offsetMs)}-${remindAtMs}`,
        offsetMs,
        remindAt: new Date(remindAtMs).toISOString(),
        sentAt: null,
        messageId: null,
        attempts: 0
      };
    })
    .filter(Boolean);

  if (schedules.length === 0) {
    throw new Error("未来に送れる通知タイミングがありません。期限または通知タイミングを見直してください。");
  }

  const state = await readState();
  const role = await resolveClassRole(guild, classChannel, state);
  if (!role) {
    await writeState(state);
    throw new Error("対象授業のロールが見つかりません。先に `/classes sync` を実行してください。");
  }

  let sendChannel = sendChannelOption;
  if (!sendChannel && config.defaultReminderChannelId) {
    sendChannel = await guild.channels.fetch(config.defaultReminderChannelId);
  }
  if (!sendChannel) {
    sendChannel = classChannel;
  }
  if (!sendChannel?.isTextBased() || typeof sendChannel.send !== "function") {
    throw new Error("通知先には、Botが送信できるテキストチャンネルを指定してください。");
  }

  const reminder = {
    id: createReminderId(),
    guildId: guild.id,
    type,
    title,
    details,
    channelId: classChannel.id,
    channelName: classChannel.name,
    reminderChannelId: sendChannel.id,
    reminderChannelName: sendChannel.name,
    roleId: role.id,
    roleName: role.name,
    dueAt: dueAt.toISOString(),
    createdBy: interaction.user.id,
    createdAt: new Date().toISOString(),
    schedules
  };

  state.reminders.push(reminder);
  await writeState(state);

  const scheduleLines = schedules.map(
    (schedule) => `- ${describeOffset(schedule.offsetMs)}: ${formatTokyo(schedule.remindAt)}`
  );
  const skippedLine = skippedOffsets.length
    ? `\n過去になる通知はスキップしました: ${skippedOffsets.map(describeOffset).join(", ")}`
    : "";

  await interaction.editReply(
    [
      `作成しました: \`${reminder.id}\``,
      `対象: <#${classChannel.id}> / <@&${role.id}>`,
      `通知先: <#${sendChannel.id}>`,
      `期限: ${formatTokyo(reminder.dueAt)}`,
      "",
      "通知予定:",
      ...scheduleLines,
      skippedLine
    ]
      .filter(Boolean)
      .join("\n")
  );
}

async function listReminders(interaction) {
  const classChannel = interaction.options.getChannel("class_channel");
  const state = await readState();
  const active = state.reminders
    .filter((reminder) => !classChannel || reminder.channelId === classChannel.id)
    .map((reminder) => ({ reminder, nextSchedule: getNextSchedule(reminder) }))
    .filter((item) => item.nextSchedule)
    .sort((a, b) => new Date(a.nextSchedule.remindAt) - new Date(b.nextSchedule.remindAt))
    .slice(0, 10);

  if (active.length === 0) {
    await interaction.reply({
      content: "未送信のリマインド予定はありません。",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const lines = active.map(({ reminder, nextSchedule }) => {
    return [
      `\`${reminder.id}\` ${typeLabel(reminder.type)}: ${reminder.title}`,
      `授業: <#${reminder.channelId}> / 期限: ${formatTokyo(reminder.dueAt)}`,
      `次回: ${describeOffset(nextSchedule.offsetMs)} (${formatTokyo(nextSchedule.remindAt)})`
    ].join("\n");
  });

  await interaction.reply({
    content: lines.join("\n\n"),
    flags: MessageFlags.Ephemeral
  });
}

async function deleteReminder(interaction) {
  const id = interaction.options.getString("id", true).trim();
  const deleted = await updateState((state) => {
    const before = state.reminders.length;
    state.reminders = state.reminders.filter((reminder) => reminder.id !== id);
    return before !== state.reminders.length;
  });

  await interaction.reply({
    content: deleted ? `リマインド \`${id}\` を削除しました。` : `リマインド \`${id}\` は見つかりませんでした。`,
    flags: MessageFlags.Ephemeral
  });
}

function buildReminderEmbed(reminder, schedule) {
  const label = typeLabel(reminder.type);
  const details = reminder.details || "詳細は授業チャンネルを確認してください。";
  return new EmbedBuilder()
    .setColor(typeColor(reminder.type))
    .setTitle(`${label}リマインド: ${reminder.title}`)
    .setDescription(details)
    .addFields(
      { name: "授業", value: `<#${reminder.channelId}>`, inline: true },
      { name: "期限・実施日時", value: `${formatTokyo(reminder.dueAt)}\n${toDiscordTimestamp(reminder.dueAt, "R")}`, inline: true },
      { name: "今回の通知", value: describeOffset(schedule.offsetMs), inline: true },
      { name: "状態リアクション", value: "✅ 終わった / 🔄 やってる / 🕒 まだやってない", inline: false }
    )
    .setFooter({ text: `Reminder ID: ${reminder.id}` })
    .setTimestamp(new Date());
}

async function sendReminder(client, reminder, schedule) {
  const guild = await client.guilds.fetch(reminder.guildId);
  const channel = await guild.channels.fetch(reminder.reminderChannelId || reminder.channelId);
  const role = await guild.roles.fetch(reminder.roleId).catch(() => null);

  const content = role
    ? `<@&${role.id}> ${typeLabel(reminder.type)}のリマインドです。`
    : `${typeLabel(reminder.type)}のリマインドです。`;

  const message = await channel.send({
    content,
    embeds: [buildReminderEmbed(reminder, schedule)],
    allowedMentions: role ? { roles: [role.id] } : { parse: [] }
  });

  for (const emoji of STATUS_REACTIONS) {
    await message.react(emoji).catch(() => null);
  }

  return message.id;
}

async function processReminders(client) {
  if (schedulerBusy) return;
  schedulerBusy = true;

  try {
    const state = await readState();
    const now = Date.now();
    let changed = false;

    for (const reminder of state.reminders) {
      for (const schedule of reminder.schedules) {
        if (schedule.sentAt || schedule.failedAt || new Date(schedule.remindAt).getTime() > now) {
          continue;
        }

        try {
          const messageId = await sendReminder(client, reminder, schedule);
          schedule.sentAt = new Date().toISOString();
          schedule.messageId = messageId;
        } catch (error) {
          schedule.attempts = (schedule.attempts || 0) + 1;
          schedule.lastError = error.message;
          schedule.lastErrorAt = new Date().toISOString();
          if (schedule.attempts >= 3) {
            schedule.failedAt = new Date().toISOString();
          }
        }
        changed = true;
      }
    }

    if (changed) {
      await writeState(state);
    }
  } finally {
    schedulerBusy = false;
  }
}

function startReminderLoop(client) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  processReminders(client).catch((error) => console.error("Reminder processing failed:", error));
  setInterval(() => {
    processReminders(client).catch((error) => console.error("Reminder processing failed:", error));
  }, REMINDER_CHECK_INTERVAL_MS);
}

module.exports = {
  handleReminderCommand,
  processReminders,
  startReminderLoop
};
