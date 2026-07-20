export function normalizeSupabaseUrl(raw: string | undefined): string {
  if (!raw) {
    return "";
  }

  let url = raw.trim();
  if (!url) {
    return "";
  }

  url = url.replace(/\/rest\/v1\/?$/i, "");
  url = url.replace(/\/+$/, "");

  return url;
}
