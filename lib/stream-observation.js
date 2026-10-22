// Transport diagnostics only: never classify, rewrite, buffer, or retry content.
export async function* observeStream(factory, { report = () => {} } = {}) {
  let outcome = "cancelled", chunks = 0, chars = 0, toolCall = false, reasoning = false;
  let errorCode;
  try {
    for await (const chunk of factory()) {
      chunks += 1;
      if (chunk?.type === "text-delta") chars += String(chunk.text || "").length;
      if (chunk?.type === "tool-call-delta" || chunk?.type === "tool-call") toolCall = true;
      if (chunk?.type === "reasoning-delta") reasoning = true;
      yield chunk;
    }
    outcome = toolCall ? "tool_call" : chars ? "text" : reasoning ? "reasoning_only" : "empty";
  } catch (error) {
    outcome = "error";
    // Do not store arbitrary error messages, URLs, response content or credentials.
    const code = typeof error?.code === "string" ? error.code : "";
    errorCode = /^[A-Z][A-Z0-9_]{0,39}$/.test(code) ? code : "STREAM_ERROR";
    throw error;
  } finally {
    try { report({ outcome, chunks, chars, toolCall, reasoning, ...(errorCode ? { error: errorCode } : {}) }); }
    catch { /* Diagnostics must not interrupt the stream. */ }
  }
}
