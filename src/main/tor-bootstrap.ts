// Only controller keywords are exposed. Never retain WARNING/HOST/HOSTADDR,
// descriptor contents or arbitrary Tor log lines in browser state.
export function bootstrapDetails(line: string) {
  const field = (name: string, pattern: string) =>
    new RegExp(`(?:^|\\s)${name}=(${pattern})(?=\\s|$)`).exec(line)?.[1];
  const phase = field("TAG", "[a-z0-9_]{1,48}");
  const reason = field("REASON", "[A-Z0-9_]{1,48}");
  const recommendation = field("RECOMMENDATION", "(?:warn|ignore)");
  const count = field("COUNT", "[0-9]{1,9}");
  return {
    phase,
    reason,
    recommendation,
    problems: count ? Number(count) : undefined,
  };
}

export class BootstrapDeadline {
  private highest = 0;
  private advancedAt: number;
  constructor(
    private readonly startedAt = Date.now(),
    private readonly totalMs = 600_000,
    private readonly idleMs = 180_000,
  ) {
    this.advancedAt = startedAt;
  }
  advance(progress: number, now = Date.now()) {
    if (progress > this.highest) {
      this.highest = progress;
      this.advancedAt = now;
    }
  }
  expired(now = Date.now()) {
    return (
      now - this.startedAt >= this.totalMs ||
      now - this.advancedAt >= this.idleMs
    );
  }
}
