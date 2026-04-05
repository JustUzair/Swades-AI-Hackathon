import { Recorder } from "@/components/recorder";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 gap-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Swades Transcriber
        </h1>
        <p className="text-muted-foreground">
          Record your meeting. We'll handle the rest.
        </p>
      </div>
      <Recorder />
    </main>
  );
}
