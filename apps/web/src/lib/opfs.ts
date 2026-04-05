const DIR_NAME = "audio-chunks";

async function getDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR_NAME, { create: true });
}

function fileName(recordingId: string, chunkIndex: number) {
  return `${recordingId}_${chunkIndex}.webm`;
}

export async function saveChunkToOPFS(
  recordingId: string,
  chunkIndex: number,
  blob: Blob,
): Promise<void> {
  const dir = await getDir();
  const name = fileName(recordingId, chunkIndex);
  const fh = await dir.getFileHandle(name, { create: true });
  const writable = await fh.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function getChunkFromOPFS(
  recordingId: string,
  chunkIndex: number,
): Promise<Blob | null> {
  try {
    const dir = await getDir();
    const fh = await dir.getFileHandle(fileName(recordingId, chunkIndex));
    return await fh.getFile();
  } catch {
    return null;
  }
}

export async function deleteChunkFromOPFS(
  recordingId: string,
  chunkIndex: number,
): Promise<void> {
  try {
    const dir = await getDir();
    await dir.removeEntry(fileName(recordingId, chunkIndex));
  } catch {}
}

export async function listChunkIndexes(recordingId: string): Promise<number[]> {
  const dir = await getDir();
  const indexes: number[] = [];
  for await (const name of dir.keys()) {
    if (name.startsWith(recordingId)) {
      const parts = name.replace(".webm", "").split("_");
      const idx = parseInt(parts.at(-1) ?? "");
      if (!isNaN(idx)) indexes.push(idx);
    }
  }
  return indexes.sort((a, b) => a - b);
}

export async function clearRecordingFromOPFS(
  recordingId: string,
): Promise<void> {
  const indexes = await listChunkIndexes(recordingId);
  await Promise.all(indexes.map(i => deleteChunkFromOPFS(recordingId, i)));
}
