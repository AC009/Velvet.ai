"use client";

import { useMemo, useState, type ReactNode } from "react";
import { MissionGate } from "@/app/components/MissionGate";
import { useVelvetAuth } from "@/lib/frontend/use-velvet-auth";
import {
  RECOVERY_SYNC_MISSION,
  isLowEnergy,
} from "@/lib/empathy/engine";
import { submitEmpathyCheckIn } from "@/lib/frontend/empathy-client";

const DEFAULT_MISSION_TEXT =
  "MISSION — HARDWARE PROOF. Capture authentic visual evidence of today's discipline task. Real world only.";

const ENERGY_OPTIONS = [1, 2, 3, 4, 5] as const;

/**
 * Chat surface bootstrap / alias — mirrors production empathy check-in.
 * Full story unlock loop lives on `/` ChatScreen.
 */
export default function ChatPage(): ReactNode {
  const { user } = useVelvetAuth();
  const [energyLevel, setEnergyLevel] = useState<number | null>(null);

  const missionText = useMemo(() => {
    if (energyLevel !== null && isLowEnergy(energyLevel as 1 | 2 | 3 | 4 | 5)) {
      return RECOVERY_SYNC_MISSION.missionText;
    }
    return DEFAULT_MISSION_TEXT;
  }, [energyLevel]);

  const userId = user?.id ?? null;

  return (
    <main className="min-h-dvh bg-black text-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-end px-3 pb-8 pt-10">
        <div className="mb-3 flex items-center justify-center gap-2">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#9b59f0] shadow-[0_0_8px_#9b59f0]" />
          <p className="text-[10px] uppercase tracking-[0.24em] text-[#b87dff]/80">
            Chat locked — hardware proof required
          </p>
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#9b59f0] shadow-[0_0_8px_#9b59f0]" />
        </div>

        {energyLevel === null ? (
          <section
            className="relative overflow-hidden rounded-2xl border border-[#9b59f0]/45 bg-[#07040f]/95 px-4 py-5 shadow-[0_0_40px_rgba(155,89,240,0.28)]"
            aria-label="Human check-in overlay"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(155,89,240,0.18),transparent_55%)]" />

            <div className="relative z-[1] space-y-4">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[#b87dff]">
                  The Watcher // Human Check-In
                </p>
                <p className="mt-2 text-[15px] font-medium leading-snug text-white">
                  Rate your current focus node energy (1-5)
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#9a90b0]">
                  Low energy auto-routes to Recovery Sync — no guilt, no wall.
                </p>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {ENERGY_OPTIONS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => {
                      setEnergyLevel(level);
                      if (userId) {
                        void submitEmpathyCheckIn({
                          userId,
                          energyLevel: level,
                          empathyMode: isLowEnergy(level)
                            ? "RECOVERY"
                            : "STANDARD",
                        }).catch(() => undefined);
                      }
                    }}
                    className="aspect-square rounded-xl border border-[#9b59f0]/45 bg-[#12081f] text-[16px] font-bold text-[#f0e7ff] transition-transform active:scale-95 hover:border-[#b87dff] hover:bg-[#9b59f0]/20"
                    aria-label={`Energy level ${level}`}
                  >
                    {level}
                  </button>
                ))}
              </div>

              <p className="text-center text-[10px] uppercase tracking-[0.18em] text-[#6f6685]">
                1 exhausted · 5 locked in
              </p>
            </div>
          </section>
        ) : userId ? (
          <MissionGate
            userId={userId}
            missionId={
              isLowEnergy(energyLevel as 1 | 2 | 3 | 4 | 5)
                ? RECOVERY_SYNC_MISSION.id
                : "hw_chat_bootstrap_01"
            }
            missionText={missionText}
            sensorKind={
              isLowEnergy(energyLevel as 1 | 2 | 3 | 4 | 5)
                ? "gyro_focus"
                : "camera_environment"
            }
            sensorLabel={
              isLowEnergy(energyLevel as 1 | 2 | 3 | 4 | 5)
                ? RECOVERY_SYNC_MISSION.sensorLabel
                : "Camera Vision — Hardware Proof"
            }
            energyLevel={energyLevel as 1 | 2 | 3 | 4 | 5}
          />
        ) : (
          <section className="rounded-2xl border border-[#9b59f0]/35 bg-[#07040f] px-4 py-5 text-center">
            <p className="text-[12px] text-[#cfc6e0]">
              Sign in on the home screen to unlock hardware sync.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
