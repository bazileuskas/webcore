// The AI section: a chat with Claude (https://claude.com), streamed to the
// page as it writes. The key comes from the ANTHROPIC_API_KEY environment
// variable, so it never goes into the code.
import Anthropic from "@anthropic-ai/sdk";

// Claude Opus 5.5 at low effort: quick answers, and cheaper than higher
// effort. "claude-haiku-5-5" costs far less per message but is less smart.
const MODEL = "claude-opus-5-5";
// Caps how long one answer can get, which also caps what it can cost.
const MAX_TOKENS = 4000;
// How much of the conversation is sent each time.
const HISTORY_MESSAGES = 20;
const MESSAGE_CHARS = 4000;

const SYSTEM = `You are the AI helper inside Minimalist, a simple web app. Most people talking to you are school students, some as young as 11.

Your main job is helping with schoolwork and learning. Explain things clearly, in simple words, and step by step. When someone asks about homework, help them understand how to solve it so they could do a similar problem themselves; give hints first when that helps. Be friendly and encouraging, and keep everything appropriate for children.

Keep answers short unless someone asks for more detail. Reply in the language the person writes in. You may use simple Markdown (bold, bullet or numbered lists, code blocks), but no tables, images or LaTeX: write maths in plain text, like 3x + 2 = 11. If you're not sure about something, say so.`;

let client = null;

export function chatReady() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Checks the conversation sent by the page and keeps the latest part of it.
// Returns null when it isn't a conversation ending with the person's message.
export function cleanHistory(list) {
  if (!Array.isArray(list)) return null;
  const messages = [];
  for (const message of list.slice(-HISTORY_MESSAGES)) {
    if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string") return null;
    const content = message.content.trim().slice(0, MESSAGE_CHARS);
    if (content) messages.push({ role: message.role, content });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages.at(-1).role !== "user") return null;
  return messages;
}

// Streams Claude's answer, calling send({ text }) for each new piece. Returns
// why it stopped ("end_turn", "max_tokens", "refusal", ...).
export async function streamChat(messages, send, signal) {
  client ??= new Anthropic();
  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: "low" },
      // If Claude's safety checks decline a message, Anthropic re-runs it on
      // the fallback model it recommends instead of just stopping.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // Reuses the already-processed start of long chats, which costs less.
      cache_control: { type: "ephemeral" },
      system: SYSTEM,
      messages,
    },
    { signal }
  );
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      send({ text: event.delta.text });
    }
  }
  const message = await stream.finalMessage();
  return message.stop_reason;
}

// A message the person can understand, for each way a request can fail.
export function chatErrorMessage(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return "The AI's key on the server isn't working. A parent needs to check ANTHROPIC_API_KEY on Render.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "The AI is busy, or its spending limit for the month is reached. Try again later.";
  }
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI. Try again in a moment.";
  if (err instanceof Anthropic.InternalServerError) return "The AI is overloaded right now. Try again in a minute.";
  if (err instanceof Anthropic.APIError && err.status === 402) {
    return "The AI account is out of credit. A parent needs to add more on the Anthropic Console.";
  }
  return "Something went wrong with the AI. Try again.";
}
