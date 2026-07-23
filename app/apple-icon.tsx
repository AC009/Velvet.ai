import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          color: "#a855f7",
          fontSize: 96,
          fontWeight: 800,
          letterSpacing: "-0.06em",
        }}
      >
        V
      </div>
    ),
    { ...size },
  );
}
