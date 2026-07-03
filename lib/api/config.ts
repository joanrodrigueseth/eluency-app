import Constants from "expo-constants";

const PROD_API_BASE_URL = "https://www.eluency.com";

function normalizeBaseUrl(value: string | undefined | null): string {
  const trimmed = value?.toString().trim() ?? "";
  return trimmed.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  const envBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
  const configBaseUrl = normalizeBaseUrl(Constants.expoConfig?.extra?.apiBaseUrl?.toString());

  // Keep release builds pinned to app.json so a local .env cannot redirect a store update.
  if (__DEV__ && envBaseUrl) return envBaseUrl;

  return configBaseUrl || envBaseUrl || PROD_API_BASE_URL;
}
