import {
  validateStoryOutline,
  validateStoryRequest,
  validateStorySummary,
} from "./schema";

import type { StoryRequest, StoryOutline, StorySummary } from "./schema";

export async function requestStoryAI(
  input: StoryRequest,
  signal: AbortSignal,
): Promise<StorySummary | StoryOutline> {
  const request = validateStoryRequest(input);
  const response = await fetch("/api/story-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error("AI 服务暂时不可用，请稍后重试");
  }
  if (!response.ok) {
    throw new Error(
      typeof value.error === "string" ? value.error : "AI 请求失败，请重试",
    );
  }
  return input.task === "summary"
    ? validateStorySummary(value)
    : validateStoryOutline(value, request);
}
