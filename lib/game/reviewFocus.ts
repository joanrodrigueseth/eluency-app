import type { GameWord, StudyRecordIssue } from "../../types/study-game";

export type StudyReviewFocusKey = "listening" | "visual" | "grammar" | "spelling" | "translation";

export type StudyReviewFocusArea = {
  key: StudyReviewFocusKey;
  label: string;
  count: number;
  recommendation: string;
  icon: "headset-outline" | "image-outline" | "git-branch-outline" | "text-outline" | "swap-horizontal-outline";
};

const FOCUS_DETAILS: Record<StudyReviewFocusKey, Omit<StudyReviewFocusArea, "key" | "count">> = {
  listening: { label: "Listening recall", recommendation: "Replay the audio, say the answer aloud, then check it.", icon: "headset-outline" },
  visual: { label: "Visual recall", recommendation: "Name the image before looking at the answer choices.", icon: "image-outline" },
  grammar: { label: "Grammar forms", recommendation: "Repeat the same form in a short sentence to reinforce the pattern.", icon: "git-branch-outline" },
  spelling: { label: "Spelling", recommendation: "Type each missed word once more without autocomplete.", icon: "text-outline" },
  translation: { label: "Translation recall", recommendation: "Practise the word in both directions before moving on.", icon: "swap-horizontal-outline" },
};

const FOCUS_ORDER: StudyReviewFocusKey[] = ["listening", "visual", "grammar", "spelling", "translation"];

export function countStudyReviewFocus(issues: StudyRecordIssue[], words: GameWord[]): StudyReviewFocusArea[] {
  const wordsById = new Map(words.map((word) => [word.id, word]));
  const counts = Object.fromEntries(FOCUS_ORDER.map((key) => [key, 0])) as Record<StudyReviewFocusKey, number>;

  for (const issue of issues) {
    if (issue.kind !== "wrong" && issue.kind !== "close" && issue.kind !== "skip") continue;
    const word = wordsById.get(issue.id);
    let key: StudyReviewFocusKey;
    if (issue.mode === "listening") key = "listening";
    else if (issue.mode === "image") key = "visual";
    else if (word?.practiceKind === "conjugation" || word?.practiceKind === "conjugation-table" || word?.practiceKind === "preposition") key = "grammar";
    else if (issue.promptFormat === "fill_blank" || word?.promptFormat === "fill_blank") key = "spelling";
    else key = "translation";
    counts[key] += 1;
  }

  return FOCUS_ORDER
    .filter((key) => counts[key] > 0)
    .map((key) => ({ key, count: counts[key], ...FOCUS_DETAILS[key] }));
}
