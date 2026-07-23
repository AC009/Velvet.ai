import { ImageResponse } from "next/og";

/** Shared fialová placeholder tile for PWA icon routes. */
export function velvetPwaIcon(size: number): ImageResponse {
  const inset = Math.round(size * 0.12);
  const inner = size - inset * 2;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07040f",
        }}
      >
        <div
          style={{
            width: inner,
            height: inner,
            background: "#a855f7",
            borderRadius: Math.round(size * 0.08),
          }}
        />
      </div>
    ),
    { width: size, height: size },
  );
}
