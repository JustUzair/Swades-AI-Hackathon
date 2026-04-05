import { Hono } from "hono";
import {
  createDb,
  recordings,
  chunks,
  transcriptSegments,
  eq,
  desc,
} from "@my-better-t-app/db";

const db = createDb(process.env.DATABASE_URL!);

export const recordingsRouter = new Hono()

  // Create a new recording session
  .post("/", async c => {
    const body = await c.req
      .json<{ title?: string }>()
      .catch(() => ({ title: undefined }));
    const [recording] = await db
      .insert(recordings)
      .values({ title: body.title ?? "Untitled Recording" })
      .returning();
    return c.json({ recording }, 201);
  })

  // Get recording with full stitched transcript
  .get("/:id/transcript", async c => {
    const { id } = c.req.param();

    const recording = await db.query.recordings.findFirst({
      where: eq(recordings.id, id),
    });

    if (!recording) return c.json({ error: "Not found" }, 404);

    // Fetch all segments ordered by chunk index then start time
    const segments = await db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.recordingId, id))
      .orderBy(transcriptSegments.chunkIndex, transcriptSegments.startTime);

    return c.json({ recording, segments });
  })

  // Mark recording as done
  .patch("/:id/finish", async c => {
    const { id } = c.req.param();
    const [updated] = await db
      .update(recordings)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(recordings.id, id))
      .returning();
    return c.json({ recording: updated });
  })

  // List recent recordings
  .get("/", async c => {
    const list = await db
      .select()
      .from(recordings)
      .orderBy(desc(recordings.createdAt))
      .limit(20);
    return c.json({ recordings: list });
  });
