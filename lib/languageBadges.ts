export function getLanguageBadge(value?: string | null) {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  const normalized = raw.toLowerCase();
  if (normalized.includes("portuguese") || normalized.includes("portugues") || normalized.includes("português")) return "PT";
  if (normalized.includes("spanish") || normalized.includes("espanol") || normalized.includes("español")) return "ESP";
  if (normalized.includes("french") || normalized.includes("francais") || normalized.includes("français")) return "FR";
  if (normalized.includes("german") || normalized.includes("deutsch")) return "DE";
  if (normalized.includes("italian") || normalized.includes("italiano")) return "IT";
  if (normalized.includes("english")) return "EN";

  return raw
    .split(/[\s()/,-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);
}

export function normalizeLanguageBadge(value?: string | null) {
  const raw = (value ?? "").trim().toUpperCase();
  if (!raw) return "EN";
  if (raw === "PORTUGUESE" || raw === "PORTUGUES" || raw === "PORTUGUÊS" || raw === "PT-BR" || raw === "PT") return "PT";
  if (raw === "SPANISH" || raw === "ESPANOL" || raw === "ESPAÑOL" || raw === "ES" || raw === "ESP") return "ESP";
  if (raw === "FRENCH" || raw === "FRANCAIS" || raw === "FRANÇAIS" || raw === "FR") return "FR";
  if (raw === "GERMAN" || raw === "DEUTSCH" || raw === "DE") return "DE";
  if (raw === "ITALIAN" || raw === "ITALIANO" || raw === "IT") return "IT";
  if (raw === "ENGLISH" || raw === "EN") return "EN";
  return raw.length <= 3 ? raw : raw.slice(0, 3);
}

export function getLanguageBadgeColors(badge: string) {
  switch (badge) {
    case "PT":
      return { backgroundColor: "#EAF7EE", borderColor: "#2F9E44", textColor: "#1F7A35" };
    case "ESP":
      return { backgroundColor: "#FFF4E5", borderColor: "#F08C00", textColor: "#C56A00" };
    case "FR":
      return { backgroundColor: "#ECF4FF", borderColor: "#2F6FED", textColor: "#2458B8" };
    case "DE":
      return { backgroundColor: "#F5F5F5", borderColor: "#5C5F66", textColor: "#2D2F33" };
    case "IT":
      return { backgroundColor: "#EEF8EF", borderColor: "#3A9D5D", textColor: "#2B7A46" };
    case "EN":
      return { backgroundColor: "#F1F6FF", borderColor: "#4C7CEB", textColor: "#355FC2" };
    default:
      return { backgroundColor: "#FFF3E8", borderColor: "#D96B1C", textColor: "#B55312" };
  }
}