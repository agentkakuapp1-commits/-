import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

function escCsv(s: string | null | undefined) {
  const v = String(s ?? '');
  return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
}

const CSS_BASE = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Hiragino Sans','Noto Sans JP',sans-serif;padding:32px;color:#111;font-size:13px}
  h1{font-size:18px;font-weight:700;text-align:center;margin-bottom:4px}
  .sub{text-align:center;font-size:12px;color:#555;margin-bottom:16px}
  .meta{display:flex;gap:24px;margin-bottom:16px;color:#555;font-size:12px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #333;padding:5px 8px}
  th{background:#222;color:#fff;font-weight:600;text-align:center}
  .num{text-align:right}
  .ctr{text-align:center}
  .bold{font-weight:700}
  .mono{font-family:monospace;font-size:11px}
  .section{background:#f3f4f6;font-weight:700}
  .indent{padding-left:20px}
  .total-row{background:#e8eaf6;font-weight:700}
  .grand{font-size:15px;font-weight:700;text-align:right;margin-top:12px}
  @media print{body{padding:16px}button{display:none}}
`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') ?? 'freee';
  const month  = searchParams.get('month')  ?? new Date().toISOString().slice(0, 7);

  // Use date-based filtering for consistency
  const startDate = `${month}-01`;
  const d = new Date(`${month}-01T00:00:00.000Z`);
  d.setMonth(d.getMonth() + 1);
  const endDate = d.toISOString().slice(0, 7) + '-01';

  const { data } = await supabase
    .from('receipts').select('*')
    .gte('date', startDate)
    .lt('date', endDate)
    .order('date', { ascending: true });

  const rows = data ?? [];

  // ── 購入明細表（いつ・何を・いくら）HTML ─────────────────────────────────────
  if (format === 'items') {
    const lang = searchParams.get('lang') === 'zh' ? 'zh' : 'ja';
    const L = lang === 'zh'
      ? { title:'购买明细表', period:'对象期间', created:'制表日', count:'笔数', date:'日期', col2:'商户 / 品目', qty:'数量', unit:'单价', amount:'金额', total:'合计' }
      : { title:'購入明細表', period:'対象期間', created:'作成日', count:'件数', date:'日付', col2:'取引先 / 品目', qty:'個数', unit:'単価', amount:'金額', total:'合計' };
    const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const total = rows.reduce((s, r) => s + r.amount, 0);

    const blocks = rows.map(r => {
      const lis: { name: string; qty: number; unit_price: number }[] = Array.isArray(r.line_items) ? r.line_items : [];
      const liRows = lis.map(li => {
        const q = Number(li.qty) || 0, u = Number(li.unit_price) || 0;
        return `<tr class="li">
          <td></td>
          <td class="liname">${esc(li.name)}</td>
          <td class="ctr">×${q}</td>
          <td class="num">¥${u.toLocaleString('ja-JP')}</td>
          <td class="num">¥${(q * u).toLocaleString('ja-JP')}</td>
        </tr>`;
      }).join('');
      return `<tr class="head">
        <td>${esc(r.date)}</td>
        <td colspan="3"><strong>${esc(r.merchant)}</strong>${r.item ? ` <span class="tag">${esc(r.item)}</span>` : ''}</td>
        <td class="num bold">¥${r.amount.toLocaleString('ja-JP')}</td>
      </tr>${liRows}`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8">
<title>${L.title} ${month}</title>
<style>
  ${CSS_BASE}
  table{border:2px solid #333}
  th{background:#1a1a2e;color:#fff;font-size:12px}
  td{font-size:12px}
  tr.head td{background:#eef0fb;border-top:2px solid #333}
  tr.li td{border-color:#e0e0e0;color:#333}
  .liname{padding-left:24px;color:#444}
  .tag{display:inline-block;margin-left:6px;padding:1px 8px;background:#4f46e5;color:#fff;border-radius:10px;font-size:10px}
  .grand{font-size:16px;font-weight:700;text-align:right;margin-top:12px;color:#4f46e5}
</style></head><body>
<h1>${L.title}</h1>
<div class="meta">
  <span>${L.period}：${month}</span>
  <span>${L.created}：${new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'ja-JP')}</span>
  <span>${L.count}：${rows.length}</span>
</div>
<table>
  <thead><tr>
    <th style="width:90px">${L.date}</th>
    <th>${L.col2}</th>
    <th style="width:60px">${L.qty}</th>
    <th style="width:90px">${L.unit}</th>
    <th style="width:100px">${L.amount}</th>
  </tr></thead>
  <tbody>${blocks}</tbody>
</table>
<div class="grand">${L.total}：¥${total.toLocaleString('ja-JP')}</div>
</body></html>`;

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // ── 経費管理表 HTML ──────────────────────────────────────────────────────────
  if (format === 'kanri') {
    const trs = rows.map((r, i) => {
      const d = r.date ?? '';
      const mm = d.slice(5, 7).replace(/^0/, '');
      const dd = d.slice(8, 10).replace(/^0/, '');
      return `<tr>
        <td class="ctr">${i + 1}</td>
        <td class="ctr">${mm}</td>
        <td class="ctr">${dd}</td>
        <td>${r.debit_account ?? '消耗品費'}</td>
        <td class="num">¥${r.amount.toLocaleString('ja-JP')}</td>
        <td>${r.merchant ?? ''}</td>
      </tr>`;
    }).join('');

    // Add empty rows to fill up to at least 32 lines
    const emptyCount = Math.max(0, 32 - rows.length);
    const emptyRows = Array.from({ length: emptyCount }, (_, i) =>
      `<tr><td class="ctr">${rows.length + i + 1}</td><td></td><td></td><td></td><td></td><td></td></tr>`
    ).join('');

    const total = rows.reduce((s, r) => s + r.amount, 0);

    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<title>経費管理表 ${month}</title>
<style>
  ${CSS_BASE}
  .header-row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}
  .year-label{font-size:14px;font-weight:700}
  .no-label{font-size:13px}
  table{border:2px solid #333}
  td,th{border:1px solid #aaa;height:22px}
  th{background:#333;color:#fff;font-size:12px}
  td{font-size:12px}
  .total-line{text-align:right;margin-top:8px;font-weight:700;font-size:14px}
</style></head><body>
<div class="header-row">
  <span class="year-label">${month.slice(0,4)}年${month.slice(5,7)}月</span>
  <span style="font-size:16px;font-weight:700;text-align:center;flex:1">経費管理表</span>
  <span class="no-label">作成日：${new Date().toLocaleDateString('ja-JP')}</span>
</div>
<table>
  <thead><tr>
    <th style="width:40px">No.</th>
    <th style="width:30px">月</th>
    <th style="width:30px">日</th>
    <th style="width:100px">勘定科目</th>
    <th style="width:90px">金額</th>
    <th>摘要</th>
  </tr></thead>
  <tbody>${trs}${emptyRows}</tbody>
</table>
<div class="total-line">合計：¥${total.toLocaleString('ja-JP')}</div>
</body></html>`;

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // ── 貸借対照表（試算表）HTML ─────────────────────────────────────────────────
  if (format === 'bs') {
    // Aggregate by debit account (費用の部)
    const debitMap: Record<string, number> = {};
    const creditMap: Record<string, number> = {};
    for (const r of rows) {
      const da = r.debit_account  ?? '消耗品費';
      const ca = r.credit_account ?? '現金';
      debitMap[da]  = (debitMap[da]  ?? 0) + r.amount;
      creditMap[ca] = (creditMap[ca] ?? 0) + r.amount;
    }

    const debitTotal  = Object.values(debitMap).reduce((s, v) => s + v, 0);
    const creditTotal = Object.values(creditMap).reduce((s, v) => s + v, 0);

    // Tax breakdown
    const tax8  = rows.filter(r => (r.tax_rate ?? 10) === 8).reduce((s, r) => s + r.amount, 0);
    const tax10 = rows.filter(r => (r.tax_rate ?? 10) === 10).reduce((s, r) => s + r.amount, 0);
    const taxTotal = rows.reduce((s, r) => s + (r.tax_amount ?? 0), 0);

    // Build debit rows (費用の部)
    const debitRows = Object.entries(debitMap)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<tr><td class="indent">${k}</td><td class="num">¥${v.toLocaleString('ja-JP')}</td></tr>`)
      .join('');

    // Build credit rows (支払の部)
    const creditRows = Object.entries(creditMap)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<tr><td class="indent">${k}</td><td class="num">¥${v.toLocaleString('ja-JP')}</td></tr>`)
      .join('');

    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<title>貸借対照表 ${month}</title>
<style>
  ${CSS_BASE}
  .bs-wrap{display:flex;gap:0}
  .bs-col{flex:1;border:2px solid #333}
  .bs-col + .bs-col{border-left:none}
  .bs-col table{width:100%;border-collapse:collapse}
  .bs-col td,th{border:1px solid #ccc;padding:5px 10px;font-size:13px}
  .bs-col .section{background:#333;color:#fff;text-align:center;font-size:13px;padding:6px}
  .bs-col .total-row td{border-top:2px solid #333;background:#f0f0f0;font-weight:700}
  .tax-box{margin-top:20px;border:1px solid #ccc;padding:12px;border-radius:4px;font-size:13px}
  .tax-box h3{font-size:13px;font-weight:700;margin-bottom:8px;border-bottom:1px solid #ccc;padding-bottom:4px}
  .tax-row{display:flex;justify-content:space-between;margin-top:4px}
  .inv-list{margin-top:16px}
  .inv-list h3{font-size:13px;font-weight:700;margin-bottom:6px}
  .inv-list table{border:1px solid #ccc}
  .inv-list td{border:1px solid #ddd;font-size:12px}
</style></head><body>
<h1>月次経費貸借対照表</h1>
<p class="sub">対象期間：${month} ／ 作成日：${new Date().toLocaleDateString('ja-JP')} ／ ${rows.length}件</p>

<div class="bs-wrap">
  <div class="bs-col">
    <div class="section">借方（費用の部）</div>
    <table>
      ${debitRows}
      <tr class="total-row"><td><strong>費用合計</strong></td><td class="num"><strong>¥${debitTotal.toLocaleString('ja-JP')}</strong></td></tr>
    </table>
  </div>
  <div class="bs-col">
    <div class="section">貸方（支払の部）</div>
    <table>
      ${creditRows}
      <tr class="total-row"><td><strong>支払合計</strong></td><td class="num"><strong>¥${creditTotal.toLocaleString('ja-JP')}</strong></td></tr>
    </table>
  </div>
</div>

<div class="tax-box">
  <h3>消費税内訳</h3>
  <div class="tax-row"><span>軽減税率対象（8%）</span><span>¥${tax8.toLocaleString('ja-JP')}</span></div>
  <div class="tax-row"><span>標準税率対象（10%）</span><span>¥${tax10.toLocaleString('ja-JP')}</span></div>
  <div class="tax-row" style="margin-top:8px;font-weight:700;border-top:1px solid #ccc;padding-top:6px">
    <span>消費税合計</span><span>¥${taxTotal.toLocaleString('ja-JP')}</span>
  </div>
</div>

${rows.some(r => r.invoice_number) ? `
<div class="inv-list">
  <h3>インボイス番号一覧</h3>
  <table style="width:100%">
    <thead><tr><th>日付</th><th>取引先</th><th>インボイス番号</th><th class="num">金額</th></tr></thead>
    <tbody>
      ${rows.filter(r => r.invoice_number).map(r =>
        `<tr><td>${r.date}</td><td>${r.merchant}</td><td class="mono">${r.invoice_number}</td><td class="num">¥${r.amount.toLocaleString('ja-JP')}</td></tr>`
      ).join('')}
    </tbody>
  </table>
</div>` : ''}

</body></html>`;

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // ── 経費精算書 HTML ──────────────────────────────────────────────────────────
  if (format === 'expense') {
    const total    = rows.reduce((s, r) => s + r.amount, 0);
    const taxTotal = rows.reduce((s, r) => s + (r.tax_amount ?? 0), 0);
    const trs = rows.map(r => `
      <tr>
        <td>${r.date}</td>
        <td>${r.merchant ?? ''}</td>
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
  ${CSS_BASE}
  table{border-collapse:collapse;width:100%}
  th{background:#1a1a2e;color:#fff;padding:8px 10px;text-align:left}
  td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
  tr:nth-child(even){background:#f9fafb}
  .totals{margin-top:16px;text-align:right}
  .totals div{margin-top:6px}
  .grand{font-size:18px;font-weight:700;color:#4f46e5;margin-top:8px}
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

  // ── マネーフォワード CSV ─────────────────────────────────────────────────────
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
