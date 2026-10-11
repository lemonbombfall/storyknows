import { useEffect, useState } from "react";
import { getFontFamilyString } from "@excalidraw/common";
import {
  getContainerElement,
  redrawTextBoundingBox,
} from "@excalidraw/element";

import type { ExcalidrawTextElement } from "@excalidraw/element/types";

import {
  getFragmentData,
  getStoryDocument,
  getStorySummary,
  storyTextUpdate,
} from "../story/documents";
import { storyCharacterCount } from "../story/schema";
import { useStoryRequest } from "../story/useStoryRequest";

import type { StorySummary as Summary } from "../story/schema";
import type App from "./App";

export const StorySummary = ({
  app,
  element,
  commit,
}: {
  app: App;
  element: ExcalidrawTextElement;
  commit: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Summary | null>(null);
  const request = useStoryRequest(app);
  useEffect(() => {
    setOpen(false);
    setDraft(null);
    request.cancel();
  }, [element.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    request.cancel();
    setOpen(false);
  };
  const generate = async () => {
    commit();
    setOpen(true);
    const source = getStoryDocument(element);
    if (!source.body.trim()) {
      request.setError("先写下一点内容，再生成梗概");
      return;
    }
    const result = await request.run({
      task: "summary",
      action: "organize",
      structure: "four",
      sources: [{ id: element.id, ...source }],
    });
    if (result && "body" in result) {
      setDraft(result);
    }
  };
  const adopt = () => {
    if (!draft) {
      return;
    }
    const latest = app.scene.getNonDeletedElement(element.id);
    if (!latest || latest.type !== "text" || latest.locked) {
      request.setError("来源已删除或锁定");
      return;
    }
    app.scene.mutateElement(latest, storyTextUpdate(latest, "summary", draft));
    redrawTextBoundingBox(
      latest,
      getContainerElement(latest, app.scene.getNonDeletedElementsMap()),
      app.scene,
    );
    commit();
    close();
  };
  const container = getContainerElement(
    element,
    app.scene.getNonDeletedElementsMap(),
  );
  const color =
    container?.backgroundColor && container.backgroundColor !== "transparent"
      ? container.backgroundColor
      : "#fff0ac";
  const count = storyCharacterCount(draft?.body || "");
  return (
    <>
      {open && (
        <aside
          className="story-ai-summary"
          aria-label="梗概预览"
          style={{
            background: color,
            color: element.strokeColor,
            fontFamily: getFontFamilyString(element),
          }}
        >
          {draft && (
            <>
              <input
                aria-label="梗概名称"
                value={draft.name}
                maxLength={80}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
              <textarea
                aria-label="片段梗概"
                value={draft.body}
                onChange={(event) =>
                  setDraft({ ...draft, body: event.target.value })
                }
              />
              <small className={count > 120 ? "is-invalid" : ""}>
                {count} / 120
              </small>
            </>
          )}
          {request.running && <p role="status">正在概括…</p>}
          {request.error && (
            <p className="story-ai-error" role="alert">
              {request.error}
            </p>
          )}
          <div className="story-ai-summary-actions">
            <button
              aria-label="重新生成梗概"
              title="重新生成"
              disabled={request.running}
              onClick={generate}
            >
              ↻
            </button>
            <button aria-label="取消梗概" title="取消" onClick={close}>
              ×
            </button>
            <button
              aria-label="采用梗概"
              title="采用"
              disabled={
                request.running ||
                !draft?.name.trim() ||
                !draft.body.trim() ||
                count > 120
              }
              onClick={adopt}
            >
              ✓
            </button>
          </div>
        </aside>
      )}
      <button
        className="story-ai-feather"
        aria-label="概括到故事卡"
        title="概括到故事卡"
        onClick={() => (open ? close() : void generate())}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M3 22C6 9 14 3 23 1c-1 5-5 8-10 10l5-1c-2 4-6 6-10 7l-3 6z"
          />
          <path stroke="currentColor" d="M4 2v4M2 4h4" />
        </svg>
      </button>
    </>
  );
};

export const StoryViewToggle = ({
  app,
  element,
  style,
}: {
  app: App;
  element: ExcalidrawTextElement;
  style: React.CSSProperties;
}) => {
  if (!getFragmentData(element)) {
    return null;
  }
  const summaryView = getFragmentData(element)?.view === "summary";
  return (
    <button
      className="story-ai-view-toggle"
      style={style}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => {
        app.scene.mutateElement(
          element,
          storyTextUpdate(
            element,
            summaryView ? "full" : "summary",
            getStorySummary(element),
          ),
        );
        redrawTextBoundingBox(
          element,
          getContainerElement(element, app.scene.getNonDeletedElementsMap()),
          app.scene,
        );
        app.scheduleCapture();
        app.setState({});
      }}
    >
      {summaryView ? "梗概 · 查看原文" : "原文 · 查看梗概"}
    </button>
  );
};
