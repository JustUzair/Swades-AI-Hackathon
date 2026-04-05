import {
  getChunkFromOPFS,
  deleteChunkFromOPFS,
  listChunkIndexes,
} from "./opfs";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000";
const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 1500;

export type UploadProgress = {
  total: number;
  done: number;
  failed: number;
  currentChunk: number;
};

async function uploadSingleChunk(
  recordingId: string,
  chunkIndex: number,
  blob: Blob,
  attempt = 0,
): Promise<boolean> {
  try {
    const fd = new FormData();
    fd.append("audio", blob, "chunk.webm");
    fd.append("recordingId", recordingId);
    fd.append("chunkIndex", String(chunkIndex));
    fd.append("clientChunkId", `${recordingId}_${chunkIndex}`);

    const res = await fetch(`${SERVER}/api/chunks/upload`, {
      method: "POST",
      body: fd,
    });

    if (res.ok) return true;

    const data = await res.json();
    if (data.retryable && attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      return uploadSingleChunk(recordingId, chunkIndex, blob, attempt + 1);
    }
    return false;
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      return uploadSingleChunk(recordingId, chunkIndex, blob, attempt + 1);
    }
    console.error(`[uploader] chunk ${chunkIndex} permanently failed`, err);
    return false;
  }
}

export async function uploadAllChunks(
  recordingId: string,
  totalChunks: number,
  onProgress?: (p: UploadProgress) => void,
): Promise<{ success: boolean; failedChunks: number[] }> {
  const indexes = Array.from({ length: totalChunks }, (_, i) => i);
  const failed: number[] = [];
  let done = 0;

  // Sequential upload — preserves order, easier reconciliation
  for (const idx of indexes) {
    onProgress?.({
      total: totalChunks,
      done,
      failed: failed.length,
      currentChunk: idx,
    });

    const blob = await getChunkFromOPFS(recordingId, idx);
    if (!blob) {
      console.warn(`[uploader] chunk ${idx} missing from OPFS`);
      failed.push(idx);
      continue;
    }

    const ok = await uploadSingleChunk(recordingId, idx, blob);
    if (ok) {
      await deleteChunkFromOPFS(recordingId, idx);
      done++;
    } else {
      failed.push(idx);
    }

    onProgress?.({
      total: totalChunks,
      done,
      failed: failed.length,
      currentChunk: idx,
    });
  }

  // Reconciliation pass — ask server which chunks it's missing
  if (failed.length === 0) {
    const remaining = await listChunkIndexes(recordingId);
    if (remaining.length > 0) {
      console.warn(
        `[uploader] ${remaining.length} orphan chunks in OPFS, re-uploading`,
      );
      for (const idx of remaining) {
        const blob = await getChunkFromOPFS(recordingId, idx);
        if (!blob) continue;
        const ok = await uploadSingleChunk(recordingId, idx, blob);
        if (ok) await deleteChunkFromOPFS(recordingId, idx);
        else failed.push(idx);
      }
    }
  }

  return { success: failed.length === 0, failedChunks: failed };
}
