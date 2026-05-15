import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const bucket = process.env.S3_BUCKET_NAME!;

/** Download a video file from S3 as a Buffer. Retries up to 3 times. */
export async function downloadFromS3(s3Key: string): Promise<Buffer> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const command = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
      const response = await s3.send(command);

      if (!response.Body) throw new Error(`Empty body for ${s3Key}`);

      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < 2) {
        const delay = 1000 * (attempt + 1);
        console.warn(`  Retry ${attempt + 1}/3 for ${s3Key} in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error(`Failed to download ${s3Key}`);
}
