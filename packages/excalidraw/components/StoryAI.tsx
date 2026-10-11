import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_FONT_FAMILY,
  getFontFamilyString,
  randomId,
  sceneCoordsToViewportCoords,
} from "@excalidraw/common";
import {
  CaptureUpdateAction,
  getCommonBounds,
  isTextElement,
} from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { zoomToFitBounds } from "../viewport";
import { getStoryDocument, getStoryDocuments } from "../story/documents";
import {
  createOutlineElements,
  storyConnections,
  placeStoryNodes,
  emptyStoryStages,
} from "../story/layout";
import { useStoryRequest } from "../story/useStoryRequest";
import { storyStages } from "../story/schema";

import "./StoryAI.scss";

import type { PlacedStoryNode } from "../story/layout";
import type { StoryRequest, StoryStructure } from "../story/schema";
import type { AppClassProperties } from "../types";
import type App from "./App";

export const StoryAIButton = ({ app }: { app: AppClassProperties }) => {
  const active =
    app.state.activeTool.type === "custom" &&
    app.state.activeTool.customType === "story-ai";
  return (
    <button
      type="button"
      className={`story-ai-tool ${active ? "is-active" : ""}`}
      aria-label="AI 整理大纲"
      title="AI 整理大纲"
      aria-pressed={active}
      onClick={() =>
        app.setActiveTool(
          { type: "custom", customType: "story-ai" },
          { keepSelection: true },
        )
      }
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3c0 6-3 9-9 9 6 0 9 3 9 9 0-6 3-9 9-9-6 0-9-3-9-9Z" />
        <circle cx="20" cy="4" r="2" />
      </svg>
    </button>
  );
};

