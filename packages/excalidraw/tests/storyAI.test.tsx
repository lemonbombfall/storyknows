import React from "react";
import { duplicateElements } from "@excalidraw/element";

import { screen, waitFor } from "@testing-library/react";

import type { ExcalidrawTextElement } from "@excalidraw/element/types";

import {
  createOutlineElements,
  placeStoryNodes,
  storyConnections,
} from "../story/layout";
import { restoreElements } from "../data/restore";

import { Excalidraw } from "../index";
import {
  getStoryDocument,
  getStoryDocuments,
  getStorySummary,
} from "../story/documents";
import { validateStoryOutline, validateStorySummary } from "../story/schema";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { act, fireEvent, render } from "./test-utils";

const { h } = window;
const summary = { name: "雨中来客", body: "女孩在书店躲雨，店主认出了她。" };
const outline = {
  nodes: [
    {
      id: "one",
      name: "雨中来客",
      body: summary.body,
      stage: "起",
      kind: "event",
      sourceIds: ["source"],
      suggested: false,
    },
  ],
};
let fetchMock: import("vitest").MockInstance<typeof globalThis.fetch>;
beforeEach(async () => {
  fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(summary), { status: 200 }));
  await render(<Excalidraw handleKeyboardGlobally />);
  API.setAppState({ width: 1440, height: 900, offsetLeft: 0, offsetTop: 0 });
  const text = API.createElement({
    type: "text",
    id: "source",
    text: "她在书店门前等雨停。\n\n店主认出了她的眼睛。",
    x: 150,
    y: 150,
  });
  API.setElements([text]);
  API.setSelectedElements([text]);
});
afterEach(() => {
  fetchMock.mockRestore();
});

it("keeps original writing through summary adoption, direct card edits and view switches", async () => {
  const original = (h.elements[0] as ExcalidrawTextElement).originalText;
  fireEvent.click(screen.getByRole("button", { name: "展开写作" }));
  fireEvent.click(screen.getByRole("button", { name: "概括到故事卡" }));
  await screen.findByRole("textbox", { name: "片段梗概" });
  fireEvent.change(screen.getByRole("textbox", { name: "片段梗概" }), {
    target: { value: "字".repeat(121) },
  });
  expect(screen.getByRole("button", { name: "采用梗概" })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "片段梗概" }), {
    target: { value: summary.body },
  });
  fireEvent.click(screen.getByRole("button", { name: "采用梗概" }));
  expect(screen.getByRole("textbox", { name: "故事正文" })).toHaveValue(
    original,
  );
  fireEvent.click(screen.getByRole("button", { name: "返回白板" }));
  let text = h.elements[0] as ExcalidrawTextElement;
  expect(h.elements).toHaveLength(1);
  expect(text.originalText).toBe(`${summary.name}\n${summary.body}`);
  expect(getStoryDocument(text).body).toBe(original);
  act(() => {
    h.app.scene.mutateElement(text, {
      originalText: "改过的梗概名\n手动改过的梗概",
      text: "改过的梗概名\n手动改过的梗概",
    });
    h.app.setState({});
  });
  expect(getStorySummary(text)?.body).toBe("手动改过的梗概");
  fireEvent.click(screen.getByRole("button", { name: "梗概 · 查看原文" }));
  text = h.elements[0] as ExcalidrawTextElement;
  expect(text.originalText).toBe(original);
  fireEvent.click(screen.getByRole("button", { name: "原文 · 查看梗概" }));
  expect((h.elements[0] as ExcalidrawTextElement).originalText).toBe(
    "改过的梗概名\n手动改过的梗概",
  );
});

it("holds previews outside the scene, keeps them on tool changes and failed regeneration, and adopts in one undo step", async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(outline), { status: 200 }),
  );
  fireEvent.click(screen.getByRole("button", { name: "AI 整理大纲" }));
  fireEvent.click(screen.getByRole("button", { name: "开始" }));
  await screen.findByRole("textbox", { name: "大纲节点名称" });
  expect(h.elements).toHaveLength(1);
  const input = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
  expect(input.sources[0].body).toContain("书店");
  expect(screen.getAllByRole("button", { name: /重新生成/ }).length).toBe(2);
  act(() => {
    h.app.setActiveTool({ type: "hand" });
  });
  expect(screen.queryByRole("navigation", { name: "AI 大纲选项" })).toBeNull();
  expect(screen.getByRole("textbox", { name: "大纲节点名称" })).toHaveValue(
    "雨中来客",
  );
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ error: "模拟失败" }), { status: 503 }),
  );
  fireEvent.click(screen.getByRole("button", { name: "↻ 重新生成" }));
  await screen.findByText("模拟失败");
  expect(screen.getByRole("textbox", { name: "大纲节点名称" })).toHaveValue(
    "雨中来客",
  );
  fireEvent.click(screen.getByRole("button", { name: "✓ 采用" }));
  await waitFor(() => expect(h.elements.length).toBeGreaterThan(1));
  const source = h.elements.find(
    (element) => element.id === "source",
  ) as ExcalidrawTextElement;
  expect(source.originalText).toContain("店主认出了她的眼睛");
  expect(getStoryDocuments(h.elements)).toHaveLength(1);
  Keyboard.undo();
  expect(h.app.scene.getNonDeletedElements()).toHaveLength(1);
  Keyboard.redo();
  expect(h.app.scene.getNonDeletedElements().length).toBeGreaterThan(1);
});

