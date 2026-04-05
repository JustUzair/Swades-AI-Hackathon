import { createClient, DeepgramClient } from "@deepgram/sdk";

export interface TranscriptSegment {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  punctuated_word?: string;
}

let _client: DeepgramClient | null = null;

function getClient(): DeepgramClient {
  if (!_client) {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) throw new Error("DEEPGRAM_API_KEY is not set");
    _client = createClient(key);
  }
  return _client;
}

function wordsToSegments(words: DeepgramWord[]): TranscriptSegment[] {
  if (!words.length) return [];

  const segments: TranscriptSegment[] = [];
  const firstWord = words[0]!;
  let currentSpeaker = firstWord.speaker ?? 0;
  let currentWords: string[] = [];
  let startTime = firstWord.start;
  let endTime = firstWord.end;

  for (const word of words) {
    const speaker = word.speaker ?? 0;

    if (speaker !== currentSpeaker) {
      // Speaker changed — flush current segment
      if (currentWords.length) {
        segments.push({
          speaker: `SPEAKER_${String(currentSpeaker).padStart(2, "0")}`,
          text: currentWords.join(" ").trim(),
          start: startTime,
          end: endTime,
        });
      }
      currentSpeaker = speaker;
      currentWords = [word.punctuated_word ?? word.word];
      startTime = word.start;
      endTime = word.end;
    } else {
      currentWords.push(word.punctuated_word ?? word.word);
      endTime = word.end;
    }
  }

  // Flush last segment
  if (currentWords.length) {
    segments.push({
      speaker: `SPEAKER_${String(currentSpeaker).padStart(2, "0")}`,
      text: currentWords.join(" ").trim(),
      start: startTime,
      end: endTime,
    });
  }

  return segments;
}

export async function transcribeChunk(
  audioBuffer: Buffer,
  mimeType: string,
  _previousContext?: string, // kept for API compatibility, Deepgram doesn't need it
): Promise<TranscriptSegment[]> {
  const deepgram = getClient();

  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
    audioBuffer,
    {
      model: "nova-2",
      diarize: true,
      punctuate: true,
      smart_format: true,
      utt_split: 0.8,
      mimetype: mimeType,
    },
  );

  if (error) {
    throw new Error(`Deepgram error: ${error.message}`);
  }

  const words = result?.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];

  if (!words.length) return [];

  return wordsToSegments(words as DeepgramWord[]);
}
