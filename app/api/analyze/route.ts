import { NextRequest, NextResponse } from 'next/server';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ReceiptData {
  date: string;
  merchant: string;
  amount: number;
  category: string;
  confidence: number;
  items?: { name: string; price: number }[];
  raw_text?: string;
}

// ── POST /api/analyze ─────────────────────────────────────────────────────────
// Future implementation:
//   1. Parse multipart/form-data to get the uploaded image file
//   2. Send image bytes to Gemini Vision / OpenAI GPT-4o
//   3. Parse the LLM response into ReceiptData
//   4. Return the structured JSON
//
// For now, returns a fixed mock payload simulating low-confidence AI output
// (confidence < 0.5 triggers the category-selection UI in the frontend).

export async function POST(_req: NextRequest): Promise<NextResponse<ReceiptData>> {
  // ── Future: read uploaded image ──────────────────────────────────────────
  // const formData = await _req.formData();
  // const imageFile = formData.get('image') as File | null;
  // if (!imageFile) {
  //   return NextResponse.json({ error: 'No image provided' } as any, { status: 400 });
  // }
  //
  // ── Future: call Gemini Vision ───────────────────────────────────────────
  // const { GoogleGenerativeAI } = await import('@google/generative-ai');
  // const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  // const model = genai.getGenerativeModel({ model: 'gemini-1.5-flash' });
  // const result = await model.generateContent([
  //   { inlineData: { mimeType: imageFile.type, data: base64Image } },
  //   'Extract: date, merchant name, total amount, expense category, and confidence (0-1).',
  // ]);
  //
  // ── Future: call OpenAI GPT-4o ───────────────────────────────────────────
  // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  // const response = await openai.chat.completions.create({ ... });

  // ── Mock response (confidence intentionally low → triggers user selection) ─
  const mockReceipt: ReceiptData = {
    date: new Date().toISOString().split('T')[0], // today's date (YYYY-MM-DD)
    merchant: 'コクヨ 新宿店',
    amount: 3850,
    category: 'office_supplies',
    confidence: 0.45, // < 0.5 → frontend shows category-selection UI
    items: [
      { name: 'A4コピー用紙', price: 1200 },
      { name: 'ボールペン 10本セット', price: 880 },
      { name: 'クリアファイル', price: 440 },
      { name: 'マウスパッド', price: 1330 },
    ],
    raw_text: 'KOKUYO SHINJUKU\n2026/06/09 14:32\n合計 ¥3,850\n（税込）',
  };

  // Simulate a brief processing delay (optional — remove in production)
  await new Promise((resolve) => setTimeout(resolve, 80));

  return NextResponse.json(mockReceipt, { status: 200 });
}
