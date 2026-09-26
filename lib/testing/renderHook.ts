import { act } from "react";
import { createRoot } from "react-dom/client";
import { createElement } from "react";

// Minimal renderHook — the repo has no @testing-library; React's own act()
// is all these hook tests need.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export function renderHook<T>(hook: () => T): { result: { current: T } } {
  const result = { current: undefined as T };
  function Probe() {
    result.current = hook();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  return { result };
}

export { act };
