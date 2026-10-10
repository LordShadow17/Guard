import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowRight, ArrowUpRight, Award, BarChart3, Bot, Check,
  ChevronDown, CircleHelp, Crown, LayoutDashboard, LogOut, MessageSquare,
  Pencil, Plus, RefreshCw, Settings2, Shield, Sparkles, Trash2, Users, X, Zap,
} from 'lucide-react';
import {
  useGetAuthSession, useLoginWithPairCode, useLogout, useGetBotStatus,
  useGetGuilds, useGetGuildOverview, useGetGuildSettings, useUpdateGuildSettings,
  useGetGuildLeaderboard, useGetGuildActivity, useGetGuildRoles, useGetGuildRewards,
  useCreateGuildReward, useUpdateGuildReward, useDeleteGuildReward,
  getGetAuthSessionQueryKey, getGetGuildSettingsQueryKey,
  getGetGuildOverviewQueryKey, getGetGuildRewardsQueryKey,
  getGetGuildActivityQueryKey, getGetGuildLeaderboardQueryKey, getGetGuildRolesQueryKey,
  getGetGuildsQueryKey,
} from '@workspace/api-client-react';
import type { ActivityItem, Guild, GuildSettings, LevelReward } from '@workspace/api-client-react';

const withCookies = { credentials: 'include' as RequestCredentials };
const pages = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/settings', label: 'Settings', icon: Settings2 },
  { href: '/leaderboard', label: 'Leaderboard', icon: BarChart3 },
  { href: '/rewards', label: 'Level rewards', icon: Award },
  { href: '/activity', label: 'Activity', icon: Activity },
];

const number = (value?: number | null) => new Intl.NumberFormat('en-US').format(value ?? 0);
const duration = (seconds?: number | null) => {
  if (seconds == null) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return days ? `${days}d ${hours}h` : `${hours}h ${mins}m`;
};
const initials = (name: string) => name.slice(0, 2).toUpperCase();
const timeAgo = (value: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
};
const eventLabel = (kind: ActivityItem['kind']) => kind === 'level_up' ? 'Level up' : ({
  warn: 'Warning', timeout: 'Timeout', kick: 'Kick', ban: 'Ban', clear: 'Messages cleared',
} as Record<string, string>)[kind] ?? kind;
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

function LoadingBlock({ label = 'Loading your community data' }: { label?: string }) {
  return <div className="panel loading-state" role="status" data-testid="status-loading">
    <div className="skeleton" style={{ height: 12, width: 170, margin: '0 auto 12px' }} />
    <div className="skeleton" style={{ height: 8, width: 230, margin: '0 auto' }} />
    <span style={{ position: 'absolute', clipPath: 'inset(50%)' }}>{label}</span>
  </div>;
}

function ErrorBlock({ message, retry }: { message: string; retry: () => void }) {
  return <div className="panel error-state" data-testid="state-error">
    <div className="empty-mark"><CircleHelp size={19} /></div>
    <strong>That didn’t load</strong><p>{message}</p>
    <button className="secondary-btn" style={{ marginTop: 15 }} onClick={retry} data-testid="button-retry"><RefreshCw className="btn-icon" /> Try again</button>
  </div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state" data-testid="state-empty">
    <div className="empty-mark"><Sparkles size={19} /></div><strong>{title}</strong><p>{description}</p>
  </div>;
}

function Toast({ message }: { message: string }) {
  return message ? <div className="toast-note" role="status" data-testid="status-save-success"><Check size={15} style={{ verticalAlign: 'middle', marginRight: 8 }} />{message}</div> : null;
}

function Brand() {
  return <div className="brand" data-testid="brand-orbit">
    <div className="brand-mark"><Bot size={19} strokeWidth={2.3} /></div>
    <div><div className="brand-name">orbit bot</div><div className="brand-caption">Community tools</div></div>
  </div>;
}

export function LoginPage() {
  const [code, setCode] = useState('');
  const [location, setLocation] = useLocation();
  const session = useGetAuthSession({ request: withCookies });
  const login = useLoginWithPairCode({ request: withCookies });
  useEffect(() => { if (session.data?.authenticated) setLocation('/'); }, [session.data?.authenticated, setLocation]);
  const queryClient = useQueryClient();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ data: { code: code.trim().toUpperCase() } }, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getGetAuthSessionQueryKey() });
        setLocation('/');
      },
    });
  };
  return <main className="login-page">
    <section className="login-story">
      <Brand />
      <div className="login-story-copy">
        <div className="eyebrow" style={{ color: '#9fb4a8' }}>The community control room</div>
        <h1>Good communities<br />grow <span>together.</span></h1>
        <p>Clear leveling, dependable moderation logs, and thoughtful rewards for the people who make your server what it is.</p>
        <div className="login-proof">
          <div><strong>Always free</strong><small>No premium tier. Ever.</small></div>
          <div><strong>One small code</strong><small>Secure, short-lived access</small></div>
        </div>
      </div>
      <div className="login-foot">ORBIT BOT · A steadier way to run your server</div>
    </section>
    <section className="login-panel-wrap">
      <form className="login-panel" onSubmit={submit}>
        <div className="eyebrow">Dashboard sign in</div>
        <h2>Welcome back.</h2>
        <p>Use a one-time code from your Discord server to open your community dashboard.</p>
        <label className="code-label" htmlFor="pair-code"><span>Pairing code</span><span>6–12 characters</span></label>
        <input id="pair-code" className="code-input" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 12))} placeholder="ABCD1234" minLength={6} maxLength={12} autoComplete="one-time-code" required data-testid="input-pair-code" />
        {login.isError && <div className="login-error" data-testid="status-login-error">{errorText(login.error)}</div>}
        <button className="primary-btn" type="submit" disabled={login.isPending || code.trim().length < 6} data-testid="button-login">
          {login.isPending ? 'Checking code…' : <>Open dashboard <ArrowRight size={15} /></>}
        </button>
        <div className="login-help"><strong>Where do I find my code?</strong>In Discord, run <b>/dashboard-code</b> in a server where Orbit Bot is installed. Codes expire quickly and can only be used once.</div>
      </form>
    </section>
  </main>;
}

