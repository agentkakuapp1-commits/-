-- スマート会計 v4 -- 明細（品目ごとの個数・単価）列の追加
-- Supabase の SQL Editor でこれを実行してください
--
-- line_items は次の形のJSON配列を保持します:
--   [{ "name": "コピー用紙", "qty": 3, "unit_price": 480 }, ...]

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS line_items jsonb DEFAULT '[]'::jsonb;