it("does not adopt a late response after cancelling", async () => {
  let resolve!: (response: Response) => void;
  fetchMock.mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "AI 整理大纲" }));
  fireEvent.click(screen.getByRole("button", { name: "开始" }));
  fireEvent.click(screen.getByRole("button", { name: "生成中… 取消" }));
  await act(async () => {
    resolve(new Response(JSON.stringify(outline), { status: 200 }));
  });
  expect(screen.queryByRole("textbox", { name: "大纲节点名称" })).toBeNull();
  expect(h.elements).toHaveLength(1);
});

it("rejects invented source IDs and counts graphemes rather than UTF-16 units", () => {
  expect(
    validateStorySummary({ name: "测试", body: "🌧️".repeat(120) }).body,
  ).toBeTruthy();
  expect(() =>
    validateStorySummary({ name: "测试", body: "字".repeat(121) }),
  ).toThrow();
  expect(() =>
    validateStoryOutline(
      { nodes: [{ ...outline.nodes[0], sourceIds: ["missing"] }] },
      {
        task: "outline",
        action: "organize",
        structure: "four",
        sources: [{ id: "source", title: "", body: "正文" }],
      },
    ),
  ).toThrow();
});

it("preserves metadata in JSON and remaps copied source links", () => {
  const nodes = placeStoryNodes(
    [{ ...outline.nodes[0], kind: "event" }],
    "four",
    h.elements,
  );
  const generated = createOutlineElements(nodes, "outline-original", "four");
  const restored = JSON.parse(JSON.stringify([...h.elements, ...generated]));
  const result = duplicateElements({ type: "everything", elements: restored });
  const copied = result.duplicatedElements.find(
    (element) => element.customData?.storyknows?.kind === "outline",
  )!;
  expect(copied.customData?.storyknows.sourceIds).toEqual([
    result.origIdToDuplicateId.get("source"),
  ]);
  expect(copied.customData?.storyknows.outlineId).not.toBe("outline-original");
  expect(
    generated.filter((element) => element.type === "rectangle"),
  ).toHaveLength(4);
});

it("adopts preview arrows at the same coordinates and preserves them through undo and reload", async () => {
  const nodes = [
    outline.nodes[0],
    { ...outline.nodes[0], id: "two", stage: "暂未归位" },
  ];
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ nodes }), { status: 200 }),
  );
  const placed = placeStoryNodes(
    nodes.map((node) => ({ ...node, kind: "event" })),
    "four",
    h.elements,
  );
  const connection = storyConnections(placed)[0];
  fireEvent.click(screen.getByRole("button", { name: "AI 整理大纲" }));
  fireEvent.click(screen.getByRole("button", { name: "开始" }));
  await screen.findAllByRole("textbox", { name: "大纲节点名称" });
  expect(document.querySelectorAll(".story-ai-curve > path")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "✓ 采用" }));
  const arrow = h.elements.find((element) => element.type === "arrow");
  expect(arrow?.type).toBe("arrow");
  if (arrow?.type !== "arrow") {
    throw new Error("Adopted arrow missing");
  }
  expect(arrow.endArrowhead).toBe("arrow");
  expect(arrow.width).toBeGreaterThan(1000);
  connection.points.forEach((point, index) => {
    // Native arrow conversion nudges endpoints by half a pixel.
    expect(
      Math.abs(arrow.x + arrow.points[index][0] - point.x),
    ).toBeLessThanOrEqual(0.51);
    expect(
      Math.abs(arrow.y + arrow.points[index][1] - point.y),
    ).toBeLessThanOrEqual(0.51);
  });
  Keyboard.undo();
  expect(
    h.app.scene
      .getNonDeletedElements()
      .some((element) => element.type === "arrow"),
  ).toBe(false);
  Keyboard.redo();
  const restored = restoreElements(
    JSON.parse(JSON.stringify(h.elements)),
    null,
    { deleteInvisibleElements: true },
  );
  expect(
    restored.some((element) => element.type === "arrow" && !element.isDeleted),
  ).toBe(true);
});
