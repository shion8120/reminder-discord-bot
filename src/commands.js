const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");

const reminderPatterns = [
  {
    name: "1週間前 / 1日前 / 5時間前 / 期限時刻",
    value: "1w,1d,5h,0"
  },
  {
    name: "1週間前 / 1日前 / 期限時刻",
    value: "1w,1d,0"
  },
  {
    name: "3日前 / 1日前 / 期限時刻",
    value: "3d,1d,0"
  },
  {
    name: "1日前 / 5時間前 / 期限時刻",
    value: "1d,5h,0"
  },
  {
    name: "期限時刻のみ",
    value: "0"
  },
  {
    name: "カスタム",
    value: "custom"
  }
];

function buildCommands() {
  return [
    new SlashCommandBuilder()
      .setName("classes")
      .setDescription("授業ロールとリアクション付与パネルを管理します。")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addSubcommand((subcommand) =>
        subcommand
          .setName("sync")
          .setDescription("授業チャンネル名と同じ名前のロールを作成・同期します。")
          .addChannelOption((option) =>
            option
              .setName("category")
              .setDescription("このカテゴリ内のテキストチャンネルだけを同期します。")
              .addChannelTypes(ChannelType.GuildCategory)
              .setRequired(false)
          )
          .addStringOption((option) =>
            option
              .setName("exclude_names")
              .setDescription("除外するチャンネル名をカンマ区切りで入力します。例: 雑談,リマインド")
              .setRequired(false)
          )
          .addStringOption((option) =>
            option
              .setName("role_color")
              .setDescription("新規作成ロールの色。例: #4f8cff")
              .setRequired(false)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("panel")
          .setDescription("リアクションで授業ロールを付けるパネルを投稿します。")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("パネルを投稿するチャンネル。省略すると今のチャンネルに投稿します。")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(false)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("status").setDescription("現在同期されている授業ロールを表示します。")
      ),

    new SlashCommandBuilder()
      .setName("reminder")
      .setDescription("課題・テストのリマインドを作成、確認、削除します。")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addSubcommand((subcommand) =>
        subcommand
          .setName("create")
          .setDescription("授業ロール宛ての課題・テストリマインドを作成します。")
          .addChannelOption((option) =>
            option
              .setName("class_channel")
              .setDescription("対象の授業チャンネル。対応する授業ロールにメンションします。")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName("type")
              .setDescription("課題かテストかを選びます。")
              .setRequired(true)
              .addChoices(
                { name: "課題", value: "assignment" },
                { name: "テスト", value: "test" }
              )
          )
          .addStringOption((option) =>
            option
              .setName("title")
              .setDescription("課題名やテスト名。例: レポート第2回")
              .setMaxLength(120)
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName("due_at")
              .setDescription("期限・実施日時。例: 2026-06-05 23:59")
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName("remind_pattern")
              .setDescription("いつ通知するかを選びます。")
              .setRequired(true)
              .addChoices(...reminderPatterns)
          )
          .addStringOption((option) =>
            option
              .setName("custom_offsets")
              .setDescription("カスタム用。例: 2w,3d,12h,0")
              .setRequired(false)
          )
          .addChannelOption((option) =>
            option
              .setName("send_channel")
              .setDescription("通知を送るチャンネル。省略時は .env の REMINDER_CHANNEL_ID または授業チャンネルです。")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(false)
          )
          .addStringOption((option) =>
            option
              .setName("details")
              .setDescription("範囲、提出先、持ち物など。")
              .setMaxLength(900)
              .setRequired(false)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("list")
          .setDescription("未送信のリマインド予定を表示します。")
          .addChannelOption((option) =>
            option
              .setName("class_channel")
              .setDescription("この授業だけに絞り込みます。")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(false)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("delete")
          .setDescription("リマインドを削除します。")
          .addStringOption((option) =>
            option.setName("id").setDescription("削除するリマインドID").setRequired(true)
          )
      )
  ].map((command) => command.toJSON());
}

module.exports = {
  buildCommands,
  reminderPatterns
};
