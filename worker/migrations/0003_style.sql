-- TezCalc look-and-feel settings (DEC-004, DEC-007). NULL = never chosen: the client applies its defaults
-- (style tactile, contrast normal, density comfortable, lite auto, fs m). Values are validated in the API/bot.
ALTER TABLE users ADD COLUMN style    TEXT;
ALTER TABLE users ADD COLUMN contrast TEXT;
ALTER TABLE users ADD COLUMN density  TEXT;
ALTER TABLE users ADD COLUMN lite     TEXT;
ALTER TABLE users ADD COLUMN fs       TEXT;
