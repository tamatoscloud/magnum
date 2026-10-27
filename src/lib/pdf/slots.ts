let active = 0;
const waiters: Array<() => void> = [];

export function acquirePdfSlot(max: number, waitMs: number): Promise<() => void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const tryAcquire = () => {
      if (settled || active >= max) return;
      settled = true;
      clearTimeout(timer);
      const index = waiters.indexOf(tryAcquire);
      if (index >= 0) waiters.splice(index, 1);
      active += 1;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        active -= 1;
        waiters[0]?.();
      });
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const index = waiters.indexOf(tryAcquire);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error("PDF generation is busy. Try again shortly."));
    }, waitMs);
    waiters.push(tryAcquire);
    tryAcquire();
  });
}
