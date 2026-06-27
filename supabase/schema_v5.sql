-- スマート会計 v5 -- 品目・明細を日中バイリンガル化
-- Supabase の SQL Editor でこれを実行してください
--
-- item_ja / item_zh: 品目要約の日本語・中国語
-- line_items (jsonb) は要素の形が次に変わります（列の変更は不要）:
--   [{ "name_ja": "コピー用紙", "name_zh": "复印纸", "qty": 3, "unit_price": 480 }, ...]

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS item_ja text,
  ADD COLUMN IF NOT EXISTS item_zh text;

-- 既存の item を日本語側へ引き継ぎ（任意）
UPDATE receipts SET item_ja = item WHERE item_ja IS NULL AND item IS NOT NULL;
