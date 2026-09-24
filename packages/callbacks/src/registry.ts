import { ConfigurationError } from "@telekit/core";
import type { CallbackHandle } from "./callback.js";

/** Build-time-equivalent guard for ADR-003's routeId collision check (spec TK1041) — enforced the moment two colliding names are installed together. */
export class CallbackIdCollisionError extends ConfigurationError {
  constructor(nameA: string, nameB: string, routeId: string) {
    super(
      "TK1041",
      `Callback "${nameA}" va "${nameB}" bir xil routeId (${routeId}) beradi — birini qayta nomlang`,
    );
  }
}

/** Maps a callback's 24-bit `routeId` back to its handle so `installCallbacks`' middleware can dispatch an incoming press. */
export class CallbackRegistry {
  private readonly byRouteId = new Map<string, CallbackHandle<any>>();

  register(handle: CallbackHandle<any>): void {
    const existing = this.byRouteId.get(handle.routeId);
    if (existing && existing.name !== handle.name) {
      throw new CallbackIdCollisionError(existing.name, handle.name, handle.routeId);
    }
    this.byRouteId.set(handle.routeId, handle);
  }

  resolve(routeId: string): CallbackHandle<any> | undefined {
    return this.byRouteId.get(routeId);
  }

  list(): CallbackHandle<any>[] {
    return [...this.byRouteId.values()];
  }
}

export function createCallbackRegistry(handles: CallbackHandle<any>[]): CallbackRegistry {
  const registry = new CallbackRegistry();
  for (const handle of handles) registry.register(handle);
  return registry;
}
