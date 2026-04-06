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
  violet: string;
  violetSoft: string;
  danger: string;
  dangerSoft: string;
  shadow: string;
};

export type AppTheme = {
  isDark: boolean;
  colors: AppColors;
  typography: {
    display: TextStyle;
    title: TextStyle;
    body: TextStyle;
    bodyStrong: TextStyle;
    label: TextStyle;
    caption: TextStyle;
  };
  cardShadow: ViewStyle;
};

const sharedFontFamily = Platform.select({
  ios: "System",
  android: "Roboto",
  default: "System",
});

// Brand palette
const LINEN_BG = "#F7F2EA";
const LINEN_SURFACE = "#FCFAF6";
const LINEN_ALT = "#FFFFFF";

const AZULEJO_BLUE = "#2E7ABF";
const AZULEJO_BLUE_SOFT = "#EAF3FB";
const AZULEJO_BLUE_SOFT_STRONG = "#D8EAF8";
const AZULEJO_BLUE_BORDER = "#B7D0E8";

const GOLD = "#F3C64D";
const GOLD_SOFT = "#FFF5DA";

const INK = "#252A2E";
const INK_MUTED = "#5F6B76";
const INK_SOFT = "#7B8794";

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
  background: LINEN_BG,
  surface: LINEN_SURFACE,
  surfaceAlt: LINEN_ALT,
  surfaceGlass: "rgba(252,250,246,0.78)",
  border: "rgba(46,122,191,0.14)",
  borderStrong: "rgba(46,122,191,0.24)",
  text: INK,
  textMuted: INK_MUTED,
  textSoft: INK_SOFT,
  primary: AZULEJO_BLUE,
  primarySoft: AZULEJO_BLUE_SOFT,
  primaryText: "#FFFFFF",
  success: "#059669",
  successSoft: "rgba(5,150,105,0.12)",
  violet: GOLD,
  violetSoft: GOLD_SOFT,
  danger: "#DC2626",
  dangerSoft: "rgba(220,38,38,0.12)",
  shadow: "rgba(37,42,46,0.10)",
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
  primaryText: "#FFFFFF",
  success: "#34D399",
  successSoft: "rgba(52,211,153,0.18)",
  violet: GOLD,
  violetSoft: "rgba(243,198,77,0.16)",
  danger: "#F87171",
  dangerSoft: "rgba(248,113,113,0.20)",
  shadow: "rgba(0,0,0,0.42)",
};

export function useAppTheme(): AppTheme {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? darkColors : lightColors;

  return {
    isDark,
    colors,
    typography: {
      display: {
        fontFamily: sharedFontFamily,
        fontSize: 34,
        lineHeight: 40,
        fontWeight: "700",
        color: colors.text,
      },
      title: {
        fontFamily: sharedFontFamily,
        fontSize: 23,
        lineHeight: 29,
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
      caption: {
        fontFamily: sharedFontFamily,
        fontSize: 13,
        lineHeight: 19,
        fontWeight: "600",
        color: colors.textSoft,
      },
    },
    cardShadow: {
      shadowColor: colors.shadow,
      shadowOpacity: isDark ? 0.32 : 0.12,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
  };
}
