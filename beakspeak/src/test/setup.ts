import '@testing-library/jest-dom'

// jsdom stubs for canvas and ResizeObserver
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

HTMLCanvasElement.prototype.getContext = function () {
  return null
} as unknown as typeof HTMLCanvasElement.prototype.getContext
