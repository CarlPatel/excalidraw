/**
 * actionStyles.ts
 * Copy/paste styles actions and the shared, category-aware style-transfer
 * path used by both ordinary and selective paste.
 * Author: Excalidraw contributors; selective paste by Akilesh Srinivasa Kumar
 * Date: 2026-10-04
 */
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_TEXT_ALIGN,
  CODES,
  KEYS,
  getLineHeight,
  arrayToMap,
} from "@excalidraw/common";

import { newElementWith, syncStickyNoteInk } from "@excalidraw/element";

import {
  normalizeStickyNote,
  hasBoundTextElement,
  canApplyRoundnessTypeToElement,
  getDefaultRoundnessTypeForElement,
  isFrameLikeElement,
  isArrowElement,
  isExcalidrawElement,
  getColorUpdate,
  isNonDeletedElement,
  isStickyNoteBoundText,
  isStickyNoteElement,
  isTextElement,
  getBaseFontSize,
  getBaseFontSizeUpdate,
  relayoutStickyNotes,
  updateBoundElements,
} from "@excalidraw/element";

import {
  getBoundTextElement,
  redrawTextBoundingBox,
} from "@excalidraw/element";

import { CaptureUpdateAction } from "@excalidraw/element";

import type {
  ElementsMap,
  ExcalidrawElement,
  ExcalidrawTextElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";

import { paintIcon } from "../components/icons";

import { t } from "../i18n";
import { getSelectedElements } from "../scene";

import { register } from "./register";

import type { AppClassProperties, AppState } from "../types";
import type { ActionResult } from "./types";

/** the style groups a paste can be limited to */
export type StyleCategory = "colors" | "stroke" | "text";

export const STYLE_CATEGORIES: readonly StyleCategory[] = [
  "colors",
  "stroke",
  "text",
];

// `copiedStyles` is exported only for tests.
export let copiedStyles: string = "{}";

export const hasCopiedStyles = (): boolean => {
  const elementsCopied: unknown = JSON.parse(copiedStyles);
  return (
    Array.isArray(elementsCopied) && isExcalidrawElement(elementsCopied[0])
  );
};

type PasteContext = {
  readonly categories: ReadonlySet<StyleCategory>;
  readonly elementsMap: ElementsMap;
  readonly copiedElementsMap: ElementsMap;
  readonly selectedElements: readonly ExcalidrawElement[];
  readonly app: AppClassProperties;
};

/** colors and stroke settings — the properties every element type carries */
const getShapeStyleUpdates = (
  element: ExcalidrawElement,
  source: ExcalidrawElement,
  categories: ReadonlySet<StyleCategory>,
) => ({
  ...(categories.has("colors") && {
    backgroundColor: source.backgroundColor,
    strokeColor: source.strokeColor,
  }),
  ...(categories.has("stroke") && {
    strokeWidth: source.strokeWidth,
    strokeStyle: source.strokeStyle,
    fillStyle: source.fillStyle,
    opacity: source.opacity,
    roughness: source.roughness,
    roundness: source.roundness
      ? canApplyRoundnessTypeToElement(source.roundness.type, element)
        ? source.roundness
        : getDefaultRoundnessTypeForElement(element)
      : null,
  }),
});

const getTextFormattingUpdates = (
  element: ExcalidrawTextElement,
  source: ExcalidrawElement,
  ctx: PasteContext,
) => {
  // a non-text source has no text props, so the defaults below apply
  const sourceText = source as ExcalidrawTextElement;
  const fontSize =
    (isTextElement(source)
      ? getBaseFontSize(source, ctx.copiedElementsMap)
      : sourceText.fontSize) || DEFAULT_FONT_SIZE;
  const fontFamily = sourceText.fontFamily || DEFAULT_FONT_FAMILY;
  return {
    ...getBaseFontSizeUpdate(element, fontSize, ctx.elementsMap),
    fontFamily,
    textAlign: sourceText.textAlign || DEFAULT_TEXT_ALIGN,
    lineHeight: sourceText.lineHeight || getLineHeight(fontFamily),
  };
};

const applyTextStyles = (
  element: ExcalidrawTextElement,
  source: ExcalidrawElement,
  ctx: PasteContext,
): ExcalidrawTextElement => {
  const newElement = ctx.categories.has("text")
    ? newElementWith(element, getTextFormattingUpdates(element, source, ctx))
    : element;

  if (isStickyNoteBoundText(newElement, ctx.elementsMap)) {
    // the copied stroke may be transparent; a note's label never is
    return ctx.categories.has("colors")
      ? newElementWith(
          newElement,
          getColorUpdate(
            newElement,
            "strokeColor",
            newElement.strokeColor,
            ctx.elementsMap,
          ),
        )
      : newElement;
  }
  if (ctx.categories.has("text")) {
    // sticky labels are laid out together with their (possibly also
    // restyled) note in the post-pass of `pasteStyles`
    const container =
      ctx.selectedElements.find((el) => el.id === newElement.containerId) ||
      null;
    redrawTextBoundingBox(newElement, container, ctx.app.scene);
  }
  return newElement;
};

/** element-specific rules that run after the generic property transfer */
const applyElementSpecificStyles = (
  element: ExcalidrawElement,
  source: ExcalidrawElement,
  categories: ReadonlySet<StyleCategory>,
): ExcalidrawElement => {
  let newElement = element;
  if (
    categories.has("stroke") &&
    newElement.type === "arrow" &&
    isArrowElement(source)
  ) {
    newElement = newElementWith(newElement, {
      startArrowhead: source.startArrowhead,
      endArrowhead: source.endArrowhead,
    });
  }
  if (isFrameLikeElement(newElement)) {
    newElement = newElementWith(newElement, {
      ...(categories.has("stroke") && { roundness: null }),
      ...(categories.has("colors") && { backgroundColor: "transparent" }),
    });
  }
  if (isStickyNoteElement(newElement)) {
    newElement = normalizeStickyNote(newElement);
  }
  return newElement;
};

/**
 * Applies the chosen style categories of `source` to one destination element.
 * This is the single compatibility path for ordinary and selective paste.
 */
const applyStylesToElement = (
  element: ExcalidrawElement,
  source: ExcalidrawElement,
  ctx: PasteContext,
): ExcalidrawElement => {
  let newElement = newElementWith(
    element,
    getShapeStyleUpdates(element, source, ctx.categories),
  );
  if (isTextElement(newElement)) {
    newElement = applyTextStyles(newElement, source, ctx);
  }
  return applyElementSpecificStyles(newElement, source, ctx.categories);
};

/** a restyled note may have grown or shrunk — arrows bound to it follow */
const updateArrowsBoundToResizedNotes = (
  nextElements: readonly ExcalidrawElement[],
  prevElementsMap: ElementsMap,
  app: AppClassProperties,
) => {
  for (const element of nextElements) {
    const prev = prevElementsMap.get(element.id);
    if (
      isStickyNoteElement(element) &&
      isNonDeletedElement(element) &&
      prev &&
      (prev.height !== element.height ||
        prev.x !== element.x ||
        prev.y !== element.y)
    ) {
      updateBoundElements(element, app.scene);
    }
  }
};

/**
 * Pastes the copied styles onto the selection, limited to `categories`.
 * Ordinary paste styles is this function with every category.
 */
export const pasteStyles = (
  elements: readonly OrderedExcalidrawElement[],
  appState: Readonly<AppState>,
  app: AppClassProperties,
  categories: readonly StyleCategory[],
): ActionResult => {
  const elementsCopied: unknown[] = JSON.parse(copiedStyles);
  const [pastedElement, copiedBoundText] = elementsCopied;
  if (!isExcalidrawElement(pastedElement)) {
    return { elements, captureUpdate: CaptureUpdateAction.EVENTUALLY };
  }
  if (!categories.length) {
    // nothing to paste: no scene change and no undo entry
    return false;
  }

  const selectedElements = getSelectedElements(elements, appState, {
    includeBoundTextElement: true,
  });
  const selectedElementIds = new Set(selectedElements.map((el) => el.id));
  const elementsMap = arrayToMap(elements);
  const ctx: PasteContext = {
    categories: new Set(categories),
    elementsMap,
    // whether the copied text was a sticky label is decided by the copied
    // snapshot — its container may be gone from the live scene by now
    copiedElementsMap: arrayToMap(elementsCopied.filter(isExcalidrawElement)),
    selectedElements,
    app,
  };

  const restyledElements = elements.map((element) => {
    if (!selectedElementIds.has(element.id)) {
      return element;
    }
    // bound text takes its styles from the copied label, if there was one
    const source =
      isTextElement(element) && element.containerId
        ? copiedBoundText
        : pastedElement;
    return isExcalidrawElement(source)
      ? applyStylesToElement(element, source, ctx)
      : element;
  });

  const nextElements = relayoutStickyNotes(
    // a restyled note and its label end up with one ink — the label's,
    // when the copied styles carry two colors
    syncStickyNoteInk(restyledElements, elementsMap),
    selectedElementIds,
    { prevElementsMap: elementsMap },
  );
  updateArrowsBoundToResizedNotes(nextElements, elementsMap, app);

  return {
    elements: nextElements,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  };
};

export const actionCopyStyles = register({
  name: "copyStyles",
  label: "labels.copyStyles",
  icon: paintIcon,
  trackEvent: { category: "element" },
  perform: (elements, appState, formData, app) => {
    const elementsCopied = [];
    const element = elements.find((el) => appState.selectedElementIds[el.id]);
    elementsCopied.push(element);
    if (element && hasBoundTextElement(element)) {
      const boundTextElement = getBoundTextElement(
        element,
        app.scene.getNonDeletedElementsMap(),
      );
      elementsCopied.push(boundTextElement);
    }
    if (element) {
      copiedStyles = JSON.stringify(elementsCopied);
    }
    return {
      appState: {
        ...appState,
        toast: { message: t("toast.copyStyles") },
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  keyTest: (event) =>
    event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.C,
});

export const actionPasteStyles = register({
  name: "pasteStyles",
  label: "labels.pasteStyles",
  icon: paintIcon,
  trackEvent: { category: "element" },
  perform: (elements, appState, formData, app) =>
    pasteStyles(elements, appState, app, STYLE_CATEGORIES),
  keyTest: (event) =>
    event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.V,
});
