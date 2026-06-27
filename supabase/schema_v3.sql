-- スマート会計 v3 -- 品目（買ったものが何か）列の追加
-- Supabase の SQL Editor でこれを実行してください

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS item text;

-- 既存データの空欄を補完（任意）
UPDATE receipts SET item = '品目不明' WHERE item IS NULL;
