/**
 * Same storage path → same URL string after overwrite; React Native Image caches aggressively.
 * - `versionKey`: e.g. lesson `updated_at` from API.
 * - `refreshEpoch`: incremented on each successful catalog fetch so images refresh after pull-to-refresh
 *   even if the API payload omits `updated_at` or the URL string is unchanged.
 */
export function cacheBustAssetUrl(
  url: string | undefined | null,
  versionKey?: string | null,
  refreshEpoch?: number
): string | undefined {
  if (url == null || typeof url !== "string") return undefined;
  const t = url.trim();
  if (!t) return undefined;
  if (t === "📄") return t;
  const vk = versionKey?.trim() ?? "";
  const epochPart = refreshEpoch != null && refreshEpoch > 0 ? `r${refreshEpoch}` : "";
  const combined = [vk, epochPart].filter(Boolean).join("|");
  if (!combined) return t;
  const sep = t.includes("?") ? "&" : "?";
  return `${t}${sep}cb=${encodeURIComponent(combined)}`;
}
