import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function privateObjectLocation(entityPath: string): {
  bucketName: string;
  objectName: string;
} {
  if (!entityPath.startsWith("/objects/")) {
    throw new Error("Invalid banner object path");
  }
  const relativePath = entityPath.slice("/objects/".length);
  if (
    !relativePath ||
    relativePath.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Invalid banner object path");
  }

  const privateDirectory = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!privateDirectory) {
    throw new Error("App Storage is not configured");
  }

  const directoryParts = privateDirectory
    .split("/")
    .filter((part) => part.length > 0);
  const bucketName = directoryParts[0];
  if (!bucketName) {
    throw new Error("App Storage private directory is invalid");
  }

  return {
    bucketName,
    objectName: [...directoryParts.slice(1), relativePath].join("/"),
  };
}

export async function storeProfileBanner(
  bytes: Buffer,
  contentType: "image/png" | "image/gif",
  extension: ".png" | ".gif",
): Promise<string> {
  const objectPath = `/objects/uploads/orbit-banners/${randomUUID()}${extension}`;
  const { bucketName, objectName } = privateObjectLocation(objectPath);
  await objectStorageClient
    .bucket(bucketName)
    .file(objectName)
    .save(bytes, {
      resumable: false,
      metadata: {
        contentType,
        cacheControl: "private, max-age=0, no-store",
      },
    });
  return objectPath;
}

export async function loadProfileBanner(objectPath: string): Promise<Buffer> {
  const { bucketName, objectName } = privateObjectLocation(objectPath);
  const [bytes] = await objectStorageClient
    .bucket(bucketName)
    .file(objectName)
    .download();
  return Buffer.from(bytes);
}

export async function deleteProfileBanner(objectPath: string): Promise<void> {
  const { bucketName, objectName } = privateObjectLocation(objectPath);
  await objectStorageClient
    .bucket(bucketName)
    .file(objectName)
    .delete({ ignoreNotFound: true });
}
