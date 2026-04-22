import "server-only";

import { createHash, createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsViewer } from "@/lib/analytics/types";
import { getQuizMasteryLevel } from "@/lib/quiz";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_REGEX = /^[0-9a-f]{64}$/;
const FINGERPRINT_DISPLAY_REGEX = /^[0-9a-f]{8}$/;

type OfflineSyncDatabase = {
  public: {
    Tables: {
      panel_activations: {
        Row: {
          id: string;
          centre_id: string;
          fingerprint_hex: string;
          status: "issued" | "applied" | "revoked";
          applied_at: string | null;
          issued_at: string;
        };
        Insert: {
          id?: string;
          centre_id: string;
          fingerprint_hex: string;
          activation_code: string;
          status?: "issued" | "applied" | "revoked";
          issued_at?: string;
          issued_by?: string | null;
          notes?: string | null;
          applied_at?: string | null;
          revoked_at?: string | null;
        };
        Update: {
          status?: "issued" | "applied" | "revoked";
          applied_at?: string | null;
        };
        Relationships: [];
      };
      centres: {
        Row: {
          id: string;
          org_id: string | null;
          name: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          org_id?: string | null;
          name?: string | null;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          org_id?: string | null;
          name?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          centre_id: string | null;
          role: string;
          is_active: boolean;
        };
        Insert: {
          id: string;
          centre_id?: string | null;
          role?: string;
          is_active?: boolean;
        };
        Update: {
          centre_id?: string | null;
          role?: string;
          is_active?: boolean;
        };
        Relationships: [];
      };
      offline_sync_events: {
        Row: {
          client_event_id: string;
          centre_id: string;
          panel_fingerprint_hex: string;
          teacher_id: string | null;
          credential_id: string | null;
          event_type: string;
          video_id: string | null;
          quiz_id: string | null;
          attempt_id: string | null;
          question_id: string | null;
          payload_json: unknown;
          occurred_at: string;
          captured_at: string;
          received_at: string;
          app_version: string | null;
          raw_event: unknown;
        };
        Insert: {
          client_event_id: string;
          centre_id: string;
          panel_fingerprint_hex: string;
          teacher_id?: string | null;
          credential_id?: string | null;
          event_type: string;
          video_id?: string | null;
          quiz_id?: string | null;
          attempt_id?: string | null;
          question_id?: string | null;
          payload_json?: unknown;
          occurred_at: string;
          captured_at: string;
          app_version?: string | null;
          raw_event?: unknown;
        };
        Update: {
          client_event_id?: string;
        };
        Relationships: [];
      };
      video_progress: {
        Row: {
          user_id: string;
          video_id: string;
          watched_percentage: number;
          last_position: number;
          completed: boolean;
        };
        Insert: {
          user_id: string;
          video_id: string;
          watched_percentage: number;
          last_position: number;
          completed: boolean;
          last_watched_at: string;
        };
        Update: {
          watched_percentage?: number;
          last_position?: number;
          completed?: boolean;
          last_watched_at?: string;
        };
        Relationships: [];
      };
      quiz_attempts: {
        Row: {
          id: string;
        };
        Insert: {
          id: string;
          quiz_id: string;
          user_id: string;
          total_questions: number;
          correct_answers: number;
          percent: number;
          mastery_level: string;
          started_at: string;
          completed_at: string;
        };
        Update: {
          id?: string;
        };
        Relationships: [];
      };
      quiz_attempt_answers: {
        Row: {
          attempt_id: string;
          question_id: string;
        };
        Insert: {
          attempt_id: string;
          question_id: string;
          selected_option?: number | null;
          is_correct: boolean;
        };
        Update: {
          attempt_id?: string;
          question_id?: string;
          selected_option?: number | null;
          is_correct?: boolean;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type OfflineSyncAdminClient = SupabaseClient<OfflineSyncDatabase>;
export type PanelActivationRow = OfflineSyncDatabase["public"]["Tables"]["panel_activations"]["Row"];
export type CentreSyncRow = OfflineSyncDatabase["public"]["Tables"]["centres"]["Row"];
export type OfflineSyncEventRow = OfflineSyncDatabase["public"]["Tables"]["offline_sync_events"]["Row"];

type PlayIntegrityServiceAccount = {
  client_email: string;
  private_key: string;
};

type PlayIntegrityDecodedToken = {
  requestDetails?: {
    requestPackageName?: string;
    requestHash?: string;
    requestTime?: string;
  };
  appIntegrity?: {
    appRecognitionVerdict?: string;
    packageName?: string;
  };
  deviceIntegrity?: {
    deviceRecognitionVerdict?: string[];
  };
  accountDetails?: {
    appLicensingVerdict?: string;
  };
};

export type RecentOfflineSyncEvent = {
  clientEventId: string;
  centreId: string;
  centreName: string | null;
  panelFingerprintHex: string;
  teacherId: string | null;
  credentialId: string | null;
  eventType: string;
  videoId: string | null;
  quizId: string | null;
  attemptId: string | null;
  questionId: string | null;
  payloadJson: unknown;
  occurredAt: string;
  capturedAt: string;
  receivedAt: string;
  appVersion: string | null;
};

export function createOfflineSyncAdminClient(): OfflineSyncAdminClient {
  return createClient<OfflineSyncDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export type OfflineSyncRequestPayload = {
  centreId: string;
  fingerprintHex: string;
  fingerprintDisplayHex: string;
  appVersion: string;
  attestation: {
    provider: string;
    packageName: string;
    debugAllowed: boolean;
    requestHash: string | null;
    integrityToken: string | null;
  };
  events: Array<{
    clientEventId: string;
    panelFingerprintHex: string;
    centreId: string;
    teacherId: string | null;
    credentialId: string | null;
    eventType: string;
    videoId: string | null;
    quizId: string | null;
    attemptId: string | null;
    questionId: string | null;
    payloadJson: string | null;
    occurredAtMillis: number;
    capturedAtMillis: number;
  }>;
  videoProgress: Array<{
    teacherId: string;
    centreId: string;
    credentialId: string;
    videoId: string;
    watchedPercentage: number;
    lastPositionSeconds: number;
    completed: boolean;
    lastWatchedAtMillis: number;
  }>;
  quizAttempts: Array<{
    attemptId: string;
    teacherId: string;
    centreId: string;
    credentialId: string;
    quizId: string;
    totalQuestions: number;
    correctAnswers: number;
    percent: number;
    masteryLevel: string;
    startedAtMillis: number;
    completedAtMillis: number | null;
  }>;
  quizAnswers: Array<{
    attemptId: string;
    questionId: string;
    selectedOption: number | null;
    isCorrect: boolean;
    answeredAtMillis: number;
  }>;
};

export function parseOfflineSyncRequest(input: unknown): OfflineSyncRequestPayload {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid sync payload");
  }

  const raw = input as Record<string, unknown>;
  const centreId = requireUuid(raw.centreId, "centreId");
  const fingerprintHex = requireFingerprint(raw.fingerprintHex, "fingerprintHex");
  const fingerprintDisplayHex = requireFingerprintDisplay(raw.fingerprintDisplayHex, "fingerprintDisplayHex");
  const appVersion = requireNonEmptyString(raw.appVersion, "appVersion");
  const attestation = parseAttestation(raw.attestation);

  const events = requireArray(raw.events, "events").map((entry, index) => parseEvent(entry, index, centreId));
  const videoProgress = requireArray(raw.videoProgress, "videoProgress").map((entry, index) =>
    parseVideoProgress(entry, index, centreId)
  );
  const quizAttempts = requireArray(raw.quizAttempts, "quizAttempts").map((entry, index) =>
    parseQuizAttempt(entry, index, centreId)
  );
  const quizAnswers = requireArray(raw.quizAnswers, "quizAnswers").map((entry, index) =>
    parseQuizAnswer(entry, index)
  );

  return {
    centreId,
    fingerprintHex,
    fingerprintDisplayHex,
    appVersion,
    attestation,
    events,
    videoProgress,
    quizAttempts,
    quizAnswers,
  };
}

export function teacherIdHint(teacherId: string) {
  return createHash("sha256").update(teacherId, "utf8").digest("hex").slice(0, 16);
}

export function allowDebugAttestation() {
  return process.env.EDUFLEET_OFFLINE_ALLOW_DEBUG_ATTESTATION === "true" || process.env.NODE_ENV !== "production";
}

export function computeOfflineSyncRequestHash(payload: OfflineSyncRequestPayload) {
  const canonical = JSON.stringify({
    centreId: payload.centreId,
    fingerprintHex: payload.fingerprintHex,
    fingerprintDisplayHex: payload.fingerprintDisplayHex,
    appVersion: payload.appVersion,
    events: payload.events,
    videoProgress: payload.videoProgress,
    quizAttempts: payload.quizAttempts,
    quizAnswers: payload.quizAnswers,
  });

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export async function verifyOfflineSyncAttestation(payload: OfflineSyncRequestPayload) {
  const requestHash = computeOfflineSyncRequestHash(payload);
  const { attestation } = payload;

  if (attestation.requestHash && attestation.requestHash !== requestHash) {
    throw new Error("Request hash mismatch");
  }

  if (attestation.provider === "debug") {
    if (!allowDebugAttestation() || !attestation.debugAllowed) {
      throw new Error("Debug attestation is disabled");
    }
    return;
  }

  if (attestation.provider !== "play_integrity") {
    throw new Error("Unsupported attestation provider");
  }

  if (!attestation.integrityToken) {
    throw new Error("Integrity token is required");
  }

  const expectedPackageName = getExpectedOfflinePackageName();
  if (attestation.packageName !== expectedPackageName) {
    throw new Error("Unexpected attestation package name");
  }

  const decodedToken = await decodePlayIntegrityToken(attestation.integrityToken, expectedPackageName);
  verifyDecodedPlayIntegrityVerdict(decodedToken, requestHash, expectedPackageName);
}

export async function loadRecentOfflineSyncEvents(
  viewer: Pick<AnalyticsViewer, "role" | "orgId" | "centreId">,
  limit = 40
): Promise<RecentOfflineSyncEvent[]> {
  const admin = createOfflineSyncAdminClient();

  let scopedCentreIds: string[] | null = null;
  if (viewer.role === "org_admin") {
    if (!viewer.orgId) return [];
    const { data, error } = await admin.from("centres").select("id").eq("org_id", viewer.orgId);
    if (error) throw new Error(error.message);
    scopedCentreIds = (data ?? []).map((row) => row.id);
  } else if (viewer.role === "centre_admin") {
    scopedCentreIds = viewer.centreId ? [viewer.centreId] : [];
  }

  if (scopedCentreIds && scopedCentreIds.length === 0) {
    return [];
  }

  let query = admin
    .from("offline_sync_events")
    .select(
      "client_event_id, centre_id, panel_fingerprint_hex, teacher_id, credential_id, event_type, video_id, quiz_id, attempt_id, question_id, payload_json, occurred_at, captured_at, received_at, app_version"
    )
    .order("received_at", { ascending: false })
    .limit(limit);

  if (scopedCentreIds) {
    query = query.in("centre_id", scopedCentreIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const centreIds = Array.from(new Set((data ?? []).map((row) => row.centre_id)));
  const centreNames = new Map<string, string | null>();
  if (centreIds.length > 0) {
    const { data: centres, error: centresError } = await admin.from("centres").select("id, name").in("id", centreIds);
    if (centresError) throw new Error(centresError.message);
    for (const centre of centres ?? []) {
      centreNames.set(centre.id, centre.name);
    }
  }

  return (data ?? []).map((row) => ({
    clientEventId: row.client_event_id,
    centreId: row.centre_id,
    centreName: centreNames.get(row.centre_id) ?? null,
    panelFingerprintHex: row.panel_fingerprint_hex,
    teacherId: row.teacher_id,
    credentialId: row.credential_id,
    eventType: row.event_type,
    videoId: row.video_id,
    quizId: row.quiz_id,
    attemptId: row.attempt_id,
    questionId: row.question_id,
    payloadJson: row.payload_json,
    occurredAt: row.occurred_at,
    capturedAt: row.captured_at,
    receivedAt: row.received_at,
    appVersion: row.app_version,
  }));
}

export async function loadPanelActivation(
  admin: OfflineSyncAdminClient,
  centreId: string,
  fingerprintHex: string,
  fingerprintDisplayHex: string
): Promise<PanelActivationRow | null> {
  const { data, error } = await admin
    .from("panel_activations")
    .select("id, centre_id, fingerprint_hex, status, applied_at, issued_at")
    .eq("centre_id", centreId)
    .in("fingerprint_hex", [fingerprintHex, fingerprintDisplayHex])
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function markPanelActivationApplied(admin: OfflineSyncAdminClient, panelActivationId: string) {
  const { error } = await admin
    .from("panel_activations")
    .update({ status: "applied", applied_at: new Date().toISOString() })
    .eq("id", panelActivationId)
    .eq("status", "issued");

  if (error) throw new Error(error.message);
}

export async function loadCentreSyncState(admin: OfflineSyncAdminClient, centreId: string) {
  const { data, error } = await admin
    .from("centres")
    .select("id, is_active")
    .eq("id", centreId)
    .single();

  if (error) throw new Error(error.message);
  return data as CentreSyncRow;
}

export async function fetchExistingOfflineEventIds(admin: OfflineSyncAdminClient, eventIds: string[]) {
  if (eventIds.length === 0) return new Set<string>();

  const existing = new Set<string>();
  for (let index = 0; index < eventIds.length; index += 500) {
    const chunk = eventIds.slice(index, index + 500);
    const { data, error } = await admin
      .from("offline_sync_events")
      .select("client_event_id")
      .in("client_event_id", chunk);

    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (typeof row.client_event_id === "string") {
        existing.add(row.client_event_id);
      }
    }
  }

  return existing;
}

export async function insertOfflineEvents(
  admin: OfflineSyncAdminClient,
  request: OfflineSyncRequestPayload,
  missingEvents: OfflineSyncRequestPayload["events"]
) {
  if (missingEvents.length === 0) return;

  const rows = missingEvents.map((event) => ({
    client_event_id: event.clientEventId,
    centre_id: request.centreId,
    panel_fingerprint_hex: request.fingerprintHex,
    teacher_id: event.teacherId,
    credential_id: event.credentialId,
    event_type: event.eventType,
    video_id: event.videoId,
    quiz_id: event.quizId,
    attempt_id: event.attemptId,
    question_id: event.questionId,
    payload_json: parseJsonOrNull(event.payloadJson),
    occurred_at: millisToIso(event.occurredAtMillis),
    captured_at: millisToIso(event.capturedAtMillis),
    app_version: request.appVersion,
    raw_event: event,
  }));

  const { error } = await admin.from("offline_sync_events").insert(rows);
  if (error) throw new Error(error.message);
}

export async function mergeVideoProgress(admin: OfflineSyncAdminClient, items: OfflineSyncRequestPayload["videoProgress"]) {
  for (const item of items) {
    const { data: existing, error: existingError } = await admin
      .from("video_progress")
      .select("user_id, video_id, watched_percentage, last_position, completed")
      .eq("user_id", item.teacherId)
      .eq("video_id", item.videoId)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    const watchedPercentage = Math.max(existing?.watched_percentage ?? 0, item.watchedPercentage);
    const lastPosition = Math.max(existing?.last_position ?? 0, item.lastPositionSeconds);
    const completed = Boolean(existing?.completed) || item.completed || watchedPercentage >= 90;

    const { error } = await admin.from("video_progress").upsert(
      {
        user_id: item.teacherId,
        video_id: item.videoId,
        watched_percentage: watchedPercentage,
        last_position: lastPosition,
        completed,
        last_watched_at: millisToIso(item.lastWatchedAtMillis),
      },
      { onConflict: "user_id,video_id" }
    );

    if (error) throw new Error(error.message);
  }
}

export async function mergeQuizAttempts(admin: OfflineSyncAdminClient, items: OfflineSyncRequestPayload["quizAttempts"]) {
  const completedItems = items.filter((item) => item.completedAtMillis !== null);
  if (completedItems.length === 0) return new Set<string>();

  const rows = completedItems.map((item) => ({
    id: item.attemptId,
    quiz_id: item.quizId,
    user_id: item.teacherId,
    total_questions: item.totalQuestions,
    correct_answers: item.correctAnswers,
    percent: item.percent,
    mastery_level: item.masteryLevel || getQuizMasteryLevel(item.percent),
    started_at: millisToIso(item.startedAtMillis),
    completed_at: millisToIso(item.completedAtMillis ?? item.startedAtMillis),
  }));

  const { error } = await admin.from("quiz_attempts").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(error.message);

  return new Set(completedItems.map((item) => item.attemptId));
}

export async function mergeQuizAnswers(
  admin: OfflineSyncAdminClient,
  items: OfflineSyncRequestPayload["quizAnswers"],
  attemptIds: Set<string>
) {
  const eligible = items.filter((item) => attemptIds.has(item.attemptId));
  if (eligible.length === 0) return;

  const rows = eligible.map((item) => ({
    attempt_id: item.attemptId,
    question_id: item.questionId,
    selected_option: item.selectedOption,
    is_correct: item.isCorrect,
  }));

  const { error } = await admin.from("quiz_attempt_answers").upsert(rows, {
    onConflict: "attempt_id,question_id",
  });
  if (error) throw new Error(error.message);
}

export async function loadActiveTeacherHints(admin: OfflineSyncAdminClient, centreId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, centre_id, role, is_active")
    .eq("centre_id", centreId)
    .eq("role", "teacher")
    .eq("is_active", true);

  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row: { id: string | null }) => row.id)
    .filter((id: string | null): id is string => typeof id === "string")
    .map(teacherIdHint);
}

function parseAttestation(input: unknown) {
  if (!input || typeof input !== "object") {
    throw new Error("attestation is required");
  }

  const raw = input as Record<string, unknown>;
  return {
    provider: requireNonEmptyString(raw.provider, "attestation.provider"),
    packageName: requireNonEmptyString(raw.packageName, "attestation.packageName"),
    debugAllowed: Boolean(raw.debugAllowed),
    requestHash: optionalString(raw.requestHash),
    integrityToken: optionalString(raw.integrityToken),
  };
}

function parseEvent(input: unknown, index: number, centreId: string) {
  const raw = requireObject(input, `events[${index}]`);
  return {
    clientEventId: requireUuid(raw.clientEventId, `events[${index}].clientEventId`),
    panelFingerprintHex: requireNonEmptyString(raw.panelFingerprintHex, `events[${index}].panelFingerprintHex`),
    centreId: requireUuid(raw.centreId, `events[${index}].centreId`) || centreId,
    teacherId: optionalUuid(raw.teacherId, `events[${index}].teacherId`),
    credentialId: optionalString(raw.credentialId),
    eventType: requireNonEmptyString(raw.eventType, `events[${index}].eventType`),
    videoId: optionalUuid(raw.videoId, `events[${index}].videoId`),
    quizId: optionalUuid(raw.quizId, `events[${index}].quizId`),
    attemptId: optionalUuid(raw.attemptId, `events[${index}].attemptId`),
    questionId: optionalUuid(raw.questionId, `events[${index}].questionId`),
    payloadJson: optionalString(raw.payloadJson),
    occurredAtMillis: requirePositiveNumber(raw.occurredAtMillis, `events[${index}].occurredAtMillis`),
    capturedAtMillis: requirePositiveNumber(raw.capturedAtMillis, `events[${index}].capturedAtMillis`),
  };
}

function parseVideoProgress(input: unknown, index: number, centreId: string) {
  const raw = requireObject(input, `videoProgress[${index}]`);
  return {
    teacherId: requireUuid(raw.teacherId, `videoProgress[${index}].teacherId`),
    centreId: requireUuid(raw.centreId, `videoProgress[${index}].centreId`) || centreId,
    credentialId: requireNonEmptyString(raw.credentialId, `videoProgress[${index}].credentialId`),
    videoId: requireUuid(raw.videoId, `videoProgress[${index}].videoId`),
    watchedPercentage: clamp(requireNumber(raw.watchedPercentage, `videoProgress[${index}].watchedPercentage`), 0, 100),
    lastPositionSeconds: Math.max(0, Math.round(requireNumber(raw.lastPositionSeconds, `videoProgress[${index}].lastPositionSeconds`))),
    completed: Boolean(raw.completed),
    lastWatchedAtMillis: requirePositiveNumber(raw.lastWatchedAtMillis, `videoProgress[${index}].lastWatchedAtMillis`),
  };
}

function parseQuizAttempt(input: unknown, index: number, centreId: string) {
  const raw = requireObject(input, `quizAttempts[${index}]`);
  return {
    attemptId: requireUuid(raw.attemptId, `quizAttempts[${index}].attemptId`),
    teacherId: requireUuid(raw.teacherId, `quizAttempts[${index}].teacherId`),
    centreId: requireUuid(raw.centreId, `quizAttempts[${index}].centreId`) || centreId,
    credentialId: requireNonEmptyString(raw.credentialId, `quizAttempts[${index}].credentialId`),
    quizId: requireUuid(raw.quizId, `quizAttempts[${index}].quizId`),
    totalQuestions: Math.max(0, Math.round(requireNumber(raw.totalQuestions, `quizAttempts[${index}].totalQuestions`))),
    correctAnswers: Math.max(0, Math.round(requireNumber(raw.correctAnswers, `quizAttempts[${index}].correctAnswers`))),
    percent: clamp(requireNumber(raw.percent, `quizAttempts[${index}].percent`), 0, 100),
    masteryLevel: optionalString(raw.masteryLevel) ?? getQuizMasteryLevel(clamp(requireNumber(raw.percent, `quizAttempts[${index}].percent`), 0, 100)),
    startedAtMillis: requirePositiveNumber(raw.startedAtMillis, `quizAttempts[${index}].startedAtMillis`),
    completedAtMillis:
      raw.completedAtMillis === null || raw.completedAtMillis === undefined
        ? null
        : requirePositiveNumber(raw.completedAtMillis, `quizAttempts[${index}].completedAtMillis`),
  };
}

function parseQuizAnswer(input: unknown, index: number) {
  const raw = requireObject(input, `quizAnswers[${index}]`);
  return {
    attemptId: requireUuid(raw.attemptId, `quizAnswers[${index}].attemptId`),
    questionId: requireUuid(raw.questionId, `quizAnswers[${index}].questionId`),
    selectedOption:
      raw.selectedOption === null || raw.selectedOption === undefined
        ? null
        : clamp(requireNumber(raw.selectedOption, `quizAnswers[${index}].selectedOption`), 1, 4),
    isCorrect: Boolean(raw.isCorrect),
    answeredAtMillis: requirePositiveNumber(raw.answeredAtMillis, `quizAnswers[${index}].answeredAtMillis`),
  };
}

function requireArray(input: unknown, field: string) {
  if (!Array.isArray(input)) {
    throw new Error(`${field} must be an array`);
  }
  return input;
}

function requireObject(input: unknown, field: string) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${field} must be an object`);
  }
  return input as Record<string, unknown>;
}

function requireUuid(input: unknown, field: string) {
  const value = requireNonEmptyString(input, field);
  if (!UUID_REGEX.test(value)) {
    throw new Error(`${field} must be a UUID`);
  }
  return value;
}

function optionalUuid(input: unknown, field: string) {
  if (input === null || input === undefined || input === "") return null;
  return requireUuid(input, field);
}

function requireFingerprint(input: unknown, field: string) {
  const value = requireNonEmptyString(input, field).toLowerCase();
  if (!FINGERPRINT_REGEX.test(value)) {
    throw new Error(`${field} must be a 64-character hex fingerprint`);
  }
  return value;
}

function requireFingerprintDisplay(input: unknown, field: string) {
  const value = requireNonEmptyString(input, field).toLowerCase();
  if (!FINGERPRINT_DISPLAY_REGEX.test(value)) {
    throw new Error(`${field} must be an 8-character hex fingerprint`);
  }
  return value;
}

function requireNonEmptyString(input: unknown, field: string) {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return input.trim();
}

function optionalString(input: unknown) {
  if (input === null || input === undefined) return null;
  if (typeof input !== "string") return null;
  const value = input.trim();
  return value.length === 0 ? null : value;
}

function requireNumber(input: unknown, field: string) {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    throw new Error(`${field} must be a number`);
  }
  return input;
}

function requirePositiveNumber(input: unknown, field: string) {
  const value = requireNumber(input, field);
  if (value < 0) {
    throw new Error(`${field} must be zero or greater`);
  }
  return Math.round(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function millisToIso(value: number) {
  return new Date(value).toISOString();
}

function parseJsonOrNull(input: string | null) {
  if (!input) return null;
  try {
    return JSON.parse(input);
  } catch {
    return { raw: input };
  }
}

function getExpectedOfflinePackageName() {
  return process.env.EDUFLEET_OFFLINE_EXPECTED_PACKAGE_NAME?.trim() || "com.edufleet.offline";
}

function getPlayIntegrityMaxAgeMillis() {
  const raw = process.env.EDUFLEET_OFFLINE_PLAY_INTEGRITY_MAX_AGE_SECONDS?.trim();
  const seconds = raw ? Number(raw) : 300;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 300_000;
  }
  return Math.round(seconds * 1000);
}

function base64UrlEncodeJson(input: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

function normalizePem(input: string) {
  return input.replace(/\\n/g, "\n");
}

async function loadPlayIntegrityServiceAccount(): Promise<PlayIntegrityServiceAccount> {
  const inlineJson = process.env.EDUFLEET_PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineJson) {
    return parsePlayIntegrityServiceAccountJson(inlineJson);
  }

  const base64Json = process.env.EDUFLEET_PLAY_INTEGRITY_SERVICE_ACCOUNT_BASE64?.trim();
  if (base64Json) {
    return parsePlayIntegrityServiceAccountJson(Buffer.from(base64Json, "base64").toString("utf8"));
  }

  const jsonPath =
    process.env.EDUFLEET_PLAY_INTEGRITY_SERVICE_ACCOUNT_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (jsonPath) {
    return parsePlayIntegrityServiceAccountJson(await readFile(jsonPath, "utf8"));
  }

  throw new Error("Play Integrity service account is not configured");
}

function parsePlayIntegrityServiceAccountJson(input: string): PlayIntegrityServiceAccount {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch {
    throw new Error("Play Integrity service account JSON is invalid");
  }

  if (!raw || typeof raw !== "object") {
    throw new Error("Play Integrity service account JSON is invalid");
  }

  const json = raw as Record<string, unknown>;
  const clientEmail = requireNonEmptyString(json.client_email, "service_account.client_email");
  const privateKey = normalizePem(requireNonEmptyString(json.private_key, "service_account.private_key"));
  return {
    client_email: clientEmail,
    private_key: privateKey,
  };
}

async function fetchGoogleAccessToken(serviceAccount: PlayIntegrityServiceAccount) {
  const issuedAtSeconds = Math.floor(Date.now() / 1000);
  const assertionHeader = base64UrlEncodeJson({ alg: "RS256", typ: "JWT" });
  const assertionPayload = base64UrlEncodeJson({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/playintegrity",
    aud: "https://oauth2.googleapis.com/token",
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + 3600,
  });
  const unsignedAssertion = `${assertionHeader}.${assertionPayload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedAssertion);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key).toString("base64url");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsignedAssertion}.${signature}`,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Google access token (${response.status})`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("Google access token response did not include an access token");
  }
  return payload.access_token;
}

async function decodePlayIntegrityToken(integrityToken: string, packageName: string) {
  const serviceAccount = await loadPlayIntegrityServiceAccount();
  const accessToken = await fetchGoogleAccessToken(serviceAccount);
  const response = await fetch(`https://playintegrity.googleapis.com/v1/${packageName}:decodeIntegrityToken`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      integrity_token: integrityToken,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Play Integrity decode failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    tokenPayloadExternal?: PlayIntegrityDecodedToken;
    tokenPayload?: PlayIntegrityDecodedToken;
  };

  return payload.tokenPayloadExternal ?? payload.tokenPayload ?? {};
}

function verifyDecodedPlayIntegrityVerdict(
  token: PlayIntegrityDecodedToken,
  expectedRequestHash: string,
  expectedPackageName: string
) {
  const requestDetails = token.requestDetails;
  if (!requestDetails) {
    throw new Error("Play Integrity verdict was missing request details");
  }
  if (requestDetails.requestPackageName !== expectedPackageName) {
    throw new Error("Play Integrity package name mismatch");
  }
  if (requestDetails.requestHash !== expectedRequestHash) {
    throw new Error("Play Integrity request hash mismatch");
  }

  const requestTime = requestDetails.requestTime ? Date.parse(requestDetails.requestTime) : Number.NaN;
  if (!Number.isFinite(requestTime)) {
    throw new Error("Play Integrity request time was missing");
  }
  if (Math.abs(Date.now() - requestTime) > getPlayIntegrityMaxAgeMillis()) {
    throw new Error("Play Integrity verdict is too old");
  }

  const appRecognitionVerdict = token.appIntegrity?.appRecognitionVerdict;
  if (appRecognitionVerdict !== "PLAY_RECOGNIZED") {
    throw new Error("Play Integrity app recognition failed");
  }

  const verdicts = token.deviceIntegrity?.deviceRecognitionVerdict ?? [];
  const allowedVerdicts = new Set([
    "MEETS_BASIC_INTEGRITY",
    "MEETS_DEVICE_INTEGRITY",
    "MEETS_STRONG_INTEGRITY",
    "MEETS_VIRTUAL_INTEGRITY",
  ]);
  if (!verdicts.some((verdict) => allowedVerdicts.has(verdict))) {
    throw new Error("Play Integrity device verdict failed");
  }

  const licensingVerdict = token.accountDetails?.appLicensingVerdict ?? "UNEVALUATED";
  if (licensingVerdict === "UNLICENSED") {
    throw new Error("Play Integrity licensing failed");
  }
}
