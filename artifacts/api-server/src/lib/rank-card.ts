import { createCanvas, loadImage } from "@napi-rs/canvas";

export type RankCardBackground =
  | "forest"
  | "aurora"
  | "sunset"
  | "midnight"
  | "orchid";

type RankCardInput = {
  username: string;
  avatarUrl: string;
  xp: number;
  level: number;
  rank: number;
  currentLevelXp: number;
  nextLevelXp: number;
  background: RankCardBackground;
};

const themes: Record<
  RankCardBackground,
  { start: string; end: string; accent: string; muted: string }
> = {
  forest: {
    start: "#183a32",
    end: "#315d4a",
    accent: "#efbc75",
    muted: "#c1d3c7",
  },
  aurora: {
    start: "#103b43",
    end: "#386a72",
    accent: "#8de0d0",
    muted: "#c0dadb",
  },
  sunset: {
    start: "#542c38",
    end: "#985b45",
    accent: "#ffd094",
    muted: "#eed0c2",
  },
  midnight: {
    start: "#202940",
    end: "#3c4668",
    accent: "#a9c3ff",
    muted: "#c7cede",
  },
  orchid: {
    start: "#382b4f",
    end: "#72577b",
    accent: "#e7b6db",
    muted: "#d9ccdf",
  },
};

function roundedRect(
  context: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export async function renderRankCard(input: RankCardInput): Promise<Buffer> {
  const width = 960;
  const height = 320;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  const theme = themes[input.background] ?? themes.forest;
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, theme.start);
  background.addColorStop(1, theme.end);
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalAlpha = 0.16;
  context.strokeStyle = "#ffffff";
  context.lineWidth = 1;
  for (let offset = 0; offset < 4; offset += 1) {
    context.beginPath();
    context.arc(930, -25, 115 + offset * 44, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();

  context.fillStyle = "rgba(8, 20, 20, 0.25)";
  roundedRect(context, 26, 25, width - 52, height - 50, 26);
  context.fill();

  const avatarX = 68;
  const avatarY = 88;
  const avatarSize = 144;
  context.save();
  context.beginPath();
  context.arc(
    avatarX + avatarSize / 2,
    avatarY + avatarSize / 2,
    avatarSize / 2,
    0,
    Math.PI * 2,
  );
  context.clip();
  try {
    const avatar = await loadImage(input.avatarUrl);
    context.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  } catch {
    context.fillStyle = theme.accent;
    context.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    context.fillStyle = theme.start;
    context.font = "bold 62px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(input.username.slice(0, 1).toUpperCase(), 140, 160);
  }
  context.restore();

  context.strokeStyle = theme.accent;
  context.lineWidth = 5;
  context.beginPath();
  context.arc(
    avatarX + avatarSize / 2,
    avatarY + avatarSize / 2,
    avatarSize / 2 + 3,
    0,
    Math.PI * 2,
  );
  context.stroke();

  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = theme.muted;
  context.font = "600 16px sans-serif";
  context.fillText("COMMUNITY RANK", 250, 91);
  context.fillStyle = "#fffaf0";
  context.font = "bold 36px sans-serif";
  context.fillText(input.username.slice(0, 28), 250, 137);

  context.fillStyle = theme.muted;
  context.font = "500 18px sans-serif";
  context.fillText(`Level ${input.level}`, 250, 180);
  context.fillText(`#${input.rank} on the leaderboard`, 250, 213);

  const progressX = 250;
  const progressY = 237;
  const progressWidth = 635;
  const progressHeight = 18;
  context.fillStyle = "rgba(255, 255, 255, 0.2)";
  roundedRect(context, progressX, progressY, progressWidth, progressHeight, 9);
  context.fill();
  const range = Math.max(1, input.nextLevelXp - input.currentLevelXp);
  const progress = Math.min(
    1,
    Math.max(0, (input.xp - input.currentLevelXp) / range),
  );
  context.fillStyle = theme.accent;
  roundedRect(
    context,
    progressX,
    progressY,
    Math.max(progressHeight, progressWidth * progress),
    progressHeight,
    9,
  );
  context.fill();

  context.fillStyle = "#fffaf0";
  context.font = "bold 17px sans-serif";
  context.fillText(`${input.xp.toLocaleString()} XP`, progressX, 286);
  context.textAlign = "right";
  context.fillStyle = theme.muted;
  context.font = "500 15px sans-serif";
  context.fillText(
    `${Math.max(0, input.nextLevelXp - input.xp).toLocaleString()} XP to next level`,
    progressX + progressWidth,
    286,
  );

  return canvas.toBuffer("image/png");
}
