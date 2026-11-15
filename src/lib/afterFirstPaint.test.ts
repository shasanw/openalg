import { afterEach, describe, expect, it, vi } from "vitest";
import { afterFirstPaint } from "./afterFirstPaint";

afterEach(() => {
  vi.useRealTimers();
});

describe("afterFirstPaint", () => {
  it("runs once, just after the next frame", () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    let frame: FrameRequestCallback | undefined;
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      frame = cb;
      return 1;
    });
    const work = vi.fn();
    afterFirstPaint(work);
    expect(work).not.toHaveBeenCalled();
    frame!(0);
    expect(work).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(work).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(work).toHaveBeenCalledTimes(1);
    raf.mockRestore();
  });

  it("still runs when no frame comes (a background tab)", () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 0);
    const work = vi.fn();
    afterFirstPaint(work, 300);
    vi.advanceTimersByTime(299);
    expect(work).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(work).toHaveBeenCalledTimes(1);
    raf.mockRestore();
  });
});
