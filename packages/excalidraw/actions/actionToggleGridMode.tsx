import { CaptureUpdateAction } from "@excalidraw/element";

import { gridIcon } from "../components/icons";

import { register } from "./register";
import { matchesShortcutBinding } from "./shortcutBindings";

export const actionToggleGridMode = register({
  name: "gridMode",
  icon: gridIcon,
  keywords: ["snap"],
  label: "labels.toggleGrid",
  viewMode: true,
  trackEvent: {
    category: "canvas",
    predicate: (appState) => appState.gridModeEnabled,
  },
  perform(elements, appState) {
    return {
      appState: {
        ...appState,
        gridModeEnabled: !this.checked!(appState),
        objectsSnapModeEnabled: false,
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  checked: (appState) => appState.gridModeEnabled,
  predicate: (element, appState, props) => {
    return props.gridModeEnabled === undefined;
  },
  keyTest: (event, appState, elements, app) =>
    matchesShortcutBinding("gridMode", event, appState, app),
});
