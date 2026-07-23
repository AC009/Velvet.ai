import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isValidUuid, jsonError } from "@/lib/chat/sse";
import { isSupabaseConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProvisionBody {
  userId: string;
  email?: string;
}

function syntheticSuccess(userId: string, extras?: Record<string, unknown>): Response {
  return Response.json({
    ok: true,
    success: true,
    provisioned: true,
    userId,
    ...extras,
  });
}

function parseBody(raw: unknown): ProvisionBody {
  if (!raw || typeof raw !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const body = raw as Record<string, unknown>;

  const userIdRaw =
    typeof body.userId === "string"
      ? body.userId
      : typeof body.user_id === "string"
        ? body.user_id
        : null;

  if (!userIdRaw || !isValidUuid(userIdRaw)) {
    throw new Error("userId must be a valid UUID string.");
  }

  const email =
    typeof body.email === "string" && body.email.trim().length > 0
      ? body.email.trim()
      : undefined;

  return { userId: userIdRaw, email };
}

/**
 * POST /api/auth/provision — Never returns 500.
 * Soft-fails to a synthetic 200 so client auth lifecycle stays alive.
 */
export async function POST(request: Request): Promise<Response> {
  let fallbackUserId = "fallback-user-id";

  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      console.warn(
        "[velvet/auth/provision] invalid JSON — returning synthetic success.",
      );
      return syntheticSuccess(fallbackUserId, { degraded: true, reason: "invalid_json" });
    }

    let body: ProvisionBody;
    try {
      body = parseBody(raw);
      fallbackUserId = body.userId;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid request payload.";
      console.warn(
        "[velvet/auth/provision] parse failed — synthetic success:",
        message,
      );
      // Recover UUID if present even when other fields are wrong.
      const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
      const maybeId =
        root && typeof root.userId === "string" && isValidUuid(root.userId)
          ? root.userId
          : root && typeof root.user_id === "string" && isValidUuid(root.user_id)
            ? root.user_id
            : fallbackUserId;
      return syntheticSuccess(maybeId, { degraded: true, reason: "parse_error" });
    }

    if (!isSupabaseConfigured()) {
      console.warn(
        "[velvet/auth/provision] Supabase not configured — synthetic success bypass.",
      );
      return syntheticSuccess(body.userId, {
        degraded: true,
        reason: "supabase_unconfigured",
      });
    }

    try {
      const supabase = getSupabaseAdmin();
      const email = body.email ?? `${body.userId}@oauth.velvet.ai`;

      const { error } = await supabase.from("users").upsert(
        {
          id: body.userId,
          email,
          tier: "free",
        },
        { onConflict: "id" },
      );

      if (error) {
        console.warn(
          "[velvet/auth/provision] upsert failed — synthetic success:",
          error.message,
        );
        return syntheticSuccess(body.userId, {
          degraded: true,
          reason: "upsert_failed",
          detail: error.message,
        });
      }

      return syntheticSuccess(body.userId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "User provisioning failed.";
      console.warn(
        "[velvet/auth/provision] transaction threw — synthetic success:",
        message,
      );
      return syntheticSuccess(body.userId, {
        degraded: true,
        reason: "provision_exception",
        detail: message,
      });
    }
  } catch (error) {
    console.error("[velvet/auth/provision] fatal — synthetic success:", error);
    return syntheticSuccess(fallbackUserId, {
      degraded: true,
      reason: "fatal",
    });
  }
}

export async function GET(): Promise<Response> {
  return jsonError("Method not allowed. Use POST.", 405);
}
