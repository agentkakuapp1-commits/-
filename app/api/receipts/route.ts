import { NextRequest, NextResponse } from 'next/server';
import { supabase, Receipt } from '@/lib/supabase';

// ── GET /api/receipts ─────────────────────────────────────────────────────────
// 直近10件 + 今月の合計金額を返す
export async function GET() {
  // 直近10件
  const { data: receipts, error: listError } = await supabase
    .from('receipts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  // 今月の合計
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { data: monthData, error: sumError } = await supabase
    .from('receipts')
    .select('amount')
    .gte('created_at', firstDay);

  if (sumError) {
    return NextResponse.json({ error: sumError.message }, { status: 500 });
  }

  const monthlyTotal = (monthData ?? []).reduce(
    (sum: number, r: { amount: number }) => sum + r.amount,
    0
  );

  return NextResponse.json({ receipts: receipts ?? [], monthlyTotal });
}

// ── POST /api/receipts ────────────────────────────────────────────────────────
// 新しい仕訳を保存する
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, merchant, amount, category, category_label } = body as Omit<
    Receipt,
    'id' | 'created_at'
  >;

  if (!date || !merchant || !amount || !category || !category_label) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('receipts')
    .insert([{ date, merchant, amount, category, category_label }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