function AuthenticatedShell({ children }: { children: ReactNode }) {
  const [path, setPath] = useLocation();
  const queryClient = useQueryClient();
  const session = useGetAuthSession({ request: withCookies });
  const guildsQuery = useGetGuilds({
    query: {
      enabled: session.data?.authenticated === true,
      queryKey: getGetGuildsQueryKey(),
    },
    request: withCookies,
  });
  const botQuery = useGetBotStatus({ request: withCookies });
  const logout = useLogout({ request: withCookies });
  const [guildId, setGuildId] = useState(() => localStorage.getItem('orbit-guild') ?? '');
  const guilds = guildsQuery.data ?? session.data?.guilds ?? [];
  const activeGuild = guilds.find(guild => guild.id === guildId) ?? guilds[0];
  useEffect(() => {
    if (session.data?.authenticated === false) setPath('/login');
  }, [session.data?.authenticated, setPath]);
  useEffect(() => {
    if (activeGuild && activeGuild.id !== guildId) {
      setGuildId(activeGuild.id);
      localStorage.setItem('orbit-guild', activeGuild.id);
    }
  }, [activeGuild, guildId]);
  if (path === '/login') return <LoginPage />;
  if (session.isLoading || guildsQuery.isLoading) return <div className="app-shell"><div className="side-rail"><Brand /></div><main className="main-area"><div className="page-wrap"><LoadingBlock /></div></main></div>;
  if (!session.data?.authenticated) return <LoginPage />;
  if (guildsQuery.isError) return <main className="error-page"><ErrorBlock message={errorText(guildsQuery.error)} retry={() => guildsQuery.refetch()} /></main>;
  if (guilds.length === 0) return <div className="app-shell"><div className="side-rail"><Brand /></div><main className="main-area"><div className="page-wrap"><div className="page-heading"><div><div className="eyebrow">Orbit Bot dashboard</div><h1>No server connected yet</h1><p>Add Orbit Bot to a Discord server, then sign in again.</p></div></div><div className="panel"><EmptyState title="Your communities will show up here" description="The dashboard only lists servers where you have access and Orbit Bot is installed." /></div></div></main></div>;
  const currentPage = pages.find(item => item.href === path)?.label ?? 'Overview';
  const onLogout = () => logout.mutate(undefined, { onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: getGetAuthSessionQueryKey() });
    setPath('/login');
  } });
  const chooseGuild = (value: string) => { setGuildId(value); localStorage.setItem('orbit-guild', value); };
  return <div className="app-shell">
    <aside className="side-rail">
      <Brand />
      <div className="rail-label">Workspace</div>
      <label className="guild-selector" data-testid="select-guild-wrap">
        {activeGuild?.iconUrl ? <img className="guild-badge" src={activeGuild.iconUrl} alt="" /> : <span className="guild-badge">{initials(activeGuild?.name ?? 'S')}</span>}
        <span style={{ minWidth: 0, flex: 1 }}><strong>{activeGuild?.name ?? 'Choose a server'}</strong><small>Discord community</small></span>
        <ChevronDown size={14} />
        <select aria-label="Choose server" value={activeGuild?.id ?? ''} onChange={e => chooseGuild(e.target.value)} data-testid="select-guild" style={{ position: 'absolute', opacity: 0, inset: 0, width: '100%', cursor: 'pointer' }}>
          {guilds.map(guild => <option key={guild.id} value={guild.id}>{guild.name}</option>)}
        </select>
      </label>
      <div className="rail-label">Manage</div>
      <nav className="nav-list" aria-label="Dashboard pages">
        {pages.map(item => {
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} className={`nav-link ${path === item.href ? 'active' : ''}`} data-testid={`link-nav-${item.href === '/' ? 'overview' : item.href.slice(1)}`}><Icon size={17} /><span>{item.label}</span></Link>;
        })}
      </nav>
      <div className="rail-bottom">
        <div className="bot-card">
          <div className="bot-card-head"><span className="status-dot" style={{ background: botQuery.data?.connected ? '#82d6a9' : '#dfa16d' }} />{botQuery.isLoading ? 'Checking bot…' : botQuery.data?.connected ? 'Orbit is online' : 'Connection needs a look'}</div>
          <p data-testid="status-bot-connection">{botQuery.data?.botTag ?? 'Your server bot'}{botQuery.data?.uptimeSeconds != null ? ` · up ${duration(botQuery.data.uptimeSeconds)}` : ''}</p>
        </div>
        <div className="rail-footer"><span>{session.data?.guilds?.length ?? guilds.length} server{guilds.length === 1 ? '' : 's'} connected</span><button className="logout-btn" onClick={onLogout} disabled={logout.isPending} aria-label="Log out" title="Log out" data-testid="button-logout"><LogOut size={15} /></button></div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="crumb">Orbit Bot <span style={{ padding: '0 8px', color: '#c5c1b8' }}>/</span> {currentPage}</div>
        <div className="topbar-right"><div className="top-status"><span className="status-dot" />{botQuery.data?.connected ? 'Bot operational' : botQuery.isLoading ? 'Connecting' : 'Bot offline'}</div><div className="top-date">FREE FOR EVERY SERVER</div></div>
      </header>
      {activeGuild ? children && <GuildContext guild={activeGuild}>{children}</GuildContext> : null}
    </main>
    <nav className="mobile-nav" aria-label="Dashboard pages">
      {pages.map(item => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={path === item.href ? 'active' : ''} data-testid={`mobile-nav-${item.href === '/' ? 'overview' : item.href.slice(1)}`}><Icon /><span>{item.label}</span></Link>; })}
    </nav>
  </div>;
}

