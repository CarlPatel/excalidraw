/**
 * actionPasteSelectedStyles.tsx
 * "Paste selected styles" action: a properties-panel control that pastes only
 * the chosen style categories, through the same path as ordinary paste.
 * Author: Akilesh Srinivasa Kumar
 * Date: 2026-10-04
 */
import { useState } from "react";

import { getNonDeletedElements } from "@excalidraw/element";

import { Button } from "../components/Button";
import { CheckboxItem } from "../components/CheckboxItem";
import { IconButton } from "../components/IconButton";
import { paintIcon } from "../components/icons";

import { t } from "../i18n";
import { isSomeElementSelected } from "../scene";

import { STYLE_CATEGORIES, hasCopiedStyles, pasteStyles } from "./actionStyles";
import { register } from "./register";

import type { StyleCategory } from "./actionStyles";

export type PasteSelectedStylesData = {
  readonly categories: readonly StyleCategory[];
};

const CATEGORY_LABEL_KEYS: Readonly<
  Record<StyleCategory, Parameters<typeof t>[0]>
> = {
  colors: "labels.pasteStyleColors",
  stroke: "labels.pasteStyleStroke",
  text: "labels.pasteStyleText",
};

const PasteStylesOptionsForm = ({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (data: PasteSelectedStylesData) => void;
}) => {
  const [checked, setChecked] = useState<ReadonlySet<StyleCategory>>(
    () => new Set(STYLE_CATEGORIES),
  );

  const toggle = (category: StyleCategory, isChecked: boolean) => {
    const next = new Set(checked);
    if (isChecked) {
      next.add(category);
    } else {
      next.delete(category);
    }
    setChecked(next);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        // keep the canonical order so the result never depends on click order
        onSubmit({
          categories: STYLE_CATEGORIES.filter((category) =>
            checked.has(category),
          ),
        });
      }}
    >
      <fieldset>
        <legend>{t("labels.pasteSelectedStyles")}</legend>
        {STYLE_CATEGORIES.map((category) => (
          <CheckboxItem
            key={category}
            checked={checked.has(category)}
            onChange={(isChecked) => toggle(category, isChecked)}
          >
            {t(CATEGORY_LABEL_KEYS[category])}
          </CheckboxItem>
        ))}
        <div className="buttonList duplicate-selection-actions">
          <Button type="submit" onSelect={() => {}} disabled={!checked.size}>
            {t("buttons.submit")}
          </Button>
          <Button type="button" onSelect={onCancel}>
            {t("buttons.cancel")}
          </Button>
        </div>
      </fieldset>
    </form>
  );
};

export const actionPasteSelectedStyles = register<PasteSelectedStylesData>({
  name: "pasteSelectedStyles",
  label: "labels.pasteSelectedStyles",
  icon: paintIcon,
  trackEvent: { category: "element" },
  perform: (elements, appState, formData, app) =>
    // without form data (e.g. via the API) it behaves like ordinary paste
    pasteStyles(
      elements,
      appState,
      app,
      formData?.categories ?? STYLE_CATEGORIES,
    ),
  PanelComponent: ({ elements, appState, updateData }) => {
    const [isFormOpen, setIsFormOpen] = useState(false);

    if (isFormOpen) {
      return (
        <PasteStylesOptionsForm
          onCancel={() => setIsFormOpen(false)}
          onSubmit={(data) => {
            setIsFormOpen(false);
            updateData(data);
          }}
        />
      );
    }

    return (
      <IconButton
        type="button"
        icon={paintIcon}
        title={t("labels.pasteSelectedStyles")}
        aria-label={t("labels.pasteSelectedStyles")}
        data-testid="paste-selected-styles-button"
        onClick={() => setIsFormOpen(true)}
        disabled={
          !hasCopiedStyles() ||
          !isSomeElementSelected(getNonDeletedElements(elements), appState)
        }
      />
    );
  },
});
