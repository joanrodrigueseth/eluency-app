import type {
  GameWord,
  StudyRecordIssue,
  TestAttemptAnswer,
} from "../../types/study-game";

export function issuesToTestAnswers(issues: StudyRecordIssue[]): TestAttemptAnswer[] {
  const byQuestion = new Map<number, TestAttemptAnswer>();
  for (const issue of issues) {
    if (!Number.isInteger(issue.questionIndex)) continue;
    const questionIndex = issue.questionIndex as number;
    byQuestion.set(questionIndex, {
      questionIndex,
      answer: issue.answer ?? "",
      selectedOptionId: issue.selectedOptionId ?? null,
    });
  }
  return Array.from(byQuestion.values()).sort(
    (left, right) => left.questionIndex - right.questionIndex
  );
}

export function testAnswersToIssues(
  words: GameWord[],
  answers: TestAttemptAnswer[]
): StudyRecordIssue[] {
  const wordsByQuestion = new Map(
    words.map((word, wordIndex) => [
      Number.isInteger(word.questionIndex) ? (word.questionIndex as number) : wordIndex,
      word,
    ])
  );

  return answers.flatMap((answer) => {
    const word = wordsByQuestion.get(answer.questionIndex);
    if (!word) return [];
    const answerText = String(answer.answer ?? "");
    return [{
      id: word.id,
      questionIndex: answer.questionIndex,
      prompt: word.en || word.sp || `Question ${answer.questionIndex + 1}`,
      expected: "",
      answer: answerText,
      kind: answerText.trim() || answer.selectedOptionId ? "open_review" : "skip",
      mode: "typing",
      promptFormat: word.promptFormat,
      answerFormat: word.answerFormat,
      mcqOptions: word.mcqOptions,
      selectedOptionId: answer.selectedOptionId ?? null,
    } satisfies StudyRecordIssue];
  });
}

export function firstUnansweredTestWordIndex(
  words: GameWord[],
  answers: TestAttemptAnswer[]
): number | null {
  const answered = new Set(
    answers
      .filter((answer) => answer.answer.trim() || answer.selectedOptionId)
      .map((answer) => answer.questionIndex)
  );
  const index = words.findIndex((word, wordIndex) => {
    const questionIndex = Number.isInteger(word.questionIndex)
      ? (word.questionIndex as number)
      : wordIndex;
    return !answered.has(questionIndex);
  });
  return index >= 0 ? index : null;
}
