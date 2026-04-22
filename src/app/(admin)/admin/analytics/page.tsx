import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard";
import { OfflineSyncEventsPanel } from "@/components/admin/offline-sync-events-panel";
import { loadInitialAnalyticsPageData } from "@/lib/analytics/server";
import { loadRecentOfflineSyncEvents } from "@/lib/offline/sync";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const initialData = await loadInitialAnalyticsPageData();
  let offlineSyncEventsError: string | null = null;
  const offlineSyncEvents = await loadRecentOfflineSyncEvents(initialData.viewer).catch((error) => {
    offlineSyncEventsError = error instanceof Error ? error.message : "Failed to load offline sync events.";
    return [];
  });

  return (
    <div className="space-y-8">
      <AnalyticsDashboard {...initialData} />
      <OfflineSyncEventsPanel events={offlineSyncEvents} loadError={offlineSyncEventsError} />
    </div>
  );
}
