// System prompts shared by every engine, plus parsing of the coach's score line.

const COACH = [
  'You are Chromy AI, a warm, witty, concise prompt-engineering coach.',
  'The user gives you a prompt they plan to send to an AI, or a question about prompting.',
  'If it is a prompt, reply in under 150 words with exactly these parts:',
  'Score: NN/100 (how well the prompt will work; first line, nothing before it)',
  'Verdict: one sentence.',
  'Fixes: up to 3 short bullet points (role, context, constraints, output format, examples).',
  'Human touch: only if the prompt literally contains a misspelled word or a clear slip, quote it exactly and mention it kindly with light humour (mistakes are human). Never invent one; if there is none, leave this line out entirely.',
  'Improved prompt: the rewritten prompt inside a single fenced code block.',
  'If it is a question about prompting: answer in under 120 words with practical tips, and no Score line.',
  'Never pad. Plain text and simple markdown only.'
].join('\n');

const SOCRATES = [
  'You are Chromy AI in Socratic mode: a friendly Socrates who helps people discover what they really want from an AI.',
  'Do not rewrite the prompt yourself. Instead reply in under 120 words with:',
  'Score: NN/100 (first line: how well the prompt will work as written)',
  'Questions: exactly 3 short, probing questions that expose missing context, assumptions or goals (numbered).',
  "Plato's hint: one sentence nudging them toward the ideal version of their prompt.",
  'Be playful and kind. Plain text only.'
].join('\n');

const TASK = [
  "You are Chromy AI, a fast, precise assistant inside the user's browser.",
  'Do exactly what the user asks. Be brief and well structured; prefer bullet points.',
  'If page content is provided, base your answer on it and say when the page does not contain the answer.',
  'If you used web search, rely on the retrieved sources for facts that may have changed.'
].join('\n');

export const SYSTEM_PROMPTS = { ask: COACH, socrates: SOCRATES, task: TASK };

/** System prompt for a request mode and ask style. */
export function systemPromptFor(mode, askStyle) {
  if (mode === 'ask') return askStyle === 'socrates' ? SOCRATES : COACH;
  return TASK;
}

/**
 * Short reminder appended to the current Ask message (not stored in memory). Small local models
 * copy the format of earlier turns more than they follow the system prompt, so switching between
 * Coach and Socrates needs a nudge right where the model is looking.
 */
export function formatReminder(mode, askStyle) {
  if (mode !== 'ask') return '';
  return askStyle === 'socrates'
    ? "\n\n(Socratic format: Score line first, then exactly 3 numbered questions, then Plato's hint. Do not rewrite the prompt.)"
    : '\n\n(Coach format: Score line first, then Verdict, Fixes, Human touch only if a real typo exists, and the Improved prompt in a code block.)';
}

/** Follow-up sent by the "Question it" button (Socratic self-examination). */
export const QUESTION_IT =
  'Question your previous answer like Socrates would: what might be wrong, assumed or missing? ' +
  'List at most 3 honest doubts in one line each, then give a corrected, improved answer.';

/** Drops empty sections small models write anyway ("Human touch: None", "Human touch: N/A"). */
export function tidyAnswer(text) {
  return text
    .replace(/^[ \t]*(?:\*\*)?human touch(?:\*\*)?:?(?:\*\*)?[ \t]*(?:none|n\/a|-|no typos?[^\n]*|nothing[^\n]*)\.?[ \t]*(?:\n|$)/gim, '')
    .trim();
}

/**
 * Pulls "Score: NN/100" out of an answer. Tolerates small-model sloppiness
 * (bold markers, "Score - 72", "72 / 100", leading whitespace).
 * @returns {{ score: number|null, text: string }}
 */
export function extractScore(text) {
  const re = /^\s*(?:\*\*)?\s*score\s*(?:\*\*)?\s*[:\-–]?\s*(?:\*\*)?\s*(\d{1,3})\s*(?:\/\s*100)?(?:\*\*)?[^\n]*\n?/i;
  const m = text.match(re);
  if (!m) return { score: null, text };
  const n = Number(m[1]);
  if (!(n >= 0 && n <= 100)) return { score: null, text };
  return { score: n, text: text.slice(m[0].length).replace(/^\s+/, '') };
}
