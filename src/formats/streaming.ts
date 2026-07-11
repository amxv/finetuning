export interface JsonlRecord<T> {
  value: T;
  line: number;
  byteOffset: number;
}
export class JsonlParseError extends Error {
  constructor(
    public readonly line: number,
    public readonly byteOffset: number,
    cause: unknown,
  ) {
    super(
      `Malformed JSONL at line ${line}, byte ${byteOffset}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

export async function* parseJsonl<T>(chunks: AsyncIterable<string | Uint8Array>): AsyncGenerator<JsonlRecord<T>> {
  const decoder = new TextDecoder();
  let buffer = "",
    line = 0,
    byteOffset = 0;
  for await (const chunk of chunks) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const raw = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      line += 1;
      const recordOffset = byteOffset;
      byteOffset += Buffer.byteLength(`${raw}\n`);
      if (!raw.trim()) continue;
      try {
        yield { value: JSON.parse(raw) as T, line, byteOffset: recordOffset };
      } catch (error) {
        throw new JsonlParseError(line, recordOffset, error);
      }
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    line += 1;
    try {
      yield { value: JSON.parse(buffer) as T, line, byteOffset };
    } catch (error) {
      throw new JsonlParseError(line, byteOffset, error);
    }
  }
}

export async function* serializeJsonl<T>(
  records: AsyncIterable<T>,
  serialize = JSON.stringify,
): AsyncGenerator<string> {
  for await (const record of records) yield `${serialize(record)}\n`;
}
