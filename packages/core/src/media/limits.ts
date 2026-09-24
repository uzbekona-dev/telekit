import {
  CaptionTooLongError,
  FileTooLargeError,
  PhotoTooLargeError,
  TextTooLongError,
  UploadTooLargeError,
} from "./errors.js";

/** Bot API hard limits (spec §27.3). */
export const MEDIA_LIMITS = {
  downloadBytes: 20 * 1024 * 1024,
  uploadBytes: 50 * 1024 * 1024,
  photoBytes: 10 * 1024 * 1024,
  captionChars: 1024,
  textChars: 4096,
} as const;

export function assertDownloadSize(sizeBytes: number): void {
  if (sizeBytes > MEDIA_LIMITS.downloadBytes) {
    throw new FileTooLargeError(
      `Fayl yuklab olish uchun juda katta: ${sizeBytes} bayt (limit ${MEDIA_LIMITS.downloadBytes} bayt)`,
    );
  }
}

export function assertUploadSize(sizeBytes: number): void {
  if (sizeBytes > MEDIA_LIMITS.uploadBytes) {
    throw new UploadTooLargeError(
      `Fayl yuborish uchun juda katta: ${sizeBytes} bayt (limit ${MEDIA_LIMITS.uploadBytes} bayt)`,
    );
  }
}

export function assertPhotoSize(sizeBytes: number): void {
  if (sizeBytes > MEDIA_LIMITS.photoBytes) {
    throw new PhotoTooLargeError(
      `Foto yuborish uchun juda katta: ${sizeBytes} bayt (limit ${MEDIA_LIMITS.photoBytes} bayt)`,
    );
  }
}

export function assertTextLength(text: string): void {
  if (text.length > MEDIA_LIMITS.textChars) {
    throw new TextTooLongError(
      `Matn juda uzun: ${text.length} belgi (limit ${MEDIA_LIMITS.textChars}). "split: true" dan foydalaning.`,
    );
  }
}

export function assertCaptionLength(caption: string | undefined): void {
  if (caption !== undefined && caption.length > MEDIA_LIMITS.captionChars) {
    throw new CaptionTooLongError(`Caption juda uzun: ${caption.length} belgi (limit ${MEDIA_LIMITS.captionChars})`);
  }
}
