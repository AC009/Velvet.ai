import { velvetPwaIcon } from "@/lib/frontend/pwa-icon";

export const runtime = "edge";

export async function GET() {
  return velvetPwaIcon(180);
}