const GuildContextValue = createContext<Guild | null>(null);
function GuildContext({ guild, children }: { guild: Guild; children: ReactNode }) {
  return <GuildContextValue.Provider value={guild}>{children}</GuildContextValue.Provider>;
}
function useGuild() {
  const guild = useContext(GuildContextValue);
  if (!guild) throw new Error('Guild context is not available');
  return guild;
}

export function AppFrame({ route }: { route: '/' | '/settings' | '/leaderboard' | '/rewards' | '/activity' }) {
  return <AuthenticatedShell><PageByRoute route={route} /></AuthenticatedShell>;
}

function PageByRoute({ route }: { route: string }) {
  switch (route) {
    case '/': return <OverviewPage />;
    case '/settings': return <SettingsPage />;
    case '/leaderboard': return <LeaderboardPage />;
    case '/rewards': return <RewardsPage />;
    case '/activity': return <ActivityPage />;
    default: return <NotFoundPage />;
  }
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function OverviewPage() {
  const guild = useGuild();
  const queryClient = useQueryClient();
  const overview = useGetGuildOverview(guild.id, { query: { queryKey: getGetGuildOverviewQueryKey(guild.id) }, request: withCookies });
  const activity = useGetGuildActivity(guild.id, { query: { queryKey: getGetGuildActivityQueryKey(guild.id) }, request: withCookies });
  const settings = useGetGuildSettings(guild.id, { query: { queryKey: getGetGuildSettingsQueryKey(guild.id) }, request: withCookies });
  const update = useUpdateGuildSettings({ request: withCookies });
  const [success, setSuccess] = useState(false);
  const metrics = overview.data;
  const setLeveling = () => {
    if (!settings.data) return;
    update.mutate({ guildId: guild.id, data: {
      levelingEnabled: !settings.data.levelingEnabled,
      xpMin: settings.data.xpMin,
      xpMax: settings.data.xpMax,
      cooldownSeconds: settings.data.cooldownSeconds,
      reactionLevelingEnabled: settings.data.reactionLevelingEnabled,
      reactionXp: settings.data.reactionXp,
      reactionCooldownSeconds: settings.data.reactionCooldownSeconds,
      voiceLevelingEnabled: settings.data.voiceLevelingEnabled,
      voiceXpPerMinute: settings.data.voiceXpPerMinute,
      rankCardBackground: settings.data.rankCardBackground,
      announcementChannelId: settings.data.announcementChannelId,
      announcementMessage: settings.data.announcementMessage,
      modLogChannelId: settings.data.modLogChannelId,
    } }, {
      onSuccess: async () => { setSuccess(true); await Promise.all([queryClient.invalidateQueries({ queryKey: getGetGuildSettingsQueryKey(guild.id) }), queryClient.invalidateQueries({ queryKey: getGetGuildOverviewQueryKey(guild.id) })]); window.setTimeout(() => setSuccess(false), 3000); },
    });
  };
  if (overview.isLoading) return <div className="page-wrap"><LoadingBlock /></div>;
  if (overview.isError) return <div className="page-wrap"><ErrorBlock message={errorText(overview.error)} retry={() => overview.refetch()} /></div>;
  const recent = (activity.data ?? []).slice(0, 5);
  return <div className="page-wrap">
    <PageHeading eyebrow="Community overview" title={`Good to see you, ${guild.name}.`} description="A clear view of the things keeping your community moving." action={<Link href="/settings" className="secondary-btn" data-testid="button-overview-settings"><Settings2 className="btn-icon" /> Configure bot</Link>} />
    <div className="metric-grid">
      <Metric label="Community members" value={number(metrics?.memberCount)} foot={`${number(metrics?.trackedMembers)} tracked by Orbit`} icon={<Users size={16} />} />
      <Metric label="XP earned to date" value={number(metrics?.totalXp)} foot="Across your whole community" icon={<Zap size={16} />} />
      <Metric label="Messages today" value={number(metrics?.messagesToday)} foot="Conversation is in motion" icon={<MessageSquare size={16} />} />
      <Metric label="Mod actions this month" value={number(metrics?.moderationActions)} foot="Logged for your team" icon={<Shield size={16} />} />
    </div>
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-head"><div><h2 className="panel-title">Recent activity</h2><div className="panel-subtitle">The latest moments across your server</div></div><Link href="/activity" className="text-link" data-testid="link-view-activity">View all <ArrowRight size={13} /></Link></div>
        {activity.isLoading ? <LoadingBlock label="Loading recent activity" /> : activity.isError ? <ErrorBlock message={errorText(activity.error)} retry={() => activity.refetch()} /> : recent.length ? <div className="activity-preview">{recent.map(item => <ActivityRow key={item.id} item={item} />)}</div> : <EmptyState title="A quiet moment" description="Level-ups and moderation events will appear here as they happen." />}
      </section>
      <div className="overview-side">
        <section className="panel feature-card">
          <div className="feature-top"><h2>Leveling system</h2><button className={`feature-toggle ${settings.data?.levelingEnabled ? 'on' : ''}`} onClick={setLeveling} disabled={!settings.data || update.isPending} aria-label={settings.data?.levelingEnabled ? 'Disable leveling' : 'Enable leveling'} aria-pressed={!!settings.data?.levelingEnabled} data-testid="toggle-leveling-overview"><span /></button></div>
          <p className="feature-blurb">Reward participation with XP, announce every milestone, and give your members a reason to return.</p>
          <div className="feature-stats"><div><span>System</span><strong>{settings.data?.levelingEnabled ? 'Enabled' : settings.isLoading ? 'Loading' : 'Paused'}</strong></div><div><span>XP per message</span><strong>{settings.data ? `${settings.data.xpMin}–${settings.data.xpMax}` : '—'}</strong></div></div>
          {update.isError && <div className="login-error" data-testid="status-leveling-save-error" style={{ marginTop: 12 }}>{errorText(update.error)}. Try the switch again.</div>}
        </section>
        <div className="uptime-card"><div><strong>{metrics?.botOnline ? 'All systems steady' : 'Bot connection offline'}</strong><small>{metrics?.guildName} · {metrics?.botOnline ? 'Listening for activity' : 'Reconnect the bot to resume'}</small></div><div className="uptime-orbit"><Bot size={19} /></div></div>
        <section className="panel feature-card" style={{ padding: 17 }}>
          <div className="feature-top" style={{ marginBottom: 9 }}><h2>Orbit promise</h2><span style={{ color: '#4c8975', font: '10px var(--font-mono)' }}>ALWAYS FREE</span></div>
          <p className="feature-blurb" style={{ margin: 0 }}>Every leveling and moderation feature stays available to every server. No caps. No premium switch.</p>
        </section>
      </div>
    </div>
    {success && <Toast message="Leveling preference saved" />}
  </div>;
}

function Metric({ label, value, foot, icon }: { label: string; value: string; foot: string; icon: ReactNode }) {
  return <div className="panel metric" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div className="metric-label">{label}</div><span style={{ color: '#538773', position: 'relative', zIndex: 1 }}>{icon}</span></div><div className="metric-value">{value}</div><div className="metric-foot">{foot}</div></div>;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const isLevel = item.kind === 'level_up';
  return <div className="activity-row" data-testid={`activity-row-${item.id}`}>
    <div className={`event-icon ${isLevel ? '' : 'mod'}`}>{isLevel ? <Award size={16} /> : <Shield size={15} />}</div>
    <div className="event-main"><strong>{isLevel ? `${item.targetTag} reached a new level` : `${eventLabel(item.kind)} · ${item.targetTag}`}</strong><small>{item.details || `${eventLabel(item.kind)} by ${item.actorTag}`}</small></div>
    <div className="event-time">{timeAgo(item.createdAt)}</div>
  </div>;
}

function SettingsPage() {
  const guild = useGuild();
  const queryClient = useQueryClient();
  const query = useGetGuildSettings(guild.id, { query: { queryKey: getGetGuildSettingsQueryKey(guild.id) }, request: withCookies });
  const save = useUpdateGuildSettings({ request: withCookies });
  const [form, setForm] = useState<GuildSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [selectedTag, setSelectedTag] = useState('{user}');
  useEffect(() => { if (query.data) setForm(query.data); }, [query.data]);
  const updateField = <K extends keyof GuildSettings>(key: K, value: GuildSettings[K]) => setForm(current => current ? { ...current, [key]: value } : current);
  if (query.isLoading) return <div className="page-wrap"><LoadingBlock /></div>;
  if (query.isError) return <div className="page-wrap"><ErrorBlock message={errorText(query.error)} retry={() => query.refetch()} /></div>;
  if (!form) return null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({ guildId: guild.id, data: {
      levelingEnabled: form.levelingEnabled,
      xpMin: Number(form.xpMin),
      xpMax: Number(form.xpMax),
      cooldownSeconds: Number(form.cooldownSeconds),
      reactionLevelingEnabled: form.reactionLevelingEnabled,
      reactionXp: Number(form.reactionXp),
      reactionCooldownSeconds: Number(form.reactionCooldownSeconds),
      voiceLevelingEnabled: form.voiceLevelingEnabled,
      voiceXpPerMinute: Number(form.voiceXpPerMinute),
      rankCardBackground: form.rankCardBackground,
      announcementChannelId: form.announcementChannelId || null,
      announcementMessage: form.announcementMessage,
      modLogChannelId: form.modLogChannelId || null,
    } }, {
      onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: getGetGuildSettingsQueryKey(guild.id) }), queryClient.invalidateQueries({ queryKey: getGetGuildOverviewQueryKey(guild.id) })]); setSaved(true); window.setTimeout(() => setSaved(false), 3500); },
    });
  };
  const insertTag = (tag = selectedTag) => updateField('announcementMessage', `${form.announcementMessage}${form.announcementMessage && !/\s$/.test(form.announcementMessage) ? ' ' : ''}${tag}`);
  const messageTags = [
    ['{user}', 'User mention'],
    ['{mention}', 'Mention'],
    ['{username}', 'Username'],
    ['{display_name}', 'Display name'],
    ['{level}', 'New level'],
    ['{previous_level}', 'Previous level'],
    ['{xp}', 'Total XP'],
    ['{next_level_xp}', 'XP needed for next level'],
    ['{remaining_xp}', 'XP remaining'],
    ['{server}', 'Server'],
    ['{server_name}', 'Server name'],
    ['{channel}', 'Channel'],
  ] as const;
  const rankBackgrounds = [
    { value: 'forest', label: 'Forest', tone: 'forest', detail: 'Deep pine and soft mint' },
    { value: 'aurora', label: 'Aurora', tone: 'aurora', detail: 'Cool northern lights' },
    { value: 'sunset', label: 'Sunset', tone: 'sunset', detail: 'Warm dusk and coral' },
    { value: 'midnight', label: 'Midnight', tone: 'midnight', detail: 'Ink with silver accents' },
    { value: 'orchid', label: 'Orchid', tone: 'orchid', detail: 'Dusky plum and rose' },
  ] as const;
  return <div className="page-wrap">
    <PageHeading eyebrow="Configuration" title="Make Orbit yours." description="Set a fair pace for XP, shape member rank cards, and choose where important moments get recorded." />
    <form className="settings-layout" onSubmit={submit}>
      <section className="panel settings-card">
        <div className="section-heading"><div className="section-icon"><Zap size={17} /></div><div><h2>Leveling basics</h2><p>How members earn XP as they chat</p></div></div>
        <div className="toggle-line"><div><strong>Leveling enabled</strong><small>Members earn experience as they participate.</small></div><button type="button" className={`feature-toggle ${form.levelingEnabled ? 'on' : ''}`} aria-label="Toggle leveling" aria-pressed={form.levelingEnabled} onClick={() => updateField('levelingEnabled', !form.levelingEnabled)} data-testid="toggle-leveling-settings"><span /></button></div>
        <div className="field-grid">
          <Field label="Minimum XP" hint="Per eligible message"><input type="number" min="1" max="100" value={form.xpMin} onChange={e => updateField('xpMin', Number(e.target.value))} required data-testid="input-xp-min" /></Field>
          <Field label="Maximum XP" hint="Per eligible message"><input type="number" min="1" max="100" value={form.xpMax} onChange={e => updateField('xpMax', Number(e.target.value))} required data-testid="input-xp-max" /></Field>
          <Field label="Message cooldown" hint="Seconds between XP awards"><input type="number" min="5" max="3600" value={form.cooldownSeconds} onChange={e => updateField('cooldownSeconds', Number(e.target.value))} required data-testid="input-cooldown" /></Field>
        </div>
      </section>
      <section className="panel settings-card">
        <div className="section-heading"><div className="section-icon reaction-icon"><MessageSquare size={17} /></div><div><h2>Reaction XP</h2><p>Reward reactions without letting them run away</p></div></div>
        <div className="toggle-line">
          <div><strong>Enable reaction leveling</strong><small>Members earn XP when they react to messages.</small></div>
          <button type="button" className={`feature-toggle ${form.reactionLevelingEnabled ? 'on' : ''}`} aria-label="Toggle reaction leveling" aria-pressed={form.reactionLevelingEnabled} onClick={() => updateField('reactionLevelingEnabled', !form.reactionLevelingEnabled)} data-testid="toggle-reaction-leveling"><span /></button>
        </div>
        <div className="field-grid">
          <Field label="XP per reaction" hint="Awarded for an eligible reaction"><input type="number" min="1" max="100" value={form.reactionXp} onChange={e => updateField('reactionXp', Number(e.target.value))} required data-testid="input-reaction-xp" /></Field>
          <Field label="Reaction cooldown" hint="Seconds between reaction XP awards"><input type="number" min="15" max="3600" value={form.reactionCooldownSeconds} onChange={e => updateField('reactionCooldownSeconds', Number(e.target.value))} required data-testid="input-reaction-cooldown" /></Field>
        </div>
      </section>
      <section className="panel settings-card">
        <div className="section-heading"><div className="section-icon voice-icon"><Activity size={17} /></div><div><h2>Voice XP</h2><p>Recognize time spent together in voice</p></div></div>
        <div className="toggle-line">
          <div><strong>Enable voice leveling</strong><small>Members earn XP each full minute in a shared voice channel with at least two non-bot members.</small></div>
          <button type="button" className={`feature-toggle ${form.voiceLevelingEnabled ? 'on' : ''}`} aria-label="Toggle voice leveling" aria-pressed={form.voiceLevelingEnabled} onClick={() => updateField('voiceLevelingEnabled', !form.voiceLevelingEnabled)} data-testid="toggle-voice-leveling"><span /></button>
        </div>
        <div className="field-grid voice-field-grid">
          <Field label="XP per minute" hint="Awarded for each eligible minute"><input type="number" min="1" max="100" value={form.voiceXpPerMinute} onChange={e => updateField('voiceXpPerMinute', Number(e.target.value))} required data-testid="input-voice-xp-per-minute" /></Field>
        </div>
      </section>
      <section className="panel settings-card full">
        <div className="section-heading"><div className="section-icon rank-icon"><Award size={17} /></div><div><h2>Rank card appearance</h2><p>Choose the backdrop members see on their rank card</p></div></div>
        <fieldset className="rank-options">
          <legend className="sr-only">Rank card background</legend>
          {rankBackgrounds.map(option => <label className={`rank-option ${form.rankCardBackground === option.value ? 'selected' : ''}`} key={option.value} data-testid={`rank-background-${option.value}`}>
            <input type="radio" name="rank-card-background" value={option.value} checked={form.rankCardBackground === option.value} onChange={() => updateField('rankCardBackground', option.value)} aria-label={`${option.label} rank card background`} />
            <span className={`rank-swatch ${option.tone}`} aria-hidden="true"><span className="rank-swatch-orbit" /></span>
            <span className="rank-option-copy"><strong>{option.label}</strong><small>{option.detail}</small></span>
            <span className="rank-selected-mark" aria-hidden="true"><Check size={13} /></span>
          </label>)}
        </fieldset>
      </section>
      <section className="panel settings-card">
        <div className="section-heading"><div className="section-icon"><MessageSquare size={17} /></div><div><h2>Level-up announcements</h2><p>A little recognition goes a long way</p></div></div>
        <div className="field-grid" style={{ gridTemplateColumns: '1fr' }}>
          <Field label="Announcement channel ID" hint="Voice level-ups need this channel; otherwise message and reaction level-ups are announced where earned."><input value={form.announcementChannelId ?? ''} onChange={e => updateField('announcementChannelId', e.target.value || null)} placeholder="Discord text channel ID (optional)" data-testid="input-announcement-channel" /></Field>
          <Field label="Announcement message"><textarea maxLength={500} value={form.announcementMessage} onChange={e => updateField('announcementMessage', e.target.value)} placeholder="Well done {user}, you reached level {level}!" data-testid="input-announcement-message" /><span className="field-hint">{form.announcementMessage.length}/500 characters</span></Field>
          <div className="tag-picker" aria-labelledby="announcement-tags-heading">
            <div className="tag-picker-heading"><div><strong id="announcement-tags-heading">Message tags</strong><small>Choose a tag to append it to the end of your message.</small></div></div>
            <div className="tag-picker-controls">
              <label className="sr-only" htmlFor="announcement-tag-select">Choose a message tag</label>
              <select id="announcement-tag-select" value={selectedTag} onChange={e => setSelectedTag(e.target.value)} data-testid="select-announcement-tag">
                {messageTags.map(([tag, description]) => <option key={tag} value={tag}>{tag} — {description}</option>)}
              </select>
              <button type="button" className="secondary-btn tag-insert-btn" onClick={() => insertTag()} data-testid="button-insert-announcement-tag">Insert tag</button>
            </div>
            <div className="tag-reference" aria-label="Available message tags">
              {messageTags.map(([tag, description]) => <button type="button" className="tag-chip" key={tag} title={`Append ${tag}`} onClick={() => insertTag(tag)} data-testid={`button-tag-${tag.slice(1, -1)}`}><code>{tag}</code><span>{description}</span></button>)}
            </div>
            <p className="tag-help">Tags are replaced with member, level, XP, server, or channel details when Orbit sends the announcement. Selecting any tag above appends it to the current message.</p>
          </div>
        </div>
      </section>
      <section className="panel settings-card full">
        <div className="section-heading"><div className="section-icon" style={{ background: '#f8ece3', color: '#ac7045' }}><Shield size={17} /></div><div><h2>Moderation log</h2><p>Keep your mod team in the loop without the noise</p></div></div>
        <div className="field" style={{ maxWidth: 460 }}><label htmlFor="mod-log-channel">Log channel ID</label><input id="mod-log-channel" value={form.modLogChannelId ?? ''} onChange={e => updateField('modLogChannelId', e.target.value || null)} placeholder="Leave empty to disable moderation logs" data-testid="input-mod-log-channel" /><span className="field-hint">Warnings, timeouts, kicks, bans, and cleared messages will be recorded here.</span></div>
      </section>
      <div className="settings-actions">{saved && <span className="saved-note" data-testid="status-settings-saved"><Check size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />All changes saved</span>}{save.isError && <span className="login-error" role="alert" data-testid="status-settings-save-error">{errorText(save.error)}</span>}<button className="primary-btn" type="submit" disabled={save.isPending} data-testid="button-save-settings">{save.isPending ? 'Saving…' : 'Save settings'}</button></div>
    </form>
  </div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="field"><label>{label}{children}</label>{hint && <span className="field-hint">{hint}</span>}</div>;
}

