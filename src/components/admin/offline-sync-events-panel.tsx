import { ClayCard } from "@/components/ui/clay-card";
import type { RecentOfflineSyncEvent } from "@/lib/offline/sync";

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPayloadPreview(value: unknown) {
  if (value === null || value === undefined) return "No payload";

  try {
    const json = JSON.stringify(value);
    return json.length > 180 ? `${json.slice(0, 177)}...` : json;
  } catch {
    return "Unserializable payload";
  }
}

function assetLabel(event: RecentOfflineSyncEvent) {
  if (event.videoId) return `Video ${event.videoId.slice(0, 8)}`;
  if (event.quizId) return `Quiz ${event.quizId.slice(0, 8)}`;
  if (event.attemptId) return `Attempt ${event.attemptId.slice(0, 8)}`;
  return "Shell event";
}

export function OfflineSyncEventsPanel({
  events,
  loadError,
}: {
  events: RecentOfflineSyncEvent[];
  loadError?: string | null;
}) {
  return (
    <ClayCard hover={false} className="!p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-primary">
            Offline Sync
          </p>
          <h2 className="mt-2 font-poppins text-xl font-bold text-heading">Recent raw sync events</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Latest event rows accepted from offline APK refresh calls. This is the quickest place to confirm that a
            panel is sending analytics upstream before deeper rollups update.
          </p>
        </div>
        <span className="rounded-full bg-orange-primary/10 px-3 py-1 text-xs font-semibold text-orange-primary">
          {events.length} recent rows
        </span>
      </div>

      {loadError ? (
        <div className="mt-5 rounded-[28px] border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-900">
          {loadError}
        </div>
      ) : null}

      {!loadError && events.length === 0 ? (
        <div className="mt-5 rounded-[28px] border border-orange-primary/10 bg-[#fff8f0] px-4 py-5 text-sm text-muted">
          No offline sync events have been ingested yet for your current admin scope.
        </div>
      ) : null}

      {events.length > 0 ? (
        <div className="mt-5 overflow-hidden rounded-[28px] border border-orange-primary/10 bg-white/85">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-orange-primary/10 text-sm">
              <thead className="bg-[#fff8f0]">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Centre</th>
                  <th className="px-4 py-3">Teacher</th>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Received</th>
                  <th className="px-4 py-3">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-primary/10">
                {events.map((event) => (
                  <tr key={event.clientEventId} className="align-top">
                    <td className="px-4 py-4">
                      <div>
                        <p className="font-semibold text-heading">{event.eventType}</p>
                        <p className="mt-1 text-xs text-muted">
                          {event.clientEventId.slice(0, 8)} · panel {event.panelFingerprintHex.slice(0, 8)}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-heading">{event.centreName ?? event.centreId.slice(0, 8)}</p>
                      <p className="mt-1 text-xs text-muted">{event.centreId}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-heading">{event.teacherId ? event.teacherId.slice(0, 8) : "N/A"}</p>
                      <p className="mt-1 text-xs text-muted">{event.appVersion ?? "Unknown APK"}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-heading">{assetLabel(event)}</p>
                      <p className="mt-1 text-xs text-muted">
                        Occurred {formatTimestamp(event.occurredAt)}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-heading">{formatTimestamp(event.receivedAt)}</p>
                      <p className="mt-1 text-xs text-muted">Captured {formatTimestamp(event.capturedAt)}</p>
                    </td>
                    <td className="max-w-[360px] px-4 py-4">
                      <code className="block whitespace-pre-wrap break-words rounded-2xl bg-[#fff8f0] px-3 py-3 font-mono text-xs text-[#7c6a58]">
                        {formatPayloadPreview(event.payloadJson)}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </ClayCard>
  );
}
