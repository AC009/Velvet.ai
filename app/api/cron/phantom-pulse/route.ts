/**
 * GET /api/cron/phantom-pulse — Vercel Cron hourly phantom push dispatch.
 *
 * Required env:
 *   CRON_SECRET
 *   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 */
import {
  assemblePhantomPushPacket,
  computePhantomAbsenceMs,
} from "@/lib/chat/phantom-pulse";
import { getServerEnv, isPushConfigured, isSupabaseConfigured } from "@/lib/env";
import {
  fetchPhantomPulseCandidates,
  fetchPushSubscriptionsForUser,
  markPhantomPulseSent,
} from "@/lib/push/subscription-store";
import { isWebPushReady, sendPhantomPush } from "@/lib/push/web-push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface DispatchReport {
  scanned: number;
  dispatched: number;
  skipped: number;
  failures: Array<{ conversationId: number; reason: string }>;
}

function authorizeCron(request: Request): boolean {
  const env = getServerEnv();
  if (!env.cronSecret) {
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization");
  return header === `Bearer ${env.cronSecret}`;
}

async function runPhantomPulseDispatch(): Promise<DispatchReport> {
  const report: DispatchReport = {
    scanned: 0,
    dispatched: 0,
    skipped: 0,
    failures: [],
  };

  if (!isSupabaseConfigured() || !isWebPushReady()) {
    report.skipped += 1;
    return report;
  }

  const candidates = await fetchPhantomPulseCandidates();
  report.scanned = candidates.length;

  for (const candidate of candidates) {
    try {
      const subscriptions = await fetchPushSubscriptionsForUser(
        candidate.userId,
        candidate.worldId,
      );

      if (subscriptions.length === 0) {
        report.skipped += 1;
        continue;
      }

      const packet = await assemblePhantomPushPacket({
        candidate,
        absenceMs: computePhantomAbsenceMs(candidate.updatedAt),
      });

      let delivered = false;

      for (const subscription of subscriptions) {
        try {
          await sendPhantomPush(subscription, packet);
          delivered = true;
        } catch (pushError) {
          report.failures.push({
            conversationId: candidate.conversationId,
            reason:
              pushError instanceof Error
                ? pushError.message
                : "Push delivery failed.",
          });
        }
      }

      if (delivered) {
        await markPhantomPulseSent(candidate.conversationId);
        report.dispatched += 1;
      } else {
        report.skipped += 1;
      }
    } catch (error) {
      report.failures.push({
        conversationId: candidate.conversationId,
        reason: error instanceof Error ? error.message : "Dispatch failed.",
      });
    }
  }

  return report;
}

export async function GET(request: Request): Promise<Response> {
  if (!authorizeCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return Response.json(
      {
        ok: false,
        error: "Web Push VAPID keys not configured.",
      },
      { status: 503 },
    );
  }

  try {
    const report = await runPhantomPulseDispatch();
    return Response.json({ ok: true, report });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Phantom pulse cron failed.";
    console.error("[velvet/cron/phantom-pulse] failed:", error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  return GET(request);
}
