import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month') ?? new Date().toISOString().slice(0, 7); // YYYY-MM

  // 選択月の範囲
  const startDate = new Date(`${month}-01T00:00:00.000Z`);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);

  // 選択月の全レシート
  const { data: receipts, error } = await supabase
    .from('receipts')
    .select('*')
    .gte('created_at', startDate.toISOString())
    .lt('created_at', endDate.toISOString())
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // カテゴリ別集計
  const catMap: Record<string, { label: string; total: number; count: number }> = {};
  for (const r of receipts ?? []) {
    if (!catMap[r.category]) {
      catMap[r.category] = { label: r.category_label, total: 0, count: 0 };
    }
    catMap[r.category].total += r.amount;
    catMap[r.category].count += 1;
  }
  const categoryBreakdown = Object.entries(catMap).map(([key, v]) => ({
    category: key,
    label: v.label,
    total: v.total,
    count: v.count,
  }));

  // 過去6ヶ月の月次合計
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const { data: allRecent } = await supabase
    .from('receipts')
    .select('created_at, amount')
    .gte('created_at', sixMonthsAgo.toISOString());

  const monthMap: Record<string, number> = {};
  for (const r of allRecent ?? []) {
    const m = r.created_at.slice(0, 7);
    monthMap[m] = (monthMap[m] ?? 0) + r.amount;
  }
  const monthlyTotals = Object.entries(monthMap)
    .map(([m, total]) => ({ month: m, total }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return NextResponse.json({
    receipts: receipts ?? [],
    categoryBreakdown,
    monthlyTotals,
    total: (receipts ?? []).reduce((s, r) => s + r.amount, 0),
    count: (receipts ?? []).length,
    month,
  });
}
