"use client";

import { useRef, useState, useCallback } from "react";
import { saveChunkToOPFS, deleteChunkFromOPFS } from "@/lib/opfs";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000";

export type RecordingState =
  | "idle"
  | "recording"
  | "stopping"
  | "uploading"
  | "done"
  | "error";

export type UploadProgress = {
  total: number;
  done: number;
  currentChunk: number;
  failed: number;
};

export function useRecording() {
  const [state, setState] = useState<RecordingState>("idle");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [chunkCount, setChunkCount] = useState(0);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]); // raw blobs in memory for merging
  const chunkIndexRef = useRef(0);
  const recordingIdRef = useRef<string | null>(null);
  const headerChunkRef = useRef<Blob | null>(null); // first blob holds the WebM header

  const start = useCallback(async () => {
    setError(null);
    setState("recording");
    chunkIndexRef.current = 0;
    chunksRef.current = [];
    setChunkCount(0);
    headerChunkRef.current = null; // reset header on each new recording

    try {
      const res = await fetch(`${SERVER}/api/recordings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Recording ${new Date().toLocaleString()}`,
        }),
      });
      const { recording } = await res.json();
      setRecordingId(recording.id);
      recordingIdRef.current = recording.id;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType =
        ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find(
          m => MediaRecorder.isTypeSupported(m),
        ) ?? "audio/webm";

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128_000,
      });

      recorder.ondataavailable = async e => {
        if (!e.data || e.data.size < 100) return;
        const idx = chunkIndexRef.current++;
        setChunkCount(idx + 1);

        // Store raw blob in memory — all raw blobs merged later = valid WebM
        if (idx === 0) headerChunkRef.current = e.data;
        chunksRef.current.push(e.data);

        // OPFS backup: prepend header so each saved file is independently recoverable
        const opfsBlob =
          idx === 0 || !headerChunkRef.current
            ? e.data
            : new Blob([headerChunkRef.current, e.data], { type: e.data.type });
        await saveChunkToOPFS(recordingIdRef.current!, idx, opfsBlob);
      };

      recorder.onerror = e => {
        console.error("[recorder] error", e);
        setError(
          "Recorder error — audio is buffered in OPFS and can be recovered",
        );
        setState("error");
      };

      mediaRecorderRef.current = recorder;
      recorder.start(10_000); // 10s slices for OPFS backup granularity
    } catch (err: any) {
      setError(err.message ?? "Failed to start recording");
      setState("error");
    }
  }, []);

  const stop = useCallback(async (): Promise<string | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return null;

    setState("stopping");

    await new Promise<void>(resolve => {
      recorder.onstop = () => resolve();
      recorder.stop();
      recorder.stream.getTracks().forEach(t => t.stop());
    });

    const recId = recordingIdRef.current;
    const allChunks = chunksRef.current;

    if (!recId || allChunks.length === 0) {
      setState("idle");
      return null;
    }

    const totalChunks = chunkIndexRef.current;
    setState("uploading");
    setProgress({ total: 1, done: 0, currentChunk: 0, failed: 0 });

    try {
      // Merge all raw blobs into one complete WebM file — Blob concat is valid
      // because MediaRecorder raw chunks in order form a proper WebM container.
      // Sending as one file gives Deepgram full context for speaker diarization.
      const mimeType =
        ["audio/webm;codecs=opus", "audio/webm"].find(m =>
          MediaRecorder.isTypeSupported(m),
        ) ?? "audio/webm";

      const mergedBlob = new Blob(allChunks, { type: mimeType });

      const fd = new FormData();
      fd.append("audio", mergedBlob, "recording.webm");
      fd.append("recordingId", recId);
      fd.append("chunkIndex", "0");
      fd.append("clientChunkId", `${recId}-merged`);

      const res = await fetch(`${SERVER}/api/chunks/upload`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Upload failed");
      }

      setProgress({ total: 1, done: 1, currentChunk: 1, failed: 0 });

      // Clean up OPFS now that upload succeeded
      for (let i = 0; i < totalChunks; i++) {
        await deleteChunkFromOPFS(recId, i);
      }

      await fetch(`${SERVER}/api/recordings/${recId}/finish`, {
        method: "PATCH",
      });

      setState("done");
      return recId;
    } catch (err: any) {
      console.error("[uploader] failed", err);
      setError(
        `Upload failed: ${err.message}. Audio is saved in OPFS — refresh to retry.`,
      );
      setState("error");
      return null;
    }
  }, []);

  return {
    state,
    recordingId,
    chunkCount,
    progress,
    error,
    start,
    stop,
  };
}
