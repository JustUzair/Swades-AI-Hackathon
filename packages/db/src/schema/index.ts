import {
  pgTable,
  text,
  integer,
  timestamp,
  real,
  index,
  uuid,
} from "drizzle-orm/pg-core";

export const recordings = pgTable("recordings", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull().default("Untitled Recording"),
  status: text("status", { enum: ["recording", "processing", "done", "error"] })
    .notNull()
    .default("recording"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordingId: uuid("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    minioKey: text("minio_key").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    mimeType: text("mime_type").notNull().default("audio/webm"),
    ackedAt: timestamp("acked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    recordingIdx: index("chunks_recording_id_idx").on(t.recordingId),
    chunkUniqueIdx: index("chunks_unique_idx").on(t.recordingId, t.chunkIndex),
  }),
);

export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => chunks.id, { onDelete: "cascade" }),
    recordingId: uuid("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    speaker: text("speaker").notNull().default("SPEAKER_00"),
    text: text("text").notNull(),
    startTime: real("start_time").notNull(),
    endTime: real("end_time").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    recordingIdx: index("segments_recording_id_idx").on(t.recordingId),
    chunkIdx: index("segments_chunk_id_idx").on(t.chunkId),
  }),
);

export type Recording = typeof recordings.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
export type TranscriptSegment = typeof transcriptSegments.$inferSelect;
