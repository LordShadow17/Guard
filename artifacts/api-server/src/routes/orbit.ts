import { and, count, desc, eq, not, sum } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  AuthSession,
  CreateGuildRewardBody,
  CreateGuildRewardResponse,
  DeleteGuildRewardParams,
  DeleteGuildRewardResponse,
  GetAuthSessionResponse,
  GetBotStatusResponse,
  GetGuildActivityParams,
  GetGuildActivityResponse,
  GetGuildLeaderboardParams,
  GetGuildLeaderboardResponse,
  GetGuildOverviewParams,
  GetGuildOverviewResponse,
  GetGuildRewardsParams,
  GetGuildRewardsResponse,
  GetGuildRolesParams,
  GetGuildRolesResponse,
  GetGuildSettingsParams,
  GetGuildSettingsResponse,
  GetGuildsResponse,
  LoginWithPairCodeBody,
  LoginWithPairCodeResponse,
  LogoutResponse,
  UpdateGuildRewardBody,
  UpdateGuildRewardParams,
  UpdateGuildRewardResponse,
  UpdateGuildSettingsBody,
  UpdateGuildSettingsParams,
  UpdateGuildSettingsResponse,
} from "@workspace/api-zod";
import {
  db,
  guildActivityTable,
  guildDailyMetricsTable,
  guildMembersTable,
  guildRewardsTable,
  guildSettingsTable,
} from "@workspace/db";
import {
  consumePairingCode,
  createSessionCookieValue,
  dashboardSessionCookie,
  readSessionGuildId,
} from "../lib/dashboard-auth";
import {
  getAssignableRoles,
  getBotGuild,
  getBotStatus,
} from "../lib/discord-bot";

const router: IRouter = Router();

function sessionGuildId(req: Request): string | null {
  return readSessionGuildId(req.cookies?.[dashboardSessionCookie.name]);
}

function hasGuildAccess(
  req: Request,
  res: Response,
  guildId: string,
): boolean {
  const authorizedGuildId = sessionGuildId(req);
  if (!authorizedGuildId) {
    res.status(401).json({ error: "Dashboard pairing required" });
    return false;
  }
  if (authorizedGuildId !== guildId) {
    res.status(403).json({ error: "This server is not paired to the session" });
    return false;
  }
  return true;
}

async function getGuildCard(guildId: string) {
  const liveGuild = getBotGuild(guildId);
  if (liveGuild) {
    return {
      id: liveGuild.id,
      name: liveGuild.name,
      iconUrl: liveGuild.iconURL(),
    };
  }

  const [settings] = await db
    .select()
    .from(guildSettingsTable)
    .where(eq(guildSettingsTable.guildId, guildId))
    .limit(1);
  return settings
    ? { id: guildId, name: settings.guildName, iconUrl: null }
    : null;
}

async function getOrCreateSettings(guildId: string) {
  const guildName = getBotGuild(guildId)?.name ?? "Discord server";
  await db
    .insert(guildSettingsTable)
    .values({ guildId, guildName })
    .onConflictDoNothing();
  const [settings] = await db
    .select()
    .from(guildSettingsTable)
    .where(eq(guildSettingsTable.guildId, guildId))
    .limit(1);
  if (!settings) throw new Error("Could not load guild settings");
  return settings;
}

function responseSettings(
  settings: Awaited<ReturnType<typeof getOrCreateSettings>>,
) {
  return {
    guildId: settings.guildId,
    levelingEnabled: settings.levelingEnabled,
    xpMin: settings.xpMin,
    xpMax: settings.xpMax,
    cooldownSeconds: settings.cooldownSeconds,
    reactionLevelingEnabled: settings.reactionLevelingEnabled,
    reactionXp: settings.reactionXp,
    reactionCooldownSeconds: settings.reactionCooldownSeconds,
    voiceLevelingEnabled: settings.voiceLevelingEnabled,
    voiceXpPerMinute: settings.voiceXpPerMinute,
    rankCardBackground: settings.rankCardBackground,
    announcementChannelId: settings.announcementChannelId,
    announcementMessage: settings.announcementMessage,
    modLogChannelId: settings.modLogChannelId,
  };
}

function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}

router.get("/auth/session", async (req, res): Promise<void> => {
  const guildId = sessionGuildId(req);
  if (!guildId) {
    res.json(GetAuthSessionResponse.parse({ authenticated: false, guilds: [] }));
    return;
  }

  const guild = await getGuildCard(guildId);
  if (!guild) {
    res.json(GetAuthSessionResponse.parse({ authenticated: false, guilds: [] }));
    return;
  }
  res.json(
    GetAuthSessionResponse.parse({ authenticated: true, guilds: [guild] }),
  );
});

router.post("/auth/pair", async (req, res): Promise<void> => {
  const body = LoginWithPairCodeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter a valid pairing code" });
    return;
  }

  const pairing = consumePairingCode(body.data.code);
  if (!pairing) {
    res.status(400).json({ error: "That code is invalid or has expired" });
    return;
  }

  const cookie = createSessionCookieValue(pairing.guildId);
  res.cookie(dashboardSessionCookie.name, cookie.value, dashboardSessionCookie);
  const guild =
    (await getGuildCard(pairing.guildId)) ??
    { id: pairing.guildId, name: pairing.guildName, iconUrl: null };
  res.json(
    LoginWithPairCodeResponse.parse({ authenticated: true, guilds: [guild] }),
  );
});

