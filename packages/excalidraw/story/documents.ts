import {
  getBoundTextElement,
  getContainerElement,
  isScrollableTextContainer,
  isTextElement,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
} from "@excalidraw/element/types";

import type { StorySummary } from "./schema";

export type StoryDocument = { title: string; body: string };
export type StoryFragmentData = {
  version: 1;
  kind: "fragment";
  view: "full" | "summary";
  document: StoryDocument;
  summary: StorySummary;
};
export const getFragmentData = (
  element: ExcalidrawElement,
): StoryFragmentData | null => {
  const data = element.customData?.storyknows;
  return data?.version === 1 &&
    data.kind === "fragment" &&
    ["full", "summary"].includes(data.view) &&
    typeof data.document?.title === "string" &&
    typeof data.document?.body === "string" &&
    typeof data.summary?.name === "string" &&
    typeof data.summary?.body === "string"
    ? data
    : null;
};
const splitFirstLine = (value: string) => {
  const newline = value.indexOf("\n");
  return newline < 0
    ? [value, ""]
    : [value.slice(0, newline), value.slice(newline + 1)];
};
export const getStoryDocument = (
  element: ExcalidrawTextElement,
): StoryDocument => {
  const data = getFragmentData(element);
  if (data?.view === "summary") {
    return data.document;
  }
  if (element.customData?.storyknowsHasTitle !== true) {
    return { title: "", body: element.originalText };
  }
  const [title, body] = splitFirstLine(element.originalText);
  return { title, body };
};
export const getStorySummary = (
  element: ExcalidrawTextElement,
): StorySummary | null => {
  const data = getFragmentData(element);
  if (!data) {
    return null;
  }
  // The visible text may have been edited using the native canvas editor.
  if (data.view === "summary") {
    const [name, body] = splitFirstLine(element.originalText);
    return { name, body };
  }
  return data.summary;
};
export const storyTextUpdate = (
  element: ExcalidrawTextElement,
  view: "full" | "summary",
  summary = getStorySummary(element),
  document = getStoryDocument(element),
) => {
  const content =
    view === "summary" && summary
      ? `${summary.name}\n${summary.body}`
      : document.title
      ? `${document.title}\n${document.body}`
      : document.body;
  return {
    originalText: content,
    text: content,
    customData: {
      ...element.customData,
      storyknowsHasTitle: !!document.title,
      ...(summary
        ? {
            storyknows: {
              version: 1,
              kind: "fragment",
              view,
              document,
              summary,
            } as StoryFragmentData,
          }
        : {}),
    },
  };
};
export const getStoryDocuments = (
  elements: readonly ExcalidrawElement[],
  selected: readonly ExcalidrawElement[] = [],
) => {
  const map = new Map(
    elements
      .filter((element) => !element.isDeleted)
      .map((element) => [element.id, element]),
  );
  const selectedIds = new Set<string>();
  selected.forEach((element) => {
    const target = isTextElement(element)
      ? element
      : getBoundTextElement(element, map);
    if (target) {
      selectedIds.add(target.id);
    }
  });
  return elements.filter(isTextElement).filter((element) => {
    const container = getContainerElement(element, map);
    return (
      !element.isDeleted &&
      !element.locked &&
      !container?.locked &&
      (!element.customData?.storyknows ||
        element.customData.storyknows.kind === "fragment") &&
      (!element.containerId || isScrollableTextContainer(container)) &&
      (!selected.length || selectedIds.has(element.id))
    );
  });
};
