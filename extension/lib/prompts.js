// System prompts shared by every engine, intent detection for Ask, and answer post-processing.

const COACH = [
  'You are Chromy AI, a warm, witty, concise prompt-engineering coach.',
  'The user gives you a prompt they plan to send to an AI. Reply in under 150 words with exactly these parts:',
  'Score: NN/100 (how well the prompt will work; first line, nothing before it)',
  'Verdict: one sentence about the prompt itself.',
  'Fixes: up to 3 short bullet points (role, context, constraints, output format, examples).',
  'Human touch: only if the prompt literally contains a misspelled word or a clear slip, quote it exactly and mention it kindly with light humour (mistakes are human). Never invent one; if there is none, leave this line out entirely.',
  'Improved prompt: the rewritten prompt inside one fenced code block.',
  'Never pad. Plain text and simple markdown only.'
].join('\n');

const SOCRATES = [
  'You are Chromy AI in Socratic mode: a friendly Socrates who helps people discover what they really want from an AI.',
  'The user gives you a prompt they plan to send to an AI. Do not rewrite it. Reply in under 120 words with:',
  'Score: NN/100 (first line: how well the prompt will work as written)',
  'Questions: exactly 3 short, probing questions that expose missing context, assumptions or goals (numbered).',
  "Plato's hint: one sentence nudging them toward the ideal version of their prompt.",
  'Be playful and kind. Plain text only.'
].join('\n');

const ANSWER = [
  'You are Chromy AI, a knowledgeable, friendly assistant.',
  'Answer the question accurately and clearly: start with a direct answer in one or two sentences,',
  'then add the key points as short bullets when that helps. Aim for 80-200 words.',
  'If you are not sure about a fact, say so plainly instead of guessing.',
  'Finish with one final line starting with "Prompt tip:" that suggests one short way to ask this even better next time.'
].join('\n');

const SOCRATES_ANSWER = [
  'You are Chromy AI in Socratic mode: a friendly Socrates.',
  'Give a short, accurate answer to the question (2-4 sentences). If unsure of a fact, say so.',
  'Then ask 2 short questions that invite the user to think more deeply about it (numbered).',
  'Finish with one final line starting with "Prompt tip:" that suggests one way to ask this even better.'
].join('\n');

const TASK = [
  "You are Chromy AI, a fast, precise assistant inside the user's browser.",
  'Do exactly what the user asks. Be brief and well structured; prefer bullet points.',
  'If page content is provided, base your answer on it and say when the page does not contain the answer.',
  'If you used web search, rely on the retrieved sources for facts that may have changed.'
].join('\n');

export const SYSTEM_PROMPTS = { ask: COACH, socrates: SOCRATES, answer: ANSWER, socratesAnswer: SOCRATES_ANSWER, task: TASK };

/**
 * System prompt for a request.
 * @param {'ask'|'task'} mode
 * @param {'coach'|'socrates'|null} askStyle
 * @param {'prompt'|'question'} [kind] what an Ask message is (see classifyAsk)
 */
export function systemPromptFor(mode, askStyle, kind = 'prompt') {
  if (mode !== 'ask') return TASK;
  if (kind === 'question') return askStyle === 'socrates' ? SOCRATES_ANSWER : ANSWER;
  return askStyle === 'socrates' ? SOCRATES : COACH;
}

// Creation requests meant for another AI get coached; asks for information get answered.
const PROMPT_VERBS =
  'write|draft|create|generate|compose|make|design|build|act|pretend|imagine|rewrite|rephrase|produce|plan|outline|code|develop|brainstorm|prepare';
const QUESTION_START =
  /^(what|why|how|who|whom|whose|when|where|which|is|are|was|were|am|can|could|should|would|will|do|does|did|has|have|had|explain|define|describe|list|give|summari[sz]e|translate|compare|tell me|difference between|meaning of)\b/i;

/**
 * Is an Ask message a question the user wants answered, or a prompt they want coached?
 * "What is a cat?" → question. "write a blog post about coffee", "make me a logo",
 * "Can you write a cover letter?" → prompt (instructions meant for an AI).
 * @returns {'question'|'prompt'}
 */
