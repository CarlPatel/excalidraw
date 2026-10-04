/**
 * pasteSelectedStyles.test.tsx
 * Tests for selective paste styles: per-category transfer, compatibility
 * rules, bound labels, undo, the panel control, and equivalence with the
 * ordinary paste-styles command on a shared fixture drawing.
 * Author: Akilesh Srinivasa Kumar
 * Date: 2026-10-04
 */
import React from "react";

import {
  COLOR_PALETTE,
  DEFAULT_STICKY_NOTE_SIZE,
  DEFAULT_FONT_FAMILY,
  ROUNDNESS,
  STROKE_WIDTH,
} from "@excalidraw/common";

import { CaptureUpdateAction, isNonDeletedElement } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { actionPasteSelectedStyles } from "../actions/actionPasteSelectedStyles";
import { actionCopyStyles, actionPasteStyles } from "../actions/actionStyles";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { act, fireEvent, render, screen } from "./test-utils";

import type { StyleCategory } from "../actions/actionStyles";

const { h } = window;

const RED = COLOR_PALETTE.red[4];
const BLUE = COLOR_PALETTE.blue[1];
const GREEN = COLOR_PALETTE.green[4];
const SOURCE_FONT_SIZE = 36;
const SOURCE_OPACITY = 60;

/** fields that change on every write and say nothing about styles */
const VOLATILE_FIELDS = ["version", "versionNonce", "updated"] as const;

const getElement = (id: string): NonDeletedExcalidrawElement => {
  const element = h.elements
    .filter(isNonDeletedElement)
    .find((el) => el.id === id);
  if (!element) {
    throw new Error(`no element with id "${id}"`);
  }
  return element;
};

const withoutVolatileFields = (element: ExcalidrawElement) => {
  const rest: Record<string, unknown> = { ...element };
  for (const field of VOLATILE_FIELDS) {
    delete rest[field];
  }
  return rest;
};

const sceneSnapshot = () => h.elements.map(withoutVolatileFields);

/** every property a paste can write, i.e. an element's appearance */
const STYLE_FIELDS = [
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "roughness",
  "opacity",
  "roundness",
  "startArrowhead",
  "endArrowhead",
  "fontSize",
  "fontFamily",
  "textAlign",
  "lineHeight",
] as const;

const appearanceSnapshot = () =>
  h.elements.map((element) => {
    const fields: Record<string, unknown> = { id: element.id };
    for (const field of STYLE_FIELDS) {
      fields[field] = (element as Record<string, unknown>)[field];
    }
    return fields;
  });

/** a container with a bound text label, styled per `overrides` */
const createLabelled = (
  type: "rectangle" | "stickynote",
  id: string,
  x: number,
  label: Partial<{ fontSize: number; strokeColor: string }> = {},
  overrides: Parameters<typeof API.createElement>[0] = {},
) => [
  API.createElement({
    type,
    id,
    x,
    y: 0,
    width: DEFAULT_STICKY_NOTE_SIZE,
    height: DEFAULT_STICKY_NOTE_SIZE,
    ...(type === "stickynote" && { baseHeight: DEFAULT_STICKY_NOTE_SIZE }),
    boundElements: [{ type: "text", id: `${id}-label` }],
    ...overrides,
  }),
  API.createElement({
    type: "text",
    id: `${id}-label`,
    x: x + 10,
    y: 10,
    text: id,
    containerId: id,
    fontSize: label.fontSize ?? 20,
    strokeColor: label.strokeColor ?? COLOR_PALETTE.black,
  }),
];

const SOURCE_STYLE = {
  strokeColor: RED,
  backgroundColor: BLUE,
  fillStyle: "cross-hatch",
  strokeWidth: STROKE_WIDTH.bold,
  strokeStyle: "dotted",
  roughness: 2,
  opacity: SOURCE_OPACITY,
  roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
} as const;

/** a styled, labelled rectangle to copy from */
const createSource = () =>
  createLabelled(
    "rectangle",
    "source",
    -400,
    { fontSize: SOURCE_FONT_SIZE, strokeColor: GREEN },
    SOURCE_STYLE,
  );

