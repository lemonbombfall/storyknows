import { EventEmitter } from "node:events";

import { createStoryAIHandler } from "../../../api/story-ai";

import type { IncomingMessage, ServerResponse } from "node:http";

const request = {
  task: "summary",
  action: "organize",
  structure: "four",
  sources: [{ id: "source", title: "", body: "女孩在书店避雨。" }],
};
let address = 0;
const invoke = async (body: unknown, key = "mock-key") => {
  const req = {
    method: "POST",
    headers: { host: "localhost", origin: "http://localhost" },
    socket: { remoteAddress: `test-${address++}` },
    body,
  } as IncomingMessage & { body?: unknown };
  let output = "";
  const res = Object.assign(new EventEmitter(), {
    destroyed: false,
    writableEnded: false,
    statusCode: 0,
    setHeader: vi.fn(),
    end: (value: string) => {
      output = value;
    },
  });
  await createStoryAIHandler({ DEEPSEEK_API_KEY: key })(
    req,
    res as unknown as ServerResponse,
  );
  return { status: res.statusCode, body: JSON.parse(output) };
};
afterEach(() => vi.restoreAllMocks());
it("returns a clear unconfigured response without calling the model", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  expect((await invoke(request, "")).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
it("validates the request before contacting the model", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  expect((await invoke({ ...request, sources: [] })).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it("retries an oversized summary and returns only validated content", async () => {
  const result = { name: "雨中", body: "女孩在书店避雨。" };
  const response = (content: unknown) =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(content) } }],
      }),
    );
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(response({ ...result, body: "字".repeat(121) }))
    .mockResolvedValueOnce(response(result));
  expect(await invoke(request)).toEqual({ status: 200, body: result });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("does not return upstream error details or credentials", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("mock-key internal error", { status: 500 }),
  );
  const result = await invoke(request);
  expect(result.status).toBe(400);
  expect(JSON.stringify(result)).not.toContain("mock-key");
});
