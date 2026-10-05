import { useSyncExternalStore } from "react";

import { CODES, EDITOR_LS_KEYS, KEYS, isDarwin } from "@excalidraw/common";

import { EditorLocalStorage } from "../data/EditorLocalStorage";

import { getShortcutKey } from "../shortcut";

import type { AppClassProperties, AppState, JSONValue } from "../types";
import type { ActionName } from "./types";
import type React from "react";

export const CONFIGURABLE_SHORTCUT_NAMES = [
  "gridMode",
  "zenMode",
  "viewMode",
  "stats",
] as const;

export type ConfigurableShortcutName =
  typeof CONFIGURABLE_SHORTCUT_NAMES[number];

export type ShortcutBinding = Readonly<{
  code: string;
  ctrlOrCmd: boolean;
  alt: boolean;
  shift: boolean;
}>;

export type ShortcutBindings = Readonly<
  Record<ConfigurableShortcutName, ShortcutBinding>
>;

const DEFAULT_SHORTCUT_BINDINGS: ShortcutBindings = {
  gridMode: {
    code: CODES.QUOTE,
    ctrlOrCmd: true,
    alt: false,
    shift: false,
  },
  zenMode: { code: CODES.Z, ctrlOrCmd: false, alt: true, shift: false },
  viewMode: { code: CODES.R, ctrlOrCmd: false, alt: true, shift: false },
  stats: {
    code: CODES.SLASH,
    ctrlOrCmd: false,
    alt: true,
    shift: false,
  },
};

const listeners = new Set<() => void>();
const recordingApps = new WeakSet<AppClassProperties>();
let bindings: ShortcutBindings | null = null;

const isValidBinding = (value: unknown): value is ShortcutBinding => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const binding = value as Record<string, unknown>;
  return (
    typeof binding.code === "string" &&
    /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(binding.code) &&
    !/^(Alt|Control|Meta|Shift)/.test(binding.code) &&
    typeof binding.ctrlOrCmd === "boolean" &&
    typeof binding.alt === "boolean" &&
    typeof binding.shift === "boolean" &&
    (binding.ctrlOrCmd || binding.alt)
  );
};

const readBindings = (): ShortcutBindings => {
  const stored = EditorLocalStorage.get<JSONValue>(EDITOR_LS_KEYS.SHORTCUTS);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return DEFAULT_SHORTCUT_BINDINGS;
  }

  const result = {} as Record<ConfigurableShortcutName, ShortcutBinding>;
  for (const name of CONFIGURABLE_SHORTCUT_NAMES) {
    const value = (stored as Record<string, unknown>)[name];
    result[name] = isValidBinding(value)
      ? { ...value }
      : DEFAULT_SHORTCUT_BINDINGS[name];
  }

  const signatures = CONFIGURABLE_SHORTCUT_NAMES.map((name) =>
    shortcutBindingSignature(result[name]),
  );
  return new Set(signatures).size === signatures.length
    ? result
    : DEFAULT_SHORTCUT_BINDINGS;
};

const getBindingsSnapshot = () => (bindings ??= readBindings());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useShortcutBindings = () =>
  useSyncExternalStore(subscribe, getBindingsSnapshot, getBindingsSnapshot);

export const getShortcutBinding = (name: ConfigurableShortcutName) =>
  getBindingsSnapshot()[name];

export const getDefaultShortcutBinding = (name: ConfigurableShortcutName) =>
  DEFAULT_SHORTCUT_BINDINGS[name];

export const shortcutBindingSignature = (binding: ShortcutBinding) =>
  `${binding.code}:${binding.ctrlOrCmd ? 1 : 0}:${binding.alt ? 1 : 0}:${
    binding.shift ? 1 : 0
  }`;

export const getShortcutBindingLabel = (binding: ShortcutBinding) => {
  const parts = [
    binding.ctrlOrCmd ? "CtrlOrCmd" : "",
    binding.alt ? "Alt" : "",
    binding.shift ? "Shift" : "",
    getShortcutCodeLabel(binding.code),
  ].filter(Boolean);
  return getShortcutKey(parts.join("+"));
};

const getShortcutCodeLabel = (code: string) => {
  const specialKeys: Record<string, string> = {
    Quote: "'",
    Slash: "/",
    Minus: "-",
    Equal: "+",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Backquote: "`",
    Comma: ",",
    Period: ".",
    Semicolon: ";",
    Space: "Space",
  };
  if (specialKeys[code]) {
    return specialKeys[code];
  }
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }
  if (/^Numpad/.test(code)) {
    return code.slice(6);
  }
  return code;
};

const getEventKey = (code: string) => {
  const label = getShortcutCodeLabel(code);
  return /^Key[A-Z]$/.test(code) ? label.toLowerCase() : label;
};

export const createShortcutKeyboardEvent = (
  binding: ShortcutBinding,
): KeyboardEvent =>
  ({
    code: binding.code,
    key: getEventKey(binding.code),
    ctrlKey: !isDarwin && binding.ctrlOrCmd,
    metaKey: isDarwin && binding.ctrlOrCmd,
    altKey: binding.alt,
    shiftKey: binding.shift,
  } as KeyboardEvent);

export const matchesShortcutBinding = (
  name: ConfigurableShortcutName,
  event: KeyboardEvent | React.KeyboardEvent,
  appState: AppState,
  app: AppClassProperties,
) => {
  if (appState.editingTextElement || recordingApps.has(app)) {
    return false;
  }

  const binding = getShortcutBinding(name);
  return (
    event.code === binding.code &&
    event[KEYS.CTRL_OR_CMD] === binding.ctrlOrCmd &&
    event.altKey === binding.alt &&
    event.shiftKey === binding.shift
  );
};

export const setShortcutRecording = (
  app: AppClassProperties,
  isRecording: boolean,
) => {
  if (isRecording) {
    recordingApps.add(app);
  } else {
    recordingApps.delete(app);
  }
};

export const setShortcutBinding = (
  name: ConfigurableShortcutName,
  binding: ShortcutBinding,
) => {
  const current = getBindingsSnapshot();
  if (
    shortcutBindingSignature(current[name]) ===
    shortcutBindingSignature(binding)
  ) {
    return;
  }
  bindings = { ...current, [name]: { ...binding } };
  EditorLocalStorage.set(EDITOR_LS_KEYS.SHORTCUTS, bindings);
  listeners.forEach((listener) => listener());
};

export const resetShortcutBinding = (name: ConfigurableShortcutName) =>
  setShortcutBinding(name, DEFAULT_SHORTCUT_BINDINGS[name]);

export const resetAllShortcutBindings = () => {
  bindings = DEFAULT_SHORTCUT_BINDINGS;
  EditorLocalStorage.set(EDITOR_LS_KEYS.SHORTCUTS, bindings);
  listeners.forEach((listener) => listener());
};

export const reloadShortcutBindings = () => {
  bindings = readBindings();
  listeners.forEach((listener) => listener());
};

export const getShortcutName = (name: ActionName) =>
  CONFIGURABLE_SHORTCUT_NAMES.includes(name as ConfigurableShortcutName)
    ? (name as ConfigurableShortcutName)
    : null;