const StoryDropdown = ({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const document = root.current?.ownerDocument;
    const outside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document?.addEventListener("pointerdown", outside);
    return () => document?.removeEventListener("pointerdown", outside);
  }, []);
  return (
    <div
      className="story-ai-dropdown"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          event.stopPropagation();
        }
      }}
    >
      <button
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {options.find((item) => item.value === value)?.label}
        <span className={open ? "is-open" : ""}>⌄</span>
      </button>
      {open && (
        <div role="menu" className="story-ai-menu">
          {options.map((item) => (
            <button
              key={item.value}
              role="menuitemradio"
              aria-checked={value === item.value}
              onClick={() => {
                onChange(item.value);
                setOpen(false);
              }}
            >
              {item.label}
              <span>{value === item.value ? "✓" : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const openStorySource = (app: App, id: string) => {
  const source = app.scene.getNonDeletedElement(id);
  if (!source || !isTextElement(source)) {
    app.setToast({ message: "来源已删除，大纲内容仍保留" });
    return;
  }
  app.excalidrawContainerValue.container?.dispatchEvent(
    new app.ownerWindow.CustomEvent("story-open-source", { detail: id }),
  );
};

export const StoryAI = ({
  app,
  selectedElements,
}: {
  app: App;
  selectedElements: readonly ExcalidrawElement[];
}) => {
  const active =
    app.state.activeTool.type === "custom" &&
    app.state.activeTool.customType === "story-ai";
  const [action, setAction] = useState<StoryRequest["action"]>("organize");
  const [structure, setStructure] = useState<StoryStructure>("four");
  const [draft, setDraft] = useState<{
    nodes: PlacedStoryNode[];
    structure: StoryStructure;
  } | null>(null);
  const [sourceMenu, setSourceMenu] = useState<string | null>(null);
  const request = useStoryRequest(app);
  const outlineId = useRef(randomId());
  const generatedOnce = useRef(false);
  const generatedElements = useMemo(
    () =>
      draft
        ? createOutlineElements(draft.nodes, outlineId.current, draft.structure)
        : [],
    [draft],
  );
  const generate = async () => {
    if (request.running) {
      request.cancel();
      return;
    }
    const documents = getStoryDocuments(
      app.scene.getNonDeletedElements(),
      selectedElements,
    );
    const sources = documents
      .map((document) => ({ id: document.id, ...getStoryDocument(document) }))
      .filter((source) => source.body.trim());
    if (!sources.length) {
      request.setError("先选择有正文的片段，或取消选择以读取当前白板");
      return;
    }
    const result = await request.run({
      task: "outline",
      action,
      structure,
      sources,
    });
    if (result && "nodes" in result) {
      const nodes = placeStoryNodes(
        result.nodes,
        structure,
        app.scene.getNonDeletedElements(),
      );
      outlineId.current = randomId();
      setDraft({ nodes, structure });
      generatedOnce.current = true;
      setSourceMenu(null);
      const bounds = getCommonBounds(
        createOutlineElements(nodes, outlineId.current, structure),
      );
      app.setState(
        zoomToFitBounds({
          bounds,
          appState: app.state,
          canvasOffsets: { top: 170, bottom: 100, left: 60, right: 60 },
          maxZoom: 1,
        }).appState,
      );
    }
  };
  const adopt = () => {
    if (!draft || request.running) {
      return;
    }
    app.updateScene({
      elements: [
        ...app.scene.getElementsIncludingDeleted(),
        ...generatedElements,
      ],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setDraft(null);
    setSourceMenu(null);
    request.setError("");
  };
  const updateNode = (id: string, patch: Partial<PlacedStoryNode>) =>
    setDraft(
      (draft) =>
        draft && {
          ...draft,
          nodes: draft.nodes.map((node) =>
            node.id === id ? { ...node, ...patch } : node,
          ),
        },
    );
  const drag = useRef<{
    id: string;
    clientX: number;
    clientY: number;
    x: number;
    y: number;
  } | null>(null);
  const sourceLinks = (ids: string[]) =>
    ids.length ? (
      ids.map((id) => {
        const source = app.scene.getNonDeletedElement(id);
        const title =
          source && isTextElement(source)
            ? getStoryDocument(source).title ||
              getStoryDocument(source).body.slice(0, 16)
            : "来源已删除";
        return (
          <button key={id} onClick={() => openStorySource(app, id)}>
            {title}
          </button>
        );
      })
    ) : (
      <span>AI 新增情节</span>
    );
  const selectedOutline = selectedElements.find(
    (element) => element.customData?.storyknows?.kind === "outline",
  );
  const selectedSources: string[] =
    selectedOutline?.customData?.storyknows?.sourceIds || [];
  if (app.state.viewModeEnabled) {
    return null;
  }
  const zoom = app.state.zoom.value;
  return (
    <>
      {active && (
        <nav
          className="story-ai-strip"
          aria-label="AI 大纲选项"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <StoryDropdown
            label="大纲操作"
            value={action}
            disabled={request.running}
            options={[
              { value: "organize", label: "整理大纲" },
              { value: "generate", label: "生成大纲" },
            ]}
            onChange={(value) => setAction(value as StoryRequest["action"])}
          />
          <i />
          <StoryDropdown
            label="故事结构"
            value={structure}
            disabled={request.running}
            options={[
              { value: "four", label: "起承转合" },
              { value: "three", label: "三幕式" },
            ]}
            onChange={(value) => setStructure(value as StoryStructure)}
          />
          <button className="story-ai-primary" onClick={generate}>
            {request.running
              ? "生成中… 取消"
              : generatedOnce.current
              ? "重新生成"
              : "开始"}
          </button>
        </nav>
      )}
      {request.error && (
        <div
          className="story-ai-message"
          role="alert"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {request.error}
          <button aria-label="关闭提示" onClick={() => request.setError("")}>
            ×
          </button>
        </div>
      )}
      {draft && (
        <>
          <div className="story-ai-preview" aria-label="大纲预览">
            {emptyStoryStages(draft.nodes, draft.structure).map((slot) => {
              const position = sceneCoordsToViewportCoords(
                { sceneX: slot.x, sceneY: slot.y },
                app.state,
              );
              return (
                <div
                  key={slot.stage}
                  className="story-ai-card story-ai-empty"
                  style={{
                    left: position.x - app.state.offsetLeft,
                    top: position.y - app.state.offsetTop,
                    transform: `scale(${zoom})`,
                  }}
                >
                  {slot.stage}
                </div>
              );
            })}
            {draft.nodes.map((node, index) => {
              const position = sceneCoordsToViewportCoords(
                { sceneX: node.x, sceneY: node.y },
                app.state,
              );
              return (
                <article
                  key={node.id}
                  className="story-ai-card"
                  style={{
                    left: position.x - app.state.offsetLeft,
                    top: position.y - app.state.offsetTop,
                    transform: `scale(${zoom}) rotate(${
                      index % 2 ? 0.7 : -0.7
                    }deg)`,
                    background: node.color,
                    fontFamily: getFontFamilyString({
                      fontFamily: DEFAULT_FONT_FAMILY,
                    }),
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onWheel={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <header
                    onPointerDown={(event) => {
                      if (event.target !== event.currentTarget) {
                        return;
                      }
                      event.currentTarget.setPointerCapture(event.pointerId);
                      drag.current = {
                        id: node.id,
                        clientX: event.clientX,
                        clientY: event.clientY,
                        x: node.x,
                        y: node.y,
                      };
                    }}
                    onPointerMove={(event) => {
                      const origin = drag.current;
                      if (origin?.id === node.id) {
                        updateNode(node.id, {
                          x: origin.x + (event.clientX - origin.clientX) / zoom,
                          y: origin.y + (event.clientY - origin.clientY) / zoom,
                        });
                      }
                    }}
                    onPointerUp={() => {
                      drag.current = null;
                    }}
                    onPointerCancel={() => {
                      drag.current = null;
                    }}
                  >
                    <select
                      aria-label={`${node.name}所属阶段`}
                      value={node.stage}
                      onChange={(event) =>
                        updateNode(node.id, { stage: event.target.value })
                      }
                    >
                      {[
                        ...storyStages(draft.structure),
                        "暂未归位",
                        "人物",
                        "设定",
                      ].map((stage) => (
                        <option key={stage}>{stage}</option>
                      ))}
                    </select>
                  </header>
                  {node.suggested && <small>✧ AI 建议</small>}
                  <input
                    aria-label="大纲节点名称"
                    value={node.name}
                    onChange={(event) =>
                      updateNode(node.id, { name: event.target.value })
                    }
                  />
                  <textarea
                    aria-label="大纲节点梗概"
                    value={node.body}
                    onChange={(event) =>
                      updateNode(node.id, { body: event.target.value })
                    }
                  />
                  <button
                    className="story-ai-source"
                    aria-label="查看来源"
                    onClick={() =>
                      setSourceMenu(sourceMenu === node.id ? null : node.id)
                    }
                  >
                    ↗
                  </button>
                  {sourceMenu === node.id && (
                    <div className="story-ai-sources">
                      {sourceLinks(node.sourceIds)}
                    </div>
                  )}
                </article>
              );
            })}
            <svg className="story-ai-curve" aria-hidden="true">
              <defs>
                <marker
                  id={`story-arrow-${outlineId.current}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M1 1 L9 5 L1 9"
                    fill="none"
                    stroke="#8961d6"
                    strokeWidth="1.5"
                  />
                </marker>
              </defs>
              {storyConnections(draft.nodes).map((connection) => {
                const points = connection.points.map((point) => {
                  const position = sceneCoordsToViewportCoords(
                    { sceneX: point.x, sceneY: point.y },
                    app.state,
                  );
                  return `${position.x - app.state.offsetLeft} ${
                    position.y - app.state.offsetTop
                  }`;
                });
                return (
                  <path
                    key={connection.id}
                    d={`M${points.join(" L")}`}
                    markerEnd={`url(#story-arrow-${outlineId.current})`}
                  />
                );
              })}
            </svg>
          </div>
          <div
            className="story-ai-draft-actions"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button disabled={request.running} onClick={generate}>
              ↻ 重新生成
            </button>
            <button
              onClick={() => {
                request.cancel();
                setDraft(null);
                request.setError("");
              }}
            >
              取消
            </button>
            <button
              className="story-ai-primary"
              disabled={
                request.running ||
                draft.nodes.some(
                  (node) => !node.name.trim() || !node.body.trim(),
                )
              }
              onClick={adopt}
            >
              ✓ 采用
            </button>
          </div>
        </>
      )}
      {!draft && selectedOutline && (
        <div
          className="story-ai-source-access"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button onClick={() => setSourceMenu(sourceMenu ? null : "selected")}>
            ↗ 来源
          </button>
          {sourceMenu && (
            <div className="story-ai-sources">
              {sourceLinks(selectedSources)}
            </div>
          )}
        </div>
      )}
    </>
  );
};
