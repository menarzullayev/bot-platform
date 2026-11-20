// Brand image URLs for Bot API parameters. The files live in brand/out and are served by the site at /brand/<name>.
// Every helper returns {} when PUBLIC_BASE_URL is not configured, so callers can always spread the result.

/** Stars invoice photo (createInvoiceLink: photo_url, photo_width, photo_height). */
export const INVOICE_PHOTO = { file: "stars-pro.jpg", width: 640, height: 360 } as const;
/** Inline result thumbnails (InlineQueryResultArticle: thumbnail_url, thumbnail_width, thumbnail_height). */
export const INLINE_THUMB_SIZE = 128;
export type InlineThumbKind = "calc" | "convert" | "loan" | "error";

function brandUrl(base: string | null | undefined, file: string): string | null {
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/brand/${file}`;
}

export function invoicePhoto(base: string | null | undefined): { photo_url?: string; photo_width?: number; photo_height?: number } {
  const url = brandUrl(base, INVOICE_PHOTO.file);
  return url ? { photo_url: url, photo_width: INVOICE_PHOTO.width, photo_height: INVOICE_PHOTO.height } : {};
}

export function inlineThumb(
  base: string | null | undefined,
  kind: InlineThumbKind,
): { thumbnail_url?: string; thumbnail_width?: number; thumbnail_height?: number } {
  const url = brandUrl(base, `thumb-${kind}.jpg`);
  return url ? { thumbnail_url: url, thumbnail_width: INLINE_THUMB_SIZE, thumbnail_height: INLINE_THUMB_SIZE } : {};
}
