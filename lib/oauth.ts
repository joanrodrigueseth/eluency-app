import * as AuthSession from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

type OAuthProvider = "google" | "apple";

let googleConfigured = false;

// Lazy-loaded to avoid crashing at startup when the native module isn't in the
// current dev client build. The module is only required when sign-in is actually
// attempted, so the app starts normally and falls back to browser OAuth if missing.
function getGoogleSigninModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@react-native-google-signin/google-signin") as typeof import("@react-native-google-signin/google-signin");
}

function getGoogleClientConfig(): { webClientId: string; iosClientId?: string } {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || "";
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || "";

  if (!webClientId) {
    throw new Error(
      "Google Sign-In is not configured. Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to your environment."
    );
  }

  return {
    webClientId,
    iosClientId: iosClientId || undefined,
  };
}

function configureGoogleSigninOnce() {
  if (googleConfigured) return;

  const { GoogleSignin } = getGoogleSigninModule();
  const { webClientId, iosClientId } = getGoogleClientConfig();
  GoogleSignin.configure({ webClientId, iosClientId });
  googleConfigured = true;
}

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

async function signInWithSupabaseGoogleNative(): Promise<void> {
  const { GoogleSignin } = getGoogleSigninModule();
  configureGoogleSigninOnce();

  if (Platform.OS === "android") {
    const hasPlayServices = await GoogleSignin.hasPlayServices({
      showPlayServicesUpdateDialog: true,
    });

    if (!hasPlayServices) {
      throw new Error("Google Play Services is not available on this device.");
    }
  }

  const signInResponse = await GoogleSignin.signIn();
  if (signInResponse.type === "cancelled") {
    throw new Error("Sign in was cancelled.");
  }

  const idToken = signInResponse.data.idToken || (await GoogleSignin.getTokens()).idToken;
  if (!idToken) {
    throw new Error("Google did not return an ID token.");
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  });

  if (error) throw error;
}

async function signInWithSupabaseOAuthBrowser(provider: OAuthProvider): Promise<void> {
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

export async function signInWithSupabaseOAuth(provider: OAuthProvider): Promise<void> {
  if (provider === "google" && (Platform.OS === "android" || Platform.OS === "ios")) {
    try {
      await signInWithSupabaseGoogleNative();
      return;
    } catch (error: unknown) {
      // If the native module isn't in this build, fall through to browser OAuth
      if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof (error as { message?: unknown }).message === "string" &&
        (error as { message: string }).message.includes("RNGoogleSignin")
      ) {
        await signInWithSupabaseOAuthBrowser(provider);
        return;
      }

      // Re-throw user cancellation and all other real errors
      try {
        const { statusCodes } = getGoogleSigninModule();
        if (
          "code" in (error as object) &&
          (error as { code?: string }).code === statusCodes.SIGN_IN_CANCELLED
        ) {
          throw new Error("Sign in was cancelled.");
        }
      } catch {
        // statusCodes unavailable — just rethrow original
      }

      throw error;
    }
  }

  await signInWithSupabaseOAuthBrowser(provider);
}
