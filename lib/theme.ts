import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform, TextStyle, useColorScheme, ViewStyle } from "react-native";

type AppColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceGlass: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSoft: string;
  primary: string;
  primarySoft: string;
  primaryText: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  violet: string;
  violetSoft: string;
  danger: string;
  dangerSoft: string;
  shadow: string;
};

export type ThemeMode = "light" | "dark" | "system";

export type AppTheme = {
  isDark: boolean;
  mode: ThemeMode;
  colors: AppColors;
  typography: {
    display: TextStyle;
    sectionTitle: TextStyle;
    title: TextStyle;
    body: TextStyle;
    bodyStrong: TextStyle;
    label: TextStyle;
    fieldLabel: TextStyle;
    caption: TextStyle;
    helper: TextStyle;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  radii: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    pill: number;
  };
  cardShadow: ViewStyle;
  setMode: (mode: ThemeMode) => void;
  toggleDarkMode: () => void;
};

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const THEME_MODE_STORAGE_KEY = "eluency-theme-mode";

const ThemeContext = createContext<ThemeContextValue>({
  mode: "system",
  setMode: () => {},
});

const sharedFontFamily = Platform.select({
  ios: "System",
  android: "Roboto",
  default: "System",
});

// Public website palette. Keep mobile brand colors sourced from one place.
export const ELUENCY_WEB_PALETTE = {
  canvas: "#FBFCFE",
  surface: "#FFFFFF",
  surfaceAlt: "#F3F7FB",
  ink: "#10253F",
  navy: "#0B1F36",
  muted: "#526477",
  softText: "#5F7185",
  blue: "#0050C0",
  blueDark: "#003F99",
  blueSoft: "#EAF3FF",
  green: "#1F745F",
  greenSoft: "#E9F6F1",
  ai: "#7042B2",
  aiSoft: "#F2EDFB",
  amber: "#9A5C0D",
  amberSoft: "#FFF6E7",
  border: "#DCE5EE",
  borderStrong: "#C5D2DF",
} as const;

const DARK_BG = "#0F1720";
const DARK_SURFACE = "#17212B";
const DARK_SURFACE_ALT = "#223041";
const DARK_GLASS = "rgba(23,33,43,0.78)";
const DARK_BORDER = "rgba(183,208,232,0.18)";
const DARK_BORDER_STRONG = "rgba(183,208,232,0.30)";
const DARK_TEXT = "#F8FAFC";
const DARK_TEXT_MUTED = "#D6E0EA";
const DARK_TEXT_SOFT = "#9FB3C8";

const lightColors: AppColors = {
  background: ELUENCY_WEB_PALETTE.canvas,
  surface: ELUENCY_WEB_PALETTE.surface,
  surfaceAlt: ELUENCY_WEB_PALETTE.surfaceAlt,
  surfaceGlass: "rgba(255,255,255,0.88)",
  border: ELUENCY_WEB_PALETTE.border,
  borderStrong: ELUENCY_WEB_PALETTE.borderStrong,
  text: ELUENCY_WEB_PALETTE.ink,
  textMuted: ELUENCY_WEB_PALETTE.muted,
  textSoft: ELUENCY_WEB_PALETTE.softText,
  primary: ELUENCY_WEB_PALETTE.blue,
  primarySoft: ELUENCY_WEB_PALETTE.blueSoft,
  primaryText: "#FFFFFF",
  success: ELUENCY_WEB_PALETTE.green,
  successSoft: ELUENCY_WEB_PALETTE.greenSoft,
  warning: ELUENCY_WEB_PALETTE.amber,
  warningSoft: ELUENCY_WEB_PALETTE.amberSoft,
  violet: ELUENCY_WEB_PALETTE.ai,
  violetSoft: ELUENCY_WEB_PALETTE.aiSoft,
  danger: "#DC2626",
  dangerSoft: "rgba(220,38,38,0.12)",
  shadow: "rgba(11,31,54,0.10)",
};

