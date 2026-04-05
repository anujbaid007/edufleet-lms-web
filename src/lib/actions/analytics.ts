"use server";

import { loadAnalyticsDataset } from "@/lib/analytics/server";
import type { AnalyticsRequest } from "@/lib/analytics/types";

export async function getAnalyticsDatasetAction(request: AnalyticsRequest) {
  return loadAnalyticsDataset(request);
}
