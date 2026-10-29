/** One deadline per eligible background tab; no periodic renderer polling. */
export class TabSleepScheduler {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private attempted = new Set<string>();
  private delay = 0;
  constructor(private readonly expire: (id: string) => void) {}
  sync(ids: string[], delay: number) {
    if (delay !== this.delay) {
      this.dispose();
      this.delay = delay;
    }
    const eligible = new Set(delay > 0 ? ids : []);
    for (const [id, timer] of this.timers)
      if (!eligible.has(id)) {
        clearTimeout(timer);
        this.timers.delete(id);
      }
    for (const id of this.attempted)
      if (!eligible.has(id)) this.attempted.delete(id);
    for (const id of eligible)
      if (!this.timers.has(id) && !this.attempted.has(id)) {
        const timer = setTimeout(() => {
          this.timers.delete(id);
          this.attempted.add(id);
          this.expire(id);
        }, delay);
        timer.unref?.();
        this.timers.set(id, timer);
      }
  }
  dispose() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.attempted.clear();
  }
}

/** Conservative discard, not a claim to serialize arbitrary JavaScript heaps.
 * Complex documents are retained, even when no dirty form is detectable. */
export const sleepSafetyProbe = `(() => {
  if (document.readyState !== 'complete') return false;
  if (document.querySelector('input, textarea, select, [contenteditable], iframe, frame, canvas, video, audio, object, embed')) return false;
  if ([...document.querySelectorAll('*')].some(element => element.shadowRoot || element.localName.includes('-'))) return false;
  try { if (sessionStorage.length) return false; } catch { return false; }
  return true;
})()`;
