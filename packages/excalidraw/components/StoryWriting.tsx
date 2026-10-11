import { useEffect, useRef, useState } from "react";

import {
  getFontFamilyString,
  sceneCoordsToViewportCoords,
} from "@excalidraw/common";
import {
  getBoundTextElement,
  getElementBounds,
  isScrollableTextContainer,
  isTextElement,
  getContainerElement,
  redrawTextBoundingBox,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
} from "@excalidraw/element/types";

import {
  getStoryDocument,
  getStoryDocuments,
  getFragmentData,
  storyTextUpdate,
} from "../story/documents";

import { StorySummary, StoryViewToggle } from "./StorySummary";

import "./StoryWriting.scss";
import "./StoryAI.scss";

import type App from "./App";

type Props = { app: App; selectedElements: readonly ExcalidrawElement[] };

const SidebarIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="3.5" width="18" height="17" rx="2.5" />
    <path d="M10 4v16" />
  </svg>
);

/** Only an explicitly entered title is separated from the canvas document. */
const getWritingContent = getStoryDocument;

/** Edit the original document even when the canvas displays its summary. */
export const StoryWriting = ({ app, selectedElements }: Props) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      setActiveId(id);
      setDirectoryOpen(false);
    };
    app.excalidrawContainerValue.container?.addEventListener(
      "story-open-source",
      open,
    );
    return () =>
      app.excalidrawContainerValue.container?.removeEventListener(
        "story-open-source",
        open,
      );
  }, [app]);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement>(null);
  const elementsMap = app.scene.getNonDeletedElementsMap();
  const documents = getStoryDocuments(app.scene.getNonDeletedElements());
  const active = documents.find((element) => element.id === activeId);
  const { title, body } = active
    ? getWritingContent(active)
    : { title: "", body: "" };

  useEffect(() => {
    if (activeId && (!active || app.state.viewModeEnabled)) {
      setActiveId(null);
    }
  }, [activeId, active, app.state.viewModeEnabled]);

  useEffect(() => {
    if (activeId) {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
      bodyRef.current?.focus();
    }
  }, [activeId]);

  // Native textarea editing provides IME and undo. Grow the writing page, not
  // the canvas shape, and avoid nesting a second scroll area inside the page.
  useEffect(() => {
    const editor = bodyRef.current;
    if (editor) {
      editor.style.height = "0px";
      editor.style.height = `${Math.max(300, editor.scrollHeight)}px`;
    }
  }, [body, activeId, app.state.width]);

  const write = (nextTitle: string, nextBody: string) => {
    if (!active || active.locked || app.state.viewModeEnabled) {
      return;
    }
    app.scene.mutateElement(
      active,
      storyTextUpdate(
        active,
        getFragmentData(active)?.view || "full",
        undefined,
        { title: nextTitle, body: nextBody },
      ),
    );
    redrawTextBoundingBox(
      active,
      getContainerElement(active, elementsMap),
      app.scene,
    );
  };

  const commit = () => {
    app.scheduleCapture();
    // The store captures on App updates; changing only this component's local
    // state would leave the latest writing session outside the undo history.
    app.setState({});
  };

  const close = () => {
    commit();
    setActiveId(null);
    app.ownerWindow.requestAnimationFrame(() => {
      if (returnFocusRef.current) {
        returnFocusRef.current.focus();
      } else {
        app.focusContainer();
      }
    });
  };

  if (active) {
    return (
      <div
        className={`story-writing${
          directoryOpen ? " story-writing--directory" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="沉浸写作"
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape" && !event.nativeEvent.isComposing) {
            directoryOpen ? setDirectoryOpen(false) : close();
          }
          if (event.key === "Tab") {
            const controls = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                "button, input, textarea",
              ),
            );
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && app.ownerDocument.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (
              !event.shiftKey &&
              app.ownerDocument.activeElement === last
            ) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <nav className="story-writing__controls" aria-label="写作导航">
          <button onClick={close} aria-label="返回白板" title="返回白板">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m14 6-6 6 6 6" />
            </svg>
          </button>
          <button
            aria-label={directoryOpen ? "收起目录" : "展开目录"}
            title={directoryOpen ? "收起目录" : "展开目录"}
            onMouseDown={(event) => event.preventDefault()}
            aria-expanded={directoryOpen}
            onClick={() => setDirectoryOpen(!directoryOpen)}
          >
            <SidebarIcon />
          </button>
        </nav>
        {directoryOpen && (
          <>
            <button
              className="story-writing__scrim"
              aria-label="收起目录"
              onClick={() => setDirectoryOpen(false)}
            />
            <nav className="story-writing__directory" aria-label="故事片段">
              {documents
                .filter(
                  (document) =>
                    document.originalText.trim() || document.id === activeId,
                )
                .map((document) => {
                  const { title: heading, body: preview } =
                    getWritingContent(document);
                  const container = getContainerElement(document, elementsMap);
                  return (
                    <button
                      key={document.id}
                      className={active.id === document.id ? "is-current" : ""}
                      aria-current={
                        active.id === document.id ? "page" : undefined
                      }
                      onClick={() => {
                        commit();
                        setActiveId(document.id);
                      }}
                    >
                      <strong>
                        <span
                          style={{
                            background:
                              !container ||
                              container.backgroundColor === "transparent"
                                ? "#dedbea"
                                : container.backgroundColor,
                          }}
                        />
                        {heading || preview.split("\n")[0] || "未命名片段"}
                      </strong>
                      <p>
                        {preview.replace(/\n/g, " ").trim() || "还没有正文"}
                      </p>
                    </button>
                  );
                })}
            </nav>
          </>
        )}
        {app.props.aiEnabled !== false && (
          <StorySummary app={app} element={active} commit={commit} />
        )}
        <div ref={scrollRef} className="story-writing__scroll">
          <main
            className="story-writing__paper"
            style={{
              fontFamily: getFontFamilyString(active),
              color: active.strokeColor,
            }}
          >
            <input
              aria-label="片段标题"
              placeholder="标题（可选）"
              value={title}
              onChange={(event) => write(event.target.value, body)}
              onBlur={commit}
            />
            <textarea
              ref={bodyRef}
              aria-label="故事正文"
              placeholder="从脑海里的那一幕写起…"
              value={body}
              onChange={(event) => write(title, event.target.value)}
              onBlur={commit}
            />
          </main>
        </div>
      </div>
    );
  }

  // Resolve a bound shape and its label to one document. Grouped, unrelated
  // elements remain separate documents and never get concatenated.
  const targets = new Map<string, ExcalidrawTextElement>();
  for (const element of selectedElements) {
    const target = isTextElement(element)
      ? element
      : isScrollableTextContainer(element)
      ? getBoundTextElement(element, elementsMap)
      : null;
    if (target && documents.some((document) => document.id === target.id)) {
      targets.set(target.id, target);
    }
  }
  const document = targets.size === 1 ? [...targets.values()][0] : null;
  const selected = document
    ? getContainerElement(document, elementsMap) || document
    : null;
  const state = app.state;
  if (
    !selected ||
    !document?.originalText.trim() ||
    selectedElements.some(
      (element) => element.id !== document.id && element.id !== selected.id,
    ) ||
    selected.locked ||
    state.viewModeEnabled ||
    state.editingTextElement ||
    state.selectedElementsAreBeingDragged ||
    state.isResizing ||
    state.isRotating ||
    state.newElement
  ) {
    return null;
  }
  const [x1, y1, x2, y2] = getElementBounds(selected, elementsMap);
  const topLeft = sceneCoordsToViewportCoords(
    { sceneX: x1, sceneY: y1 },
    state,
  );
  const bottomRight = sceneCoordsToViewportCoords(
    { sceneX: x2, sceneY: y2 },
    state,
  );
  const right = bottomRight.x - state.offsetLeft;
  const top = topLeft.y - state.offsetTop;
  // Fixed to the selected object's upper-right, never to text measurements.
  // Clamp only at viewport edges so the control remains reachable.
  const left = Math.max(8, Math.min(state.width - 44, right + 12));
  const y = Math.max(8, Math.min(state.height - 44, top - 48));
  if (
    right < 0 ||
    top > state.height ||
    bottomRight.y < state.offsetTop ||
    topLeft.x > state.offsetLeft + state.width
  ) {
    return null;
  }
  return (
    <>
      <StoryViewToggle
        app={app}
        element={document}
        style={{
          left: Math.max(8, right - 145),
          top: Math.min(
            state.height - 40,
            bottomRight.y - state.offsetTop - 32,
          ),
        }}
      />
      <button
        ref={returnFocusRef}
        className="story-writing-entry"
        style={{ left, top: y }}
        aria-label="展开写作"
        title="展开写作"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          commit();
          setDirectoryOpen(false);
          setActiveId(document.id);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M4 4l5 5m6 0 5-5m0 16-5-5M9 15l-5 5" />
        </svg>
      </button>
    </>
  );
};
