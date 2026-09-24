import {
  validateIncomingFile,
  type Context,
  type MediaFileMeta,
  type MediaInvalidReason,
} from "@telekit/core";

/** `true` = valid; any other return value is shown as the "invalid" message (falls back to `invalidMessage` if the validator returned exactly `false`). */
export type ValidateResult = true | false | string;

export interface AskOptions<T> {
  validate?: (value: T) => ValidateResult;
  /** Number of extra attempts after the first failed one before giving up. `undefined`/`0` retries forever. */
  retry?: number;
  invalidMessage?: string;
}

export interface ChoiceOption<T> {
  value: T;
  label: string;
}

export interface ConfirmOptions {
  yesLabel?: string;
  noLabel?: string;
}

/** `flow.document()`/`flow.photo()` options (spec §27.4) — `maxSize`/`mimeTypes` run before `validate`. */
export interface MediaAskOptions<T> {
  validate?: (value: T) => ValidateResult;
  retry?: number;
  invalidMessage?: string;
  maxSize?: string | number;
  mimeTypes?: string[];
  onInvalid?: (ctx: Context, reason: MediaInvalidReason) => void | Promise<void>;
}

export interface ResolvedMediaAskOptions<T> {
  options: AskOptions<T> | undefined;
  onInvalid?: (ctx: Context, message: string) => void | Promise<void>;
}

/**
 * Splits `MediaAskOptions` into the plain `AskOptions` `FlowController.ask()`
 * already understands (with `maxSize`/`mimeTypes` folded into `validate`) and
 * a separate `onInvalid` hook — kept out of `AskOptions` itself so the
 * generic ask machinery never needs to know media exists. `toMeta` projects
 * the ask's result type down to the `{ file_size, mime_type }` shape
 * `validateIncomingFile` checks (e.g. `PhotoSize[] -> PhotoSize[].at(-1)`).
 */
export function resolveMediaAskOptions<T>(
  options: MediaAskOptions<T> | undefined,
  toMeta: (value: T) => MediaFileMeta | undefined,
): ResolvedMediaAskOptions<T> {
  if (!options) return { options: undefined };

  const { maxSize, mimeTypes, onInvalid, ...rest } = options;
  const needsMediaCheck = maxSize !== undefined || (mimeTypes?.length ?? 0) > 0;
  if (!needsMediaCheck) return { options: rest };

  const userValidate = rest.validate;
  return {
    options: {
      ...rest,
      validate: (value: T) => {
        const meta = toMeta(value);
        const reason = meta ? validateIncomingFile(meta, { maxSize, mimeTypes }) : null;
        return reason ?? (userValidate ? userValidate(value) : true);
      },
    },
    onInvalid: onInvalid
      ? (ctx, reason) => onInvalid(ctx, reason as MediaInvalidReason)
      : async (ctx, reason) => {
          await ctx.reply(ctx.t(`errors.file.${reason}`));
        },
  };
}