const darkColors: AppColors = {
  background: DARK_BG,
  surface: DARK_SURFACE,
  surfaceAlt: DARK_SURFACE_ALT,
  surfaceGlass: DARK_GLASS,
  border: DARK_BORDER,
  borderStrong: DARK_BORDER_STRONG,
  text: DARK_TEXT,
  textMuted: DARK_TEXT_MUTED,
  textSoft: DARK_TEXT_SOFT,
  primary: "#60A5FA",
  primarySoft: "rgba(96,165,250,0.16)",
  primaryText: DARK_BG,
  success: "#34D399",
  successSoft: "rgba(52,211,153,0.18)",
  warning: "#FBBF24",
  warningSoft: "rgba(251,191,36,0.16)",
  violet: "#C4B5FD",
  violetSoft: "rgba(196,181,253,0.16)",
  danger: "#F87171",
  dangerSoft: "rgba(248,113,113,0.20)",
  shadow: "rgba(0,0,0,0.42)",
};

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(THEME_MODE_STORAGE_KEY)
      .then((stored) => {
        if (!mounted || !isThemeMode(stored)) return;
        setModeState(stored);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      mode,
      setMode,
    }),
    [mode, setMode]
  );

  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useAppTheme(): AppTheme {
  const colorScheme = useColorScheme();
  const { mode, setMode } = useContext(ThemeContext);
  const isDark = mode === "system" ? colorScheme === "dark" : mode === "dark";
  const colors = isDark ? darkColors : lightColors;

  const toggleDarkMode = useCallback(() => {
    setMode(isDark ? "light" : "dark");
  }, [isDark, setMode]);

  return {
    isDark,
    mode,
    setMode,
    toggleDarkMode,
    colors,
    typography: {
      display: {
        fontFamily: sharedFontFamily,
        fontSize: 34,
        lineHeight: 40,
        fontWeight: "700",
        color: colors.text,
      },
      sectionTitle: {
        fontFamily: sharedFontFamily,
        fontSize: 27,
        lineHeight: 33,
        fontWeight: "800",
        color: colors.text,
      },
      title: {
        fontFamily: sharedFontFamily,
        fontSize: 22,
        lineHeight: 28,
        fontWeight: "800",
        color: colors.text,
      },
      body: {
        fontFamily: sharedFontFamily,
        fontSize: 16,
        lineHeight: 23,
        fontWeight: "400",
        color: colors.textMuted,
      },
      bodyStrong: {
        fontFamily: sharedFontFamily,
        fontSize: 16,
        lineHeight: 23,
        fontWeight: "700",
        color: colors.text,
      },
      label: {
        fontFamily: sharedFontFamily,
        fontSize: 11,
        lineHeight: 15,
        fontWeight: "800",
        letterSpacing: 1.5,
        textTransform: "uppercase",
        color: colors.textSoft,
      },
      fieldLabel: {
        fontFamily: sharedFontFamily,
        fontSize: 10,
        lineHeight: 14,
        fontWeight: "800",
        letterSpacing: 1.3,
        textTransform: "uppercase",
        color: colors.textMuted,
      },
      caption: {
        fontFamily: sharedFontFamily,
        fontSize: 13,
        lineHeight: 19,
        fontWeight: "600",
        color: colors.textSoft,
      },
      helper: {
        fontFamily: sharedFontFamily,
        fontSize: 12,
        lineHeight: 18,
        fontWeight: "500",
        color: colors.textSoft,
      },
    },
    spacing: {
      xs: 8,
      sm: 12,
      md: 16,
      lg: 20,
      xl: 24,
      xxl: 32,
    },
    radii: {
      sm: 12,
      md: 16,
      lg: 20,
      xl: 24,
      pill: 999,
    },
    cardShadow: {
      shadowColor: colors.shadow,
      shadowOpacity: isDark ? 0.28 : 0.1,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
  };
}
