-- P5 (DEC-014): share cards may be JPEG (Telegram InlineQueryResultPhoto.photo_url accepts JPEG only).
-- mime: NULL = image/png (rows created before this migration), 'image/jpeg' = JPEG. The column "png" keeps holding the bytes.
ALTER TABLE cards ADD COLUMN mime TEXT;
