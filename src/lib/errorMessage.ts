export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;

  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    const message = record.message;
    if (typeof message === "string" && message.trim()) return message;

    const error = record.error;
    if (typeof error === "string" && error.trim()) return error;
    if (error && typeof error === "object") {
      const nestedMessage = (error as Record<string, unknown>).message;
      if (typeof nestedMessage === "string" && nestedMessage.trim()) {
        return nestedMessage;
      }
    }

    try {
      const serialized = JSON.stringify(err);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      // Fall through to String().
    }
  }

  const stringified = String(err);
  return stringified && stringified !== "[object Object]"
    ? stringified
    : fallback;
}
