const MAX_JSON_BYTES = 8 * 1024;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function readLimitedJson(request: Request): Promise<unknown> {
  if (!request.body) {
    throw new HttpError(400, "missing_body", "请求正文不能为空");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_JSON_BYTES) {
    throw new HttpError(413, "payload_too_large", "请求正文过大");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalLength += value.byteLength;
    if (totalLength > MAX_JSON_BYTES) {
      await reader.cancel("payload_too_large");
      throw new HttpError(413, "payload_too_large", "请求正文过大");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new HttpError(400, "invalid_json", "请求正文不是有效 JSON");
  }
}

export function isPlayerInput(
  value: unknown,
): value is {
  playerId: string;
  nickname: string;
  resumeToken?: string;
  [key: string]: unknown;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const input = value as Record<string, unknown>;
  return (
    typeof input.playerId === "string" &&
    input.playerId.length >= 8 &&
    input.playerId.length <= 80 &&
    typeof input.nickname === "string" &&
    input.nickname.trim().length >= 1 &&
    input.nickname.trim().length <= 24 &&
    (input.resumeToken === undefined ||
      (typeof input.resumeToken === "string" && input.resumeToken.length >= 20 && input.resumeToken.length <= 160))
  );
}

export function normalizeNickname(nickname: string): string {
  return nickname.normalize("NFKC").trim().replaceAll(/[\u0000-\u001F\u007F]/g, "").slice(0, 24);
}
