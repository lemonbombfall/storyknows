import { pointFrom, type LocalPoint, type Radians } from "@excalidraw/math";
import {
  convertToExcalidrawElements,
  getCommonBounds,
  newElementWith,
} from "@excalidraw/element";
import { DEFAULT_FONT_FAMILY } from "@excalidraw/common";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { storyStages } from "./schema";

import type { StoryNode, StoryStructure } from "./schema";

export type PlacedStoryNode = StoryNode & {
  x: number;
  y: number;
  color: string;
};
export const placeStoryNodes = (
  nodes: StoryNode[],
  structure: StoryStructure,
  existing: readonly ExcalidrawElement[],
): PlacedStoryNode[] => {
  const bounds = existing.length ? getCommonBounds(existing) : [0, 0, 0, 0];
  const startX = bounds[0];
  const startY = bounds[3] + 180;
  const stages = [...storyStages(structure), "暂未归位", "人物", "设定"];
  const palette =
    structure === "three"
      ? ["#fff0ac", "#ffd9d9", "#d3ebfc"]
      : ["#fff0ac", "#d9f1d2", "#ffd9d9", "#d3ebfc"];
  const rows = new Map<string, number>();
  return nodes.map((node) => {
    const column = stages.indexOf(node.stage);
    const row = rows.get(node.stage) || 0;
    rows.set(node.stage, row + 1);
    return {
      ...node,
      x: startX + column * 330,
      y: startY + [24, 44, 0, 34][column % 4] + row * 390,
      color: palette[column] || "#f0e8f7",
    };
  });
};
export const emptyStoryStages = (
  nodes: PlacedStoryNode[],
  structure: StoryStructure,
) => {
  const stages = storyStages(structure);
  const anchor = nodes[0];
  if (!anchor) {
    return [];
  }
  const allStages = [...stages, "暂未归位", "人物", "设定"];
  const column = allStages.indexOf(anchor.stage);
  const startX = anchor.x - column * 330;
  const startY = anchor.y - [24, 44, 0, 34][column % 4];
  return stages.flatMap((stage, index) =>
    nodes.some((node) => node.stage === stage)
      ? []
      : [
          {
            stage,
            x: startX + index * 330,
            y: startY + [24, 44, 0, 34][index % 4],
          },
        ],
  );
};
/** Shared world-space geometry for preview and adopted reading-order arrows. */
export const storyConnections = (nodes: PlacedStoryNode[]) => {
  const events = nodes.filter((node) => node.kind === "event");
  return events.slice(1).map((node, index) => {
    const previous = events[index];
    const start = { x: previous.x + 135, y: previous.y + 395 };
    const end = { x: node.x + 135, y: node.y + 395 };
    const middle = (start.x + end.x) / 2;
    const points = Array.from({ length: 13 }, (_, step) => {
      const t = step / 12;
      const u = 1 - t;
      return {
        x: u ** 3 * start.x + 3 * u * t * middle + t ** 3 * end.x,
        y:
          (u ** 3 + 3 * u ** 2 * t) * start.y +
          (3 * u * t ** 2 + t ** 3) * end.y,
      };
    });
    return { id: `${previous.id}-${node.id}`, points };
  });
};
export const storyNodeText = (node: StoryNode) =>
  `${node.stage}\n${node.suggested ? "✧ AI 建议\n" : ""}${node.name}\n\n${
    node.body
  }`;
export const createOutlineElements = (
  nodes: PlacedStoryNode[],
  outlineId: string,
  structure?: StoryStructure,
): ExcalidrawElement[] => {
  const elements: ExcalidrawElement[] = [];
  for (const [index, node] of nodes.entries()) {
    const customData = {
      storyknows: {
        version: 1,
        kind: "outline",
        outlineId,
        nodeId: node.id,
        stage: node.stage,
        sourceIds: node.sourceIds,
        suggested: node.suggested,
      },
    };
    const card = convertToExcalidrawElements([
      {
        type: "rectangle",
        x: node.x,
        y: node.y,
        width: 270,
        height: 330,
        backgroundColor: node.color,
        fillStyle: "solid",
        strokeColor: "#343630",
        strokeWidth: 1.5,
        roughness: 1.2,
        roundness: { type: 3 },
        angle: ((index % 2 ? 1 : -1) * 0.012) as Radians,
        customData,
        label: {
          text: storyNodeText(node),
          fontFamily: DEFAULT_FONT_FAMILY,
          fontSize: 18,
          textAlign: "left",
          verticalAlign: "top",
        },
      },
    ]);
    elements.push(
      ...card.map((element) => newElementWith(element, { customData })),
    );
  }
  if (structure) {
    for (const slot of emptyStoryStages(nodes, structure)) {
      elements.push(
        ...convertToExcalidrawElements([
          {
            type: "rectangle",
            x: slot.x,
            y: slot.y,
            width: 270,
            height: 330,
            strokeStyle: "dashed",
            strokeColor: "#b8b1c7",
            opacity: 35,
            roundness: { type: 3 },
            label: { text: slot.stage, fontSize: 22, verticalAlign: "top" },
          },
        ]),
      );
    }
  }
  for (const connection of storyConnections(nodes)) {
    const { x, y } = connection.points[0];
    const xs = connection.points.map((point) => point.x);
    const ys = connection.points.map((point) => point.y);
    elements.push(
      ...convertToExcalidrawElements([
        {
          type: "arrow",
          x,
          y,
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
          points: connection.points.map((point) =>
            pointFrom<LocalPoint>(point.x - x, point.y - y),
          ),
          endArrowhead: "arrow",
          strokeColor: "#8961d6",
          strokeWidth: 2,
          roughness: 1,
          roundness: { type: 2 },
        },
      ]),
    );
  }
  return elements.map((element) =>
    element.customData
      ? element
      : newElementWith(element, {
          customData: {
            storyknows: { version: 1, kind: "decoration", outlineId },
          },
        }),
  );
};
