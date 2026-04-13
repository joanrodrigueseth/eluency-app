import Constants from "expo-constants";

import type { GameWord, LessonGamePayload, StudySessionMode, TestGamePayload } from "../../types/study-game";

const API_BASE = (Constants.expoConfig?.extra?.apiBaseUrl?.toString() || "https://www.eluency.com").replace(/\/$/, "");

/**
 * React Native Image requires an absolute http(s) URL. API may return /api/lesson-asset?... paths.
 */
function absolutePublicAssetUrl(url: string): string {
  const t = url.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("/")) return `${API_BASE}${t}`;
  return t;
}

function stableToken(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
}

function toImageUrl(input?: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (trimmed === "📄") return undefined;
  return trimmed;
}

/** Image URL ready for <Image source={{ uri }} /> in the app. */
function gameWordImageUrl(raw?: string | null): string | undefined {
  const u = toImageUrl(raw ?? undefined);
  if (!u) return undefined;
  return absolutePublicAssetUrl(u);
}

export function normalizeLessonsToWords(lessons: LessonGamePayload[]): GameWord[] {
  const out: GameWord[] = [];
  const pair = (l: LessonGamePayload) => (typeof l.language_pair === "string" && l.language_pair.trim() ? l.language_pair.trim() : "en-pt");

  for (const lesson of lessons) {
    const lessonLanguagePair = pair(lesson);
    const lessonLanguage = lesson.language?.trim() || null;
    for (let i = 0; i < (lesson.words ?? []).length; i += 1) {
      const w = (lesson.words ?? [])[i] as Record<string, unknown>;
      const rowType =
        w.rowType === "conjugation" ? "conjugation" : w.rowType === "preposition" ? "preposition" : "vocab";

      if (rowType === "conjugation") {
        const infinitive = String(w.infinitive ?? "").trim();
        const conjugations = Array.isArray(w.conjugations) ? w.conjugations : [];
        const entries = conjugations.map((c: { pronoun?: string; form_a?: string; form_b?: string }) => ({
          pronoun: String(c.pronoun ?? "").trim(),
          form_a: String(c.form_a ?? "").trim(),
          form_b: String(c.form_b ?? "").trim(),
        }));
        const withPronouns = entries.filter((e) => e.pronoun);
        if (!infinitive || withPronouns.length === 0) continue;
        const hasAnyKey = withPronouns.some((e) => e.form_a || e.form_b);
        if (!hasAnyKey) continue;
        out.push({
          id: `lesson-${lesson.id}-conj-table-${i}`,
          lessonId: lesson.id,
          lessonName: lesson.name,
          lessonLanguagePair,
          lessonLanguage,
          sourceType: "lesson",
          pt: "",
          en: infinitive,
          sp: infinitive,
          se: "",
          imageUrl: undefined,
          audioUrl: w.audio_url != null ? (w.audio_url as string | null) : null,
          promptFormat: "text",
          answerFormat: "specific",
          practiceKind: "conjugation-table",
          conjugationTable: { infinitive, entries: withPronouns },
          conjugationInfinitive: infinitive,
        });
        continue;
      }

      if (rowType === "preposition") {
        const preps = Array.isArray(w.prepositions) ? w.prepositions : [];
        for (let pi = 0; pi < preps.length; pi += 1) {
          const p = preps[pi] as { left?: string; right?: string; answer?: string; note?: string };
          const left = String(p.left ?? "").trim();
          const right = String(p.right ?? "").trim();
          const answer = String(p.answer ?? "").trim();
          if (!answer || (!left && !right)) continue;
          const prompt = left && right ? `${left} + ${right}` : left || right;
          const token = stableToken(`${left}-${right}-${answer}`) || `${i}-${pi}`;
          out.push({
            id: `lesson-${lesson.id}-prep-${token}`,
            lessonId: lesson.id,
            lessonName: lesson.name,
            lessonLanguagePair,
            lessonLanguage,
            sourceType: "lesson",
            pt: answer,
            en: prompt,
            sp: prompt,
            se: answer,
            imageUrl: undefined,
            audioUrl: null,
            promptFormat: "text",
            answerFormat: "specific",
            practiceKind: "preposition",
            prepositionPrompt: prompt,
            prepositionAnswer: answer,
          });
        }
        continue;
      }

      const legacy = lessonLanguagePair === "en-pt";
      const termA = legacy ? String(w.pt ?? "").trim() : String(w.term_a ?? w.pt ?? "").trim();
      const termB = legacy ? String(w.en ?? "").trim() : String(w.term_b ?? w.en ?? "").trim();
      if (!termA && !termB) continue;
      const rawCtxA = legacy
        ? typeof w.sp === "string"
          ? w.sp.trim()
          : ""
        : String(w.context_a ?? "").trim();
      const rawCtxB = legacy
        ? typeof w.se === "string"
          ? w.se.trim()
          : ""
        : String(w.context_b ?? "").trim();
      const sp = rawCtxA || termA;
      const se = rawCtxB || termB;
      out.push({
        id: `lesson-${lesson.id}-${stableToken(`${termA}-${termB}`) || i}`,
        lessonId: lesson.id,
        lessonName: lesson.name,
        lessonLanguagePair,
        lessonLanguage,
        sourceType: "lesson",
        pt: termA,
        en: termB,
        sp,
        se,
        imageUrl: gameWordImageUrl((w.image_url as string | undefined) ?? (w.img as string | undefined)),
        audioUrl: (w.audio_url as string | null | undefined) ?? null,
        promptFormat:
          w.audio_url != null && String(w.audio_url).trim()
            ? "audio"
            : toImageUrl((w.image_url as string | undefined) ?? (w.img as string | undefined))
              ? "image"
              : "text",
        answerFormat: "specific",
        practiceKind: "vocab",
      });
    }
  }
  return out;
}

