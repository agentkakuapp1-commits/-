import { NextRequest, NextResponse } from 'next/server';

interface LineItem { name: string; qty: number; unit_price: number; }

interface ReceiptData {
  date: string; merchant: string; item: string; line_items: LineItem[]; amount: number; category: string; confidence: number;
  tax_rate: number; tax_amount: number; amount_before_tax: number;
  invoice_number: string | null; debit_account: string; credit_account: string;
}

// Gemini が返す line_items を安全な配列へ整形
function sanitizeLineItems(raw: unknown): LineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 50).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      name: String(o.name ?? '').trim().slice(0, 60) || '品目不明',
      qty: Math.max(1, Math.round(Number(o.qty) || 1)),
      unit_price: Math.max(0, Math.round(Number(o.unit_price) || 0)),
    };
  }).filter((li) => li.name);
}

export async function POST(req: NextRequest): Promise<NextResponse<ReceiptData>> {
  const today = new Date().toISOString().split('T')[0];
  let imageBase64: string | null = null;
  let imageMimeType = 'image/jpeg';

  try {
    const formData = await req.formData();
    const file = formData.get('image') as File | null;
    if (file) {
      imageBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');
      imageMimeType = file.type || 'image/jpeg';
      console.log(`[analyze] image: ${file.name} ${file.size}bytes ${imageMimeType}`);
    }
  } catch (e) { console.error('[analyze] FormData error:', e); }

  const apiKey = process.env.GEMINI_API_KEY;
  console.log(`[analyze] key=${!!apiKey} img=${!!imageBase64}`);

  if (apiKey && imageBase64) {
    try {
      const prompt = `You are a Japanese accounting assistant. Analyze this receipt (it may be a photo or a PDF).
Return ONLY a valid JSON object, no markdown.

{
  "date": "YYYY-MM-DD",
  "merchant": "exact store name as printed",
  "item": "コピー用紙・ボールペン",
  "line_items": [{"name": "コピー用紙", "qty": 3, "unit_price": 480}, {"name": "ボールペン", "qty": 2, "unit_price": 150}],
  "amount": 3850,
  "tax_rate": 10,
  "tax_amount": 350,
  "amount_before_tax": 3500,
  "invoice_number": null,
  "debit_account": "消耗品費",
  "credit_account": "現金",
  "confidence": 0.9
}

Rules:
- date: use ${today} if not clearly visible
- item: a short, human-readable summary (品目) of WHAT was actually purchased, in Japanese. Summarize the line items, max ~20 chars (e.g. "文房具一式", "会議用コーヒー", "ノートPC"). If unclear, infer the most likely category of goods from the store. Never leave empty.
- line_items: an array of each purchased line on the receipt. For every line: name (品目名, Japanese, concise), qty (個数, integer, default 1 if not shown), unit_price (単価 in integer JPY as printed). Exclude subtotal/tax/total/discount summary rows. If individual lines are not readable, return [].
- amount: total including tax, integer JPY
- tax_rate: 8 for food/beverages (軽減税率), 10 for all others
- tax_amount: consumption tax portion (integer)
- amount_before_tax: amount - tax_amount
- invoice_number: "T" + 13 digits if visible on receipt, else null
- debit_account: best match from: 消耗品費, 交際費, 旅費交通費, 会議費, 広告宣伝費, 通信費, 水道光熱費, 地代家賃, 雑費
- credit_account: 現金 (default) or 未払金 (if credit/card transaction)
- confidence: 0.0 to 1.0`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { inline_data: { mime_type: imageMimeType, data: imageBase64 } },
              { text: prompt },
            ]}],
          }),
        }
      );

      if (!res.ok) {
        const txt = await res.text();
        console.error(`[analyze] Gemini ${res.status}:`, txt.slice(0, 200));
        throw new Error(`${res.status}`);
      }

      const json = await res.json();
      const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      console.log('[analyze] Gemini:', text.slice(0, 200));

      // 先頭の { から末尾の } まで（line_items の入れ子オブジェクトを含めて）取得
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const p = JSON.parse(match[0]);
        const amount = Math.round(Number(p.amount) || 0);
        const taxRate = p.tax_rate === 8 ? 8 : 10;
        const taxAmount = Math.round(Number(p.tax_amount) || Math.round(amount * taxRate / (100 + taxRate)));
        return NextResponse.json({
          date: String(p.date ?? today),
          merchant: String(p.merchant ?? '不明'),
          item: String(p.item ?? '').trim() || '品目不明',
          line_items: sanitizeLineItems(p.line_items),
          amount,
          category: 'unknown',
          confidence: Number(p.confidence) || 0.7,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          amount_before_tax: Math.round(Number(p.amount_before_tax) || (amount - taxAmount)),
          invoice_number: p.invoice_number ?? null,
          debit_account: String(p.debit_account ?? '消耗品費'),
          credit_account: String(p.credit_account ?? '現金'),
        });
      }
      console.log('[analyze] no JSON in response');
    } catch (e) { console.error('[analyze] error:', e); }
  }

  console.log('[analyze] mock fallback');
  const mock = 3850;
  const mockTax = Math.round(mock * 10 / 110);
  return NextResponse.json({
    date: today, merchant: 'コクヨ 新宿店', item: 'コピー用紙・文具',
    line_items: [
      { name: 'コピー用紙 A4', qty: 3, unit_price: 480 },
      { name: 'ボールペン 黒', qty: 2, unit_price: 150 },
    ],
    amount: mock,
    category: 'office_supplies', confidence: 0.45,
    tax_rate: 10, tax_amount: mockTax, amount_before_tax: mock - mockTax,
    invoice_number: null, debit_account: '消耗品費', credit_account: '現金',
  });
}
