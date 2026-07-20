/**
 * GET /api/cron/proactive-ping — peripheral-aware proactive engagement worker.
 *
 * Required env:
 *   CRON_SECRET
 *   GROQ_API_KEY
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *   VAPID_* (optional — push delivery)
 */
import { buildPeripheralProactiveDispatch } from "@/lib/chat/proactive-ping";
import { getServerEnv, isPushConfigured, isSupabaseConfigured } from "@/lib/env";
import {
  fetchProactivePingCandidates,
  fetchPushSubscriptionsForUser,
  markProactivePingSent,
} from "@/lib/push/subscription-store";
import { isWebPushReady, sendPhantomPush } from "@/lib/push/web-push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface ProactiveDispatchReport {
  scanned: number;
  dispatched: number;
  skipped: number;
  simulated: number;
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

async function runProactivePingDispatch(): Promise<ProactiveDispatchReport> {
  const report: ProactiveDispatchReport = {
    scanned: 0,
    dispatched: 0,
    skipped: 0,
    simulated: 0,
    failures: [],
  };

  if (!isSupabaseConfigured()) {
    report.skipped += 1;
    return report;
  }

  const candidates = await fetchProactivePingCandidates();
  report.scanned = candidates.length;
  const pushReady = isPushConfigured() && isWebPushReady();

  for (const candidate of candidates) {
    try {
      const { envelope } = await buildPeripheralProactiveDispatch(candidate);
      report.simulated += 1;

      if (!pushReady) {
        report.skipped += 1;
        await markProactivePingSent(candidate.conversationId);
        continue;
      }

      const subscriptions = await fetchPushSubscriptionsForUser(
        candidate.userId,
        candidate.worldId,
      );

      if (subscriptions.length === 0) {
        report.skipped += 1;
        await markProactivePingSent(candidate.conversationId);
        continue;
      }

      let delivered = false;
      for (const subscription of subscriptions) {
        try {
          await sendPhantomPush(subscription, envelope.packet);
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
        report.dispatched += 1;
      } else {
        report.skipped += 1;
      }

      await markProactivePingSent(candidate.conversationId);
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

  try {
    const report = await runProactivePingDispatch();
    return Response.json({ ok: true, report });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Proactive ping cron failed.";
    console.error("[velvet/cron/proactive-ping] failed:", error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  return GET(request);
}
