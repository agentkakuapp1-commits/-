-- スマート会計 receipts テーブル
-- Supabase ダッシュボード → SQL Editor に貼り付けて実行してください

create table if not exists receipts (
  id           uuid default gen_random_uuid() primary key,
  created_at   timestamp with time zone default timezone('utc', now()) not null,
  date         text not null,
  merchant     text not null,
  amount       integer not null,
  category     text not null,        -- 'office' | 'entertainment' | 'personal'
  category_label text not null       -- 表示用ラベル（例: 'オフィス用品'）
);

-- 全ユーザーが読み書きできる設定（開発用）
-- 本番では認証ユーザーのみに制限することを推奨
alter table receipts enable row level security;

create policy "allow all" on receipts
  for all using (true) with check (true);
