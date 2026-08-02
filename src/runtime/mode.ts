export type RuntimeMode = "sources" | "installed";

let currentMode: RuntimeMode = "sources";

export function getRuntimeMode(): RuntimeMode {
  return currentMode;
}

export function setRuntimeMode(mode: RuntimeMode): void {
  currentMode = mode;
}
