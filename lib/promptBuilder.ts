export const PROMPT_ELEMENT_KINDS = ["text", "emoji", "icon", "image"] as const;
export type PromptElementKind = (typeof PROMPT_ELEMENT_KINDS)[number];
export type PromptTextPresentation = "word" | "phrase" | "text";

export const PROMPT_ICON_OPTIONS = [
  { value: "person", label: "Person", glyph: "\u{1F464}", ionicon: "person-outline" },
  { value: "people", label: "People", glyph: "\u{1F465}", ionicon: "people-outline" },
  { value: "coffee", label: "Coffee", glyph: "\u2615", ionicon: "cafe-outline" },
  { value: "home", label: "Home", glyph: "\u{1F3E0}", ionicon: "home-outline" },
  { value: "book", label: "Book", glyph: "\u{1F4D8}", ionicon: "book-outline" },
  { value: "school", label: "School", glyph: "\u{1F3EB}", ionicon: "school-outline" },
  { value: "food", label: "Food", glyph: "\u{1F37D}\uFE0F", ionicon: "restaurant-outline" },
  { value: "travel", label: "Travel", glyph: "\u2708\uFE0F", ionicon: "airplane-outline" },
] as const;

export type PromptIconKey = (typeof PROMPT_ICON_OPTIONS)[number]["value"];
export type PromptElement = {
  kind: PromptElementKind;
  value?: string;
  presentation?: PromptTextPresentation;
  image_url?: string;
  image_path?: string;
  asset_id?: string;
  source?: "upload" | "asset";
  alt_text?: string;
};
export type PromptBuilderItem = {
  id: string;
  a: PromptElement;
  b: PromptElement;
  expectedAnswer: string;
  acceptedAnswers?: string[];
};
export type PromptBuilderActivity = {
  rowType: "prompt_builder";
  instruction: string;
  prompts: PromptBuilderItem[];
};

const createId = () => `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const text = (value: unknown) => typeof value === "string" ? value : "";
const legacyPromptId = (index: number, ...parts: unknown[]) => {
  const token = parts.map(text).join("-").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `legacy-prompt-${index}-${token || "item"}`;
};

export function createPromptElement(kind: PromptElementKind = "text"): PromptElement {
  if (kind === "text") return { kind, value: "", presentation: "text" };
  if (kind === "image") return { kind, image_url: "", source: "upload", alt_text: "" };
  return { kind, value: "" };
}

export function createPromptBuilderItem(): PromptBuilderItem {
  return { id: createId(), a: createPromptElement(), b: createPromptElement(), expectedAnswer: "", acceptedAnswers: [] };
}

export function createPromptBuilderActivity(instruction = ""): PromptBuilderActivity {
  return { rowType: "prompt_builder", instruction, prompts: [createPromptBuilderItem()] };
}

export function normalizePromptElement(value: unknown): PromptElement {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const kind = PROMPT_ELEMENT_KINDS.includes(source.kind as PromptElementKind) ? source.kind as PromptElementKind : "text";
  return {
    kind,
    value: text(source.value),
    ...(kind === "text" ? { presentation: ["word", "phrase", "text"].includes(String(source.presentation)) ? source.presentation as PromptTextPresentation : "text" } : {}),
    ...(kind === "image" ? {
      image_url: text(source.image_url),
      image_path: text(source.image_path) || undefined,
      asset_id: text(source.asset_id) || undefined,
      source: source.source === "asset" ? "asset" : "upload",
      alt_text: text(source.alt_text),
    } : {}),
    ...(kind === "icon" ? { alt_text: text(source.alt_text) } : {}),
  };
}

export function normalizePromptBuilderItem(value: unknown): PromptBuilderItem {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    id: text(source.id).trim() || createId(),
    a: normalizePromptElement(source.a),
    b: normalizePromptElement(source.b),
    expectedAnswer: text(source.expectedAnswer),
    acceptedAnswers: Array.isArray(source.acceptedAnswers) ? source.acceptedAnswers.map(text).map((answer) => answer.trim()).filter(Boolean) : [],
  };
}

export function normalizePromptBuilderActivity(value: unknown): PromptBuilderActivity {
  const source = value && typeof value === "object" ? value as Record<string, any> : {};
  if (source.rowType === "preposition") {
    const prompts = (Array.isArray(source.prepositions) ? source.prepositions : []).map((entry: any, index: number) => ({
      id: legacyPromptId(index, entry?.left, entry?.right, entry?.answer),
      a: { kind: "text" as const, value: text(entry?.left), presentation: "text" as const },
      b: { kind: "text" as const, value: text(entry?.right), presentation: "text" as const },
      expectedAnswer: text(entry?.answer),
      acceptedAnswers: text(entry?.note).split(",").map((answer) => answer.trim()).filter(Boolean),
    }));
    return {
      rowType: "prompt_builder",
      instruction: text(source.prepositionTitle) || "Combine A and B, then build the answer.",
      prompts: prompts.length ? prompts : [createPromptBuilderItem()],
    };
  }
  const prompts = Array.isArray(source.prompts) ? source.prompts.map(normalizePromptBuilderItem) : [];
  return { rowType: "prompt_builder", instruction: text(source.instruction), prompts: prompts.length ? prompts : [createPromptBuilderItem()] };
}

export function promptElementHasContent(element: PromptElement) {
  return element.kind === "image" ? !!element.image_url?.trim() : !!element.value?.trim();
}

export function isPromptBuilderItemComplete(item: PromptBuilderItem) {
  return promptElementHasContent(item.a) && promptElementHasContent(item.b) && !!item.expectedAnswer.trim();
}

export function isPromptBuilderActivityComplete(activity: PromptBuilderActivity) {
  return !!activity.instruction.trim() && activity.prompts.length > 0 && activity.prompts.every(isPromptBuilderItemComplete);
}

function serializeElement(element: PromptElement): PromptElement {
  if (element.kind === "image") {
    return {
      kind: "image",
      image_url: element.image_url?.trim() || "",
      image_path: element.image_path?.trim() || undefined,
      asset_id: element.asset_id?.trim() || undefined,
      source: element.source === "asset" ? "asset" : "upload",
      alt_text: element.alt_text?.trim() || "Visual prompt",
    };
  }
  return {
    kind: element.kind,
    value: element.value?.trim() || "",
    ...(element.kind === "text" ? { presentation: "text" as const } : {}),
    ...(element.kind === "icon" ? { alt_text: element.alt_text?.trim() || element.value?.trim() || "Prompt icon" } : {}),
  };
}

export function serializePromptBuilderActivity(activity: PromptBuilderActivity): PromptBuilderActivity {
  return {
    rowType: "prompt_builder",
    instruction: activity.instruction.trim(),
    prompts: activity.prompts.filter(isPromptBuilderItemComplete).map((item) => ({
      id: item.id.trim() || createId(),
      a: serializeElement(item.a),
      b: serializeElement(item.b),
      expectedAnswer: item.expectedAnswer.trim(),
      acceptedAnswers: (item.acceptedAnswers ?? []).map((answer) => answer.trim()).filter(Boolean),
    })),
  };
}

export function promptElementText(element: PromptElement) {
  if (element.kind === "image") return element.alt_text?.trim() || "image";
  if (element.kind === "icon") return PROMPT_ICON_OPTIONS.find((option) => option.value === element.value)?.label ?? element.alt_text?.trim() ?? "icon";
  return element.value?.trim() || "";
}

export function promptBuilderPromptText(item: PromptBuilderItem) {
  return `${promptElementText(item.a)} + ${promptElementText(item.b)}`;
}
