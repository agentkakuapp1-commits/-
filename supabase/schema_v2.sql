-- スマート会計 v2 -- 会計士機能追加
-- Supabase の SQL Editor でこれを実行してください

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS tax_rate         integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS tax_amount       integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_before_tax integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_number   text,
  ADD COLUMN IF NOT EXISTS debit_account    text DEFAULT '消耗品費',
  ADD COLUMN IF NOT EXISTS credit_account   text DEFAULT '現金',
  ADD COLUMN IF NOT EXISTS notes            text;

-- 勘定科目学習テーブル
CREATE TABLE IF NOT EXISTS account_mappings (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_pattern text NOT NULL UNIQUE,
  debit_account   text NOT NULL,
  credit_account  text NOT NULL DEFAULT '現金',
  use_count       integer DEFAULT 1,
  created_at      timestamp with time zone DEFAULT now()
);

ALTER TABLE account_mappings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "allow all" ON account_mappings FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;
