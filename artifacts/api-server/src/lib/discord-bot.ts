import {
  AttachmentBuilder,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type TextChannel,
  type User,
} from "discord.js";
import { and, count, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { randomInt } from "node:crypto";
import {
  db,
  guildActivityTable,
  guildDailyMetricsTable,
  guildMembersTable,
  guildRewardsTable,
  guildSettingsTable,
} from "@workspace/db";
import { logger } from "./logger";
import { issuePairingCode } from "./dashboard-auth";
import { renderRankCard } from "./rank-card";
import {
  deleteProfileBanner,
  loadProfileBanner,
  storeProfileBanner,
} from "./profile-banner-storage";
import {
  BannerInputError,
  prepareProfileBanner,
} from "./profile-banners";

const token = process.env.DISCORD_BOT_TOKEN;
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});
const botStartedAt = Date.now();
let voiceTickRunning = false;

function getCommands() {
  return [
    new SlashCommandBuilder()
      .setName("dashboard-code")
      .setDescription("Create a one-time code to open your Orbit dashboard")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder()
      .setName("rank")
      .setDescription("Check your XP and level")
      .addUserOption((option) =>
        option.setName("user").setDescription("Member to check"),
      ),
    new SlashCommandBuilder()
      .setName("leaderboard")
      .setDescription("Show the top 10 members by XP"),
    new SlashCommandBuilder()
      .setName("profile-banner")
      .setDescription("Set your own rank profile and level-up banners")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("set")
          .setDescription("Upload a banner for your profile or level-ups")
          .addStringOption((option) =>
            option
              .setName("target")
              .setDescription("Choose where your banner appears")
              .setRequired(true)
              .addChoices(
                { name: "Rank profile", value: "profile" },
                { name: "Level-up announcement", value: "level-up" },
                { name: "Both", value: "both" },
              ),
          )
          .addAttachmentOption((option) =>
            option
              .setName("image")
              .setDescription("PNG, JPG, WebP, or GIF under 5 MB")
              .setRequired(true),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("clear")
          .setDescription("Remove one or both of your custom banners")
          .addStringOption((option) =>
            option
              .setName("target")
              .setDescription("Choose which banner to remove")
              .setRequired(true)
              .addChoices(
                { name: "Rank profile", value: "profile" },
                { name: "Level-up announcement", value: "level-up" },
                { name: "Both", value: "both" },
              ),
          ),
      ),
    new SlashCommandBuilder()
      .setName("warn")
      .setDescription("Record a warning for a member")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
      .addUserOption((option) =>
        option
          .setName("member")
          .setDescription("Member to warn")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Reason for the warning")
          .setMaxLength(500)
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("timeout")
      .setDescription("Timeout a member")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
      .addUserOption((option) =>
        option
          .setName("member")
          .setDescription("Member to timeout")
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("minutes")
          .setDescription("Timeout duration in minutes (1–40320)")
          .setMinValue(1)
          .setMaxValue(40320)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Reason for the timeout")
          .setMaxLength(500),
      ),
    new SlashCommandBuilder()
      .setName("kick")
      .setDescription("Kick a member")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers)
      .addUserOption((option) =>
        option
          .setName("member")
          .setDescription("Member to kick")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Reason for the kick")
          .setMaxLength(500),
      ),
    new SlashCommandBuilder()
      .setName("ban")
      .setDescription("Ban a member")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers)
      .addUserOption((option) =>
        option
          .setName("member")
          .setDescription("Member to ban")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Reason for the ban")
          .setMaxLength(500),
      ),
    new SlashCommandBuilder()
      .setName("clear")
      .setDescription("Delete up to 100 recent messages in this channel")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
      .addIntegerOption((option) =>
        option
          .setName("amount")
          .setDescription("Number of messages to delete (1–100)")
          .setMinValue(1)
          .setMaxValue(100)
          .setRequired(true),
      ),
  ];
}

function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}

async function ensureGuildSettings(guild: Guild) {
  await db
    .insert(guildSettingsTable)
    .values({ guildId: guild.id, guildName: guild.name })
    .onConflictDoUpdate({
      target: guildSettingsTable.guildId,
      set: { guildName: guild.name, updatedAt: new Date() },
    });
}

