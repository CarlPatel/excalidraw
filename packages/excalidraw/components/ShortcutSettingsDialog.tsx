import { useEffect, useState } from "react";

import { KEYS } from "@excalidraw/common";

import {
  CONFIGURABLE_SHORTCUT_NAMES,
  createShortcutKeyboardEvent,
  getDefaultShortcutBinding,
  getShortcutBindingLabel,
  resetAllShortcutBindings,
  resetShortcutBinding,
  setShortcutBinding,
  setShortcutRecording,
  shortcutBindingSignature,
  useShortcutBindings,
} from "../actions/shortcutBindings";

import { t } from "../i18n";

import { useExcalidrawActionManager } from "./App";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

import "./ShortcutSettingsDialog.scss";

import type {
  ConfigurableShortcutName,
  ShortcutBinding,
} from "../actions/shortcutBindings";
import type { TranslationKeys } from "../i18n";

const getCommandLabel = (name: ConfigurableShortcutName) => {
  switch (name) {
    case "gridMode":
      return t("shortcutSettings.commands.gridMode");
    case "zenMode":
      return t("shortcutSettings.commands.zenMode");
    case "viewMode":
      return t("shortcutSettings.commands.viewMode");
    case "stats":
      return t("shortcutSettings.commands.stats");
  }
};

export const ShortcutSettingsDialog = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const actionManager = useExcalidrawActionManager();
  const bindings = useShortcutBindings();
  const [selectedName, setSelectedName] =
    useState<ConfigurableShortcutName>("gridMode");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  useEffect(() => {
    return () => setShortcutRecording(actionManager.app, false);
  }, [actionManager.app]);

  const stopRecording = () => {
    setIsRecording(false);
    setShortcutRecording(actionManager.app, false);
  };

  const startRecording = () => {
    setRecordingError(null);
    setIsRecording(true);
    setShortcutRecording(actionManager.app, true);
  };

  const onRecordKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!isRecording) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.key === KEYS.ESCAPE) {
      stopRecording();
      return;
    }

    if (["Alt", "Control", "Meta", "Shift"].includes(event.key)) {
      return;
    }

    const candidate: ShortcutBinding = {
      code: event.code,
      ctrlOrCmd: event[KEYS.CTRL_OR_CMD],
      alt: event.altKey,
      shift: event.shiftKey,
    };

    if (!candidate.code || (!candidate.ctrlOrCmd && !candidate.alt)) {
      setRecordingError(t("shortcutSettings.modifierRequirement"));
      return;
    }

    const usedByConfigurable = CONFIGURABLE_SHORTCUT_NAMES.find(
      (name) =>
        name !== selectedName &&
        shortcutBindingSignature(bindings[name]) ===
          shortcutBindingSignature(candidate),
    );
    const fixedActions = actionManager.getMatchingActions(
      createShortcutKeyboardEvent(candidate),
      new Set(CONFIGURABLE_SHORTCUT_NAMES),
    );
    const conflicts = [
      ...(usedByConfigurable ? [getCommandLabel(usedByConfigurable)] : []),
      ...fixedActions.map((action) =>
        typeof action.label === "string"
          ? t(action.label as TranslationKeys)
          : action.name,
      ),
    ];

    if (conflicts.length) {
      setRecordingError(
        t("shortcutSettings.conflict", {
          command: [...new Set(conflicts)].join(", "),
        }),
      );
      return;
    }

    setShortcutBinding(selectedName, candidate);
    setRecordingError(null);
    stopRecording();
  };

  const resetSelectedBinding = () => {
    stopRecording();
    resetShortcutBinding(selectedName);
    setRecordingError(null);
  };

  const resetAllBindings = () => {
    stopRecording();
    resetAllShortcutBindings();
    setRecordingError(null);
  };

  return (
    <Dialog
      className="ShortcutSettingsDialog"
      title={t("shortcutSettings.title")}
      onCloseRequest={() => {
        stopRecording();
        onClose();
      }}
    >
      <div className="ShortcutSettingsDialog__content">
        <label className="ShortcutSettingsDialog__command">
          {t("shortcutSettings.command")}
          <select
            value={selectedName}
            onChange={(event) => {
              setSelectedName(event.target.value as ConfigurableShortcutName);
              setRecordingError(null);
              if (isRecording) {
                stopRecording();
              }
            }}
          >
            {CONFIGURABLE_SHORTCUT_NAMES.map((name) => (
              <option key={name} value={name}>
                {getCommandLabel(name)}
              </option>
            ))}
          </select>
        </label>
        <div className="ShortcutSettingsDialog__current">
          <span>{t("shortcutSettings.current")}</span>
          <kbd>{getShortcutBindingLabel(bindings[selectedName])}</kbd>
        </div>
        <div className="ShortcutSettingsDialog__actions">
          <Button
            onSelect={startRecording}
            onKeyDown={onRecordKeyDown}
            aria-pressed={isRecording}
          >
            {isRecording
              ? t("shortcutSettings.recording")
              : t("shortcutSettings.record")}
          </Button>
          {isRecording && (
            <Button onSelect={stopRecording}>
              {t("shortcutSettings.cancelRecording")}
            </Button>
          )}
          <Button onSelect={resetSelectedBinding}>
            {t("shortcutSettings.resetBinding")}
          </Button>
          <Button onSelect={resetAllBindings}>
            {t("shortcutSettings.resetAll")}
          </Button>
        </div>
        {recordingError && (
          <p className="ShortcutSettingsDialog__error" role="alert">
            {recordingError}
          </p>
        )}
        <div className="ShortcutSettingsDialog__default">
          {t("shortcutSettings.default")}:&nbsp;
          <kbd>
            {getShortcutBindingLabel(getDefaultShortcutBinding(selectedName))}
          </kbd>
        </div>
      </div>
    </Dialog>
  );
};
