import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PhantomPulseCandidate } from "@/lib/chat/phantom-pulse";
import type { ProactivePingCandidate } from "@/lib/chat/proactive-ping";
import { resolveFallbackCharacterId } from "@/lib/chat/phantom-pulse";
import type { PushSubscriptionPayload } from "@/lib/push/types";

const HOUR_MS = 60 * 60 * 1000;

export interface StoredPushSubscription extends PushSubscriptionPayload {
  id: number;
  userId: string;
  worldId: number | null;
  characterId: number | null;
}

export async function upsertPushSubscription(params: {
  userId: string;
  subscription: PushSubscriptionPayload;
  worldId?: number;
  characterId?: number;
}): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: params.userId,
      endpoint: params.subscription.endpoint,
      p256dh: params.subscription.keys.p256dh,
      auth: params.subscription.keys.auth,
      world_id: params.worldId ?? null,
      character_id: params.characterId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    throw new Error(`Failed to upsert push subscription: ${error.message}`);
  }
}

export async function fetchPushSubscriptionsForUser(
  userId: string,
  worldId?: number,
): Promise<StoredPushSubscription[]> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, world_id, character_id")
    .eq("user_id", userId);

  if (worldId !== undefined) {
    query = query.or(`world_id.eq.${worldId},world_id.is.null`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch push subscriptions: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as number,
    userId: row.user_id as string,
    endpoint: row.endpoint as string,
    keys: {
      p256dh: row.p256dh as string,
      auth: row.auth as string,
    },
    worldId: (row.world_id as number | null) ?? null,
    characterId: (row.character_id as number | null) ?? null,
  }));
}

export async function fetchLatestCharacterIdForConversation(
  conversationId: number,
): Promise<number | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("messages")
    .select("character_id")
    .eq("conversation_id", conversationId)
    .not("character_id", "is", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to resolve conversation character: ${error.message}`,
    );
  }

  return typeof data?.character_id === "number" ? data.character_id : null;
}

export async function fetchPhantomPulseCandidates(): Promise<
  PhantomPulseCandidate[]
> {
  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const windowStart = new Date(now - 4.5 * HOUR_MS).toISOString();
  const windowEnd = new Date(now - 3.5 * HOUR_MS).toISOString();
  const nowIso = new Date(now).toISOString();

  const { data, error } = await supabase
    .from("conversations")
    .select("id, user_id, world_id, locked_until, updated_at, last_phantom_pulse_at")
    .gte("updated_at", windowStart)
    .lte("updated_at", windowEnd)
    .or(`locked_until.gt.${nowIso},locked_until.is.null`);

  if (error) {
    throw new Error(`Phantom pulse scan failed: ${error.message}`);
  }

  const candidates: PhantomPulseCandidate[] = [];

  for (const row of data ?? []) {
    const conversationId = row.id as number;
    const lastPulseAt = row.last_phantom_pulse_at as string | null;
    const updatedAt = row.updated_at as string;

    if (lastPulseAt && Date.parse(lastPulseAt) >= Date.parse(updatedAt)) {
      continue;
    }

    let characterId = await fetchLatestCharacterIdForConversation(conversationId);
    if (characterId === null) {
      characterId = resolveFallbackCharacterId(row.world_id as number);
    }

    candidates.push({
      conversationId,
      userId: row.user_id as string,
      worldId: row.world_id as number,
      lockedUntil: (row.locked_until as string | null) ?? null,
      updatedAt,
      characterId,
    });
  }

  return candidates;
}

export async function markPhantomPulseSent(conversationId: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("conversations")
    .update({ last_phantom_pulse_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (error) {
    throw new Error(`Failed to mark phantom pulse: ${error.message}`);
  }
}

export async function fetchProactivePingCandidates(): Promise<
  ProactivePingCandidate[]
> {
  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const silenceThreshold = new Date(
    now - 16 * HOUR_MS,
  ).toISOString();

  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, user_id, world_id, locked_until, updated_at, last_proactive_ping_at",
    )
    .lte("updated_at", silenceThreshold)
    .or(`locked_until.gt.${new Date(now).toISOString()},locked_until.is.null`);

  if (error) {
    throw new Error(`Proactive ping scan failed: ${error.message}`);
  }

  const candidates: ProactivePingCandidate[] = [];

  for (const row of data ?? []) {
    const conversationId = row.id as number;
    const updatedAt = row.updated_at as string;
    const lastPingAt = row.last_proactive_ping_at as string | null;

    if (lastPingAt && Date.parse(lastPingAt) >= Date.parse(updatedAt)) {
      continue;
    }

    let characterId = await fetchLatestCharacterIdForConversation(conversationId);
    if (characterId === null) {
      characterId = resolveFallbackCharacterId(row.world_id as number);
    }

    candidates.push({
      conversationId,
      userId: row.user_id as string,
      worldId: row.world_id as number,
      lockedUntil: (row.locked_until as string | null) ?? null,
      updatedAt,
      characterId,
    });
  }

  return candidates;
}

export async function markProactivePingSent(conversationId: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("conversations")
    .update({ last_proactive_ping_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (error) {
    throw new Error(`Failed to mark proactive ping: ${error.message}`);
  }
}
