export type StorySource = { id: string; title: string; body: string };
export type StoryStructure = "four" | "three";
export type StoryRequest = {
  task: "summary" | "outline";
  action: "organize" | "generate";
  structure: StoryStructure;
  sources: StorySource[];
};
export type StorySummary = { name: string; body: string };
export type StoryNode = StorySummary & {
  id: string;
  stage: string;
  kind: "event" | "character" | "setting";
  sourceIds: string[];
  suggested: boolean;
};
export type StoryOutline = { nodes: StoryNode[] };
export const storyStages = (structure: StoryStructure) =>
  structure === "four"
    ? ["起", "承", "转", "合"]
    : ["第一幕", "第二幕", "第三幕"];

export const storyCharacterCount = (text: string) =>
  Array.from(
    new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(
      text.replace(/\s/g, ""),
    ),
  ).length;

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AI 返回格式不完整，请重新生成");
  }
  return value as Record<string, unknown>;
};
const text = (value: unknown, max: number) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error("AI 返回内容为空或过长，请重新生成");
  }
  return value.trim();
};
export const validateStoryRequest = (value: unknown): StoryRequest => {
  const input = record(value);
  if (
    !["summary", "outline"].includes(String(input.task)) ||
    !["organize", "generate"].includes(String(input.action)) ||
    !["four", "three"].includes(String(input.structure)) ||
    !Array.isArray(input.sources) ||
    !input.sources.length ||
    input.sources.length > 50
  ) {
    throw new Error("请选择 1–50 个写作片段");
  }
  const sources = input.sources.map((source) => {
    const item = record(source);
    return {
      id: text(item.id, 200),
      title: typeof item.title === "string" ? item.title.slice(0, 300) : "",
      body: text(item.body, 200000),
    };
  });
  if (
    new Set(sources.map((source) => source.id)).size !== sources.length ||
    sources.reduce((total, source) => total + source.body.length, 0) > 200000 ||
    (input.task === "summary" && sources.length !== 1)
  ) {
    throw new Error("本次内容过多或重复，请缩小片段范围");
  }
  return {
    task: input.task as StoryRequest["task"],
    action: input.action as StoryRequest["action"],
    structure: input.structure as StoryStructure,
    sources,
  };
};
export const validateStorySummary = (value: unknown): StorySummary => {
  const result = record(value);
  const summary = {
    name: text(result.name, 80),
    body: text(result.body, 1000),
  };
  if (storyCharacterCount(summary.body) > 120) {
    throw new Error("梗概超过 120 字，请重新生成或缩短内容");
  }
  return summary;
};
export const validateStoryOutline = (
  value: unknown,
  request: StoryRequest,
): StoryOutline => {
  const result = record(value);
  if (
    !Array.isArray(result.nodes) ||
    !result.nodes.length ||
    result.nodes.length > 40
  ) {
    throw new Error("大纲节点数量不正确，请重新生成");
  }
  const allowedSources = new Set(request.sources.map((source) => source.id));
  const stages = [
    ...storyStages(request.structure),
    "暂未归位",
    "人物",
    "设定",
  ];
  const ids = new Set<string>();
  const nodes = result.nodes.map((value) => {
    const node = record(value);
    const id = text(node.id, 100);
    if (
      ids.has(id) ||
      !stages.includes(String(node.stage)) ||
      !["event", "character", "setting"].includes(String(node.kind)) ||
      typeof node.suggested !== "boolean" ||
      !Array.isArray(node.sourceIds) ||
      node.sourceIds.some(
        (id) => typeof id !== "string" || !allowedSources.has(id),
      ) ||
      (!node.suggested && !node.sourceIds.length) ||
      (request.action === "organize" && node.suggested)
    ) {
      throw new Error("大纲来源或结构不正确，请重新生成");
    }
    ids.add(id);
    return {
      id,
      name: text(node.name, 80),
      body: text(node.body, 600),
      kind: node.kind as StoryNode["kind"],
      stage:
        node.kind === "character"
          ? "人物"
          : node.kind === "setting"
          ? "设定"
          : (node.stage as string),
      sourceIds: [...new Set(node.sourceIds)] as string[],
      suggested: node.suggested,
    };
  });
  return { nodes };
};
