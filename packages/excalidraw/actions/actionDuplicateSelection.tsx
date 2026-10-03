import { useState } from "react";

import {
  DEFAULT_GRID_SIZE,
  KEYS,
  MOBILE_ACTION_BUTTON_BG,
  arrayToMap,
} from "@excalidraw/common";

import { getNonDeletedElements } from "@excalidraw/element";

import { LinearElementEditor } from "@excalidraw/element";

import {
  getSelectedElements,
  getSelectionStateForElements,
} from "@excalidraw/element";

import { syncMovedIndices } from "@excalidraw/element";

import { duplicateElements } from "@excalidraw/element";
import { repeatDuplicateElements } from "@excalidraw/element";

import { CaptureUpdateAction } from "@excalidraw/element";

import { IconButton } from "../components/IconButton";
import { Button } from "../components/Button";
import { checkIcon, CloseIcon, DuplicateIcon } from "../components/icons";
import { TextField } from "../components/TextField";

import { t } from "../i18n";
import { isSomeElementSelected } from "../scene";
import { getShortcutKey } from "../shortcut";

import { useStylesPanelMode } from "../components/App";

import { register } from "./register";

type RepeatDuplicateSelectionData = {
  count: number;
  offsetX: number;
  offsetY: number;
};

const RepeatDuplicateForm = ({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (data: RepeatDuplicateSelectionData) => void;
}) => {
  const [count, setCount] = useState("1");
  const [offsetX, setOffsetX] = useState(String(DEFAULT_GRID_SIZE / 2));
  const [offsetY, setOffsetY] = useState(String(DEFAULT_GRID_SIZE / 2));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          count: Number(count),
          offsetX: Number(offsetX),
          offsetY: Number(offsetY),
        });
      }}
    >
      <fieldset>
        <legend>{t("labels.duplicateSelection")}</legend>
        <div className="buttonList">
          <TextField
            type="number"
            label={t("labels.duplicateCount")}
            value={count}
            onChange={setCount}
          />
          <TextField
            type="number"
            label={t("labels.duplicateOffsetX")}
            value={offsetX}
            onChange={setOffsetX}
          />
          <TextField
            type="number"
            label={t("labels.duplicateOffsetY")}
            value={offsetY}
            onChange={setOffsetY}
          />
        </div>
        <div className="buttonList">
          <Button type="submit" onSelect={() => {}} aria-label={t("buttons.submit")}>
            {checkIcon}
          </Button>
          <Button onSelect={onCancel} aria-label={t("buttons.cancel")}>
            {CloseIcon}
          </Button>
        </div>
      </fieldset>
    </form>
  );
};

export const actionDuplicateSelection = register<
  RepeatDuplicateSelectionData | null
>({
  name: "duplicateSelection",
  label: "labels.duplicateSelection",
  icon: DuplicateIcon,
  trackEvent: { category: "element" },
  perform: (elements, appState, formData, app) => {
    if (appState.selectedElementsAreBeingDragged) {
      return false;
    }

    // duplicate selected point(s) if editing a line
    if (appState.selectedLinearElement?.isEditing) {
      // TODO: Invariants should be checked here instead of duplicateSelectedPoints()
      try {
        const newAppState = LinearElementEditor.duplicateSelectedPoints(
          appState,
          app.scene,
        );

        return {
          elements,
          appState: newAppState,
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        };
      } catch {
        return false;
      }
    }

    const idsOfElementsToDuplicate = arrayToMap(
      getSelectedElements(elements, appState, {
        includeBoundTextElement: true,
        includeElementsInFrames: true,
      }),
    );

    const result = formData
      ? repeatDuplicateElements({
          elements,
          idsOfElementsToDuplicate,
          appState,
          randomizeSeed: true,
          ...formData,
          overrides: ({ origElement, origIdToDuplicateId }) => {
            const duplicateFrameId =
              origElement.frameId &&
              origIdToDuplicateId.get(origElement.frameId);
            return {
              frameId: duplicateFrameId ?? origElement.frameId,
            };
          },
        })
      : duplicateElements({
          type: "in-place",
          elements,
          idsOfElementsToDuplicate,
          appState,
          randomizeSeed: true,
          overrides: ({ origElement, origIdToDuplicateId }) => {
            const duplicateFrameId =
              origElement.frameId &&
              origIdToDuplicateId.get(origElement.frameId);
            return {
              x: origElement.x + DEFAULT_GRID_SIZE / 2,
              y: origElement.y + DEFAULT_GRID_SIZE / 2,
              frameId: duplicateFrameId ?? origElement.frameId,
            };
          },
        });

    if (result === false) {
      return false;
    }

    let { duplicatedElements, elementsWithDuplicates } = result;

    if (app.props.onDuplicate && elementsWithDuplicates) {
      const mappedElements = app.props.onDuplicate(
        elementsWithDuplicates,
        elements,
      );
      if (mappedElements) {
        elementsWithDuplicates = mappedElements;
      }
    }

    return {
      elements: syncMovedIndices(
        elementsWithDuplicates,
        arrayToMap(duplicatedElements),
      ),
      appState: {
        ...appState,
        ...getSelectionStateForElements(
          duplicatedElements,
          getNonDeletedElements(elementsWithDuplicates),
          appState,
        ),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  keyTest: (event) => event[KEYS.CTRL_OR_CMD] && event.key === KEYS.D,
  PanelComponent: ({ elements, appState, updateData, app }) => {
    const isMobile = useStylesPanelMode() === "mobile";
    const [isRepeatFormOpen, setIsRepeatFormOpen] = useState(false);

    if (isRepeatFormOpen) {
      return (
        <RepeatDuplicateForm
          onCancel={() => setIsRepeatFormOpen(false)}
          onSubmit={(data) => {
            setIsRepeatFormOpen(false);
            updateData(data);
          }}
        />
      );
    }

    return (
      <IconButton
        type="button"
        icon={DuplicateIcon}
        title={`${t("labels.duplicateSelection")} — ${getShortcutKey(
          "CtrlOrCmd+D",
        )}`}
        aria-label={t("labels.duplicateSelection")}
        onClick={() => setIsRepeatFormOpen(true)}
        disabled={
          !isSomeElementSelected(getNonDeletedElements(elements), appState)
        }
        style={{
          ...(isMobile && appState.openPopup !== "compactOtherProperties"
            ? MOBILE_ACTION_BUTTON_BG
            : {}),
        }}
      />
    );
  },
});