router.delete("/auth/session", (_req, res): void => {
  res.clearCookie(dashboardSessionCookie.name, {
    path: dashboardSessionCookie.path,
    httpOnly: true,
    sameSite: dashboardSessionCookie.sameSite,
    secure: dashboardSessionCookie.secure,
  });
  res.json(LogoutResponse.parse({ success: true }));
});

router.get("/bot/status", (_req, res): void => {
  res.json(GetBotStatusResponse.parse(getBotStatus()));
});

router.get("/guilds", async (req, res): Promise<void> => {
  const guildId = sessionGuildId(req);
  if (!guildId) {
    res.status(401).json({ error: "Dashboard pairing required" });
    return;
  }
  const guild = await getGuildCard(guildId);
  res.json(GetGuildsResponse.parse(guild ? [guild] : []));
});

router.get("/guilds/:guildId/overview", async (req, res): Promise<void> => {
  const params = GetGuildOverviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid server ID" });
    return;
  }
  const { guildId } = params.data;
  if (!hasGuildAccess(req, res, guildId)) return;

  const settings = await getOrCreateSettings(guildId);
  const guild = getBotGuild(guildId);
  const [memberStats] = await db
    .select({
      trackedMembers: count(),
      totalXp: sum(guildMembersTable.xp),
    })
    .from(guildMembersTable)
    .where(eq(guildMembersTable.guildId, guildId));
  const today = new Date().toISOString().slice(0, 10);
  const [dailyMetrics] = await db
    .select({ messages: guildDailyMetricsTable.messages })
    .from(guildDailyMetricsTable)
    .where(
      and(
        eq(guildDailyMetricsTable.guildId, guildId),
        eq(guildDailyMetricsTable.day, today),
      ),
    )
    .limit(1);
  const [moderation] = await db
    .select({ count: count() })
    .from(guildActivityTable)
    .where(
      and(
        eq(guildActivityTable.guildId, guildId),
        not(eq(guildActivityTable.kind, "level_up")),
      ),
    );

  res.json(
    GetGuildOverviewResponse.parse({
      guildId,
      guildName: guild?.name ?? settings.guildName,
      memberCount: guild?.memberCount ?? 0,
      trackedMembers: memberStats?.trackedMembers ?? 0,
      totalXp: Number(memberStats?.totalXp ?? 0),
      messagesToday: dailyMetrics?.messages ?? 0,
      moderationActions: moderation?.count ?? 0,
      levelingEnabled: settings.levelingEnabled,
      botOnline: getBotStatus().connected,
    }),
  );
});

router.get("/guilds/:guildId/settings", async (req, res): Promise<void> => {
  const params = GetGuildSettingsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid server ID" });
    return;
  }
  if (!hasGuildAccess(req, res, params.data.guildId)) return;
  const settings = await getOrCreateSettings(params.data.guildId);
  res.json(GetGuildSettingsResponse.parse(responseSettings(settings)));
});

router.put("/guilds/:guildId/settings", async (req, res): Promise<void> => {
  const params = UpdateGuildSettingsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid server ID" });
    return;
  }
  const { guildId } = params.data;
  if (!hasGuildAccess(req, res, guildId)) return;

  const body = UpdateGuildSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (body.data.xpMax < body.data.xpMin) {
    res.status(400).json({ error: "Maximum XP must be at least the minimum XP" });
    return;
  }
  const guild = getBotGuild(guildId);
  if (
    guild &&
    body.data.announcementChannelId &&
    !isTextChannel(guild.channels.cache.get(body.data.announcementChannelId))
  ) {
    res.status(400).json({ error: "Choose a valid text announcement channel" });
    return;
  }
  if (
    guild &&
    body.data.modLogChannelId &&
    !isTextChannel(guild.channels.cache.get(body.data.modLogChannelId))
  ) {
    res.status(400).json({ error: "Choose a valid text moderation-log channel" });
    return;
  }

  await getOrCreateSettings(guildId);
  const [updated] = await db
    .update(guildSettingsTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(guildSettingsTable.guildId, guildId))
    .returning();
  res.json(
    UpdateGuildSettingsResponse.parse(
      responseSettings(updated ?? (await getOrCreateSettings(guildId))),
    ),
  );
});

router.get(
  "/guilds/:guildId/leaderboard",
  async (req, res): Promise<void> => {
    const params = GetGuildLeaderboardParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid server ID" });
      return;
    }
    const { guildId } = params.data;
    if (!hasGuildAccess(req, res, guildId)) return;

    const rows = await db
      .select()
      .from(guildMembersTable)
      .where(eq(guildMembersTable.guildId, guildId))
      .orderBy(desc(guildMembersTable.xp))
      .limit(10);
    res.json(
      GetGuildLeaderboardResponse.parse(
        rows.map((member, index) => ({
          userId: member.userId,
          username: member.username,
          avatarUrl: member.avatarUrl,
          xp: member.xp,
          level: levelForXp(member.xp),
          messages: member.messageCount,
          rank: index + 1,
        })),
      ),
    );
  },
);

