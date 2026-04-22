import { NextRequest, NextResponse } from "next/server";
import {
  createOfflineSyncAdminClient,
  fetchExistingOfflineEventIds,
  insertOfflineEvents,
  loadActiveTeacherHints,
  loadCentreSyncState,
  loadPanelActivation,
  markPanelActivationApplied,
  mergeQuizAnswers,
  mergeQuizAttempts,
  mergeVideoProgress,
  parseOfflineSyncRequest,
  verifyOfflineSyncAttestation,
} from "@/lib/offline/sync";

export async function POST(req: NextRequest) {
  try {
    const payload = parseOfflineSyncRequest(await req.json());
    await verifyOfflineSyncAttestation(payload);

    const admin = createOfflineSyncAdminClient();
    const panelActivation = await loadPanelActivation(
      admin,
      payload.centreId,
      payload.fingerprintHex,
      payload.fingerprintDisplayHex
    );

    if (!panelActivation) {
      return NextResponse.json({ error: "Panel activation not found for this centre" }, { status: 403 });
    }

    if (panelActivation.status === "issued") {
      await markPanelActivationApplied(admin, panelActivation.id);
    }

    const centre = await loadCentreSyncState(admin, payload.centreId);
    const forceLock = panelActivation.status === "revoked" || !centre.is_active;

    const eventIds = payload.events.map((event) => event.clientEventId);
    const existingEventIds = await fetchExistingOfflineEventIds(admin, eventIds);
    const missingEvents = payload.events.filter((event) => !existingEventIds.has(event.clientEventId));
    await insertOfflineEvents(admin, payload, missingEvents);

    await mergeVideoProgress(admin, payload.videoProgress);
    const syncedAttemptIds = await mergeQuizAttempts(admin, payload.quizAttempts);
    await mergeQuizAnswers(admin, payload.quizAnswers, syncedAttemptIds);

    const activeTeacherIdHints = await loadActiveTeacherHints(admin, payload.centreId);
    const acceptedEventIds = Array.from(new Set(eventIds));

    return NextResponse.json(
      {
        acceptedEventIds,
        serverTimeMillis: Date.now(),
        forceLock,
        activeTeacherIdHints,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
