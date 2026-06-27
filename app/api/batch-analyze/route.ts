import { NextRequest, NextResponse } from 'next/server';

interface ReceiptData {
  date: string; merchant: string; amount: number; confidence: number;
  tax_rate: number; tax_amount: number; amount_before_tax: number;
  invoice_number: string | null; debit_account: string; credit_account: string;
  index: number; error?: string;
}

async function analyzeOne(
  imageBase64: string,
  imageMimeType: string,
  apiKey: string,
  index: number,
  today: string
): Promise<ReceiptData> {
  const prompt = `You are a Japanese accounting assistant. Analyze this receipt (it may be a photo or a PDF).
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
- invoice_number: "T" + 13 digits if visible, else null
- debit_account: best match from: 消耗品費, 交際費, 旅費交通費, 会議費, 広告宣伝費, 通信費, 水道光熱費, 地代家賃, 雑費
- credit_account: 現金 or 未払金 (if card)
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

  if (!res.ok) throw new Error(`Gemini ${res.status}`);

  const json = await res.json();
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error('No JSON in response');

  const p = JSON.parse(match[0]);
  const amount = Math.round(Number(p.amount) || 0);
  const taxRate = p.tax_rate === 8 ? 8 : 10;
  const taxAmount = Math.round(Number(p.tax_amount) || Math.round(amount * taxRate / (100 + taxRate)));
  return {
    index,
    date: String(p.date ?? today),
    merchant: String(p.merchant ?? '不明'),
    amount,
    confidence: Number(p.confidence) || 0.7,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    amount_before_tax: Math.round(Number(p.amount_before_tax) || (amount - taxAmount)),
    invoice_number: p.invoice_number ?? null,
    debit_account: String(p.debit_account ?? '消耗品費'),
    credit_account: String(p.credit_account ?? '現金'),
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const today = new Date().toISOString().split('T')[0];
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: 'FormData parse failed' }, { status: 400 }); }

  const files = formData.getAll('images') as File[];
  if (files.length === 0) return NextResponse.json({ error: 'No images' }, { status: 400 });
  if (files.length > 20) return NextResponse.json({ error: 'Max 20 images' }, { status: 400 });

  console.log(`[batch-analyze] ${files.length} images`);

  // Process in parallel with concurrency limit of 5
  const CONCURRENCY = 5;
  const results: ReceiptData[] = new Array(files.length);

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const chunk = files.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (file, ci) => {
      const idx = i + ci;
      try {
        const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
        results[idx] = await analyzeOne(base64, file.type || 'image/jpeg', apiKey, idx, today);
      } catch (e) {
        console.error(`[batch-analyze] idx=${idx} error:`, e);
        const mock = 0;
        results[idx] = {
          index: idx, date: today, merchant: `画像${idx + 1}`, amount: mock,
          confidence: 0, tax_rate: 10, tax_amount: 0, amount_before_tax: mock,
          invoice_number: null, debit_account: '消耗品費', credit_account: '現金',
          error: String(e),
        };
      }
    }));
  }

  return NextResponse.json({ results });
}