router.get("/guilds/:guildId/activity", async (req, res): Promise<void> => {
  const params = GetGuildActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid server ID" });
    return;
  }
  const { guildId } = params.data;
  if (!hasGuildAccess(req, res, guildId)) return;

  const activity = await db
    .select()
    .from(guildActivityTable)
    .where(eq(guildActivityTable.guildId, guildId))
    .orderBy(desc(guildActivityTable.createdAt))
    .limit(25);
  res.json(GetGuildActivityResponse.parse(activity));
});

router.get("/guilds/:guildId/roles", (req, res): void => {
  const params = GetGuildRolesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid server ID" });
    return;
  }
  if (!hasGuildAccess(req, res, params.data.guildId)) return;
  res.json(GetGuildRolesResponse.parse(getAssignableRoles(params.data.guildId)));
});

router.get("/guilds/:guildId/rewards", async (req, res): Promise<void> => {
  const params = GetGuildRewardsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid server ID" });
    return;
  }
  const { guildId } = params.data;
  if (!hasGuildAccess(req, res, guildId)) return;
  const rewards = await db
    .select()
    .from(guildRewardsTable)
    .where(eq(guildRewardsTable.guildId, guildId))
    .orderBy(guildRewardsTable.level);
  res.json(GetGuildRewardsResponse.parse(rewards));
});

router.post("/guilds/:guildId/rewards", async (req, res): Promise<void> => {
  const params = GetGuildRewardsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid server ID" });
    return;
  }
  const { guildId } = params.data;
  if (!hasGuildAccess(req, res, guildId)) return;

  const body = CreateGuildRewardBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const role = getBotGuild(guildId)?.roles.cache.get(body.data.roleId);
  if (!role?.editable || role.managed) {
    res.status(400).json({ error: "Select a role the bot can assign" });
    return;
  }
  const duplicate = await db
    .select({ id: guildRewardsTable.id })
    .from(guildRewardsTable)
    .where(
      and(
        eq(guildRewardsTable.guildId, guildId),
        eq(guildRewardsTable.level, body.data.level),
      ),
    )
    .limit(1);
  if (duplicate.length) {
    res.status(400).json({ error: "A reward already exists for this level" });
    return;
  }

  const [created] = await db
    .insert(guildRewardsTable)
    .values({
      guildId,
      level: body.data.level,
      roleId: role.id,
      roleName: role.name,
    })
    .returning();
  res.status(201).json(CreateGuildRewardResponse.parse(created));
});

router.patch(
  "/guilds/:guildId/rewards/:rewardId",
  async (req, res): Promise<void> => {
    const params = UpdateGuildRewardParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid reward ID" });
      return;
    }
    const { guildId, rewardId } = params.data;
    if (!hasGuildAccess(req, res, guildId)) return;

    const body = UpdateGuildRewardBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const role = getBotGuild(guildId)?.roles.cache.get(body.data.roleId);
    if (!role?.editable || role.managed) {
      res.status(400).json({ error: "Select a role the bot can assign" });
      return;
    }
    const duplicate = await db
      .select({ id: guildRewardsTable.id })
      .from(guildRewardsTable)
      .where(
        and(
          eq(guildRewardsTable.guildId, guildId),
          eq(guildRewardsTable.level, body.data.level),
          not(eq(guildRewardsTable.id, rewardId)),
        ),
      )
      .limit(1);
    if (duplicate.length) {
      res.status(400).json({ error: "A reward already exists for this level" });
      return;
    }

    const [updated] = await db
      .update(guildRewardsTable)
      .set({
        level: body.data.level,
        roleId: role.id,
        roleName: role.name,
      })
      .where(
        and(
          eq(guildRewardsTable.id, rewardId),
          eq(guildRewardsTable.guildId, guildId),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Reward not found" });
      return;
    }
    res.json(UpdateGuildRewardResponse.parse(updated));
  },
);

router.delete(
  "/guilds/:guildId/rewards/:rewardId",
  async (req, res): Promise<void> => {
    const params = DeleteGuildRewardParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid reward ID" });
      return;
    }
    const { guildId, rewardId } = params.data;
    if (!hasGuildAccess(req, res, guildId)) return;

    const [deleted] = await db
      .delete(guildRewardsTable)
      .where(
        and(
          eq(guildRewardsTable.id, rewardId),
          eq(guildRewardsTable.guildId, guildId),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Reward not found" });
      return;
    }
    res.json(DeleteGuildRewardResponse.parse({ success: true }));
  },
);

function isTextChannel(
  channel: ReturnType<NonNullable<ReturnType<typeof getBotGuild>>["channels"]["cache"]["get"]>,
): boolean {
  return !!channel?.isTextBased() && "send" in channel;
}

export default router;
