import { Codex } from "@openai/codex-sdk";

const transientPatterns = ["stream disconnected", "ECONNRESET", "ENETDOWN", "ETIMEDOUT"];

export async function runWithRetries(
  thread: ReturnType<Codex["startThread"]>,
  prompt: string,
  events: any[],
  maxAttempts = 3
) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      const result = await thread.run(prompt, {
        onEvent: (evt) => {
          events.push(evt);
        },
      });
      return result;
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      const transient = transientPatterns.some((p) => msg.includes(p));
      if (!transient || attempt >= maxAttempts) {
        throw err;
      }
      const backoffMs = 500 * attempt;
      console.warn(
        `[codex] transient error (${msg}); retry ${attempt}/${maxAttempts} after ${backoffMs}ms`
      );
      await new Promise((r) => setTimeout(r, backoffMs));
      events.length = 0; // reset events for a clean retry
    }
  }
}
