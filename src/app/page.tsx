/**
 * --- Shortform Engine Dashboard (Prototype) ---
 * A simple landing page to check if the API is alive.
 */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8">🚀 Shortform Reverse-Engine</h1>
        <p className="mb-4">The API is ready for Discord Webhooks.</p>
        <div className="p-4 bg-gray-100 rounded-lg">
          <code className="text-blue-600">POST /api/ingest/discord</code>
        </div>
      </div>
    </main>
  );
}
