import { VirtualClock, parseDuration } from "@telekit/core";

/**
 * `VirtualClock` for tests: starts frozen at the real "now" (so virtual
 * timestamps — session TTLs, conversation `expires_at` — look realistic) and
 * accepts spec-style durations: `bot.clock.advance("5m")` (spec §28.4).
 */
export class TestClock extends VirtualClock {
  constructor(start: number = Date.now()) {
    super(start);
  }

  override advance(duration: number | string): Promise<void> {
    return super.advance(parseDuration(duration));
  }
}