function LeaderboardPage() {
  const guild = useGuild();
  const query = useGetGuildLeaderboard(guild.id, { query: { queryKey: getGetGuildLeaderboardQueryKey(guild.id) }, request: withCookies });
  if (query.isLoading) return <div className="page-wrap"><LoadingBlock label="Loading XP rankings" /></div>;
  if (query.isError) return <div className="page-wrap"><ErrorBlock message={errorText(query.error)} retry={() => query.refetch()} /></div>;
  const entries = [...(query.data ?? [])].sort((a, b) => a.rank - b.rank);
  return <div className="page-wrap">
    <PageHeading eyebrow="XP rankings" title="The community board." description="A little friendly progress, measured one message at a time." />
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div className="panel-head"><div><h2 className="panel-title">Member leaderboard</h2><div className="panel-subtitle">{entries.length} ranked members · updates as your community chats</div></div><span style={{ font: '10px var(--font-mono)', color: '#818a82' }}>ALL TIME XP</span></div>
      {!entries.length ? <EmptyState title="The board is yours to fill" description="When members start earning XP, their progress will be ranked here." /> :
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Rank</th><th>Member</th><th>Level</th><th>Experience</th><th>Messages</th></tr></thead><tbody>
          {entries.map((entry, index) => <tr key={entry.userId} data-testid={`row-leaderboard-${entry.userId}`}><td className="rank-cell">{String(entry.rank || index + 1).padStart(2, '0')}</td><td className="user-cell">{entry.avatarUrl ? <img className="avatar" src={entry.avatarUrl} alt="" /> : <span className="avatar">{initials(entry.username)}</span>}{entry.username}</td><td><span className="level-pill">Lv. {entry.level}</span></td><td className="xp-cell">{number(entry.xp)} XP</td><td>{number(entry.messages)}</td></tr>)}
        </tbody></table></div>}
    </div>
    <div style={{ display: 'flex', gap: 9, alignItems: 'center', color: '#858d86', fontSize: 11, marginTop: 14 }}><Crown size={15} color="#ba8b4f" /> Rankings reflect lifetime XP earned in this server.</div>
  </div>;
}

