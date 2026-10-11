import React from "react";
import { screen } from "@testing-library/react";

import {
  getBoundTextElement,
  getCommonBounds,
  redrawTextBoundingBox,
} from "@excalidraw/element";

import { Excalidraw } from "../index";
import { exportToSvg } from "../scene/export";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import { act, fireEvent, render } from "./test-utils";

const { h } = window;

beforeEach(async () => {
  await render(<Excalidraw handleKeyboardGlobally />);
  API.setAppState({ width: 1440, height: 900, offsetLeft: 0, offsetTop: 0 });
});

it("writes into the existing document, preserves the canvas, and reopens with the directory closed", async () => {
  const note = API.createElement({
    type: "stickynote",
    id: "note",
    x: 300,
    y: 200,
    width: 250,
    height: 250,
    baseHeight: 250,
    boundElements: [{ type: "text", id: "text" }],
  });
  const text = API.createElement({
    type: "text",
    id: "text",
    containerId: note.id,
    text: "标题\n原正文",
  });
  API.setElements([note, text]);
  API.setSelectedElements([note]);
  const viewport = {
    x: h.state.scrollX,
    y: h.state.scrollY,
    zoom: h.state.zoom.value,
  };
  fireEvent.click(screen.getByRole("button", { name: "展开写作" }));
  expect(screen.queryByRole("navigation", { name: "故事片段" })).toBeNull();
  expect(screen.getByRole("textbox", { name: "片段标题" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "故事正文" })).toHaveValue(
    "标题\n原正文",
  );
  fireEvent.change(screen.getByRole("textbox", { name: "故事正文" }), {
    target: { value: "新的正文\n第二段" },
  });
  fireEvent.click(screen.getByRole("button", { name: "展开目录" }));
  expect(
    screen.getByRole("navigation", { name: "故事片段" }).textContent,
  ).toContain("新的正文");
  fireEvent.click(screen.getByRole("button", { name: "返回白板" }));
  expect(h.elements.find((element) => element.id === "text")).toMatchObject({
    originalText: "新的正文\n第二段",
  });
  expect(h.elements.find((element) => element.id === "note")).toMatchObject({
    width: 250,
    height: 250,
  });
  expect({
    x: h.state.scrollX,
    y: h.state.scrollY,
    zoom: h.state.zoom.value,
  }).toEqual(viewport);
  Keyboard.undo();
  expect(h.elements.find((element) => element.id === "text")).toMatchObject({
    originalText: "标题\n原正文",
  });
  API.setSelectedElements([h.app.scene.getNonDeletedElement(note.id)!]);
  fireEvent.click(screen.getByRole("button", { name: "展开写作" }));
  expect(screen.queryByRole("navigation", { name: "故事片段" })).toBeNull();
});

it("requires text, supports standalone writing, and never combines unrelated selections", () => {
  const rectangle = API.createElement({ type: "rectangle", x: 300, y: 200 });
  const text = API.createElement({
    type: "text",
    text: "原来的正文",
    x: 600,
    y: 200,
  });
  API.setElements([rectangle, text]);
  API.setSelectedElements([rectangle]);
  expect(screen.queryByRole("button", { name: "展开写作" })).toBeNull();
  API.setSelectedElements([rectangle, text]);
  expect(screen.queryByRole("button", { name: "展开写作" })).toBeNull();
  API.setSelectedElements([text]);
  fireEvent.click(screen.getByRole("button", { name: "展开写作" }));
  fireEvent.change(screen.getByRole("textbox", { name: "片段标题" }), {
    target: { value: "新标题" },
  });
  fireEvent.click(screen.getByRole("button", { name: "返回白板" }));
  expect(text.originalText).toBe("新标题\n原来的正文");
  expect(text.customData?.storyknowsHasTitle).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "展开写作" }));
  expect(screen.getByRole("textbox", { name: "片段标题" })).toHaveValue(
    "新标题",
  );
  expect(screen.getByRole("textbox", { name: "故事正文" })).toHaveValue(
    "原来的正文",
  );
  fireEvent.change(screen.getByRole("textbox", { name: "片段标题" }), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: "返回白板" }));
  expect(text.originalText).toBe("原来的正文");
  expect(text.customData?.storyknowsHasTitle).toBe(false);
});

