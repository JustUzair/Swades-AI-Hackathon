"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../../packages/ui/src/components/card";
import { Progress } from "../../../../packages/ui/src/components/progress";
import { Button } from "../../../../packages/ui/src/components/button";

import { useRecording } from "@/hooks/useRecording";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Loader2 } from "lucide-react";

export function Recorder() {
  const router = useRouter();
  const { state, chunkCount, progress, error, start, stop } = useRecording();

  const uploadPct = progress
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  const handleStop = async () => {
    const recId = await stop();
    console.log("[debug] stop() returned:", recId); // what does this log?
    if (recId) {
      router.push(`/recordings/${recId}`);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {state === "recording" ? (
            <span className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              Recording
            </span>
          ) : (
            "Transcription Recorder"
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {state === "idle" && (
          <Button onClick={start} className="w-full" size="lg">
            <Mic className="mr-2 h-5 w-5" />
            Start Recording
          </Button>
        )}

        {state === "recording" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              {chunkCount} chunk{chunkCount !== 1 ? "s" : ""} captured ·{" "}
              {chunkCount * 10}s buffered in OPFS
            </p>
            <Button
              onClick={handleStop}
              variant="destructive"
              className="w-full"
              size="lg"
            >
              <MicOff className="mr-2 h-5 w-5" />
              Stop & Transcribe
            </Button>
          </div>
        )}

        {(state === "stopping" || state === "uploading") && (
          <div className="space-y-3">
            {progress && (
              <>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Transcribing with speaker detection...</span>
                  <span>{uploadPct}%</span>
                </div>
                <Progress value={uploadPct} className="w-full" />
              </>
            )}
            {!progress && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Finalizing...
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded p-3">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
