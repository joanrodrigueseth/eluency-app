import Constants from "expo-constants";

function apiBase(): string {
  const fromExtra = Constants.expoConfig?.extra?.apiBaseUrl?.toString();
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  return (fromExtra || fromEnv || "https://www.eluency.com").replace(/\/$/, "");
}

export type ImageBankRequest = {
  pt: string;
  en?: string;
  tags?: string[];
  category?: string;
  audience?: string;
};

export type ImageBankResult = {
  image_url: string;
  image_path?: string;
  reused?: boolean;
};

async function postJson(path: string, accessToken: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(json?.error ?? "Request failed"));
  return json;
}

/**
 * Queries the image bank first; if nothing matches, calls generate-image (which also registers the asset).
 */
export async function getOrCreateVocabImage(accessToken: string, req: ImageBankRequest): Promise<ImageBankResult> {
  const ptRaw = req.pt.trim();
  const enRaw = (req.en ?? "").trim();
  if (!ptRaw && !enRaw) throw new Error("pt or en is required");

  const body = {
    pt: ptRaw || enRaw,
    en: enRaw || undefined,
    tags: req.tags?.length ? req.tags : undefined,
    category: req.category?.trim() || undefined,
    audience: req.audience?.trim() || undefined,
  };

  let search: Record<string, unknown> = { found: false };
  try {
    search = await postJson("/api/ai/images/search", accessToken, body);
  } catch {
    // API antiga sem rota de busca: segue só para generate-image.
  }
  if (search.found === true && typeof search.image_url === "string" && search.image_url.trim()) {
    return {
      image_url: search.image_url.trim(),
      image_path: typeof search.image_path === "string" ? search.image_path : undefined,
      reused: true,
    };
  }

  const gen = await postJson("/api/ai/tests/generate-image", accessToken, body);
  const imageUrl = String(gen.image_url ?? "").trim();
  if (!imageUrl) throw new Error("No image returned");
  return {
    image_url: imageUrl,
    image_path: typeof gen.image_path === "string" ? gen.image_path : undefined,
    reused: gen.reused === true,
  };
}