export function classifyAsk(text) {
  const t = text.trim();
  if (!t) return 'prompt';
  const firstWords = t.toLowerCase().split(/\s+/).slice(0, 4).join(' ');
  // Instructions for an AI: starts with (or opens with "can you / please / I want you to") a doing-verb.
  if (new RegExp(`^(please |can you |could you |would you |i want you to |i need you to |you are )?(${PROMPT_VERBS})\\b`, 'i').test(firstWords)) return 'prompt';
  if (/\byou are an?\b|\bact as\b|\brole:|\bformat:|\bstep[- ]by[- ]step\b/i.test(t)) return 'prompt';
  if (t.length > 280 || t.split('\n').length > 3) return 'prompt';
  if (QUESTION_START.test(t) || /\?\s*$/.test(t)) return 'question';
  return 'prompt';
}

/**
 * Short reminder appended to the current Ask message (not stored in memory). Small local models
 * copy the format of earlier turns more than they follow the system prompt, so the format needs a
 * nudge right where the model is looking.
 */
export function formatReminder(mode, askStyle, kind = 'prompt') {
  if (mode !== 'ask') return '';
  if (kind === 'question') {
    return askStyle === 'socrates'
      ? '\n\n(Answer briefly first, then 2 numbered questions, then one "Prompt tip:" line.)'
      : '\n\n(Answer the question directly first. End with one "Prompt tip:" line.)';
  }
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

/**
 * A rule-based prompt tip for a question, used when the model forgets its "Prompt tip" line
 * (small local models often do). Picks the most useful missing ingredient.
 */
export function quickTip(question) {
  const q = question.trim();
  const words = q.split(/\s+/).filter(Boolean).length;
  if ((q.match(/\?/g) || []).length > 1 || /\?\s*(and|also)\b/i.test(q)) {
    return 'Ask one question at a time: each answer gets sharper and easier to check.';
  }
  if (!/\b(for (a|an|my|kids?|beginners?|students?|experts?)|as a|like i'?m|explain to|beginner|expert|child|kid|student|professional)\b/i.test(q)) {
    return words < 6
      ? 'Add who it is for and how deep to go, e.g. "for a beginner, in 5 bullet points".'
      : 'Say who the answer is for, e.g. "explain for a 12-year-old" or "for a nurse".';
  }
  if (!/\b(list|bullets?|table|steps?|words?|sentences?|paragraphs?|summary|example|compare)\b/i.test(q)) {
    return 'Ask for a format, e.g. "5 bullet points" or "under 100 words".';
  }
  return 'Ask for sources or an example, so you can check the answer yourself.';
}

/** Pulls the last "Prompt tip: …" line out of an answer. */
export function extractTip(text) {
  // The tip may be on its own line or tacked onto the last sentence ("…problems. Prompt tip: …").
  const re = /(?:^|\n|(?<=[.!?)])[ \t]+)[ \t]*(?:[-*•][ \t]*)?(?:💡[ \t]*)?(?:\*\*)?prompt tip(?:\*\*)?[ \t]*[:\-–]?(?:\*\*)?[ \t]*([^\n]+)\s*$/i;
  const m = text.match(re);
  if (!m || !m[1].trim()) return { tip: null, text };
  return { tip: m[1].replace(/\*\*/g, '').trim(), text: text.slice(0, m.index).trim() };
}

/**
 * Splits an answer into text and code segments for rendering. Robust to small-model fence
 * mistakes: nested/stray ``` lines inside a block, empty blocks, and an unclosed final fence.
 * @returns {Array<{type:'text'|'code', value:string}>}
 */
export function splitAnswer(text) {
  // Small models often double-wrap: "```\n```\ncode\n```\n```". Back-to-back fence lines act as one.
  text = text.replace(/(```[\w+-]*[ \t]*\n)(?:[ \t]*\n)*(?:[ \t]*```[\w+-]*[ \t]*\n(?:[ \t]*\n)*)+/g, '$1');
  const out = [];
  const re = /```[\w+-]*[ \t]*\n?([\s\S]*?)(?:```|$(?![\s\S]))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
    const code = m[1].replace(/^[ \t]*```[\w+-]*[ \t]*$/gm, '').replace(/^\n+|\s+$/g, '');
    if (code) out.push({ type: 'code', value: code });
    last = re.lastIndex;
    if (m[0].length === 0) break;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  // Collapse whitespace-only text segments and trim surrounding blank lines.
  return out
    .map((s) => (s.type === 'text' ? { ...s, value: s.value.replace(/^\n+|\n+$/g, '') } : s))
    .filter((s) => s.value.trim());
}
