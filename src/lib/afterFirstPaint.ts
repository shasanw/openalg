// Run work once the page has painted, so it never competes with the first
// frame (its scripts, styles or fonts). A frame callback plus a task lands
// just after that frame is presented. Background tabs get no frames, so a
// timeout makes sure the work still starts.

export function afterFirstPaint(work: () => void, fallbackMs = 300): void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    work();
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => setTimeout(run, 0));
  }
  setTimeout(run, fallbackMs);
}
