import { NextRequest, NextResponse } from 'next/server';

interface ReceiptData {
  date: string; merchant: string; amount: number; category: string; confidence: number;
  tax_rate: number; tax_amount: number; amount_before_tax: number;
  invoice_number: string | null; debit_account: string; credit_account: string;
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
      const prompt = `You are a Japanese accounting assistant. Analyze this receipt image.
Return ONLY a valid JSON object, no markdown.

{
  "date": "YYYY-MM-DD",
  "merchant": "exact store name as printed",
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

      const match = text.match(/\{[\s\S]*?\}/);
      if (match) {
        const p = JSON.parse(match[0]);
        const amount = Math.round(Number(p.amount) || 0);
        const taxRate = p.tax_rate === 8 ? 8 : 10;
        const taxAmount = Math.round(Number(p.tax_amount) || Math.round(amount * taxRate / (100 + taxRate)));
        return NextResponse.json({
          date: String(p.date ?? today),
          merchant: String(p.merchant ?? '不明'),
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
    date: today, merchant: 'コクヨ 新宿店', amount: mock,
    category: 'office_supplies', confidence: 0.45,
    tax_rate: 10, tax_amount: mockTax, amount_before_tax: mock - mockTax,
    invoice_number: null, debit_account: '消耗品費', credit_account: '現金',
  });
}
