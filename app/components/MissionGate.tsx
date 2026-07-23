"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { track } from "@/lib/frontend/analytics";
import { submitEnvironmentVerification } from "@/lib/frontend/empathy-client";
import {
  formatFocusCountdown,
  isFaceDownProtocolText,
  isLowEnergy,
  NIGHT_FOCUS_PROTOCOL_DURATION_SEC,
  RECOVERY_SYNC_DURATION_SEC,
  type EmpathyMode,
  type EnergyLevel,
  type VerificationMode,
} from "@/lib/empathy/engine";
import type { HardwareSensorKind } from "@/lib/frontend/hardware-mission-pool";
import {
  submitMissionVerification,
  type HardwareStatusTag,
  type VerifyMissionResponse,
} from "@/lib/frontend/verify-mission";

export interface MissionGateSuccessPayload {
  feedback: string;
  arcProgress: number;
  affinityScore: number;
  statusTag: HardwareStatusTag;
  missionId: string;
}

export interface MissionGateProps {
  userId: string;
  missionId: string;
  missionText: string;
  sensorKind?: HardwareSensorKind;
  sensorLabel?: string;
  /** Active Human Check-In energy (1–5). Drives Recovery vs Focus gyro routing. */
  energyLevel?: EnergyLevel | null;
  onSuccess?: (payload: MissionGateSuccessPayload) => void | Promise<void>;
}

type CameraPhase =
  | "booting"
  | "live"
  | "denied"
  | "capturing"
  | "submitting"
  | "approved"
  | "rejected"
  | "error";

type GyroPhase =
  | "ready"
  | "listening"
  | "running"
  | "breached"
  | "submitting"
  | "approved"
  | "rejected"
  | "error"
  | "permission_denied";

interface CaptureBundle {
  dataUri: string;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

const BREACH_MESSAGE = "PROTOCOL BREACHED: Phone flipped face up.";

function isFaceDownProtocol(missionText: string): boolean {
  return isFaceDownProtocolText(missionText);
}

function resolveGyroRouting(params: {
  energyLevel?: EnergyLevel | null;
  missionId: string;
  missionText: string;
}): {
  verificationMode: Exclude<VerificationMode, "camera">;
  empathyMode: EmpathyMode;
  energyLevel: EnergyLevel;
  durationSec: number;
} {
  const inferredLow =
    params.energyLevel != null
      ? isLowEnergy(params.energyLevel)
      : params.missionId === "hw_recovery_sync_01" ||
        params.missionText.includes("Rest and Recovery");

  if (inferredLow) {
    return {
      verificationMode: "recovery_sync",
      empathyMode: "RECOVERY",
      energyLevel: params.energyLevel ?? 2,
      durationSec: RECOVERY_SYNC_DURATION_SEC,
    };
  }

  return {
    verificationMode: "environment_sync",
    empathyMode: "FOCUS",
    energyLevel: params.energyLevel ?? 4,
    durationSec: NIGHT_FOCUS_PROTOCOL_DURATION_SEC,
  };
}

/** Face-down when beta is near ±180 (±15° margin). */
function isFaceDownBeta(beta: number | null): boolean {
  if (beta === null || !Number.isFinite(beta)) {
    return false;
  }
  const absolute = Math.abs(beta);
  return absolute >= 165 && absolute <= 195;
}

/** Flat face-up / table-resting when beta is near 0 (±35°). */
function isFaceUpBeta(beta: number | null): boolean {
  if (beta === null || !Number.isFinite(beta)) {
    return false;
  }
  return Math.abs(beta) <= 35;
}

function wipeCaptureBundle(bundle: CaptureBundle | null): void {
  if (!bundle) {
    return;
  }
  try {
    bundle.context.clearRect(0, 0, bundle.canvas.width, bundle.canvas.height);
    bundle.canvas.width = 0;
    bundle.canvas.height = 0;
  } catch {
    /* ignore */
  }
  bundle.dataUri = "";
}

function captureCompressedFrame(
  video: HTMLVideoElement,
  quality = 0.7,
): CaptureBundle {
  const sourceWidth = video.videoWidth || 1280;
  const sourceHeight = video.videoHeight || 720;
  const maxEdge = 960;
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: false });
  if (!context) {
    throw new Error("Unable to allocate capture canvas.");
  }

  context.drawImage(video, 0, 0, width, height);
  const dataUri = canvas.toDataURL("image/jpeg", quality);
  if (!dataUri.startsWith("data:image/jpeg;base64,")) {
    throw new Error("Failed to encode JPEG proof frame.");
  }

  return { dataUri, canvas, context };
}

