import * as Minio from "minio";

const BUCKET = "audio-chunks";

export const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
  port: parseInt(process.env.MINIO_PORT ?? "9000"),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
});

export async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET);
    console.log(`[minio] created bucket: ${BUCKET}`);
  }
}

export async function uploadChunk(
  key: string,
  buffer: Buffer,
  mimeType: string,
): Promise<void> {
  await minioClient.putObject(BUCKET, key, buffer, buffer.length, {
    "Content-Type": mimeType,
  });
}

export async function chunkExists(key: string): Promise<boolean> {
  try {
    await minioClient.statObject(BUCKET, key);
    return true;
  } catch {
    return false;
  }
}

export async function getChunk(key: string): Promise<Buffer> {
  const stream = await minioClient.getObject(BUCKET, key);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", chunk => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export { BUCKET };
