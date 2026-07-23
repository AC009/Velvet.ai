"use client";

import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { track } from "@/lib/frontend/analytics";
import type { HardwareStatusTag } from "@/lib/frontend/verify-mission";

export interface ShareProgressCardProps {
  affinityPercent: number;
  statusTag: string;
  arcProgress?: number | null;
}

function roundRect(
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

function drawProgressCard(params: {
  affinityPercent: number;
  statusTag: string;
  arcProgress: number | null;
}): HTMLCanvasElement {
  const width = 1080;
  const height = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to allocate share canvas.");
  }

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#07040f");
  gradient.addColorStop(0.45, "#1a0b2e");
  gradient.addColorStop(1, "#3d1263");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(
    width * 0.5,
    height * 0.38,
    40,
    width * 0.5,
    height * 0.38,
    520,
  );
  glow.addColorStop(0, "rgba(184, 125, 255, 0.35)");
  glow.addColorStop(1, "rgba(184, 125, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(155, 89, 240, 0.55)";
  ctx.lineWidth = 4;
  roundRect(ctx, 64, 120, width - 128, height - 240, 48);
  ctx.stroke();

  ctx.fillStyle = "#b87dff";
  ctx.font = "700 42px 'DM Sans', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("VELVET.AI", width / 2, 280);

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "600 28px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("REAL-LIFE RPG COMPANION", width / 2, 340);

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 160px 'DM Sans', system-ui, sans-serif";
  ctx.fillText(`${Math.round(params.affinityPercent)}%`, width / 2, 620);

  ctx.fillStyle = "#d9bcff";
  ctx.font = "700 36px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("AFFINITY", width / 2, 690);

  roundRect(ctx, width / 2 - 260, 740, 520, 88, 44);
  ctx.fillStyle = "rgba(155, 89, 240, 0.22)";
  ctx.fill();
  ctx.strokeStyle = "rgba(184, 125, 255, 0.65)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#f0e7ff";
  ctx.font = "800 34px 'DM Sans', system-ui, sans-serif";
  ctx.fillText(`[ ${params.statusTag.toUpperCase()} ]`, width / 2, 798);

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = "600 34px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("Real-Life Discipline Node: Synced", width / 2, 980);

  if (params.arcProgress != null) {
    ctx.fillStyle = "#b87dff";
    ctx.font = "700 30px 'DM Sans', system-ui, sans-serif";
    ctx.fillText(
      `ARC PROGRESS ${Math.round(params.arcProgress)}%`,
      width / 2,
      1060,
    );
  }

  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "500 26px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("SHARE MY DESTINY", width / 2, 1680);
  ctx.fillText("velvet.ai", width / 2, 1740);

  return canvas;
}

export function ShareProgressButton({
  affinityPercent,
  statusTag,
  arcProgress = null,
}: ShareProgressCardProps): ReactNode {
  const [isSharing, setIsSharing] = useState(false);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  const handleShare = useCallback(async (): Promise<void> => {
    if (isSharing) {
      return;
    }
    setIsSharing(true);
    setShareHint(null);

    track("progress_shared_progress", {
      current_affinity: Math.round(affinityPercent),
      statusTag,
      arcProgress: arcProgress ?? undefined,
    });

    try {
      const canvas = drawProgressCard({
        affinityPercent,
        statusTag,
        arcProgress,
      });

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), "image/png", 0.92);
      });

      if (!blob) {
        throw new Error("Failed to render share graphic.");
      }

      const file = new File([blob], "velvet-destiny.png", {
        type: "image/png",
      });

      const canShareFiles =
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (
        canShareFiles &&
        typeof navigator.share === "function"
      ) {
        await navigator.share({
          files: [file],
          title: "Velvet.ai — My Destiny",
          text: `Velvet.ai | Affinity: ${Math.round(affinityPercent)}% [${statusTag}] | Real-Life Discipline Node: Synced`,
        });
        setShareHint("Shared to your story apps.");
        return;
      }

      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current);
      }
      const url = URL.createObjectURL(blob);
      lastUrlRef.current = url;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "velvet-destiny.png";
      anchor.click();
      setShareHint("Graphic downloaded — drop it into TikTok/IG Stories.");
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        setShareHint(null);
        return;
      }
      const message =
        error instanceof Error ? error.message : "Share failed.";
      setShareHint(message);
    } finally {
      setIsSharing(false);
    }
  }, [affinityPercent, arcProgress, isSharing, statusTag]);

  return (
    <div className="mt-2 w-full">
      <button
        type="button"
        onClick={() => {
          void handleShare();
        }}
        disabled={isSharing}
        className="send-purple-glow relative w-full overflow-hidden rounded-2xl px-5 py-4 text-center transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Share my progress"
      >
        <span className="relative z-[1] text-[12px] font-extrabold uppercase tracking-[0.22em] text-white">
          {isSharing ? "Rendering Destiny…" : "Share My Progress"}
        </span>
        <span className="relative z-[1] mt-1 block text-[10px] uppercase tracking-[0.16em] text-[#d9bcff]/80">
          TikTok / Instagram Stories card
        </span>
      </button>
      {shareHint && (
        <p className="mt-2 text-center text-[11px] text-[#b87dff]/85">
          {shareHint}
        </p>
      )}
    </div>
  );
}

export type { HardwareStatusTag };
