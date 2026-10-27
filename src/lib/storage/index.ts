import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getEnv } from "@/lib/env";

export type StorageAdapter = {
  putFile(key: string, filePath: string, contentType: string): Promise<void>;
  putBuffer(key: string, body: Buffer, contentType: string): Promise<void>;
  open(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
};

const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9/_\-.]{0,240}$/;

export function assertStorageKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.includes("..") || key.startsWith("/")) {
    throw new Error("Invalid storage key.");
  }
}

export function createStorage(): StorageAdapter {
  const env = getEnv();
  return env.STORAGE_DRIVER === "s3" ? createS3Storage() : createLocalStorage(env.STORAGE_LOCAL_PATH);
}

export function createLocalStorage(root: string): StorageAdapter {
  const resolvedRoot = path.resolve(root);

  function location(key: string): string {
    assertStorageKey(key);
    const full = path.resolve(resolvedRoot, key);
    if (!full.startsWith(resolvedRoot + path.sep)) throw new Error("Invalid storage key.");
    return full;
  }

  return {
    async putFile(key, filePath) {
      const destination = location(key);
      await mkdir(path.dirname(destination), { recursive: true });
      await pipeline(createReadStream(filePath), createWriteStream(destination));
    },
    async putBuffer(key, body) {
      const destination = location(key);
      await mkdir(path.dirname(destination), { recursive: true });
      await pipeline(Readable.from(body), createWriteStream(destination));
    },
    async open(key) {
      return createReadStream(location(key));
    },
    async delete(key) {
      await rm(location(key), { force: true });
    },
    async exists(key) {
      try {
        await stat(location(key));
        return true;
      } catch {
        return false;
      }
    },
  };
}

function createS3Storage(): StorageAdapter {
  const env = getEnv();
  const bucket = env.STORAGE_BUCKET;
  if (!bucket || !env.STORAGE_ENDPOINT || !env.STORAGE_ACCESS_KEY || !env.STORAGE_SECRET_KEY) {
    throw new Error("S3 storage is not configured.");
  }
  const client = new S3Client({
    region: env.STORAGE_REGION,
    endpoint: env.STORAGE_ENDPOINT,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
    },
  });

  return {
    async putFile(key, filePath, contentType) {
      assertStorageKey(key);
      const body = createReadStream(filePath);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ServerSideEncryption: env.STORAGE_SSE === "AES256" ? "AES256" : undefined,
        }),
      );
    },
    async putBuffer(key, body, contentType) {
      assertStorageKey(key);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ServerSideEncryption: env.STORAGE_SSE === "AES256" ? "AES256" : undefined,
        }),
      );
    },
    async open(key) {
      assertStorageKey(key);
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!response.Body) throw new Error("Stored object is empty.");
      return response.Body as Readable;
    },
    async delete(key) {
      assertStorageKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async exists(key) {
      assertStorageKey(key);
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },
  };
}
