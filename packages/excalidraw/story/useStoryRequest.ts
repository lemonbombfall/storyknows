import { useEffect, useRef, useState } from "react";

import { requestStoryAI } from "./client";

import type { StoryRequest } from "./schema";
import type App from "../components/App";

export const useStoryRequest = (app: App) => {
  const pending = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const cancel = () => {
    pending.current?.abort();
    pending.current = null;
    setRunning(false);
  };
  useEffect(() => () => pending.current?.abort(), []);
  const run = async (request: StoryRequest) => {
    pending.current?.abort();
    const controller = new app.ownerWindow.AbortController();
    pending.current = controller;
    setRunning(true);
    setError("");
    try {
      const result = await requestStoryAI(request, controller.signal);
      return pending.current === controller && !controller.signal.aborted
        ? result
        : null;
    } catch (error) {
      if (pending.current === controller && !controller.signal.aborted) {
        setError(error instanceof Error ? error.message : "生成失败，请重试");
      }
      return null;
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setRunning(false);
      }
    }
  };
  return { running, error, setError, cancel, run };
};
