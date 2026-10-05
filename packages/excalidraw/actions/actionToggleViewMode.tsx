import { CaptureUpdateAction } from "@excalidraw/element";

import { eyeIcon } from "../components/icons";

import { register } from "./register";
import { matchesShortcutBinding } from "./shortcutBindings";

export const actionToggleViewMode = register({
  name: "viewMode",
  label: "labels.viewMode",
  icon: eyeIcon,
  viewMode: true,
  trackEvent: {
    category: "canvas",
    predicate: (appState) => !appState.viewModeEnabled,
  },
  perform(elements, appState) {
    return {
      appState: {
        ...appState,
        viewModeEnabled: !this.checked!(appState),
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  checked: (appState) => appState.viewModeEnabled,
  predicate: (elements, appState, appProps, app) => {
    return (
      typeof appProps.viewModeEnabled === "undefined" &&
      app.isInteractionEnabled()
    );
  },
  keyTest: (event, appState, elements, app) =>
    matchesShortcutBinding("viewMode", event, appState, app),
});