it("keeps the entry fixed when a bound document changes and inherits its ink", () => {
  const note = API.createElement({
    type: "rectangle",
    id: "note",
    x: 300,
    y: 200,
    width: 250,
    height: 250,
    boundElements: [{ type: "text", id: "text" }],
  });
  const text = API.createElement({
    type: "text",
    id: "text",
    containerId: note.id,
    text: "短文",
    strokeColor: "#e03131",
    fontFamily: 3,
  });
  API.setElements([note, text]);
  API.setSelectedElements([note]);
  const entry = screen.getByRole("button", { name: "展开写作" });
  const position = entry.getAttribute("style");
  act(() => {
    h.app.scene.mutateElement(text, { originalText: "多行正文\n".repeat(20) });
    redrawTextBoundingBox(text, note, h.app.scene);
  });
  expect(entry.getAttribute("style")).toBe(position);
  fireEvent.click(entry);
  const paper = screen.getByRole("textbox", { name: "故事正文" })
    .parentElement!;
  expect(paper.style.color).toBe("rgb(224, 49, 49)");
  expect(paper.style.fontFamily).toContain("Cascadia");
  const editor = screen.getByRole("textbox", {
    name: "故事正文",
  }) as HTMLTextAreaElement;
  editor.focus();
  editor.setSelectionRange(3, 3);
  const scroller = paper.parentElement!;
  scroller.scrollTop = 100;
  fireEvent.mouseDown(screen.getByRole("button", { name: "展开目录" }));
  fireEvent.click(screen.getByRole("button", { name: "展开目录" }));
  expect(editor.selectionStart).toBe(3);
  expect(scroller.scrollTop).toBe(100);
});

it.each(["rectangle", "ellipse", "diamond", "stickynote"] as const)(
  "binds double-clicks inside the actual %s outline away from the center",
  async (type) => {
    const shape = API.createElement({
      type,
      x: 300,
      y: 200,
      width: 250,
      height: 250,
      backgroundColor: "transparent",
    });
    API.setElements([shape]);
    const mouse = new Pointer("mouse");
    mouse.doubleClickAt(425, 225);
    const { getTextEditor, updateTextEditor } = await import("./queries/dom");
    const editor = await getTextEditor();
    updateTextEditor(editor, "写在图形里面");
    Keyboard.exitTextEditor(editor);
    expect(
      getBoundTextElement(shape, h.app.scene.getNonDeletedElementsMap())
        ?.originalText,
    ).toBe("写在图形里面");
    mouse.doubleClickAt(425, 425);
    const reopened = await getTextEditor();
    expect(reopened.value).toBe("写在图形里面");
    Keyboard.exitTextEditor(reopened);
    expect(
      h.elements.filter(
        (element) => element.type === "text" && !element.isDeleted,
      ),
    ).toHaveLength(1);
  },
);

it.each(["ellipse", "diamond"] as const)(
  "keeps a double-click in the %s bounding-box corner as free text",
  async (type) => {
    const shape = API.createElement({
      type,
      x: 300,
      y: 200,
      width: 250,
      height: 250,
    });
    API.setElements([shape]);
    API.setSelectedElements([shape]);
    new Pointer("mouse").doubleClickAt(310, 210);
    const { getTextEditor, updateTextEditor } = await import("./queries/dom");
    const editor = await getTextEditor();
    updateTextEditor(editor, "独立文字");
    Keyboard.exitTextEditor(editor);
    expect(h.elements.find((element) => element.type === "text")).toMatchObject(
      { containerId: null },
    );
  },
);

it.each(["rectangle", "ellipse", "diamond", "stickynote"] as const)(
  "keeps long %s prose intact while clipping exports to the shape",
  async (type) => {
    const container = API.createElement({
      type,
      id: "container",
      width: 250,
      height: 250,
      boundElements: [{ type: "text", id: "text" }],
    });
    const content = Array(80).fill("很长的中文正文").join("\n");
    const text = API.createElement({
      type: "text",
      id: "text",
      text: content,
      containerId: container.id,
    });
    API.setElements([container, text]);
    act(() => redrawTextBoundingBox(text, container, h.app.scene));
    expect(container.height).toBe(250);
    expect(text.originalText).toBe(content);
    expect(text.height).toBeGreaterThan(container.height);
    expect(getCommonBounds(h.elements)).toEqual(getCommonBounds([container]));
    const svg = await exportToSvg(
      h.app.scene.getNonDeletedElements(),
      h.state,
      {},
    );
    expect(svg.querySelector("#text-viewport-text polygon")).not.toBeNull();
    expect(svg.textContent).toContain("很长的中文正文");
  },
);
