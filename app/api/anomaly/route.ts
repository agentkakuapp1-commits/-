import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface Alert { type: string; message: string; severity: 'high' | 'medium'; }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month') ?? new Date().toISOString().slice(0, 7);

  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end   = new Date(start); end.setMonth(end.getMonth() + 1);

  const [{ data: cur }, { data: hist }] = await Promise.all([
    supabase.from('receipts').select('*')
      .gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
    supabase.from('receipts').select('amount, debit_account')
      .gte('created_at', new Date(start.getFullYear(), start.getMonth() - 3, 1).toISOString())
      .lt('created_at', start.toISOString()),
  ]);

  const alerts: Alert[] = [];
  const rows = cur ?? [];
  if (rows.length === 0) return NextResponse.json({ alerts });

  // ① 同一店舗が月3回以上
  const mc: Record<string, number> = {};
  for (const r of rows) mc[r.merchant] = (mc[r.merchant] ?? 0) + 1;
  for (const [m, n] of Object.entries(mc)) {
    if (n >= 3) alerts.push({
      type: 'duplicate', severity: n >= 5 ? 'high' : 'medium',
      message: `${m} が今月 ${n} 回計上されています`,
    });
  }

  // ② 高額取引（平均の3倍 かつ 5万円超）
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const avg = total / rows.length;
  for (const r of rows) {
    if (r.amount > avg * 3 && r.amount > 50000) {
      alerts.push({
        type: 'large', severity: 'high',
        message: `${r.merchant} ¥${r.amount.toLocaleString('ja-JP')} は平均の ${Math.round(r.amount / avg)}倍の高額取引です`,
      });
    }
  }

  // ③ 先月比スパイク
  const histRows = hist ?? [];
  if (histRows.length > 0) {
    const histAvg = histRows.reduce((s, r) => s + r.amount, 0) / 3;
    if (total > histAvg * 2 && total > 100000) {
      alerts.push({
        type: 'spike', severity: 'high',
        message: `今月の経費 ¥${total.toLocaleString('ja-JP')} は過去3ヶ月平均の ${(total / histAvg).toFixed(1)}倍です`,
      });
    }
  }

  // ④ 交際費が10万円超
  const entTotal = rows.filter(r => r.debit_account === '交際費' || r.category === 'entertainment')
    .reduce((s, r) => s + r.amount, 0);
  if (entTotal >= 100000) {
    alerts.push({
      type: 'entertainment', severity: 'medium',
      message: `交際費が ¥${entTotal.toLocaleString('ja-JP')} に達しています（税務調査リスク）`,
    });
  }

  return NextResponse.json({ alerts, total, count: rows.length });
}
