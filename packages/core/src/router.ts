import { resolveEventTypes, type EventType } from "@telekit/types";
import type { Context } from "./context.js";
import { compose, type Middleware } from "./middleware.js";

export interface CommandDefinition {
  name: string;
  aliases?: string[];
  description?: string;
  middleware?: Middleware[];
  handle(ctx: Context, args: string): void | Promise<void>;
}

export interface EventDefinition {
  type: EventType;
  filter?: (ctx: Context) => boolean;
  middleware?: Middleware[];
  handle(ctx: Context): void | Promise<void>;
}

/**
 * An inline-mode handler (`app/inline/*.ts`). `match` narrows which queries
 * it answers: a string is a case-insensitive prefix (`"gif "` answers
 * `@bot gif cats`), a RegExp is tested against the whole query. Handlers
 * with a `match` are tried first, in registration order; one without
 * (`app/inline/default.ts`) answers everything else.
 */
export interface InlineDefinition {
  match?: string | RegExp;
  middleware?: Middleware[];
  /** `query`: the text after a string prefix (trimmed), otherwise the whole query. `match`: the RegExp result, if `match` is a RegExp. */
  handle(ctx: Context, query: string, match: RegExpExecArray | null): void | Promise<void>;
}

function matchInline(def: InlineDefinition, query: string): { query: string; match: RegExpExecArray | null } | null {
  if (def.match === undefined) return { query, match: null };
  if (typeof def.match === "string") {
    return query.toLowerCase().startsWith(def.match.toLowerCase()) ? { query: query.slice(def.match.length).trim(), match: null } : null;
  }
  def.match.lastIndex = 0; // a /g or /y pattern would otherwise resume from the previous query
  const result = def.match.exec(query);
  return result ? { query, match: result } : null;
}

function parseCommand(text: string): { name: string; args: string } | null {
  if (!text.startsWith("/")) return null;
  const [head, ...rest] = text.slice(1).split(/\s+/);
  if (!head) return null;
  const name = head.split("@")[0]!.toLowerCase();
  return { name, args: rest.join(" ") };
}

/**
 * Matches an update against registered commands/events and runs the
 * matching handler through its route-level middleware. File-based routing
 * (spec §15.1) populates this via the loader; `app.command()`/`app.event()`
 * populate it directly for programmatic registration (spec §15.3).
 */
export class Router {
  private readonly commands = new Map<string, CommandDefinition>();
  private readonly eventsByType = new Map<EventType, EventDefinition[]>();
  private readonly inline: InlineDefinition[] = [];

  registerInline(def: InlineDefinition): void {
    this.inline.push(def);
  }

  /** Matching order: every handler with a `match` (registration order), then the fallbacks. */
  listInline(): InlineDefinition[] {
    return [...this.inline.filter((d) => d.match !== undefined), ...this.inline.filter((d) => d.match === undefined)];
  }

  registerCommand(def: CommandDefinition): void {
    this.commands.set(def.name.toLowerCase(), def);
    for (const alias of def.aliases ?? []) {
      this.commands.set(alias.toLowerCase(), def);
    }
  }

  registerEvent(def: EventDefinition): void {
    const list = this.eventsByType.get(def.type) ?? [];
    list.push(def);
    this.eventsByType.set(def.type, list);
  }

  listCommands(): CommandDefinition[] {
    return [...new Set(this.commands.values())];
  }

  /** Returns true if some route matched and ran (spec §14.1 step 5–7). */
  async dispatch(ctx: Context): Promise<boolean> {
    if (ctx.message?.text) {
      const parsed = parseCommand(ctx.message.text);
      if (parsed) {
        const def = this.commands.get(parsed.name);
        if (def) {
          await compose(def.middleware ?? [], ctx, () => def.handle(ctx, parsed.args));
          return true;
        }
      }
    }

    const inlineQuery = ctx.update.inline_query;
    if (inlineQuery) {
      for (const def of this.listInline()) {
        const matched = matchInline(def, inlineQuery.query);
        if (!matched) continue;
        await compose(def.middleware ?? [], ctx, () => def.handle(ctx, matched.query, matched.match));
        return true;
      }
    }

    for (const type of resolveEventTypes(ctx.update)) {
      for (const def of this.eventsByType.get(type) ?? []) {
        if (def.filter && !def.filter(ctx)) continue;
        await compose(def.middleware ?? [], ctx, () => def.handle(ctx));
        return true;
      }
    }

    return false;
  }
}