type RewardDraft = { id?: number; level: number; roleId: string; roleName: string };
function RewardsPage() {
  const guild = useGuild();
  const queryClient = useQueryClient();
  const rewardsQuery = useGetGuildRewards(guild.id, { query: { queryKey: getGetGuildRewardsQueryKey(guild.id) }, request: withCookies });
  const rolesQuery = useGetGuildRoles(guild.id, { query: { queryKey: getGetGuildRolesQueryKey(guild.id) }, request: withCookies });
  const create = useCreateGuildReward({ request: withCookies });
  const update = useUpdateGuildReward({ request: withCookies });
  const remove = useDeleteGuildReward({ request: withCookies });
  const [draft, setDraft] = useState<RewardDraft | null>(null);
  const [success, setSuccess] = useState('');
  const pending = create.isPending || update.isPending;
  const refresh = async () => queryClient.invalidateQueries({ queryKey: getGetGuildRewardsQueryKey(guild.id) });
  const beginCreate = () => setDraft({ level: 5, roleId: '', roleName: '' });
  const beginEdit = (reward: LevelReward) => setDraft({ id: reward.id, level: reward.level, roleId: reward.roleId, roleName: reward.roleName });
  const saveReward = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const selected = (rolesQuery.data ?? []).find(role => role.id === draft.roleId);
    const body = { level: Number(draft.level), roleId: draft.roleId, roleName: selected?.name ?? draft.roleName };
    const onSuccess = async () => { await refresh(); setDraft(null); setSuccess(draft.id ? 'Reward updated' : 'Reward created'); window.setTimeout(() => setSuccess(''), 3200); };
    if (draft.id) update.mutate({ guildId: guild.id, rewardId: draft.id, data: body }, { onSuccess });
    else create.mutate({ guildId: guild.id, data: body }, { onSuccess });
  };
  const deleteReward = (reward: LevelReward) => {
    if (!window.confirm(`Remove the level ${reward.level} reward for ${reward.roleName}?`)) return;
    remove.mutate({ guildId: guild.id, rewardId: reward.id }, { onSuccess: async () => { await refresh(); setSuccess('Reward removed'); window.setTimeout(() => setSuccess(''), 3200); } });
  };
  const rewards = [...(rewardsQuery.data ?? [])].sort((a, b) => a.level - b.level);
  if (rewardsQuery.isLoading) return <div className="page-wrap"><LoadingBlock label="Loading level rewards" /></div>;
  if (rewardsQuery.isError) return <div className="page-wrap"><ErrorBlock message={errorText(rewardsQuery.error)} retry={() => rewardsQuery.refetch()} /></div>;
  return <div className="page-wrap">
    <PageHeading eyebrow="Recognition that sticks" title="Set the next milestone." description="Give members a role to look forward to at every level." action={<button className="primary-btn" onClick={beginCreate} data-testid="button-create-reward"><Plus className="btn-icon" /> Add reward</button>} />
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div className="panel-head"><div><h2 className="panel-title">Level rewards</h2><div className="panel-subtitle">Roles are assigned automatically when members reach each level.</div></div><span style={{ color: '#748078', font: '10px var(--font-mono)' }}>{rewards.length} ACTIVE</span></div>
      {rewards.length ? <div className="reward-list">{rewards.map(reward => <div key={reward.id} className="reward-item" data-testid={`reward-item-${reward.id}`}><div className="reward-level">{reward.level}</div><div className="reward-info"><strong>{reward.roleName}</strong><small>Role unlocked at level {reward.level} · Discord role</small></div><div className="reward-actions"><button className="icon-btn" onClick={() => beginEdit(reward)} aria-label={`Edit ${reward.roleName} reward`} data-testid={`button-edit-reward-${reward.id}`}><Pencil size={15} /></button><button className="icon-btn delete" onClick={() => deleteReward(reward)} aria-label={`Delete ${reward.roleName} reward`} data-testid={`button-delete-reward-${reward.id}`} disabled={remove.isPending}><Trash2 size={15} /></button></div></div>)}</div> : <EmptyState title="Every level is a chance to celebrate" description="Create your first milestone and give active members a role to earn." />}
      {remove.isError && <div className="login-error" style={{ padding: '0 18px 14px' }} data-testid="status-reward-delete-error">{errorText(remove.error)}. Please retry.</div>}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, color: '#858d86', fontSize: 11 }}><ArrowUpRight size={14} /> Rewards are managed by Orbit in your Discord server.</div>
    {success && <Toast message={success} />}
    {draft && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setDraft(null); }}>
      <form className="modal" onSubmit={saveReward} aria-label={draft.id ? 'Edit level reward' : 'Create level reward'}>
        <div className="modal-head"><div><h2>{draft.id ? 'Edit reward' : 'Add a milestone'}</h2><p>Choose when the role becomes available.</p></div><button type="button" className="icon-btn" onClick={() => setDraft(null)} aria-label="Close dialog" data-testid="button-close-reward-dialog"><X size={17} /></button></div>
        {rolesQuery.isError && <div className="login-error" data-testid="status-roles-error">{errorText(rolesQuery.error)} You can still enter the role ID below.</div>}
        <div className="modal-fields">
          <Field label="Level"><input type="number" min="1" max="1000" required value={draft.level} onChange={e => setDraft({ ...draft, level: Number(e.target.value) })} data-testid="input-reward-level" /></Field>
          <Field label="Discord role">
            {rolesQuery.data?.length ? <select required value={draft.roleId} onChange={e => { const role = rolesQuery.data?.find(item => item.id === e.target.value); setDraft({ ...draft, roleId: e.target.value, roleName: role?.name ?? '' }); }} data-testid="select-reward-role"><option value="" disabled>Select a role</option>{rolesQuery.data.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select> :
              <input required value={draft.roleId} onChange={e => setDraft({ ...draft, roleId: e.target.value, roleName: draft.roleName || 'Discord role' })} placeholder="Role ID" data-testid="input-reward-role-id" />}
          </Field>
          {!rolesQuery.data?.length && <Field label="Role name"><input required value={draft.roleName} onChange={e => setDraft({ ...draft, roleName: e.target.value })} placeholder="Community regular" data-testid="input-reward-role-name" /></Field>}
        </div>
        {(create.isError || update.isError) && <div className="login-error" data-testid="status-reward-save-error">{errorText(create.error ?? update.error)}</div>}
        <div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setDraft(null)} data-testid="button-cancel-reward">Cancel</button><button className="primary-btn" disabled={pending} type="submit" data-testid="button-save-reward">{pending ? 'Saving…' : draft.id ? 'Save changes' : 'Create reward'}</button></div>
      </form>
    </div>}
  </div>;
}

