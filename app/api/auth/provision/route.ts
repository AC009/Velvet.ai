import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isValidUuid, jsonError } from "@/lib/chat/sse";
import { isSupabaseConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProvisionBody {
  userId: string;
  email?: string;
}

function parseBody(raw: unknown): ProvisionBody {
  if (!raw || typeof raw !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const body = raw as Record<string, unknown>;

  if (typeof body.userId !== "string" || !isValidUuid(body.userId)) {
    throw new Error("userId must be a valid UUID string.");
  }

  const email =
    typeof body.email === "string" && body.email.trim().length > 0
      ? body.email.trim()
      : undefined;

  return { userId: body.userId, email };
}

export async function POST(request: Request): Promise<Response> {
  if (!isSupabaseConfigured()) {
    return jsonError("Supabase is not configured.", 503);
  }

  let body: ProvisionBody;
  try {
    body = parseBody(await request.json());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid request payload.";
    return jsonError(message, 400);
  }

  try {
    const supabase = getSupabaseAdmin();
    const email =
      body.email ?? `${body.userId}@oauth.velvet.ai`;

    const { error } = await supabase.from("users").upsert(
      {
        id: body.userId,
        email,
        tier: "free",
      },
      { onConflict: "id" },
    );

    if (error) {
      throw new Error(error.message);
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "User provisioning failed.";
    console.error("[velvet/auth/provision] failed:", error);
    return jsonError(message, 500);
  }
}

export async function GET(): Promise<Response> {
  return jsonError("Method not allowed. Use POST.", 405);
}
