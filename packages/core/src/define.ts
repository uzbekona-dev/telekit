import type { EventType } from "@telekit/types";
import type { Context } from "./context.js";
import type { CommandDefinition, EventDefinition, InlineDefinition } from "./router.js";
import type { Middleware } from "./middleware.js";

/** Identity helper — exists so `app/commands/*.ts` files export a typed, self-describing object (spec §15.4). */
export function defineCommand(def: CommandDefinition): CommandDefinition {
  return def;
}

export interface EventOptions {
  filter?: (ctx: Context) => boolean;
  middleware?: Middleware[];
}

export function defineEvent(
  type: EventType,
  handler: (ctx: Context) => void | Promise<void>,
): EventDefinition;
export function defineEvent(
  type: EventType,
  options: EventOptions,
  handler: (ctx: Context) => void | Promise<void>,
): EventDefinition;
export function defineEvent(
  type: EventType,
  handlerOrOptions: EventOptions | ((ctx: Context) => void | Promise<void>),
  maybeHandler?: (ctx: Context) => void | Promise<void>,
): EventDefinition {
  if (typeof handlerOrOptions === "function") {
    return { type, handle: handlerOrOptions };
  }
  return { type, ...handlerOrOptions, handle: maybeHandler! };
}

export function defineMiddleware(middleware: Middleware): Middleware {
  return middleware;
}

/** Identity helper for `app/inline/*.ts` files — see `InlineDefinition` for how `match` picks the handler. */
export function defineInline(def: InlineDefinition): InlineDefinition {
  return def;
}
