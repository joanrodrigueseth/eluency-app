/** Matches teacher lesson editor LESSON_LANGUAGES → short codes for game labels. */
const LESSON_LANG_TO_SHORT: Record<string, string> = {
  "Portuguese (BR)": "PT",
  Spanish: "ES",
  English: "EN",
  French: "FR",
  German: "DE",
  Italian: "IT",
  Japanese: "JA",
  Korean: "KO",
  "Chinese (Mandarin)": "ZH",
  Arabic: "AR",
};

/** Matches teacher lesson editor LANGUAGE_PAIRS — label A is stored in `pt` (or term_a), label B in `en` (or term_b) for display mapping. */
const PAIR_META: Record<string, { labelA: string; labelB: string; shortA: string; shortB: string }> = {
  "en-pt": { labelA: "Portuguese", labelB: "English", shortA: "PT", shortB: "EN" },
  "en-es": { labelA: "Spanish", labelB: "English", shortA: "ES", shortB: "EN" },
  "en-en": { labelA: "English", labelB: "English", shortA: "EN", shortB: "EN" },
  "en-fr": { labelA: "French", labelB: "English", shortA: "FR", shortB: "EN" },
  "en-de": { labelA: "German", labelB: "English", shortA: "DE", shortB: "EN" },
  "en-it": { labelA: "Italian", labelB: "English", shortA: "IT", shortB: "EN" },
  "en-ja": { labelA: "Japanese", labelB: "English", shortA: "JA", shortB: "EN" },
  "en-ko": { labelA: "Korean", labelB: "English", shortA: "KO", shortB: "EN" },
  "en-zh": { labelA: "Chinese (Mandarin)", labelB: "English", shortA: "ZH", shortB: "EN" },
  "en-ar": { labelA: "Arabic", labelB: "English", shortA: "AR", shortB: "EN" },
  "pt-es": { labelA: "Portuguese", labelB: "Spanish", shortA: "PT", shortB: "ES" },
};

export function getLanguagePairMeta(pairCode: string | undefined | null) {
  const key = typeof pairCode === "string" && pairCode.trim() ? pairCode.trim() : "en-pt";
  return PAIR_META[key] ?? PAIR_META["en-pt"];
}

/**
 * Map DB lesson.language (e.g. "German") to a short label. Returns null if unknown.
 * Matching is case-insensitive so values like "GERMAN" still map to DE.
 */
export function lessonLanguageToShort(lessonLanguage: string | null | undefined): string | null {
  if (!lessonLanguage || typeof lessonLanguage !== "string") return null;
  const t = lessonLanguage.trim();
  if (!t) return null;
  if (LESSON_LANG_TO_SHORT[t]) return LESSON_LANG_TO_SHORT[t];
  const lower = t.toLowerCase();
  for (const [label, short] of Object.entries(LESSON_LANG_TO_SHORT)) {
    if (label.toLowerCase() === lower) return short;
  }
  return null;
}

/**
 * Short codes shown in the game: first column follows lesson instructional language when it
 * differs from the pair's "B" language (avoids EN→EN when the lesson is "English" on en-pt).
 */
export function getDisplayShortLabels(
  pairCode: string | undefined | null,
  lessonLanguage: string | null | undefined
): { shortA: string; shortB: string } {
  const m = getLanguagePairMeta(pairCode);
  const lessonShort = lessonLanguageToShort(lessonLanguage);
  let shortA = m.shortA;
  const shortB = m.shortB;
  if (lessonShort && lessonShort !== m.shortB) {
    shortA = lessonShort;
  }
  return { shortA, shortB };
}

export function getDisplayLanguageMeta(pairCode: string | undefined | null, lessonLanguage?: string | null) {
  const m = getLanguagePairMeta(pairCode);
  const { shortA, shortB } = getDisplayShortLabels(pairCode, lessonLanguage);
  return { ...m, shortA, shortB };
}

/** Shown for direction pt-en (prompt lang A, answer lang B). */
export function labelDirectionForward(pairCode: string | undefined | null, lessonLanguage?: string | null): string {
  const { shortA, shortB } = getDisplayShortLabels(pairCode, lessonLanguage);
  return `${shortA} → ${shortB}`;
}

/** Shown for direction en-pt (prompt lang B, answer lang A). */
export function labelDirectionReverse(pairCode: string | undefined | null, lessonLanguage?: string | null): string {
  const { shortA, shortB } = getDisplayShortLabels(pairCode, lessonLanguage);
  return `${shortB} → ${shortA}`;
}

export function historyDirectionLabel(
  direction: "pt-en" | "en-pt",
  pairCode: string | undefined | null,
  lessonLanguage?: string | null
): string {
  const { shortA, shortB } = getDisplayShortLabels(pairCode, lessonLanguage);
  return direction === "pt-en" ? `${shortA} → ${shortB}` : `${shortB} → ${shortA}`;
}
