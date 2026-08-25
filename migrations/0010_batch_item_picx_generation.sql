-- Migration: correlate a batch item with its PicX generation, for webhook delivery.
--
-- Batch items are moving from "block on the PicX call inside waitUntil" to
-- "submit, return, let a webhook complete the item". That inverts who finishes
-- an item: the fan-out used to have the result in hand, and now a later inbound
-- request carries it. The webhook payload identifies the work by *PicX's*
-- generation id (`data.generation_id`, from the 202 accepted body), which is a
-- different namespace from our own `generation.id`, so there was previously no
-- way to map a delivery back to the row that is waiting for it.
--
-- `picx_generation_id` is recorded at submit time and is the only thing the
-- receiver trusts for correlation. Deliberately NOT correlating on a path
-- parameter in the callback URL: the signature covers the request body, not the
-- URL, so a captured delivery replayed against a different item's path would
-- still verify. Looking the item up *by the id inside the signed body* makes
-- that mis-attribution impossible.
--
-- Nullable because it is only set on the async path — an item created before
-- this migration, or run while PICX_WEBHOOK_SECRET is unset (the synchronous
-- fallback), never has one, and both must keep working.
--
-- No FOREIGN KEY, consistent with 0006_drop_foreign_keys.sql: this references
-- an id in PicX's database, not ours, so there is nothing local to point at.

ALTER TABLE batch_item ADD COLUMN picx_generation_id TEXT;

-- The prompt actually sent, captured at submit time.
--
-- Needed because `generation.prompt` is NOT NULL and the row is now written by
-- the webhook, which has no way to know what was sent. Rebuilding it there is
-- not an option: the builders in doodle-constants.ts randomize on every call —
-- that randomization is the entire variant mechanism — so a rebuilt prompt would
-- be a *different* prompt, and we would be recording text that never produced
-- the image. Storing it is the only way the persisted prompt stays truthful.
--
-- Nullable for the same reason as picx_generation_id: pre-existing rows and the
-- synchronous fallback never set it.
ALTER TABLE batch_item ADD COLUMN prompt TEXT;

-- The receiver's only query is "which item is this delivery for", so the lookup
-- has to be indexed or every webhook becomes a full scan of the table.
CREATE UNIQUE INDEX IF NOT EXISTS batch_item_picx_generation_id_idx
  ON batch_item (picx_generation_id)
  WHERE picx_generation_id IS NOT NULL;
