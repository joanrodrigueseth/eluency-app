import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Supabase] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is not set. Authentication will fail until these are configured."
  );
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "", {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// On Android (Expo Go), a stale token from a different device/platform will
// trigger "Refresh Token Not Found". Auto sign-out so the user hits the login screen.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" && !session) {
    AsyncStorage.removeItem("supabase.auth.token").catch(() => {});
  }
});

