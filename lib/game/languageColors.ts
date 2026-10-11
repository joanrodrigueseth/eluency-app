export type LanguageColorPalette = {
  solid: string;
  soft: string;
  border: string;
  accent: string;
  onSolid: string;
  text: string;
};

type LanguageColorDefinition = Omit<LanguageColorPalette, "text"> & {
  darkSolid?: string;
  darkSoft: string;
  darkBorder: string;
  darkText: string;
};

const LANGUAGE_COLORS: Record<string, LanguageColorDefinition> = {
  PT: { solid: "#147A52", soft: "#E6F6EF", border: "#79BFA3", accent: "#E5B83B", onSolid: "#FFFFFF", darkSoft: "#123D31", darkBorder: "#3FAE83", darkText: "#71D7AE" },
  ES: { solid: "#C73D3D", soft: "#FFF0E8", border: "#E69575", accent: "#F2C94C", onSolid: "#FFFFFF", darkSoft: "#482629", darkBorder: "#C96A6A", darkText: "#F4A0A0" },
  DE: { solid: "#292929", soft: "#F4EFE2", border: "#B79A52", accent: "#E0B52F", onSolid: "#FFFFFF", darkSolid: "#735F24", darkSoft: "#3B3523", darkBorder: "#A98D49", darkText: "#F3D57B" },
  FR: { solid: "#2E5EB5", soft: "#EDF2FF", border: "#86A4DD", accent: "#E45B64", onSolid: "#FFFFFF", darkSoft: "#1D3157", darkBorder: "#648ED6", darkText: "#9EC1FF" },
  IT: { solid: "#16815B", soft: "#E9F7F0", border: "#7ABDA5", accent: "#D95252", onSolid: "#FFFFFF", darkSoft: "#153D32", darkBorder: "#45AD87", darkText: "#79DCB7" },
  EN: { solid: "#315FA8", soft: "#EDF3FC", border: "#88A7D3", accent: "#D6535B", onSolid: "#FFFFFF", darkSoft: "#203454", darkBorder: "#668CC8", darkText: "#A6C7F5" },
  JA: { solid: "#B63C4A", soft: "#FFF0F2", border: "#DF929B", accent: "#FFFFFF", onSolid: "#FFFFFF", darkSoft: "#45262D", darkBorder: "#C76874", darkText: "#F3A0AA" },
  KO: { solid: "#365EA8", soft: "#EFF3FB", border: "#8EA8D4", accent: "#D65151", onSolid: "#FFFFFF", darkSoft: "#223653", darkBorder: "#6F91CC", darkText: "#ABC7F2" },
  ZH: { solid: "#C0393A", soft: "#FFF0EA", border: "#E08B76", accent: "#F2C94C", onSolid: "#FFFFFF", darkSoft: "#492628", darkBorder: "#C96968", darkText: "#F4A09F" },
  AR: { solid: "#147A52", soft: "#EAF7F1", border: "#7ABDA5", accent: "#FFFFFF", onSolid: "#FFFFFF", darkSoft: "#123D31", darkBorder: "#3FAE83", darkText: "#71D7AE" },
};

const FALLBACK: LanguageColorDefinition = {
  solid: "#2F6FB2",
  soft: "#EAF3FC",
  border: "#8BB2D8",
  accent: "#7FC8C0",
  onSolid: "#FFFFFF",
  darkSoft: "#203653",
  darkBorder: "#6895C5",
  darkText: "#A7CCF2",
};

export function getLanguageColor(shortCode?: string | null, isDark = false): LanguageColorPalette {
  const key = String(shortCode ?? "").trim().toUpperCase();
  const palette = LANGUAGE_COLORS[key] ?? FALLBACK;

  return {
    solid: isDark ? palette.darkSolid ?? palette.solid : palette.solid,
    soft: isDark ? palette.darkSoft : palette.soft,
    border: isDark ? palette.darkBorder : palette.border,
    accent: palette.accent,
    onSolid: palette.onSolid,
    text: isDark ? palette.darkText : palette.solid,
  };
}
