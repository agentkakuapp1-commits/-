import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data: receipts, error } = await supabase
    .from('receipts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { data: monthData } = await supabase
    .from('receipts').select('amount').gte('created_at', firstDay);

  const monthTotal = (monthData ?? []).reduce((s: number, r: { amount: number }) => s + r.amount, 0);

  return NextResponse.json({ receipts: receipts ?? [], monthTotal });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const { data, error } = await supabase.from('receipts').insert([{
    date:              body.date,
    merchant:          body.merchant,
    item:              body.item_ja           ?? body.item ?? null,
    item_ja:           body.item_ja           ?? body.item ?? null,
    item_zh:           body.item_zh           ?? null,
    line_items:        body.line_items        ?? [],
    amount:            body.amount,
    category:          body.category,
    category_label:    body.category_label,
    tax_rate:          body.tax_rate          ?? 10,
    tax_amount:        body.tax_amount        ?? 0,
    amount_before_tax: body.amount_before_tax ?? body.amount,
    invoice_number:    body.invoice_number    ?? null,
    debit_account:     body.debit_account     ?? '消耗品費',
    credit_account:    body.credit_account    ?? '現金',
    notes:             body.notes             ?? null,
  }]).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
