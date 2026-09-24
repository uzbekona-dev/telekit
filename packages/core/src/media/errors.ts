import { TelekitError, type TelekitErrorOptions } from "../errors.js";

/** `getFile` download would exceed Telegram's 20 MB file-API limit (spec §27.3). */
export class FileTooLargeError extends TelekitError {
  constructor(message: string, options?: TelekitErrorOptions) {
    super("TK1105", message, options);
  }
}

/** Outgoing document/video/audio upload would exceed Telegram's 50 MB limit (spec §27.3). */
export class UploadTooLargeError extends TelekitError {
  constructor(message: string, options?: TelekitErrorOptions) {
    super("TK1106", message, options);
  }
}

/** Outgoing photo upload would exceed Telegram's 10 MB limit (spec §27.3). */
export class PhotoTooLargeError extends TelekitError {
  constructor(message: string, options?: TelekitErrorOptions) {
    super("TK1107", message, options);
  }
}

/** Message text exceeds Telegram's 4096-character limit and `split` wasn't requested (spec §27.3). */
export class TextTooLongError extends TelekitError {
  constructor(message: string, options?: TelekitErrorOptions) {
    super("TK2004", message, options);
  }
}

/** Caption exceeds Telegram's 1024-character limit (spec §27.3). */
export class CaptionTooLongError extends TelekitError {
  constructor(message: string, options?: TelekitErrorOptions) {
    super("TK2005", message, options);
  }
}
