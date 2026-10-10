import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type PairingCode = {
  guildId: string;
  guildName: string;
  expiresAt: number;
};

type Session = {
  guildId: string;
  expiresAt: number;
};

const pairingCodes = new Map<string, PairingCode>();
const sessionCookieName = "orbit_session";
const sessionLifetimeSeconds = 7 * 24 * 60 * 60;

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required to protect the dashboard.");
  }
  return secret;
}

export function issuePairingCode(guildId: string, guildName: string): string {
  const now = Date.now();
  for (const [code, pairing] of pairingCodes) {
    if (pairing.expiresAt <= now) pairingCodes.delete(code);
  }

  const code = randomBytes(5).toString("hex").toUpperCase();
  pairingCodes.set(code, {
    guildId,
    guildName,
    expiresAt: now + 5 * 60 * 1000,
  });
  return code;
}

export function consumePairingCode(
  candidate: string,
): { guildId: string; guildName: string } | null {
  const code = candidate.trim().toUpperCase();
  const pairing = pairingCodes.get(code);
  pairingCodes.delete(code);

  if (!pairing || pairing.expiresAt <= Date.now()) return null;
  return { guildId: pairing.guildId, guildName: pairing.guildName };
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");
}

export function createSessionCookieValue(guildId: string): {
  value: string;
  expiresAt: number;
} {
  const expiresAt = Math.floor(Date.now() / 1000) + sessionLifetimeSeconds;
  const payload = Buffer.from(
    JSON.stringify({ guildId, expiresAt } satisfies Session),
  ).toString("base64url");
  return {
    value: `${payload}.${sign(payload)}`,
    expiresAt,
  };
}

export function readSessionGuildId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const [payload, providedSignature, extra] = value.split(".");
  if (!payload || !providedSignature || extra) return null;

  let expectedSignature: string;
  try {
    expectedSignature = sign(payload);
  } catch {
    return null;
  }

  const expected = Buffer.from(expectedSignature);
  const actual = Buffer.from(providedSignature);
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    return null;
  }

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<Session>;
    if (
      typeof session.guildId !== "string" ||
      typeof session.expiresAt !== "number" ||
      session.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return session.guildId;
  } catch {
    return null;
  }
}

export const dashboardSessionCookie = {
  name: sessionCookieName,
  maxAge: sessionLifetimeSeconds * 1000,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api",
};
