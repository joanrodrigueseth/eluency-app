import assert from "node:assert/strict";
import test from "node:test";

import {
  createPromptBuilderActivity,
  isPromptBuilderActivityComplete,
  normalizePromptBuilderActivity,
  serializePromptBuilderActivity,
} from "../lib/promptBuilder.ts";

test("legacy preposition activities upgrade to Prompt Builder", () => {
  const activity = normalizePromptBuilderActivity({
    rowType: "preposition",
    prepositionTitle: "Combine the forms",
    prepositions: [{ left: "DE", right: "O", answer: "DO", note: "do" }],
  });

  assert.equal(activity.rowType, "prompt_builder");
  assert.equal(activity.instruction, "Combine the forms");
  assert.equal(activity.prompts[0].a.value, "DE");
  assert.equal(activity.prompts[0].expectedAnswer, "DO");
  assert.deepEqual(activity.prompts[0].acceptedAnswers, ["do"]);
  assert.equal(serializePromptBuilderActivity(activity).prompts[0].a.presentation, "text");
});

test("Prompt Builder requires every visible formula to be complete", () => {
  const activity = createPromptBuilderActivity("Build a question");
  assert.equal(activity.prompts[0].a.presentation, "text");
  activity.prompts[0].a.value = "person";
  activity.prompts[0].b.value = "COMER";
  activity.prompts[0].expectedAnswer = "Você já comeu?";
  assert.equal(isPromptBuilderActivityComplete(activity), true);

  activity.prompts.push({ ...activity.prompts[0], id: "incomplete", expectedAnswer: "" });
  assert.equal(isPromptBuilderActivityComplete(activity), false);
});
