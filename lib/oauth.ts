import * as AuthSession from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";

import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

type OAuthProvider = "google" | "apple";

function getRedirectUri(): string {
  const rawScheme =
    Constants.expoConfig?.scheme ||
    (Constants.expoConfig?.ios as { bundleIdentifier?: string } | undefined)?.bundleIdentifier ||
    "eluency";

  const configuredScheme = Array.isArray(rawScheme) ? rawScheme[0] : rawScheme;

  return AuthSession.makeRedirectUri({
    scheme: configuredScheme,
    path: "auth/callback",
  });
}

export async function signInWithSupabaseOAuth(provider: OAuthProvider): Promise<void> {
  const redirectTo = getRedirectUri();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data?.url) throw new Error("Unable to start sign in.");

  const authResult = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (authResult.type !== "success") {
    if (authResult.type === "cancel" || authResult.type === "dismiss") {
      throw new Error("Sign in was cancelled.");
    }
    throw new Error("Authentication did not complete.");
  }

  const { params, errorCode } = QueryParams.getQueryParams(authResult.url);
  if (errorCode) {
    throw new Error("Authentication provider returned an error.");
  }

  const code = params.code;
  if (!code || Array.isArray(code)) {
    throw new Error("No authentication code returned.");
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}
