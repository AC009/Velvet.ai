"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { track } from "@/lib/frontend/analytics";

export interface ShareCardProps {
  affinityPercent: number;
  statusTag: string;
  missionTitle?: string | null;
  missionDescription?: string | null;
  arcProgress?: number | null;
}

interface CodexCardDto {
  id: string;
  mission_id?: string;
  missionId?: string;
  title: string;
  description: string;
  unlocked_at?: string;
  unlockedAt?: string;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawCodexExportCard(params: {
  affinityPercent: number;
  statusTag: string;
  missionTitle: string;
  missionDescription: string;
}): HTMLCanvasElement {
  const width = 1080;
  const height = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to allocate Codex share canvas.");
  }

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#05020c");
  bg.addColorStop(0.5, "#1a0b2e");
  bg.addColorStop(1, "#3d1263");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(
    width / 2,
    height * 0.42,
    20,
    width / 2,
    height * 0.42,
    520,
  );
  glow.addColorStop(0, "rgba(184,125,255,0.38)");
  glow.addColorStop(1, "rgba(184,125,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(155,89,240,0.7)";
  ctx.lineWidth = 5;
  roundRectPath(ctx, 72, 140, width - 144, height - 280, 42);
  ctx.stroke();

  ctx.fillStyle = "#b87dff";
  ctx.font = "800 36px 'DM Sans', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("VELVET.AI // OBJECTIVE COMPLETED", width / 2, 260);

  // Minimalist cyber glyph
  ctx.strokeStyle = "rgba(184,125,255,0.85)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(width / 2, 520, 86, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(width / 2 - 54, 520);
  ctx.lineTo(width / 2 + 54, 520);
  ctx.moveTo(width / 2, 466);
  ctx.lineTo(width / 2, 574);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 54px 'Playfair Display', Georgia, serif";
  wrapCenteredText(ctx, params.missionTitle, width / 2, 700, width - 220, 64);

  ctx.fillStyle = "rgba(232,226,245,0.82)";
  ctx.font = "500 28px 'DM Sans', system-ui, sans-serif";
  wrapCenteredText(
    ctx,
    params.missionDescription,
    width / 2,
    860,
    width - 240,
    40,
  );

  const tag = params.statusTag.toUpperCase();
  ctx.fillStyle = "#f0e7ff";
  ctx.font = "900 44px 'DM Sans', system-ui, sans-serif";
  ctx.fillText(
    `AFFINITY: ${Math.round(params.affinityPercent)}% [${tag}]`,
    width / 2,
    1280,
  );

  ctx.fillStyle = "rgba(184,125,255,0.9)";
  ctx.font = "700 30px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("SHARE MY DESTINY", width / 2, 1680);

  return canvas;
}

function wrapCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = trial;
    }
  }
  if (current) {
    lines.push(current);
  }

  const visible = lines.slice(0, 4);
  visible.forEach((line, index) => {
    ctx.fillText(line, centerX, startY + index * lineHeight);
  });
}

