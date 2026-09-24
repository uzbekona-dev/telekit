import type { Context } from "./context.js";

export type NextFn = () => Promise<void>;
export type Middleware = (ctx: Context, next: NextFn) => void | Promise<void>;

/**
 * Standard Koa-style onion composition: each middleware decides whether
 * (and when) to call `next()`. `finalHandler` runs once every middleware in
 * `chain` has called `next()` in turn — see spec §17.
 */
export function compose(
  chain: Middleware[],
  ctx: Context,
  finalHandler: () => void | Promise<void>,
): Promise<void> {
  let lastIndexCalled = -1;

  function dispatch(index: number): Promise<void> {
    if (index <= lastIndexCalled) {
      return Promise.reject(new Error("next() called multiple times in one middleware"));
    }
    lastIndexCalled = index;

    if (index === chain.length) {
      return Promise.resolve(finalHandler());
    }

    const middleware = chain[index]!;
    return Promise.resolve(middleware(ctx, () => dispatch(index + 1)));
  }

  return dispatch(0);
}