/** an arrow source, so arrowhead transfer is covered too */
const createArrowSource = () => [
  API.createElement({
    type: "arrow",
    id: "source",
    x: -400,
    y: 0,
    ...SOURCE_STYLE,
    roundness: { type: ROUNDNESS.PROPORTIONAL_RADIUS },
    startArrowhead: "circle",
    endArrowhead: "triangle",
  }),
];

/** destinations: text, arrows, frames, sticky notes and bound labels */
const DESTINATION_IDS = ["rect", "text", "arrow", "frame", "note"];

const createDestinations = () => [
  ...createLabelled("rectangle", "rect", 0),
  API.createElement({ type: "text", id: "text", x: 300, y: 0, text: "t" }),
  API.createElement({
    type: "arrow",
    id: "arrow",
    x: 0,
    y: 300,
    endArrowhead: "arrow",
  }),
  API.createElement({ type: "frame", id: "frame", x: 600, y: 300 }),
  ...createLabelled("stickynote", "note", 600, { fontSize: 28 }),
];

const setUpScene = (source: readonly ExcalidrawElement[]) => {
  // captured, so history has a baseline to undo back to
  API.updateScene({
    elements: [...source, ...createDestinations()],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  API.setSelectedElements([getElement("source")]);
  API.executeAction(actionCopyStyles);
};

const selectByIds = (ids: readonly string[]) =>
  API.setSelectedElements(ids.map(getElement));

const pasteCategories = (categories: readonly StyleCategory[]) => {
  act(() => {
    h.app.actionManager.executeAction(actionPasteSelectedStyles, "api", {
      categories,
    });
  });
};

describe("paste selected styles", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  afterEach(async () => {
    await act(async () => {});
  });

  describe("all categories equal the ordinary paste styles command", () => {
    it.each([
      ["a labelled rectangle", createSource],
      ["an arrow", createArrowSource],
    ])("on the shared fixture, copying from %s", (_, createFrom) => {
      setUpScene(createFrom());
      selectByIds(DESTINATION_IDS);
      API.executeAction(actionPasteStyles);
      const ordinary = sceneSnapshot();

      setUpScene(createFrom());
      selectByIds(DESTINATION_IDS);
      pasteCategories(["colors", "stroke", "text"]);

      expect(sceneSnapshot()).toEqual(ordinary);
    });
  });

  describe("single categories", () => {
    beforeEach(() => {
      setUpScene(createSource());
    });

    it("colors changes only stroke and background color", () => {
      const before = getElement("rect");
      selectByIds(["rect"]);
      pasteCategories(["colors"]);

      expect(getElement("rect")).toEqual(
        expect.objectContaining({
          ...withoutVolatileFields(before),
          strokeColor: RED,
          backgroundColor: BLUE,
        }),
      );
    });

    it("stroke settings change stroke props but leave colors", () => {
      const before = getElement("rect");
      selectByIds(["rect"]);
      pasteCategories(["stroke"]);

      expect(getElement("rect")).toEqual(
        expect.objectContaining({
          ...withoutVolatileFields(before),
          fillStyle: "cross-hatch",
          strokeWidth: STROKE_WIDTH.bold,
          strokeStyle: "dotted",
          roughness: 2,
          opacity: SOURCE_OPACITY,
          roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
        }),
      );
    });

    it("text formatting changes font props but leaves colors and stroke", () => {
      const before = getElement("text");
      selectByIds(["text"]);
      pasteCategories(["text"]);

      const text = getElement("text");
      expect(text).toEqual(
        expect.objectContaining({
          strokeColor: before.strokeColor,
          backgroundColor: before.backgroundColor,
          strokeWidth: before.strokeWidth,
          opacity: before.opacity,
          // a standalone text takes the copied shape's (default) text props,
          // exactly as ordinary paste does
          fontFamily: DEFAULT_FONT_FAMILY,
        }),
      );
    });
  });

  describe("mixed selections and compatibility", () => {
    beforeEach(() => {
      setUpScene(createSource());
    });

    it("applies colors + text to a mixed shape/text selection", () => {
      const rectBefore = getElement("rect");
      selectByIds(["rect", "text"]);
      pasteCategories(["colors", "text"]);

      const rect = getElement("rect");
      expect(rect.strokeColor).toBe(RED);
      expect(rect.strokeWidth).toBe(rectBefore.strokeWidth);
      expect(rect.roughness).toBe(rectBefore.roughness);
      expect(getElement("text").strokeColor).toBe(RED);
    });

    it("leaves a shape untouched when only text formatting is pasted", () => {
      const before = getElement("arrow");
      selectByIds(["arrow"]);
      pasteCategories(["text"]);

      expect(getElement("arrow")).toBe(before);
    });

    it("keeps a frame's own rules: no fill, no roundness", () => {
      selectByIds(["frame"]);
      pasteCategories(["colors", "stroke"]);

      const frame = getElement("frame");
      expect(frame.backgroundColor).toBe("transparent");
      expect(frame.roundness).toBeNull();
      expect(frame.strokeColor).toBe(RED);
    });

    it("keeps arrowheads when the source is not an arrow", () => {
      selectByIds(["arrow"]);
      pasteCategories(["stroke"]);

      const arrow = getElement("arrow");
      expect(arrow.type === "arrow" && arrow.endArrowhead).toBe("arrow");
      expect(arrow.strokeStyle).toBe("dotted");
    });

    it("keeps a sticky note solid-filled when stroke settings are pasted", () => {
      selectByIds(["note"]);
      pasteCategories(["stroke"]);

      expect(getElement("note").fillStyle).toBe("solid");
    });
  });

  describe("bound labels", () => {
    beforeEach(() => {
      setUpScene(createSource());
    });

    it("colors take the label color from the copied label", () => {
      const labelBefore = getElement("rect-label");
      selectByIds(["rect"]);
      pasteCategories(["colors"]);

      const label = getElement("rect-label");
      expect(label.strokeColor).toBe(GREEN);
      expect(label.type === "text" && label.fontSize).toBe(
        labelBefore.type === "text" && labelBefore.fontSize,
      );
    });

    it("text formatting takes the font from the copied label only", () => {
      selectByIds(["rect"]);
      pasteCategories(["text"]);

      const label = getElement("rect-label");
      expect(label.type === "text" && label.fontSize).toBe(SOURCE_FONT_SIZE);
      expect(label.strokeColor).toBe(COLOR_PALETTE.black);
      expect(getElement("rect").strokeColor).not.toBe(RED);
    });
  });

  describe("history", () => {
    beforeEach(() => {
      setUpScene(createSource());
    });

    it("an empty choice changes nothing and records no undo step", () => {
      selectByIds(DESTINATION_IDS);
      const before = sceneSnapshot();
      const undoDepth = API.getUndoStack().length;

      pasteCategories([]);

      expect(sceneSnapshot()).toEqual(before);
      expect(API.getUndoStack().length).toBe(undoDepth);
    });

    it("one undo restores the selection's previous appearance", () => {
      selectByIds(DESTINATION_IDS);
      const before = appearanceSnapshot();

      pasteCategories(["colors", "text"]);
      expect(getElement("rect").strokeColor).toBe(RED);

      Keyboard.undo();

      // geometry is left out: undo re-lays out bound text, which this
      // fixture deliberately creates without a prior layout
      expect(appearanceSnapshot()).toEqual(before);
    });
  });

  describe("panel control", () => {
    it("pastes only the categories left checked", () => {
      setUpScene(createSource());
      selectByIds(["rect"]);
      const before = getElement("rect");

      fireEvent.click(screen.getByTestId("paste-selected-styles-button"));
      fireEvent.click(screen.getByText("Stroke settings"));
      fireEvent.click(screen.getByText("Submit"));

      const rect = getElement("rect");
      expect(rect.strokeColor).toBe(RED);
      expect(rect.strokeWidth).toBe(before.strokeWidth);
    });

    it("disables submit when every category is unchecked", () => {
      setUpScene(createSource());
      selectByIds(["rect"]);

      fireEvent.click(screen.getByTestId("paste-selected-styles-button"));
      for (const label of ["Colors", "Stroke settings", "Text formatting"]) {
        fireEvent.click(screen.getByText(label));
      }

      expect(screen.getByText("Submit").closest("button")).toBeDisabled();
    });
  });
});
