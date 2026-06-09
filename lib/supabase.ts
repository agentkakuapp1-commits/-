import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnon);

export interface Receipt {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  category: string;
  category_label: string;
  tax_rate: number;
  tax_amount: number;
  amount_before_tax: number;
  invoice_number: string | null;
  debit_account: string;
  credit_account: string;
  notes: string | null;
  created_at: string;
}
