import {
  boolean,
  date,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const guildSettingsTable = pgTable("orbit_guild_settings", {
  guildId: text("guild_id").primaryKey(),
  guildName: text("guild_name").notNull().default("Discord server"),
  levelingEnabled: boolean("leveling_enabled").notNull().default(true),
  xpMin: integer("xp_min").notNull().default(15),
  xpMax: integer("xp_max").notNull().default(25),
  cooldownSeconds: integer("cooldown_seconds").notNull().default(60),
  reactionLevelingEnabled: boolean("reaction_leveling_enabled")
    .notNull()
    .default(false),
  reactionXp: integer("reaction_xp").notNull().default(2),
  reactionCooldownSeconds: integer("reaction_cooldown_seconds")
    .notNull()
    .default(60),
  voiceLevelingEnabled: boolean("voice_leveling_enabled")
    .notNull()
    .default(false),
  voiceXpPerMinute: integer("voice_xp_per_minute").notNull().default(5),
  rankCardBackground: text("rank_card_background")
    .notNull()
    .default("forest"),
  announcementChannelId: text("announcement_channel_id"),
  announcementMessage: text("announcement_message")
    .notNull()
    .default("GG {user}, you reached level {level}!"),
  modLogChannelId: text("mod_log_channel_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export type GuildSettings = typeof guildSettingsTable.$inferSelect;
export type NewGuildSettings = typeof guildSettingsTable.$inferInsert;

export const guildMembersTable = pgTable(
  "orbit_guild_members",
  {
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    username: text("username").notNull(),
    avatarUrl: text("avatar_url"),
    rankBannerPath: text("rank_banner_path"),
    levelUpBannerPath: text("level_up_banner_path"),
    xp: integer("xp").notNull().default(0),
    messageCount: integer("message_count").notNull().default(0),
    reactionCount: integer("reaction_count").notNull().default(0),
    voiceMinutes: integer("voice_minutes").notNull().default(0),
    lastXpAt: timestamp("last_xp_at", { withTimezone: true }),
    lastReactionXpAt: timestamp("last_reaction_xp_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
);
export type GuildMember = typeof guildMembersTable.$inferSelect;

export const guildDailyMetricsTable = pgTable(
  "orbit_guild_daily_metrics",
  {
    guildId: text("guild_id").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    messages: integer("messages").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.day] })],
);

export const guildActivityTable = pgTable("orbit_guild_activity", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  kind: text("kind").notNull(),
  actorTag: text("actor_tag").notNull(),
  targetTag: text("target_tag").notNull(),
  details: text("details").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export type GuildActivity = typeof guildActivityTable.$inferSelect;

export const guildRewardsTable = pgTable("orbit_guild_rewards", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  level: integer("level").notNull(),
  roleId: text("role_id").notNull(),
  roleName: text("role_name").notNull(),
});
export type GuildReward = typeof guildRewardsTable.$inferSelect;
