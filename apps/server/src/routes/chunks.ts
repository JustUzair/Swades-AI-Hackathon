import { Hono } from "hono";
import {
  createDb,
  chunks,
  transcriptSegments,
  recordings,
  eq,
  and,
  isNull,
} from "@my-better-t-app/db";
import { uploadChunk, chunkExists } from "../lib/minio.js";
import { transcribeChunk } from "../lib/transcription.js";

const db = createDb(process.env.DATABASE_URL!);

export const chunksRouter = new Hono()

  // Main upload endpoint — the critical path
  .post("/upload", async c => {
    const formData = await c.req.formData();

    const audioFile = formData.get("audio") as File | null;
    const recordingId = formData.get("recordingId") as string | null;
    const chunkIndex = parseInt((formData.get("chunkIndex") as string) ?? "0");
    const clientChunkId = formData.get("clientChunkId") as string | null;

    if (!audioFile || !recordingId) {
      return c.json({ error: "Missing audio or recordingId" }, 400);
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const mimeType = audioFile.type || "audio/webm";
    const minioKey = `${recordingId}/${chunkIndex}-${Date.now()}.webm`;

    try {
      // Step 1 — persist to MinIO FIRST, before any DB write
      await uploadChunk(minioKey, buffer, mimeType);

      // Step 2 — get previous chunk's last segment for context injection
      let previousContext: string | undefined;
      if (chunkIndex > 0) {
        const prevSegments = await db
          .select()
          .from(transcriptSegments)
          .where(
            and(
              eq(transcriptSegments.recordingId, recordingId),
              eq(transcriptSegments.chunkIndex, chunkIndex - 1),
            ),
          )
          .orderBy(transcriptSegments.endTime);

        const lastSeg = prevSegments.at(-1);
        if (lastSeg) previousContext = lastSeg.text;
      }

      // Step 3 — transcribe with diarization
      const segments = await transcribeChunk(buffer, mimeType, previousContext);

      // Step 4 — write chunk ack to DB
      const [chunk] = await db
        .insert(chunks)
        .values({
          recordingId,
          chunkIndex,
          minioKey,
          sizeBytes: buffer.length,
          mimeType,
          ackedAt: new Date(),
        })
        .returning();

      if (!chunk) {
        throw new Error("Failed to insert chunk");
      }

      // Step 5 — write transcript segments
      if (segments.length > 0) {
        await db.insert(transcriptSegments).values(
          segments.map(seg => ({
            chunkId: chunk.id,
            recordingId,
            speaker: seg.speaker,
            text: seg.text.trim(),
            startTime: seg.start,
            endTime: seg.end,
            chunkIndex,
          })),
        );
      }

      return c.json({
        success: true,
        chunkId: chunk.id,
        clientChunkId,
        segmentsCount: segments.length,
        segments,
      });
    } catch (err) {
      console.error(`[chunks] upload failed for chunk ${chunkIndex}:`, err);
      // Do NOT ack — client will retry from OPFS
      return c.json(
        { error: "Upload failed, retry from OPFS", retryable: true },
        500,
      );
    }
  })

  // Reconciliation — client sends chunk IDs it has in OPFS, we verify which are missing
  .post("/reconcile", async c => {
    const body = await c.req.json<{
      recordingId: string;
      clientChunkIds: number[]; // chunk indexes client has in OPFS
    }>();

    const { recordingId, clientChunkIds } = body;

    const ackedChunks = await db
      .select({ chunkIndex: chunks.chunkIndex })
      .from(chunks)
      .where(
        and(
          eq(chunks.recordingId, recordingId),
          // only fully acked ones
        ),
      );

    const ackedIndexes = new Set(ackedChunks.map(c => c.chunkIndex));
    const missingIndexes = clientChunkIds.filter(idx => !ackedIndexes.has(idx));

    return c.json({ missingChunkIndexes: missingIndexes });
  })

  // Verify MinIO vs DB consistency (called during reconciliation)
  .get("/verify/:recordingId", async c => {
    const { recordingId } = c.req.param();

    const allChunks = await db
      .select()
      .from(chunks)
      .where(eq(chunks.recordingId, recordingId));

    const results = await Promise.all(
      allChunks.map(async chunk => {
        const existsInBucket = await chunkExists(chunk.minioKey);
        return {
          chunkIndex: chunk.chunkIndex,
          existsInBucket,
          chunkId: chunk.id,
        };
      }),
    );

    const inconsistent = results.filter(r => !r.existsInBucket);
    return c.json({ total: allChunks.length, inconsistent });
  });
