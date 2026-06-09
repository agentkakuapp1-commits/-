import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

function escCsv(s: string | null | undefined) {
  const v = String(s ?? '');
  return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') ?? 'freee';
  const month  = searchParams.get('month')  ?? new Date().toISOString().slice(0, 7);

  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end   = new Date(start); end.setMonth(end.getMonth() + 1);

  const { data } = await supabase
    .from('receipts').select('*')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('date', { ascending: true });

  const rows = data ?? [];

  // ── 経費精算書 HTML ──────────────────────────────────────────────────────────
  if (format === 'expense') {
    const total    = rows.reduce((s, r) => s + r.amount, 0);
    const taxTotal = rows.reduce((s, r) => s + (r.tax_amount ?? 0), 0);
    const trs = rows.map(r => `
      <tr>
        <td>${r.date}</td>
        <td>${escCsv(r.merchant)}</td>
        <td>${r.debit_account ?? '消耗品費'}</td>
        <td class="num">¥${(r.amount_before_tax ?? 0).toLocaleString('ja-JP')}</td>
        <td class="ctr">${r.tax_rate ?? 10}%</td>
        <td class="num">¥${(r.tax_amount ?? 0).toLocaleString('ja-JP')}</td>
        <td class="num bold">¥${r.amount.toLocaleString('ja-JP')}</td>
        <td class="mono">${r.invoice_number ?? '—'}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<title>経費精算書 ${month}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Hiragino Sans',sans-serif;padding:32px;color:#1a1a2e;font-size:13px}
  h1{font-size:20px;font-weight:700;border-bottom:2px solid #1a1a2e;padding-bottom:8px;margin-bottom:16px}
  .meta{display:flex;gap:32px;margin-bottom:20px;color:#555}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#1a1a2e;color:#fff;padding:8px 10px;text-align:left;font-weight:600}
  td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
  tr:nth-child(even){background:#f9fafb}
  .num{text-align:right}.ctr{text-align:center}.bold{font-weight:700}
  .mono{font-family:monospace;font-size:11px}
  .totals{margin-top:16px;text-align:right;font-size:14px;space-y:4px}
  .totals div{margin-top:6px}
  .grand{font-size:18px;font-weight:700;color:#4f46e5;margin-top:8px}
  @media print{body{padding:16px}}
</style></head><body>
<h1>経費精算書</h1>
<div class="meta">
  <span>対象期間：${month}</span>
  <span>作成日：${new Date().toLocaleDateString('ja-JP')}</span>
  <span>件数：${rows.length}件</span>
</div>
<table>
  <thead><tr>
    <th>日付</th><th>取引先</th><th>勘定科目</th>
    <th>税抜金額</th><th>税率</th><th>消費税</th><th>税込金額</th><th>インボイス番号</th>
  </tr></thead>
  <tbody>${trs}</tbody>
</table>
<div class="totals">
  <div>消費税合計：¥${taxTotal.toLocaleString('ja-JP')}</div>
  <div class="grand">合計（税込）：¥${total.toLocaleString('ja-JP')}</div>
</div>
</body></html>`;

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // ── マネーフォワード CSV ──────────────────────────────────────────────────────
  if (format === 'mf') {
    const header = '取引日,取引内容,金額（円）,勘定科目,補助科目,メモ,決済';
    const lines = rows.map(r =>
      [r.date, escCsv(r.merchant), r.amount, r.debit_account ?? '消耗品費', '', escCsv(r.invoice_number), '未決済'].join(',')
    );
    const csv = '﻿' + [header, ...lines].join('\n');
    return new NextResponse(csv, { headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mf_${month}.csv"`,
    }});
  }

  // ── freee CSV（デフォルト）──────────────────────────────────────────────────
  const header = '取引No,取引日,借方科目,借方税区分,借方金額,貸方科目,貸方税区分,貸方金額,摘要,インボイス番号';
  const lines = rows.map((r, i) => {
    const taxLabel = (r.tax_rate ?? 10) === 8 ? '課税仕入8%' : '課税仕入10%';
    return [
      i + 1, r.date,
      r.debit_account ?? '消耗品費', taxLabel, r.amount,
      r.credit_account ?? '現金', '不課税', r.amount,
      escCsv(r.merchant), escCsv(r.invoice_number),
    ].join(',');
  });
  const csv = '﻿' + [header, ...lines].join('\n');
  return new NextResponse(csv, { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="freee_${month}.csv"`,
  }});
}