async function syncCommands(guild: Guild): Promise<void> {
  try {
    await guild.commands.set(getCommands().map((command) => command.toJSON()));
    logger.info({ guildId: guild.id }, "Registered Orbit slash commands");
  } catch (error) {
    logger.error(
      { guildId: guild.id, error: errorMessage(error) },
      "Failed to register Orbit slash commands",
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(
    { botTag: readyClient.user.tag, guildCount: readyClient.guilds.cache.size },
    "Discord bot connected",
  );
  for (const guild of readyClient.guilds.cache.values()) {
    await ensureGuildSettings(guild);
    await syncCommands(guild);
  }
  startVoiceXpTicker();
});

client.on(Events.GuildCreate, (guild) => {
  void ensureGuildSettings(guild)
    .then(() => syncCommands(guild))
    .catch((error: unknown) => {
      logger.error(
        { guildId: guild.id, error: errorMessage(error) },
        "Failed to initialize new Discord server",
      );
    });
});

client.on(Events.MessageCreate, (message) => {
  void handleMessage(message).catch((error: unknown) => {
    logger.error(
      { guildId: message.guildId, error: errorMessage(error) },
      "Failed to process guild message",
    );
  });
});

client.on(Events.MessageReactionAdd, (reaction, user) => {
  void handleReaction(reaction, user).catch((error: unknown) => {
    logger.error(
      {
        guildId: reaction.message.guildId,
        error: errorMessage(error),
      },
      "Failed to process reaction XP",
    );
  });
});

client.on(Events.InteractionCreate, (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  void handleCommand(interaction).catch(async (error: unknown) => {
    logger.error(
      {
        guildId: interaction.guildId,
        command: interaction.commandName,
        error: errorMessage(error),
      },
      "Discord command failed",
    );
    if (interaction.replied || interaction.deferred) {
      await interaction
        .followUp({ content: "That command could not be completed.", ephemeral: true })
        .catch(() => undefined);
    } else {
      await interaction
        .reply({ content: "That command could not be completed.", ephemeral: true })
        .catch(() => undefined);
    }
  });
});

async function handleMessage(message: Message): Promise<void> {
  if (!message.guild || message.author.bot || !message.member) return;

  const guild = message.guild;
  const now = new Date();
  const [settings] = await db
    .select()
    .from(guildSettingsTable)
    .where(eq(guildSettingsTable.guildId, guild.id))
    .limit(1);
  if (!settings) return;

  const day = now.toISOString().slice(0, 10);
  await db
    .insert(guildDailyMetricsTable)
    .values({ guildId: guild.id, day, messages: 1 })
    .onConflictDoUpdate({
      target: [guildDailyMetricsTable.guildId, guildDailyMetricsTable.day],
      set: { messages: sql`${guildDailyMetricsTable.messages} + 1` },
    });

  await db
    .insert(guildMembersTable)
    .values({
      guildId: guild.id,
      userId: message.author.id,
      username: message.author.tag,
      avatarUrl: message.author.displayAvatarURL(),
      messageCount: 1,
    })
    .onConflictDoUpdate({
      target: [guildMembersTable.guildId, guildMembersTable.userId],
      set: {
        username: message.author.tag,
        avatarUrl: message.author.displayAvatarURL(),
        messageCount: sql`${guildMembersTable.messageCount} + 1`,
        updatedAt: now,
      },
    });

  if (!settings.levelingEnabled) return;
  await awardXp(
    guild,
    message.author,
    randomInt(settings.xpMin, settings.xpMax + 1),
    settings,
    "message",
    message.channelId,
  );
}

async function handleReaction(
  reaction: MessageReaction | PartialMessageReaction,
  reactingUser: User | PartialUser,
): Promise<void> {
  let user: User;
  try {
    user = reactingUser.partial
      ? await reactingUser.fetch()
      : (reactingUser as User);
  } catch {
    return;
  }
  if (user.bot) return;

  let fullReaction: MessageReaction;
  try {
    fullReaction = reaction.partial
      ? await reaction.fetch()
      : (reaction as MessageReaction);
  } catch {
    return;
  }
  const message = fullReaction.message;
  const guild = message.guild;
  if (!guild || !message.author || message.author.id === user.id) return;

  const [settings] = await db
    .select()
    .from(guildSettingsTable)
    .where(eq(guildSettingsTable.guildId, guild.id))
    .limit(1);
  if (!settings?.levelingEnabled || !settings.reactionLevelingEnabled) return;

  await awardXp(
    guild,
    user,
    settings.reactionXp,
    settings,
    "reaction",
    message.channelId,
  );
}

type XpSource = "message" | "reaction" | "voice";

async function awardXp(
  guild: Guild,
  user: User,
  amount: number,
  settings: typeof guildSettingsTable.$inferSelect,
  source: XpSource,
  channelId?: string,
): Promise<void> {
  await db
    .insert(guildMembersTable)
    .values({
      guildId: guild.id,
      userId: user.id,
      username: user.tag,
      avatarUrl: user.displayAvatarURL(),
    })
    .onConflictDoUpdate({
      target: [guildMembersTable.guildId, guildMembersTable.userId],
      set: {
        username: user.tag,
        avatarUrl: user.displayAvatarURL(),
        updatedAt: new Date(),
      },
    });

  const now = new Date();
  const identity = and(
    eq(guildMembersTable.guildId, guild.id),
    eq(guildMembersTable.userId, user.id),
  );
  const baseUpdate = {
    xp: sql`${guildMembersTable.xp} + ${amount}`,
    updatedAt: now,
  };
  let updatedMember:
    | (typeof guildMembersTable.$inferSelect)
    | undefined;

  if (source === "message") {
    const cooldownLimit = new Date(
      now.getTime() - settings.cooldownSeconds * 1000,
    );
    [updatedMember] = await db
      .update(guildMembersTable)
      .set({ ...baseUpdate, lastXpAt: now })
      .where(
        and(
          identity,
          or(
            isNull(guildMembersTable.lastXpAt),
            lt(guildMembersTable.lastXpAt, cooldownLimit),
          ),
        ),
      )
      .returning();
  } else if (source === "reaction") {
    const cooldownLimit = new Date(
      now.getTime() - settings.reactionCooldownSeconds * 1000,
    );
    [updatedMember] = await db
      .update(guildMembersTable)
      .set({
        ...baseUpdate,
        lastReactionXpAt: now,
        reactionCount: sql`${guildMembersTable.reactionCount} + 1`,
      })
      .where(
        and(
          identity,
          or(
            isNull(guildMembersTable.lastReactionXpAt),
            lt(guildMembersTable.lastReactionXpAt, cooldownLimit),
          ),
        ),
      )
      .returning();
  } else {
    [updatedMember] = await db
      .update(guildMembersTable)
      .set({
        ...baseUpdate,
        voiceMinutes: sql`${guildMembersTable.voiceMinutes} + 1`,
      })
      .where(identity)
      .returning();
  }

  if (!updatedMember) return;
  const previousLevel = levelForXp(updatedMember.xp - amount);
  const currentLevel = levelForXp(updatedMember.xp);
  if (currentLevel <= previousLevel) return;

  await db.insert(guildActivityTable).values({
    guildId: guild.id,
    kind: "level_up",
    actorTag: "Orbit Bot",
    targetTag: user.tag,
    details: `Reached level ${currentLevel} through ${source} XP`,
  });
  await grantLevelReward(guild, user.id, currentLevel);
  await sendLevelUpAnnouncement({
    guild,
    user,
    settings,
    previousLevel,
    currentLevel,
    xp: updatedMember.xp,
    channelId,
  });
}

async function sendLevelUpAnnouncement({
  guild,
  user,
  settings,
  previousLevel,
  currentLevel,
  xp,
  channelId,
}: {
  guild: Guild;
  user: User;
  settings: typeof guildSettingsTable.$inferSelect;
  previousLevel: number;
  currentLevel: number;
  xp: number;
  channelId?: string;
}): Promise<void> {
  const announcementChannel = settings.announcementChannelId
    ? guild.channels.cache.get(settings.announcementChannelId)
    : channelId
      ? guild.channels.cache.get(channelId)
      : null;
  if (
    !announcementChannel?.isTextBased() ||
    !("send" in announcementChannel) ||
    typeof announcementChannel.send !== "function"
  ) {
    return;
  }

  const nextLevelXp = (currentLevel + 1) ** 2 * 100;
  const tags: Record<string, string> = {
    user: `<@${user.id}>`,
    mention: `<@${user.id}>`,
    username: user.username,
    display_name:
      guild.members.cache.get(user.id)?.displayName ?? user.username,
    level: String(currentLevel),
    previous_level: String(previousLevel),
    xp: String(xp),
    next_level_xp: String(nextLevelXp),
    remaining_xp: String(Math.max(0, nextLevelXp - xp)),
    server: guild.name,
    server_name: guild.name,
    channel: channelId ? `<#${channelId}>` : "voice chat",
  };
  const content = settings.announcementMessage.replace(
    /\{([a-z_]+)\}/gi,
    (tag, key: string) => tags[key.toLowerCase()] ?? tag,
  );
  let bannerFile: AttachmentBuilder | undefined;
  const [member] = await db
    .select({ levelUpBannerPath: guildMembersTable.levelUpBannerPath })
    .from(guildMembersTable)
    .where(
      and(
        eq(guildMembersTable.guildId, guild.id),
        eq(guildMembersTable.userId, user.id),
      ),
    )
    .limit(1);
  if (member?.levelUpBannerPath) {
    try {
      const banner = await loadProfileBanner(member.levelUpBannerPath);
      const extension = member.levelUpBannerPath.endsWith(".gif")
        ? "gif"
        : "png";
      bannerFile = new AttachmentBuilder(banner, {
        name: `level-up-banner.${extension}`,
      });
    } catch (error) {
      logger.warn(
        { guildId: guild.id, userId: user.id, error: errorMessage(error) },
        "Could not load a member's level-up banner",
      );
    }
  }
  await announcementChannel
    .send({
      content,
      allowedMentions: { users: [user.id] },
      files: bannerFile ? [bannerFile] : [],
    })
    .catch((error: unknown) => {
      logger.warn(
        { guildId: guild.id, error: errorMessage(error) },
        "Could not post level-up announcement",
      );
    });
}

function startVoiceXpTicker(): void {
  setInterval(() => {
    if (voiceTickRunning) return;
    voiceTickRunning = true;
    void awardVoiceXpTick()
      .catch((error: unknown) => {
        logger.error(
          { error: errorMessage(error) },
          "Failed to award voice XP",
        );
      })
      .finally(() => {
        voiceTickRunning = false;
      });
  }, 60_000);
}

async function awardVoiceXpTick(): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    const [settings] = await db
      .select()
      .from(guildSettingsTable)
      .where(eq(guildSettingsTable.guildId, guild.id))
      .limit(1);
    if (!settings?.levelingEnabled || !settings.voiceLevelingEnabled) continue;

    for (const channel of guild.channels.cache.values()) {
      if (!channel.isVoiceBased() || channel.id === guild.afkChannelId) continue;
      const participants = [...channel.members.values()].filter(
        (member) =>
          !member.user.bot &&
          !member.voice.selfDeaf &&
          !member.voice.serverDeaf,
      );
      if (participants.length < 2) continue;

      for (const member of participants) {
        await awardXp(
          guild,
          member.user,
          settings.voiceXpPerMinute,
          settings,
          "voice",
          channel.id,
        );
      }
    }
  }
}