export function normalizeTestsToWords(tests: TestGamePayload[]): GameWord[] {
  const out: GameWord[] = [];
  for (const test of tests) {
    for (let i = 0; i < (test.words ?? []).length; i += 1) {
      const q = (test.words ?? [])[i];
      const pt = String(q.pt ?? "").trim();
      const en = String(q.en ?? "");
      if (!pt && !en) continue;
      out.push({
        id: `test-${test.id}-${stableToken(`${pt}-${en}`) || i}`,
        testId: test.id,
        testName: test.name,
        sourceType: "test",
        pt,
        en,
        pt_alt: Array.isArray(q.pt_alt) ? q.pt_alt : [],
        imageUrl: gameWordImageUrl(q.image_url ?? q.img),
        audioUrl: q.audio_url ?? null,
        promptFormat: q.prompt_format ?? "text",
        answerFormat: q.answer_format ?? (q.require_specific_answer === false ? "open" : "specific"),
        mcqOptions: Array.isArray(q.mcq_options) ? q.mcq_options : undefined,
        mcqCorrectOptionId: q.mcq_correct_option_id ?? null,
        fillBlankCharacterCount: q.fill_blank_character_count,
      });
    }
    for (const rv of test.reviewVocabulary ?? []) {
      const pt = String(rv.pt ?? "").trim();
      const en = String(rv.en ?? "").trim();
      if (!pt && !en) continue;
      out.push({
        id: rv.id ? String(rv.id) : `review-${test.id}-${stableToken(`${pt}-${en}`) || "x"}`,
        testId: test.id,
        testName: test.name,
        sourceType: "review",
        pt,
        en,
        sp: rv.sp ?? pt,
        se: rv.se ?? en,
        imageUrl: gameWordImageUrl(rv.image_url ?? rv.img),
        audioUrl: rv.audio_url ?? null,
        promptFormat: rv.audio_url ? "audio" : toImageUrl(rv.img) ? "image" : "text",
        answerFormat: "open",
      });
    }
  }
  return out;
}

export function getDisplayPrompt(word: GameWord, direction: "pt-en" | "en-pt") {
  if (word.practiceKind === "conjugation-table" && word.conjugationTable?.infinitive) return word.conjugationTable.infinitive;
  if (word.practiceKind === "conjugation" && word.conjugationPrompt) return word.conjugationPrompt;
  if (word.practiceKind === "preposition" && word.prepositionPrompt) return word.prepositionPrompt;
  if (direction === "pt-en") return word.pt || word.sp || "";
  return word.en || word.se || "";
}

export function getExpectedAnswer(word: GameWord, direction: "pt-en" | "en-pt") {
  if (word.practiceKind === "conjugation-table") return "";
  if (word.practiceKind === "conjugation" && word.conjugationAnswer) return word.conjugationAnswer;
  if (word.practiceKind === "preposition" && word.prepositionAnswer) return word.prepositionAnswer;
  if (direction === "pt-en") return word.en || "";
  return word.pt || "";
}

/**
 * Web game: full conjugation row for typing; MCQ/listening expand to one card per pronoun.
 */
export function expandConjugationTablesForMode(words: GameWord[], mode: StudySessionMode): GameWord[] {
  const out: GameWord[] = [];
  for (const w of words) {
    if (w.practiceKind !== "conjugation-table" || !w.conjugationTable) {
      out.push(w);
      continue;
    }
    if (mode === "multiple-choice" || mode === "listening") {
      const { infinitive, entries } = w.conjugationTable;
      for (let ci = 0; ci < entries.length; ci++) {
        const c = entries[ci];
        const answer = String(c.form_a ?? c.form_b ?? "").trim();
        const pronoun = String(c.pronoun ?? "").trim();
        if (!answer || !infinitive || !pronoun) continue;
        const prompt = `${pronoun} · ${infinitive}`;
        const token = stableToken(`${infinitive}-${pronoun}-${answer}`) || `${ci}`;
        out.push({
          ...w,
          id: `${w.id}-p-${token}`,
          practiceKind: "conjugation",
          conjugationTable: undefined,
          conjugationInfinitive: infinitive,
          conjugationPronoun: pronoun,
          conjugationPrompt: prompt,
          conjugationAnswer: answer,
          pt: answer,
          en: infinitive,
          sp: prompt,
          se: answer,
        });
      }
    } else {
      out.push(w);
    }
  }
  return out;
}

