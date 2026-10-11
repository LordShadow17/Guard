import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { Attachment } from "discord.js";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const STATIC_BANNER_SIZE = { width: 960, height: 320 };

const supportedTypes = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
} as const;

export class BannerInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BannerInputError";
  }
}

export type PreparedBanner = {
  bytes: Buffer;
  contentType: "image/gif" | "image/png";
  extension: ".gif" | ".png";
  animated: boolean;
};

function matchesImageType(
  bytes: Buffer,
  contentType: keyof typeof supportedTypes,
): boolean {
  switch (contentType) {
    case "image/gif":
      return (
        bytes.subarray(0, 6).toString("ascii") === "GIF87a" ||
        bytes.subarray(0, 6).toString("ascii") === "GIF89a"
      );
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8;
    case "image/png":
      return bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
    case "image/webp":
      return (
        bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
        bytes.subarray(8, 12).toString("ascii") === "WEBP"
      );
  }
}

function drawCover(
  context: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  image: Awaited<ReturnType<typeof loadImage>>,
): void {
  const scale = Math.max(
    STATIC_BANNER_SIZE.width / image.width,
    STATIC_BANNER_SIZE.height / image.height,
  );
  const width = image.width * scale;
  const height = image.height * scale;
  context.drawImage(
    image,
    (STATIC_BANNER_SIZE.width - width) / 2,
    (STATIC_BANNER_SIZE.height - height) / 2,
    width,
    height,
  );
}

export async function prepareProfileBanner(
  attachment: Attachment,
): Promise<PreparedBanner> {
  if (attachment.size > MAX_UPLOAD_BYTES) {
    throw new BannerInputError("Banner files must be 5 MB or smaller.");
  }

  const url = new URL(attachment.url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "cdn.discordapp.com" ||
    !url.pathname.startsWith("/attachments/")
  ) {
    throw new BannerInputError("Upload the image as a Discord attachment.");
  }

  const contentType = attachment.contentType
    ?.split(";")[0]
    .trim()
    .toLowerCase() as keyof typeof supportedTypes | undefined;
  if (
    !contentType ||
    !Object.hasOwn(supportedTypes, contentType)
  ) {
    throw new BannerInputError("Use a PNG, JPG, WebP, or GIF image.");
  }

  if (
    !attachment.width ||
    !attachment.height ||
    attachment.width < 1 ||
    attachment.height < 1
  ) {
    throw new BannerInputError("Discord couldn't read the image dimensions.");
  }

  const isGif = contentType === "image/gif";
  const maxPixels = isGif ? 2_073_600 : 25_000_000;
  const maxWidth = isGif ? 1920 : 8192;
  const maxHeight = isGif ? 1080 : 8192;
  if (
    attachment.width > maxWidth ||
    attachment.height > maxHeight ||
    attachment.width * attachment.height > maxPixels
  ) {
    throw new BannerInputError(
      isGif
        ? "GIF banners must be no larger than 1920 × 1080."
        : "Image dimensions must be 8192 pixels or smaller on each side.",
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new BannerInputError("Discord couldn't download that image. Try again.");
  }
  if (!response.ok) {
    throw new BannerInputError("Discord couldn't download that image. Try again.");
  }

  const responseLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(responseLength) && responseLength > MAX_UPLOAD_BYTES) {
    throw new BannerInputError("Banner files must be 5 MB or smaller.");
  }
  const original = Buffer.from(await response.arrayBuffer());
  if (
    original.length === 0 ||
    original.length > MAX_UPLOAD_BYTES ||
    !matchesImageType(original, contentType)
  ) {
    throw new BannerInputError("That file isn't a supported image.");
  }

  let image: Awaited<ReturnType<typeof loadImage>>;
  try {
    image = await loadImage(original);
  } catch {
    throw new BannerInputError("That image couldn't be decoded. Try another file.");
  }
  if (
    image.width !== attachment.width ||
    image.height !== attachment.height
  ) {
    throw new BannerInputError("The image dimensions don't match the upload.");
  }

  if (contentType === "image/gif") {
    return {
      bytes: original,
      contentType: "image/gif",
      extension: ".gif",
      animated: true,
    };
  }

  const canvas = createCanvas(STATIC_BANNER_SIZE.width, STATIC_BANNER_SIZE.height);
  drawCover(canvas.getContext("2d"), image);
  return {
    bytes: canvas.toBuffer("image/png"),
    contentType: "image/png",
    extension: ".png",
    animated: false,
  };
}