async function grantLevelReward(
  guild: Guild,
  userId: string,
  level: number,
): Promise<void> {
  const [reward] = await db
    .select()
    .from(guildRewardsTable)
    .where(
      and(
        eq(guildRewardsTable.guildId, guild.id),
        eq(guildRewardsTable.level, level),
      ),
    )
    .limit(1);
  if (!reward) return;

  const role = guild.roles.cache.get(reward.roleId);
  if (!role?.editable) return;

  try {
    const member = await guild.members.fetch(userId);
    await member.roles.add(role, `Reached level ${level}`);
  } catch (error) {
    logger.warn(
      { guildId: guild.id, roleId: reward.roleId, error: errorMessage(error) },
      "Could not grant level role",
    );
  }
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "Use this command inside a server.",
      ephemeral: true,
    });
    return;
  }

  switch (interaction.commandName) {
    case "dashboard-code": {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({
          content: "Only server administrators can pair the dashboard.",
          ephemeral: true,
        });
        return;
      }
      await ensureGuildSettings(interaction.guild);
      const code = issuePairingCode(interaction.guild.id, interaction.guild.name);
      await interaction.reply({
        content: `Your one-time dashboard code is \`${code}\`. Enter it on the Orbit Bot dashboard within 5 minutes. Never share this code.`,
        ephemeral: true,
      });
      return;
    }
    case "rank":
      await showRank(interaction);
      return;
    case "leaderboard":
      await showLeaderboard(interaction);
      return;
    case "profile-banner":
      await handleProfileBanner(interaction);
      return;
    case "warn":
      await moderate(interaction, "warn");
      return;
    case "timeout":
      await moderate(interaction, "timeout");
      return;
    case "kick":
      await moderate(interaction, "kick");
      return;
    case "ban":
      await moderate(interaction, "ban");
      return;
    case "clear":
      await clearMessages(interaction);
      return;
    default:
      await interaction.reply({
        content: "Unknown command.",
        ephemeral: true,
      });
  }
}