async function requestOrientationPermission(): Promise<boolean> {
  const Orientation = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<PermissionState>;
  };

  if (typeof Orientation.requestPermission !== "function") {
    return true;
  }

  try {
    const state = await Orientation.requestPermission();
    return state === "granted";
  } catch {
    return false;
  }
}

export function MissionGate({
  userId,
  missionId,
  missionText,
  sensorLabel,
  energyLevel = null,
  onSuccess,
}: MissionGateProps): ReactNode {
  const faceDownMode = useMemo(
    () => isFaceDownProtocol(missionText),
    [missionText],
  );

  if (faceDownMode) {
    return (
      <GyroEnvironmentSync
        userId={userId}
        missionId={missionId}
        missionText={missionText}
        sensorLabel={sensorLabel}
        energyLevel={energyLevel}
        onSuccess={onSuccess}
      />
    );
  }

  return (
    <CameraMissionGate
      userId={userId}
      missionId={missionId}
      missionText={missionText}
      sensorLabel={sensorLabel}
      onSuccess={onSuccess}
    />
  );
}

/* ─── Gyroscope Environment Sync (Recovery / Focus) ─── */

function GyroEnvironmentSync({
  userId,
  missionId,
  missionText,
  sensorLabel,
  energyLevel = null,
  onSuccess,
}: MissionGateProps): ReactNode {
  const routing = useMemo(
    () => resolveGyroRouting({ energyLevel, missionId, missionText }),
    [energyLevel, missionId, missionText],
  );

  const [phase, setPhase] = useState<GyroPhase>("ready");
  const [remainingSec, setRemainingSec] = useState(routing.durationSec);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pulseSuccess, setPulseSuccess] = useState(false);
  const [betaLive, setBetaLive] = useState<number | null>(null);

  const phaseRef = useRef<GyroPhase>("ready");
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const faceDownLockedRef = useRef(false);
  const submittingRef = useRef(false);
  const orientationActiveRef = useRef(false);
  const routingRef = useRef(routing);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    routingRef.current = routing;
    setRemainingSec(routing.durationSec);
  }, [routing]);

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    startedAtRef.current = null;
  }, []);

  const detachOrientation = useCallback((): void => {
    orientationActiveRef.current = false;
  }, []);

  const completeProtocol = useCallback(async (): Promise<void> => {
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    clearTimer();
    detachOrientation();
    setPhase("submitting");

    const active = routingRef.current;

    try {
      const result = await submitEnvironmentVerification({
        userId,
        missionText,
        missionId,
        verificationMode: active.verificationMode,
        energyLevel: active.energyLevel,
        empathyMode: active.empathyMode,
        heldSeconds: active.durationSec,
        completed: true,
      });

      setFeedback(result.feedback);
      if (result.approved) {
        setPhase("approved");
        setPulseSuccess(true);
        (track as any)("mission_verified", {
          status: "success",
          score_impact: 10,
          missionId,
          verificationMode: active.verificationMode,
          empathyMode: active.empathyMode,
          energyLevel: active.energyLevel,
        });
        await onSuccess?.({
          feedback: result.feedback,
          arcProgress: result.arcProgress,
          affinityScore: result.affinityScore,
          statusTag: result.statusTag,
          missionId,
        });
        return;
      }

      setPhase("rejected");
      track("mission_verified", {
        status: "failed",
        score_impact: 0,
        missionId,
        reason: "env_rejected",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Environment verification failed.";
      setPhase("error");
      setErrorMessage(message);
    } finally {
      submittingRef.current = false;
    }
  }, [clearTimer, detachOrientation, missionId, missionText, onSuccess, userId]);

  const breachProtocol = useCallback((): void => {
    if (phaseRef.current !== "running") {
      return;
    }
    clearTimer();
    setFeedback(BREACH_MESSAGE);
    setErrorMessage(BREACH_MESSAGE);
    setPhase("breached");
    faceDownLockedRef.current = false;
    track("mission_verified", {
      status: "failed",
      score_impact: 0,
      missionId,
      reason: "gyro_breach",
    });
  }, [clearTimer, missionId]);

  const startCountdown = useCallback((): void => {
    if (faceDownLockedRef.current || timerRef.current !== null) {
      return;
    }
    faceDownLockedRef.current = true;
    const durationSec = routingRef.current.durationSec;
    startedAtRef.current = Date.now();
    setRemainingSec(durationSec);
    setPhase("running");

    timerRef.current = window.setInterval(() => {
      const started = startedAtRef.current;
      if (!started) {
        return;
      }
      const elapsed = (Date.now() - started) / 1000;
      const left = Math.max(0, durationSec - elapsed);
      setRemainingSec(left);
      if (left <= 0) {
        void completeProtocol();
      }
    }, 200);
  }, [completeProtocol]);

  const handleOrientation = useCallback(
    (event: DeviceOrientationEvent): void => {
      if (!orientationActiveRef.current) {
        return;
      }

      const beta =
        typeof event.beta === "number" && Number.isFinite(event.beta)
          ? event.beta
          : null;
      setBetaLive(beta);

      const current = phaseRef.current;

      if (current === "listening") {
        if (isFaceDownBeta(beta)) {
          startCountdown();
        }
        return;
      }

      if (current === "running") {
        if (isFaceUpBeta(beta)) {
          breachProtocol();
        }
      }
    },
    [breachProtocol, startCountdown],
  );

  useEffect(() => {
    if (phase !== "listening" && phase !== "running") {
      return;
    }

    orientationActiveRef.current = true;
    window.addEventListener("deviceorientation", handleOrientation, true);
    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, [handleOrientation, phase]);

  useEffect(() => {
    return () => {
      clearTimer();
      detachOrientation();
    };
  }, [clearTimer, detachOrientation]);

  const handleStartProtocol = useCallback(async (): Promise<void> => {
    setFeedback(null);
    setErrorMessage(null);
    setPulseSuccess(false);
    faceDownLockedRef.current = false;
    clearTimer();
    setRemainingSec(routingRef.current.durationSec);

    const granted = await requestOrientationPermission();
    if (!granted) {
      setPhase("permission_denied");
      setErrorMessage(
        "Motion permission denied. Enable orientation access, then tap START PROTOCOL again.",
      );
      return;
    }

    setPhase("listening");
  }, [clearTimer]);

  const statusLabel = ((): string => {
    switch (phase) {
      case "ready":
        return "PROTOCOL ARMED";
      case "listening":
        return "AWAITING FACE-DOWN";
      case "running":
        return "FOCUS PROTOCOL LIVE";
      case "breached":
        return "GYRO BREACH";
      case "submitting":
        return "UPLINK TO THE WATCHER";
      case "approved":
        return "PROOF ACCEPTED";
      case "rejected":
        return "PROOF REJECTED";
      case "error":
        return "UPLINK FAULT";
      case "permission_denied":
        return "PERMISSION DENIED";
      default:
        return "STANDBY";
    }
  })();

  return (
    <section
      className={`mission-gate-root relative mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-[#9b59f0]/45 bg-[#07040f]/95 shadow-[0_0_40px_rgba(155,89,240,0.28)] ${
        pulseSuccess ? "mission-gate-success-pulse" : ""
      }`}
      aria-label="Gyroscope environment sync gate"
      aria-busy={phase === "running" || phase === "submitting"}
    >
      <div className="pointer-events-none absolute inset-0 mission-gate-neon-frame" />

      <header className="relative z-[2] flex items-center justify-between border-b border-[#9b59f0]/25 px-3 py-2">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[#b87dff]">
            THE WATCHER // GYRO HUD
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">
            {sensorLabel ?? "Gyroscope — Recovery Sync"}
          </p>
        </div>
        <span className="rounded-full border border-[#9b59f0]/40 bg-[#9b59f0]/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[#d9bcff]">
          {statusLabel}
        </span>
      </header>

      <div className="relative z-[1] aspect-[4/3] w-full overflow-hidden bg-black">
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black px-6 text-center">
          {(phase === "listening" || phase === "running") && (
            <>
              <p
                className={`font-mono text-[42px] font-bold tracking-[0.2em] ${
                  phase === "running"
                    ? "text-[#d9bcff] drop-shadow-[0_0_18px_rgba(168,85,247,0.65)]"
                    : "text-[#6f6685]"
                }`}
              >
                {formatFocusCountdown(remainingSec)}
              </p>
              <p className="mt-3 text-[11px] uppercase tracking-[0.28em] text-[#b87dff]/75">
                {phase === "running"
                  ? "Do not flip. Do not move."
                  : "Place phone face down to begin"}
              </p>
              {betaLive !== null && (
                <p className="mt-4 text-[10px] text-[#4a4458]">
                  β {betaLive.toFixed(1)}°
                </p>
              )}
            </>
          )}

          {phase === "ready" && (
            <p className="text-[13px] leading-relaxed text-[#cfc6e0]">
              Pitch-black Darkness Validation. Gyroscope will monitor face-down
              orientation for the full protocol window.
            </p>
          )}

          {phase === "breached" && (
            <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#e8476a]">
              {BREACH_MESSAGE}
            </p>
          )}

          {phase === "submitting" && (
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#b87dff]">
              Syncing affinity…
            </p>
          )}

          {phase === "approved" && (
            <p className="text-[12px] uppercase tracking-[0.22em] text-[#d9bcff]">
              Protocol complete
            </p>
          )}
        </div>
      </div>

      <div className="relative z-[2] space-y-3 border-t border-[#9b59f0]/25 px-3 py-3">
        <p className="text-[11px] leading-relaxed text-[#cfc6e0]/90">
          <span className="font-semibold uppercase tracking-[0.14em] text-[#b87dff]">
            {routing.empathyMode === "RECOVERY" ? "Recovery Node" : "Focus Protocol"}
          </span>
          <span className="mt-1 block text-[12px] text-white/90">
            {missionText}
          </span>
        </p>

        {(feedback || errorMessage) && (
          <div
            className={`rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed ${
              phase === "approved"
                ? "border-[#9b59f0]/55 bg-[#9b59f0]/15 text-[#f0e7ff]"
                : phase === "breached" || phase === "rejected"
                  ? "border-[#e8476a]/45 bg-[#e8476a]/10 text-[#ffd0da]"
                  : "border-white/15 bg-white/5 text-[#e8e2f5]"
            }`}
            role="status"
          >
            <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-[#b87dff]/80">
              The Watcher
            </p>
            <p>{feedback ?? errorMessage}</p>
          </div>
        )}

        {phase === "approved" ? (
          <div className="rounded-xl border border-[#9b59f0]/4 bg-[#12081f] px-3 py-3 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d9bcff]">
              Channel unlocked — affinity synced
            </p>
          </div>
        ) : phase === "listening" ||
          phase === "running" ||
          phase === "submitting" ? (
          <div className="rounded-xl border border-[#9b59f0]/25 bg-black/40 px-3 py-3 text-center text-[11px] uppercase tracking-[0.16em] text-[#8a8a8a]">
            {phase === "running"
              ? "Gyroscope monitoring — hold face down"
              : phase === "submitting"
                ? "Transmitting sync…"
                : "Waiting for face-down lock"}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              void handleStartProtocol();
            }}
            className="send-purple-glow w-full rounded-xl px-4 py-3.5 text-[12px] font-extrabold uppercase tracking-[0.16em] text-white transition-transform active:scale-[0.98]"
          >
            {phase === "breached" ||
            phase === "rejected" ||
            phase === "error" ||
            phase === "permission_denied"
              ? "Reset Protocol"
              : "Start Protocol"}
          </button>
        )}
      </div>
    </section>
  );
}

/* ─── Camera Vision Gate (standard missions) ─── */

function CameraMissionGate({
  userId,
  missionId,
  missionText,
  sensorLabel,
  onSuccess,
}: MissionGateProps): ReactNode {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureBundleRef = useRef<CaptureBundle | null>(null);
  const bootTimeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const [phase, setPhase] = useState<CameraPhase>("booting");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pulseSuccess, setPulseSuccess] = useState(false);

  const interactionLocked =
    phase === "booting" ||
    phase === "capturing" ||
    phase === "submitting" ||
    phase === "approved";

  const stopCamera = useCallback((): void => {
    if (streamRef.current) {
      for (const mediaTrack of streamRef.current.getTracks()) {
        mediaTrack.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const disposeCapture = useCallback((): void => {
    wipeCaptureBundle(captureBundleRef.current);
    captureBundleRef.current = null;
  }, []);

  const clearBootTimeout = useCallback((): void => {
    if (bootTimeoutRef.current !== null) {
      window.clearTimeout(bootTimeoutRef.current);
      bootTimeoutRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async (): Promise<void> => {
    setPhase("booting");
    setErrorMessage(null);
    setFeedback(null);
    setPulseSuccess(false);
    disposeCapture();
    clearBootTimeout();

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      if (mountedRef.current) {
        setPhase("denied");
        setErrorMessage("Camera API is unavailable on this device.");
      }
      return;
    }

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (!mountedRef.current) {
        for (const mediaTrack of stream.getTracks()) {
          mediaTrack.stop();
        }
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        throw new Error("Video element missing.");
      }
      video.srcObject = stream;
      await video.play();

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise<void>((resolve, reject) => {
          const onReady = (): void => {
            cleanup();
            resolve();
          };
          const onError = (): void => {
            cleanup();
            reject(new Error("Camera stream failed to decode."));
          };
          const cleanup = (): void => {
            video.removeEventListener("loadeddata", onReady);
            video.removeEventListener("error", onError);
            clearBootTimeout();
          };
          video.addEventListener("loadeddata", onReady, { once: true });
          video.addEventListener("error", onError, { once: true });
          bootTimeoutRef.current = window.setTimeout(() => {
            cleanup();
            resolve();
          }, 2500);
        });
      }

      if (mountedRef.current) {
        setPhase("live");
      }
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      const message =
        error instanceof Error ? error.message : "Camera permission denied.";
      setPhase("denied");
      setErrorMessage(message);
    }
  }, [clearBootTimeout, disposeCapture, stopCamera]);

  useEffect(() => {
    mountedRef.current = true;
    void startCamera();
    return () => {
      mountedRef.current = false;
      clearBootTimeout();
      stopCamera();
      disposeCapture();
    };
  }, [clearBootTimeout, disposeCapture, startCamera, stopCamera]);

  const handleSubmitProof = useCallback(async (): Promise<void> => {
    if (interactionLocked || phase !== "live") {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      setErrorMessage("Camera feed is not ready.");
      return;
    }

    setPhase("capturing");
    setErrorMessage(null);
    setFeedback(null);

    track("mission_submission_attempt", {
      missionId,
      userId,
      missionTextPreview: missionText.slice(0, 80),
    });

    let bundle: CaptureBundle;
    try {
      disposeCapture();
      bundle = captureCompressedFrame(video, 0.7);
      captureBundleRef.current = bundle;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Frame capture failed.";
      setPhase("error");
      setErrorMessage(message);
      return;
    }

    setPhase("submitting");

    try {
      const result: VerifyMissionResponse = await submitMissionVerification({
        userId,
        missionText,
        image: bundle.dataUri,
        missionId,
        verificationMode: "camera",
      });

      wipeCaptureBundle(bundle);
      if (captureBundleRef.current === bundle) {
        captureBundleRef.current = null;
      }

      setFeedback(result.feedback);

      if (result.approved) {
        setPhase("approved");
        setPulseSuccess(true);
        stopCamera();
        track("mission_verified", {
          status: "success",
          score_impact: 10,
          missionId,
        });
        await onSuccess?.({
          feedback: result.feedback,
          arcProgress: result.arcProgress,
          affinityScore: result.affinityScore,
          statusTag: result.statusTag,
          missionId,
        });
        return;
      }

      setPhase("rejected");
    } catch (error) {
      wipeCaptureBundle(bundle);
      if (captureBundleRef.current === bundle) {
        captureBundleRef.current = null;
      }
      const message =
        error instanceof Error ? error.message : "Verification request failed.";
      setPhase("error");
      setErrorMessage(message);
    }
  }, [
    disposeCapture,
    interactionLocked,
    missionId,
    missionText,
    onSuccess,
    phase,
    stopCamera,
    userId,
  ]);

  const statusLabel = ((): string => {
    switch (phase) {
      case "booting":
        return "ACQUIRING OPTICS";
      case "live":
        return "SCANNING ENVIRONMENT";
      case "denied":
        return "OPTICS DENIED";
      case "capturing":
        return "FREEZING FRAME";
      case "submitting":
        return "UPLINK TO THE WATCHER";
      case "approved":
        return "PROOF ACCEPTED";
      case "rejected":
        return "PROOF REJECTED";
      case "error":
        return "UPLINK FAULT";
      default:
        return "STANDBY";
    }
  })();

  return (
    <section
      className={`mission-gate-root relative mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-[#9b59f0]/45 bg-[#07040f]/95 shadow-[0_0_40px_rgba(155,89,240,0.28)] ${
        pulseSuccess ? "mission-gate-success-pulse" : ""
      }`}
      aria-label="Hardware mission verification gate"
      aria-busy={phase === "booting" || phase === "submitting"}
    >
      <div className="pointer-events-none absolute inset-0 mission-gate-neon-frame" />

      <header className="relative z-[2] flex items-center justify-between border-b border-[#9b59f0]/25 px-3 py-2">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[#b87dff]">
            THE WATCHER // HARDWARE HUD
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">
            {sensorLabel ?? missionId.replace(/_/g, " ")}
          </p>
        </div>
        <span className="rounded-full border border-[#9b59f0]/40 bg-[#9b59f0]/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[#d9bcff]">
          {statusLabel}
        </span>
      </header>

      <div className="relative z-[1] aspect-[4/3] w-full overflow-hidden bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            phase === "booting" ? "opacity-0" : "opacity-100"
          }`}
          aria-label="Environment camera feed"
        />

        <div className="pointer-events-none absolute inset-0 mission-gate-vignette" />
        <div className="pointer-events-none absolute inset-x-6 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-[#b87dff]/55" />
        <div className="pointer-events-none absolute inset-y-6 left-1/2 w-px -translate-x-1/2 border-l border-dashed border-[#b87dff]/55" />

        {(phase === "live" ||
          phase === "capturing" ||
          phase === "submitting") && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden">
            <div className="mission-gate-laser-bar" />
          </div>
        )}

        {phase === "booting" && (
          <div
            className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-4 bg-black/90 px-6"
            role="status"
          >
            <div className="h-14 w-14 animate-pulse rounded-full border border-[#9b59f0]/50 shadow-[0_0_24px_rgba(155,89,240,0.45)]" />
            <p className="text-[11px] uppercase tracking-[0.3em] text-[#b87dff]">
              Calibrating optics…
            </p>
          </div>
        )}

        {phase === "denied" && (
          <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center">
            <p className="text-[12px] uppercase tracking-[0.22em] text-[#e8476a]">
              Camera access required
            </p>
            <p className="text-[12px] leading-relaxed text-[#cfc6e0]">
              {errorMessage ?? "Enable the rear camera to continue."}
            </p>
            <button
              type="button"
              onClick={() => {
                void startCamera();
              }}
              className="rounded-full border border-[#9b59f0]/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d9bcff]"
            >
              Retry Optics
            </button>
          </div>
        )}
      </div>

      <div className="relative z-[2] space-y-3 border-t border-[#9b59f0]/25 px-3 py-3">
        <p className="text-[11px] leading-relaxed text-[#cfc6e0]/90">
          <span className="font-semibold uppercase tracking-[0.14em] text-[#b87dff]">
            Mission
          </span>
          <span className="mt-1 block text-[12px] text-white/90">
            {missionText}
          </span>
        </p>

        {(feedback || errorMessage) && phase !== "denied" && (
          <div
            className={`rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed ${
              phase === "approved"
                ? "border-[#9b59f0]/55 bg-[#9b59f0]/15 text-[#f0e7ff]"
                : phase === "rejected"
                  ? "border-[#e8476a]/45 bg-[#e8476a]/10 text-[#ffd0da]"
                  : "border-white/15 bg-white/5 text-[#e8e2f5]"
            }`}
            role="status"
          >
            <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-[#b87dff]/80">
              The Watcher
            </p>
            <p>{feedback ?? errorMessage}</p>
          </div>
        )}

        {phase === "approved" ? (
          <div className="rounded-xl border border-[#9b59f0]/4 bg-[#12081f] px-3 py-3 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d9bcff]">
              Channel unlocked — affinity synced
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              void handleSubmitProof();
            }}
            disabled={interactionLocked || phase !== "live"}
            className="send-purple-glow w-full rounded-xl px-4 py-3.5 text-[12px] font-extrabold uppercase tracking-[0.16em] text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {phase === "booting"
              ? "Waiting For Optics…"
              : phase === "capturing" || phase === "submitting"
                ? "Transmitting proof…"
                : phase === "rejected" || phase === "error"
                  ? "Resend Proof To The Watcher"
                  : "Send Proof To The Watcher"}
          </button>
        )}
      </div>
    </section>
  );
}
