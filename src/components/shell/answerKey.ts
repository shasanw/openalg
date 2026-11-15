import type { AnswerKeyFormat } from "@/engine/worksheet";

/** How each Answer Key format is named and described in the editor. */
export const ANSWER_KEY_LABELS: Record<AnswerKeyFormat, { name: string; description: string }> = {
  full: { name: "Full", description: "Every Answer, on its own page after the Problems." },
  odds: { name: "Odd-numbered", description: "Answers to odd-numbered Problems only." },
  "in-context": {
    name: "In context",
    description: "A copy of the Worksheet with each Answer printed under its Problem.",
  },
  none: { name: "None", description: "No Answer Key is printed." },
};
