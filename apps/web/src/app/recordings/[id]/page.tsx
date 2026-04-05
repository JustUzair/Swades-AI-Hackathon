import { notFound } from "next/navigation";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000";

const SPEAKER_COLORS: Record<string, string> = {
  SPEAKER_00: "bg-blue-100 text-blue-800 border-blue-200",
  SPEAKER_01: "bg-green-100 text-green-800 border-green-200",
  SPEAKER_02: "bg-purple-100 text-purple-800 border-purple-200",
  SPEAKER_03: "bg-orange-100 text-orange-800 border-orange-200",
  SPEAKER_04: "bg-pink-100 text-pink-800 border-pink-200",
};

function colorFor(speaker: string) {
  return SPEAKER_COLORS[speaker] ?? "bg-gray-100 text-gray-800 border-gray-200";
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Segment {
  id: string;
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  chunkIndex: number;
}

async function getTranscript(id: string) {
  const res = await fetch(`${SERVER}/api/recordings/${id}/transcript`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ recording: any; segments: Segment[] }>;
}

export default async function TranscriptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getTranscript(id);
  if (!data) notFound();

  const { recording, segments } = data;

  // Group consecutive segments by same speaker for clean display
  const grouped: { speaker: string; segments: Segment[] }[] = [];
  for (const seg of segments) {
    const last = grouped.at(-1);
    if (last && last.speaker === seg.speaker) {
      last.segments.push(seg);
    } else {
      grouped.push({ speaker: seg.speaker, segments: [seg] });
    }
  }

  const uniqueSpeakers = [...new Set(segments.map(s => s.speaker))];

  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{recording.title}</h1>
        <p className="text-sm text-muted-foreground">
          {segments.length} segments · {uniqueSpeakers.length} speaker
          {uniqueSpeakers.length !== 1 ? "s" : ""} detected
        </p>
      </div>

      {/* Speaker legend */}
      {uniqueSpeakers.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {uniqueSpeakers.map(spk => (
            <span
              key={spk}
              className={`text-xs px-2 py-1 rounded-full border font-medium ${colorFor(spk)}`}
            >
              {spk.replace("SPEAKER_", "Speaker ")}
            </span>
          ))}
        </div>
      )}

      {/* Transcript */}
      <div className="space-y-4">
        {grouped.length === 0 && (
          <p className="text-muted-foreground text-center py-12">
            No transcript yet. Processing may still be in progress.
          </p>
        )}

        {grouped.map((group, i) => (
          <div key={i} className="flex gap-3">
            <span
              className={`shrink-0 text-xs px-2 py-1 rounded-full border font-semibold h-fit mt-1 ${colorFor(
                group.speaker,
              )}`}
            >
              {group.speaker.replace("SPEAKER_", "S")}
            </span>
            <div className="space-y-1 flex-1">
              <span className="text-xs text-muted-foreground">
                {formatTime(group.segments[0].startTime)} –{" "}
                {formatTime(group.segments.at(-1)!.endTime)}
              </span>
              <p className="text-sm leading-relaxed">
                {group.segments.map(s => s.text).join(" ")}
              </p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
