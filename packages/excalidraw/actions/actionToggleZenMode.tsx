import { CaptureUpdateAction } from "@excalidraw/element";

import { coffeeIcon } from "../components/icons";

import { register } from "./register";
import { matchesShortcutBinding } from "./shortcutBindings";

export const actionToggleZenMode = register({
  name: "zenMode",
  label: "buttons.zenMode",
  icon: coffeeIcon,
  viewMode: true,
  trackEvent: {
    category: "canvas",
    predicate: (appState) => !appState.zenModeEnabled,
  },
  perform(elements, appState) {
    return {
      appState: {
        ...appState,
        zenModeEnabled: !this.checked!(appState),
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  checked: (appState) => appState.zenModeEnabled,
  predicate: (elements, appState, appProps, app) => {
    return (
      app.editorInterface.formFactor !== "phone" &&
      typeof appProps.zenModeEnabled === "undefined"
    );
  },
  keyTest: (event, appState, elements, app) =>
    matchesShortcutBinding("zenMode", event, appState, app),
});
