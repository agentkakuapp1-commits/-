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
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('image') as File | null;
      if (file) {
        const bytes = await file.arrayBuffer();
        imageBase64 = Buffer.from(bytes).toString('base64');
        imageMimeType = file.type || 'image/jpeg';
      }
    }
  } catch (e) {
    console.error('FormData parse error:', e);
  }

  // ── Gemini Vision で解析 ───────────────────────────────────────────────────
  if (process.env.GEMINI_API_KEY && imageBase64) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `You are a Japanese receipt parser. Analyze this receipt image.
Respond ONLY with a single JSON object — no markdown, no explanation.
Format: {"date":"YYYY-MM-DD","merchant":"store name","amount":1234,"confidence":0.9}

Rules:
- date: the receipt date (use ${today} if not visible)
- merchant: store/restaurant name exactly as printed
- amount: total amount as an integer in JPY (look for 合計・お会計・total)
- confidence: 0.0–1.0 reflecting extraction accuracy`;

      const result = await model.generateContent([
        { inlineData: { mimeType: imageMimeType, data: imageBase64 } },
        prompt,
      ]);

      const text = result.response.text().trim();
      const match = text.match(/\{[\s\S]*?\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return NextResponse.json({
          date: String(parsed.date ?? today),
          merchant: String(parsed.merchant ?? '不明'),
          amount: Math.round(Number(parsed.amount) || 0),
          category: 'unknown',
          confidence: Number(parsed.confidence) || 0.5,
        });
      }
    } catch (e) {
      console.error('Gemini error:', e);
    }
  }

  // ── フォールバック（モックデータ）──────────────────────────────────────────
  await new Promise((r) => setTimeout(r, 80));
  return NextResponse.json({
    date: today,
    merchant: 'コクヨ 新宿店',
    amount: 3850,
    category: 'office_supplies',
    confidence: 0.45,
  });
}
