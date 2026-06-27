import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function DELETE(
  _req: NextRequest,
  context: { params: { id: string } }
) {
  const { id } = context.params;
  const { error } = await supabase
    .from('receipts')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Update an existing receipt's accounts / category (used by manual edit & AI approve)
export async function PATCH(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const { id } = context.params;
  const body = await req.json();

  // Only allow a safe subset of fields to be patched
  const patch: Record<string, unknown> = {};
  if (body.item           !== undefined) patch.item           = body.item;
  if (body.line_items     !== undefined) patch.line_items     = body.line_items;
  if (body.debit_account  !== undefined) patch.debit_account  = body.debit_account;
  if (body.credit_account !== undefined) patch.credit_account = body.credit_account;
  if (body.category       !== undefined) patch.category       = body.category;
  if (body.category_label !== undefined) patch.category_label = body.category_label;
  if (body.notes          !== undefined) patch.notes          = body.notes;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('receipts')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 200 });
}
