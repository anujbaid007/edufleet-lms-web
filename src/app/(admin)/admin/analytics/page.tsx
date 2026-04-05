import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard";
import { loadInitialAnalyticsPageData } from "@/lib/analytics/server";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const initialData = await loadInitialAnalyticsPageData();
  return <AnalyticsDashboard {...initialData} />;
}