function ActivityPage() {
  const guild = useGuild();
  const query = useGetGuildActivity(guild.id, { query: { queryKey: getGetGuildActivityQueryKey(guild.id) }, request: withCookies });
  const [filter, setFilter] = useState<'all' | 'leveling' | 'moderation'>('all');
  const items = useMemo(() => (query.data ?? []).filter(item => filter === 'all' || (filter === 'leveling' ? item.kind === 'level_up' : item.kind !== 'level_up')), [query.data, filter]);
  if (query.isLoading) return <div className="page-wrap"><LoadingBlock label="Loading community activity" /></div>;
  if (query.isError) return <div className="page-wrap"><ErrorBlock message={errorText(query.error)} retry={() => query.refetch()} /></div>;
  return <div className="page-wrap">
    <PageHeading eyebrow="A useful paper trail" title="Everything that happened." description="Level milestones and moderation actions, kept together and easy to scan." />
    <section className="panel">
      <div className="panel-head"><div><h2 className="panel-title">Server activity</h2><div className="panel-subtitle">{items.length} {items.length === 1 ? 'event' : 'events'} shown</div></div>
        <div className="activity-filters" role="group" aria-label="Filter activity">{(['all', 'leveling', 'moderation'] as const).map(value => <button key={value} className={`filter-chip ${filter === value ? 'selected' : ''}`} onClick={() => setFilter(value)} data-testid={`filter-activity-${value}`}>{value === 'all' ? 'Everything' : value === 'leveling' ? 'Level-ups' : 'Moderation'}</button>)}</div>
      </div>
      {items.length ? <div className="activity-list">{items.map(item => <ActivityRow key={item.id} item={item} />)}</div> : <EmptyState title={filter === 'all' ? 'No events to show yet' : `No ${filter === 'leveling' ? 'level-ups' : 'moderation actions'} yet`} description="When there is something to share, you will find it right here." />}
    </section>
  </div>;
}

function NotFoundPage() {
  return <div className="page-wrap"><div className="panel" style={{ padding: 36, textAlign: 'center' }}><div className="empty-mark"><CircleHelp size={20} /></div><h2 className="panel-title">Page not found</h2><p className="field-hint" style={{ margin: '8px 0 16px' }}>That page isn’t part of your Orbit workspace.</p><Link href="/" className="primary-btn" data-testid="link-back-overview">Back to overview</Link></div></div>;
}
