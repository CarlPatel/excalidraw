import React from "react";

import { CODES, EDITOR_LS_KEYS, KEYS } from "@excalidraw/common";

import { Excalidraw } from "../index";
import { getShortcutFromShortcutName } from "../actions/shortcuts";
import {
  getDefaultShortcutBinding,
  getShortcutBinding,
  reloadShortcutBindings,
  setShortcutBinding,
  shortcutBindingSignature,
} from "../actions/shortcutBindings";
import { CommandPalette } from "../components/CommandPalette/CommandPalette";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { act, fireEvent, render, screen, waitFor } from "./test-utils";

describe("shortcuts", () => {
  beforeEach(() => {
    localStorage.clear();
    reloadShortcutBindings();
  });

  it("toggles grid, zen, view, and stats with their default shortcuts", async () => {
    await render(<Excalidraw handleKeyboardGlobally />);

    Keyboard.withModifierKeys({ ctrl: true }, () => {
      Keyboard.codePress(CODES.QUOTE);
    });
    expect(window.h.state.gridModeEnabled).toBe(true);

    Keyboard.withModifierKeys({ alt: true }, () => {
      Keyboard.codePress(CODES.Z);
    });
    expect(window.h.state.zenModeEnabled).toBe(true);

    Keyboard.withModifierKeys({ alt: true }, () => {
      Keyboard.codePress(CODES.R);
    });
    expect(window.h.state.viewModeEnabled).toBe(true);

    Keyboard.withModifierKeys({ alt: true }, () => {
      Keyboard.codePress(CODES.SLASH);
    });
    expect(window.h.state.stats.open).toBe(true);
  });

  it("Clear canvas shortcut should display confirm dialog", async () => {
    await render(
      <Excalidraw
        initialData={{ elements: [API.createElement({ type: "rectangle" })] }}
        handleKeyboardGlobally
      />,
    );

    expect(window.h.elements.length).toBe(1);

    Keyboard.withModifierKeys({ ctrl: true }, () => {
      Keyboard.keyDown(KEYS.DELETE);
    });
    const confirmDialog = document.querySelector(".confirm-dialog")!;
    expect(confirmDialog).not.toBe(null);

    fireEvent.click(confirmDialog.querySelector('[aria-label="Confirm"]')!);

    await waitFor(() => {
      expect(window.h.elements[0].isDeleted).toBe(true);
    });
  });

  it("changes an action binding, stops matching the old combo, and reloads it from localStorage", async () => {
    await render(<Excalidraw handleKeyboardGlobally />);
    API.setAppState({ openDialog: { name: "shortcuts" } });

    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "zenMode" },
    });
    const recordButton = screen.getByRole("button", {
      name: "Record shortcut",
    });
    fireEvent.click(recordButton);
    fireEvent.keyDown(recordButton, {
      code: "KeyX",
      key: "x",
      altKey: true,
    });

    expect(getShortcutBinding("zenMode")).toEqual({
      code: "KeyX",
      ctrlOrCmd: false,
      alt: true,
      shift: false,
    });
    expect(
      JSON.parse(localStorage.getItem(EDITOR_LS_KEYS.SHORTCUTS)!).zenMode,
    ).toEqual(getShortcutBinding("zenMode"));

    act(() => reloadShortcutBindings());
    expect(getShortcutBinding("zenMode").code).toBe("KeyX");

    Keyboard.withModifierKeys({ alt: true }, () => {
      Keyboard.codePress(CODES.Z);
    });
    expect(window.h.state.zenModeEnabled).toBe(false);

    Keyboard.withModifierKeys({ alt: true }, () => {
      Keyboard.codePress("KeyX");
    });
    expect(window.h.state.zenModeEnabled).toBe(true);
  });

  it("shows the changed binding in Help and the Command Palette", async () => {
    await render(
      <Excalidraw handleKeyboardGlobally>
        <CommandPalette />
      </Excalidraw>,
    );
    setShortcutBinding("zenMode", {
      code: "KeyM",
      ctrlOrCmd: true,
      alt: false,
      shift: false,
    });

    API.setAppState({ openDialog: { name: "help" } });
    const zenHelpRow = Array.from(
      document.querySelectorAll<HTMLElement>(".HelpDialog__shortcut"),
    ).find((row) => row.textContent?.includes("Zen mode"));
    expect(zenHelpRow?.textContent).toContain("M");
    expect(zenHelpRow?.textContent).toMatch(/Ctrl|Cmd/);

    fireEvent.click(
      screen.getByRole("button", { name: "Configure shortcuts" }),
    );
    expect(
      await screen.findByRole("button", { name: "Record shortcut" }),
    ).toBeTruthy();

    API.setAppState({ openDialog: { name: "commandPalette" } });
    const searchInput = await screen.findByPlaceholderText(
      "Search menus, commands, and discover hidden gems",
    );
    fireEvent.change(searchInput, { target: { value: "zen mode" } });

    const zenCommand = await screen.findByText("Zen mode");
    const commandRow = zenCommand.closest(".command-item");
    expect(commandRow?.querySelector(".shortcut")?.textContent).toContain("M");
    expect(commandRow?.querySelector(".shortcut")?.textContent).toMatch(
      /Ctrl|Cmd/,
    );

    fireEvent.change(searchInput, {
      target: { value: "shortcut settings" },
    });
    const settingsCommand = await screen.findByText("Shortcut settings");
    fireEvent.click(settingsCommand.closest(".command-item")!);
    expect(await screen.findByText("Current shortcut")).toBeTruthy();
    expect(getShortcutFromShortcutName("zenMode")).toContain("M");
  });

  it("resets one binding and all bindings to their defaults", async () => {
    await render(<Excalidraw handleKeyboardGlobally />);
    setShortcutBinding("zenMode", {
      code: "KeyX",
      ctrlOrCmd: false,
      alt: true,
      shift: false,
    });
    setShortcutBinding("viewMode", {
      code: "KeyM",
      ctrlOrCmd: true,
      alt: false,
      shift: false,
    });
    API.setAppState({ openDialog: { name: "shortcuts" } });

    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "zenMode" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Reset this shortcut" }),
    );
    expect(getShortcutBinding("zenMode")).toEqual(
      getDefaultShortcutBinding("zenMode"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Reset all shortcuts" }),
    );
    for (const name of ["gridMode", "zenMode", "viewMode", "stats"] as const) {
      expect(shortcutBindingSignature(getShortcutBinding(name))).toBe(
        shortcutBindingSignature(getDefaultShortcutBinding(name)),
      );
    }
  });

  it("refuses conflicts with configurable and fixed shortcuts", async () => {
    await render(<Excalidraw handleKeyboardGlobally />);
    setShortcutBinding("viewMode", {
      code: "KeyM",
      ctrlOrCmd: true,
      alt: false,
      shift: false,
    });
    API.setAppState({ openDialog: { name: "shortcuts" } });
    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "zenMode" },
    });
    const recordButton = screen.getByRole("button", {
      name: "Record shortcut",
    });
    fireEvent.click(recordButton);

    fireEvent.keyDown(recordButton, { code: "KeyM", key: "m" });
    expect(screen.getByRole("alert").textContent).toContain("Ctrl/Cmd or Alt");

    fireEvent.keyDown(recordButton, {
      code: "KeyM",
      key: "m",
      ctrlKey: true,
    });
    expect(screen.getByRole("alert").textContent).toContain("View mode");

    fireEvent.keyDown(recordButton, {
      code: CODES.QUOTE,
      key: "'",
      ctrlKey: true,
    });
    expect(screen.getByRole("alert").textContent).toContain("Grid mode");

    fireEvent.keyDown(recordButton, {
      code: CODES.Z,
      key: "z",
      ctrlKey: true,
    });
    expect(screen.getByRole("alert").textContent).toContain("Undo");
    expect(getShortcutBinding("zenMode")).toEqual(
      getDefaultShortcutBinding("zenMode"),
    );
  });

  it("does not run the old shortcut while recording it again", async () => {
    await render(<Excalidraw handleKeyboardGlobally />);
    API.setAppState({ openDialog: { name: "shortcuts" } });
    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "zenMode" },
    });
    const recordButton = screen.getByRole("button", {
      name: "Record shortcut",
    });
    fireEvent.click(recordButton);
    fireEvent.keyDown(recordButton, {
      code: CODES.Z,
      key: "z",
      altKey: true,
    });

    expect(window.h.state.zenModeEnabled).toBe(false);
    expect(getShortcutBinding("zenMode")).toEqual(
      getDefaultShortcutBinding("zenMode"),
    );
  });

  it("does not run configurable shortcuts while editing canvas text", async () => {
    await render(<Excalidraw handleKeyboardGlobally />);
    const textElement = API.createElement({ type: "text", text: "typing" });
    API.setElements([textElement]);
    API.setAppState({ editingTextElement: textElement });

    Keyboard.withModifierKeys({ ctrl: true }, () => {
      Keyboard.codePress(CODES.QUOTE);
    });
    Keyboard.withModifierKeys({ alt: true }, () => {
      Keyboard.codePress(CODES.Z);
      Keyboard.codePress(CODES.R);
      Keyboard.codePress(CODES.SLASH);
    });

    expect(window.h.state.gridModeEnabled).toBe(false);
    expect(window.h.state.zenModeEnabled).toBe(false);
    expect(window.h.state.viewModeEnabled).toBe(false);
    expect(window.h.state.stats.open).toBe(false);
  });

  it("falls back to defaults when localStorage contains broken bindings", () => {
    localStorage.setItem(EDITOR_LS_KEYS.SHORTCUTS, "not json");
    reloadShortcutBindings();

    for (const name of ["gridMode", "zenMode", "viewMode", "stats"] as const) {
      expect(getShortcutBinding(name)).toEqual(getDefaultShortcutBinding(name));
    }
  });
});
