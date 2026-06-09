import { NextRequest, NextResponse } from 'next/server';

interface ReceiptData {
  date: string;
  merchant: string;
  amount: number;
  category: string;
  confidence: number;
}

export async function POST(req: NextRequest): Promise<NextResponse<ReceiptData>> {
  const today = new Date().toISOString().split('T')[0];

  // ── 画像を FormData から取得 ────────────────────────────────────────────────
  let imageBase64: string | null = null;
  let imageMimeType = 'image/jpeg';

  try {
    const formData = await req.formData();
    const file = formData.get('image') as File | null;
    if (file) {
      const bytes = await file.arrayBuffer();
      imageBase64 = Buffer.from(bytes).toString('base64');
      imageMimeType = file.type || 'image/jpeg';
      console.log(`[analyze] image received: ${file.name}, ${file.size}bytes, ${imageMimeType}`);
    } else {
      console.log('[analyze] no image in FormData — using mock');
    }
  } catch (e) {
    console.error('[analyze] FormData parse error:', e);
  }

  // ── API キー確認 ────────────────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  console.log(`[analyze] GEMINI_API_KEY set: ${!!apiKey}, imageBase64 set: ${!!imageBase64}`);

  // ── Gemini Vision で解析 ───────────────────────────────────────────────────
  if (apiKey && imageBase64) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const prompt = `Parse this receipt image. Respond ONLY with a single JSON object — no markdown, no explanation.
Format: {"date":"YYYY-MM-DD","merchant":"store name","amount":1234,"confidence":0.9}
- date: receipt date (use ${today} if not visible)
- merchant: store name exactly as printed
- amount: total in JPY as integer
- confidence: 0.0-1.0`;

      const result = await model.generateContent([
        { inlineData: { mimeType: imageMimeType, data: imageBase64 } },
        prompt,
      ]);

      const text = result.response.text().trim();
      console.log('[analyze] Gemini raw response:', text.slice(0, 200));

      const match = text.match(/\{[\s\S]*?\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        console.log('[analyze] parsed:', parsed);
        return NextResponse.json({
          date: String(parsed.date ?? today),
          merchant: String(parsed.merchant ?? '不明'),
          amount: Math.round(Number(parsed.amount) || 0),
          category: 'unknown',
          confidence: Number(parsed.confidence) || 0.5,
        });
      }
      console.log('[analyze] no JSON found in Gemini response');
    } catch (e) {
      console.error('[analyze] Gemini API error:', e);
    }
  }

  // ── フォールバック（モック）────────────────────────────────────────────────
  console.log('[analyze] returning mock data');
  await new Promise((r) => setTimeout(r, 80));
  return NextResponse.json({
    date: today,
    merchant: 'コクヨ 新宿店',
    amount: 3850,
    category: 'office_supplies',
    confidence: 0.45,
  });
}