type BannerTarget = "profile" | "level-up" | "both";

function nextBannerPaths(
  target: BannerTarget,
  current: {
    profileBannerPath: string | null;
    levelUpBannerPath: string | null;
  },
  replacementPath: string | null,
): { profileBannerPath: string | null; levelUpBannerPath: string | null } {
  return {
    profileBannerPath:
      target === "profile" || target === "both"
        ? replacementPath
        : current.profileBannerPath,
    levelUpBannerPath:
      target === "level-up" || target === "both"
        ? replacementPath
        : current.levelUpBannerPath,
  };
}

async function removeUnusedBanners(
  previousPaths: Array<string | null | undefined>,
  nextPaths: Array<string | null | undefined>,
  guildId: string,
  userId: string,
): Promise<void> {
  const retained = new Set(nextPaths.filter((path): path is string => !!path));
  const removed = new Set(previousPaths.filter((path): path is string => !!path));
  for (const path of removed) {
    if (retained.has(path)) continue;
    try {
      await deleteProfileBanner(path);
    } catch (error) {
      logger.warn(
        { guildId, userId, error: errorMessage(error) },
        "Could not remove an unused member banner",
      );
    }
  }
}

async function handleProfileBanner(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const user = interaction.user;
  await interaction.deferReply({ ephemeral: true });

  try {
    const target = interaction.options.getString("target", true) as BannerTarget;
    const [existing] = await db
      .select()
      .from(guildMembersTable)
      .where(
        and(
          eq(guildMembersTable.guildId, guild.id),
          eq(guildMembersTable.userId, user.id),
        ),
      )
      .limit(1);

    if (interaction.options.getSubcommand() === "clear") {
      const targetHasBanner =
        target === "both"
          ? !!existing?.rankBannerPath || !!existing?.levelUpBannerPath
          : target === "profile"
            ? !!existing?.rankBannerPath
            : !!existing?.levelUpBannerPath;
      if (!targetHasBanner) {
        await interaction.editReply(
          target === "both"
            ? "You don't have any custom banners to clear."
            : `You don't have a ${target === "profile" ? "rank profile" : "level-up"} banner to clear.`,
        );
        return;
      }
      const next = nextBannerPaths(
        target,
        {
          profileBannerPath: existing.rankBannerPath,
          levelUpBannerPath: existing.levelUpBannerPath,
        },
        null,
      );
      await db
        .update(guildMembersTable)
        .set({ ...next, updatedAt: new Date() })
        .where(
          and(
            eq(guildMembersTable.guildId, guild.id),
            eq(guildMembersTable.userId, user.id),
          ),
        );
      await removeUnusedBanners(
        [existing.rankBannerPath, existing.levelUpBannerPath],
        [next.profileBannerPath, next.levelUpBannerPath],
        guild.id,
        user.id,
      );
      await interaction.editReply(
        target === "both"
          ? "Your rank and level-up banners have been cleared."
          : `Your ${target === "profile" ? "rank profile" : "level-up"} banner has been cleared.`,
      );
      return;
    }

    const prepared = await prepareProfileBanner(
      interaction.options.getAttachment("image", true),
    );
    const uploadedPath = await storeProfileBanner(
      prepared.bytes,
      prepared.contentType,
      prepared.extension,
    );
    const next = nextBannerPaths(
      target,
      {
        profileBannerPath: existing?.rankBannerPath ?? null,
        levelUpBannerPath: existing?.levelUpBannerPath ?? null,
      },
      uploadedPath,
    );

    try {
      await db
        .insert(guildMembersTable)
        .values({
          guildId: guild.id,
          userId: user.id,
          username: user.username,
          avatarUrl: user.displayAvatarURL({ extension: "png", size: 128 }),
          rankBannerPath: next.profileBannerPath,
          levelUpBannerPath: next.levelUpBannerPath,
        })
        .onConflictDoUpdate({
          target: [guildMembersTable.guildId, guildMembersTable.userId],
          set: {
            username: user.username,
            avatarUrl: user.displayAvatarURL({ extension: "png", size: 128 }),
            rankBannerPath: next.profileBannerPath,
            levelUpBannerPath: next.levelUpBannerPath,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      await deleteProfileBanner(uploadedPath).catch(() => undefined);
      throw error;
    }

    await removeUnusedBanners(
      [existing?.rankBannerPath, existing?.levelUpBannerPath],
      [next.profileBannerPath, next.levelUpBannerPath],
      guild.id,
      user.id,
    );
    const targetLabel =
      target === "both"
        ? "rank and level-up banners"
        : target === "profile"
          ? "rank profile banner"
          : "level-up banner";
    const formatNote = prepared.animated
      ? target === "profile"
        ? " The rank card shows a still frame from the GIF."
        : target === "level-up"
          ? " GIF animation is preserved in level-up messages."
          : " GIFs animate in level-up messages; rank cards show a still frame."
      : "";
    await interaction.editReply(
      `Your ${targetLabel} ${target === "both" ? "have" : "has"} been updated.${formatNote}`,
    );
  } catch (error) {
    if (error instanceof BannerInputError) {
      await interaction.editReply(error.message);
      return;
    }
    logger.error(
      { guildId: guild.id, userId: user.id, error: errorMessage(error) },
      "Could not update a member's banner",
    );
    await interaction.editReply("Couldn't update that banner. Please try again.");
  }
}

async function showRank(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const user = interaction.options.getUser("user") ?? interaction.user;
  const guild = interaction.guild!;
  const [member] = await db
    .select()
    .from(guildMembersTable)
    .where(
      and(
        eq(guildMembersTable.guildId, guild.id),
        eq(guildMembersTable.userId, user.id),
      ),
    )
    .limit(1);

  const xp = member?.xp ?? 0;
  const level = levelForXp(xp);
  const currentLevelXp = level ** 2 * 100;
  const nextLevelXp = (level + 1) ** 2 * 100;
  let customBanner: Buffer | undefined;
  if (member?.rankBannerPath) {
    try {
      customBanner = await loadProfileBanner(member.rankBannerPath);
    } catch (error) {
      logger.warn(
        { guildId: guild.id, userId: user.id, error: errorMessage(error) },
        "Could not load a member's rank banner",
      );
    }
  }
  const [{ rank }, settings] = await Promise.all([
    db
      .select({ rank: count() })
      .from(guildMembersTable)
      .where(
        and(
          eq(guildMembersTable.guildId, guild.id),
          gt(guildMembersTable.xp, xp),
        ),
      )
      .then(([result]) => ({ rank: (result?.rank ?? 0) + 1 })),
    db
      .select()
      .from(guildSettingsTable)
      .where(eq(guildSettingsTable.guildId, guild.id))
      .limit(1)
      .then(([result]) => result),
  ]);
  const buffer = await renderRankCard({
    username: user.globalName ?? user.username,
    avatarUrl: user.displayAvatarURL({ extension: "png", size: 256 }),
    xp,
    level,
    rank,
    currentLevelXp,
    nextLevelXp,
    background: settings?.rankCardBackground as
      | "forest"
      | "aurora"
      | "sunset"
      | "midnight"
      | "orchid",
    customBanner,
  });
  const attachment = new AttachmentBuilder(buffer, { name: "rank-card.png" });
  await interaction.reply({ files: [attachment] });
}

async function showLeaderboard(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const members = await db
    .select()
    .from(guildMembersTable)
    .where(eq(guildMembersTable.guildId, interaction.guild!.id))
    .orderBy(sql`${guildMembersTable.xp} DESC`)
    .limit(10);

  const content = members.length
    ? members
        .map(
          (member, index) =>
            `${index + 1}. ${member.username} — level ${levelForXp(member.xp)}, ${member.xp} XP`,
        )
        .join("\n")
    : "No XP has been earned yet.";
  await interaction.reply({
    content: `**XP leaderboard**\n${content}\n\nUse \`/rank\` with a member to view their banner profile, and \`/profile-banner set\` to customize your own.`,
    allowedMentions: { parse: [] },
  });
}

type ModerationKind = "warn" | "timeout" | "kick" | "ban";

async function moderate(
  interaction: ChatInputCommandInteraction,
  kind: ModerationKind,
): Promise<void> {
  const memberUser = interaction.options.getUser("member", true);
  const reason =
    interaction.options.getString("reason")?.trim() || "No reason provided";
  const permission = {
    warn: PermissionsBitField.Flags.ModerateMembers,
    timeout: PermissionsBitField.Flags.ModerateMembers,
    kick: PermissionsBitField.Flags.KickMembers,
    ban: PermissionsBitField.Flags.BanMembers,
  }[kind];

  if (!interaction.memberPermissions?.has(permission)) {
    await interaction.reply({
      content: "You don't have permission to use this moderation command.",
      ephemeral: true,
    });
    return;
  }
  if (memberUser.id === interaction.user.id) {
    await interaction.reply({
      content: "You can't moderate yourself.",
      ephemeral: true,
    });
    return;
  }
  if (memberUser.id === interaction.client.user?.id) {
    await interaction.reply({
      content: "I can't moderate myself.",
      ephemeral: true,
    });
    return;
  }

  const guild = interaction.guild!;
  const reasonWithActor = `${reason} (by ${interaction.user.tag})`;
  if (kind === "timeout") {
    const minutes = interaction.options.getInteger("minutes", true);
    const member = await guild.members.fetch(memberUser.id);
    await member.timeout(minutes * 60_000, reasonWithActor);
  } else if (kind === "kick") {
    const member = await guild.members.fetch(memberUser.id);
    await member.kick(reasonWithActor);
  } else if (kind === "ban") {
    await guild.members.ban(memberUser.id, { reason: reasonWithActor });
  }

  await db.insert(guildActivityTable).values({
    guildId: guild.id,
    kind,
    actorTag: interaction.user.tag,
    targetTag: memberUser.tag,
    details: reason,
  });
  await writeModLog(
    guild.id,
    `${kind.toUpperCase()} · ${memberUser.tag} · ${reason}`,
  );
  await interaction.reply({
    content:
      kind === "warn"
        ? `Warning recorded for ${memberUser.tag}.`
        : `${memberUser.tag} was ${kind === "timeout" ? "timed out" : `${kind}ed`}.`,
    ephemeral: true,
    allowedMentions: { parse: [] },
  });
}

async function clearMessages(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
    await interaction.reply({
      content: "You don't have permission to clear messages.",
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: "Use this command in a text channel.",
      ephemeral: true,
    });
    return;
  }
  const amount = interaction.options.getInteger("amount", true);
  const deleted = await (channel as TextChannel).bulkDelete(amount, true);
  await db.insert(guildActivityTable).values({
    guildId: interaction.guild!.id,
    kind: "clear",
    actorTag: interaction.user.tag,
    targetTag: `${deleted.size} messages`,
    details: `Cleared messages in #${"name" in channel ? channel.name : "channel"}`,
  });
  await interaction.reply({
    content: `Deleted ${deleted.size} messages. Messages older than 14 days are skipped by Discord.`,
    ephemeral: true,
  });
}

async function writeModLog(guildId: string, content: string): Promise<void> {
  const [settings] = await db
    .select()
    .from(guildSettingsTable)
    .where(eq(guildSettingsTable.guildId, guildId))
    .limit(1);
  if (!settings?.modLogChannelId) return;

  const channel = client.channels.cache.get(settings.modLogChannelId);
  if (
    !channel?.isTextBased() ||
    !("send" in channel) ||
    typeof channel.send !== "function"
  ) {
    return;
  }

  await channel
    .send({ content, allowedMentions: { parse: [] } })
    .catch((error: unknown) => {
      logger.warn(
        { guildId, error: errorMessage(error) },
        "Could not post moderation log",
      );
    });
}

export async function startDiscordBot(): Promise<void> {
  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN is not configured; Discord bot is offline");
    return;
  }

  try {
    await client.login(token);
  } catch {
    logger.error("Discord bot could not connect; check the bot token and intents");
  }
}

export function getBotStatus() {
  const ready = client.isReady();
  return {
    connected: ready,
    botTag: ready ? client.user.tag : null,
    guildCount: client.guilds.cache.size,
    uptimeSeconds: ready ? Math.floor((Date.now() - botStartedAt) / 1000) : null,
  };
}

export function getBotGuild(guildId: string): Guild | null {
  return client.guilds.cache.get(guildId) ?? null;
}

export function getAssignableRoles(guildId: string) {
  const guild = getBotGuild(guildId);
  if (!guild) return [];
  return [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id && role.editable && !role.managed)
    .sort((a, b) => b.position - a.position)
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.hexColor,
      position: role.position,
    }));
}
