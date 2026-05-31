import "@testing-library/jest-dom/vitest";

// React Flow measures its container via ResizeObserver, which jsdom/happy-dom
// don't implement. Stub it so the canvas can mount under the test DOM.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!("ResizeObserver" in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    ResizeObserverStub;
}