export function ShareCard({
  affinityPercent,
  statusTag,
  missionTitle = null,
  missionDescription = null,
  arcProgress = null,
}: ShareCardProps): ReactNode {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [latestTitle, setLatestTitle] = useState(
    missionTitle ?? "The Desk Deliverance",
  );
  const [latestDescription, setLatestDescription] = useState(
    missionDescription ??
      "A hardware-verified breakthrough locked into your Codex.",
  );

  useEffect(() => {
    if (missionTitle) {
      setLatestTitle(missionTitle);
    }
  }, [missionTitle]);

  useEffect(() => {
    if (missionDescription) {
      setLatestDescription(missionDescription);
    }
  }, [missionDescription]);

  const handleShare = useCallback(async (): Promise<void> => {
    if (isExporting) {
      return;
    }
    setIsExporting(true);
    setHint(null);

    track("user_licked_share_progress", {
      affinity: Math.round(affinityPercent),
      status_tag: statusTag,
      missionTitle: latestTitle,
      arcProgress: arcProgress ?? undefined,
    });

    try {
      const canvas = drawCodexExportCard({
        affinityPercent,
        statusTag,
        missionTitle: latestTitle,
        missionDescription: latestDescription,
      });

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), "image/png", 0.94);
      });
      if (!blob) {
        throw new Error("Failed to render Codex share asset.");
      }

      const file = new File([blob], "velvet-codex-destiny.png", {
        type: "image/png",
      });

      const canShareFiles =
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (canShareFiles && typeof navigator.share === "function") {
        await navigator.share({
          files: [file],
          title: "Velvet.ai — Objective Completed",
          text: `VELVET.AI // OBJECTIVE COMPLETED — ${latestTitle} | AFFINITY: ${Math.round(affinityPercent)}% [${statusTag}]`,
        });
        setHint("Shared to Stories.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "velvet-codex-destiny.png";
      anchor.click();
      URL.revokeObjectURL(url);
      setHint("Card downloaded — drop it into TikTok / IG Stories.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setHint(null);
        return;
      }
      setHint(error instanceof Error ? error.message : "Share failed.");
    } finally {
      setIsExporting(false);
    }
  }, [
    affinityPercent,
    arcProgress,
    isExporting,
    latestDescription,
    latestTitle,
    statusTag,
  ]);

  const normalizedTag = statusTag.toUpperCase();

  return (
    <div className="w-full max-w-lg">
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-2xl border border-[#9b59f0]/45 bg-gradient-to-br from-[#07040f] via-[#1a0b2e] to-[#3d1263] p-5 shadow-[0_0_36px_rgba(155,89,240,0.28)]"
        aria-label="Codex memory share card"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(184,125,255,0.18),transparent_62%)]" />

        <p className="relative z-[1] text-center text-[10px] font-extrabold uppercase tracking-[0.28em] text-[#b87dff]">
          Velvet.ai // Objective Completed
        </p>

        <div className="relative z-[1] mx-auto mt-5 flex h-20 w-20 items-center justify-center rounded-full border border-[#b87dff]/55 shadow-[0_0_22px_rgba(155,89,240,0.35)]">
          <span
            className="block h-10 w-10 border border-dashed border-[#d9bcff]/70"
            aria-hidden="true"
            style={{
              clipPath:
                "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
            }}
          />
        </div>

        <h3 className="relative z-[1] mt-5 text-center font-serif-display text-[22px] font-semibold tracking-[0.04em] text-white">
          {latestTitle}
        </h3>
        <p className="relative z-[1] mt-2 text-center text-[12px] leading-relaxed text-[#cfc6e0]/90">
          {latestDescription}
        </p>

        <p className="relative z-[1] mt-6 text-center text-[13px] font-black uppercase tracking-[0.16em] text-[#f0e7ff]">
          Affinity: {Math.round(affinityPercent)}% [{normalizedTag}]
        </p>
        {arcProgress != null && (
          <p className="relative z-[1] mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[#b87dff]/85">
            Arc Progress {Math.round(arcProgress)}%
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          void handleShare();
        }}
        disabled={isExporting}
        className="send-purple-glow mt-3 w-full rounded-2xl px-5 py-4 text-center transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Share my progress to stories"
      >
        <span className="block text-[12px] font-extrabold uppercase tracking-[0.2em] text-white">
          {isExporting ? "Rendering Destiny…" : "Share My Progress To Stories"}
        </span>
      </button>
      {hint && (
        <p className="mt-2 text-center text-[11px] text-[#b87dff]/85">{hint}</p>
      )}
    </div>
  );
}

/** Optional helper for Memories — hydrate latest Codex title from API. */
export function useLatestCodexCard(
  userId: string | null,
  refreshNonce = 0,
): {
  title: string | null;
  description: string | null;
} {
  const [title, setTitle] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(
          `/api/codex/cards?userId=${encodeURIComponent(userId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { cards?: CodexCardDto[] };
        const first = payload.cards?.[0];
        if (!cancelled && first) {
          setTitle(first.title);
          setDescription(first.description);
        }
      } catch {
        /* non-blocking */
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshNonce]);

  return { title, description };
}
