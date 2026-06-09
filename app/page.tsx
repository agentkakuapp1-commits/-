'use client';

import { useState } from 'react';
import { Camera, Loader2, CheckCircle2 } from 'lucide-react';

// ── i18n ──────────────────────────────────────────────────────────────────────
const i18n = {
  ja: {
    appName: 'スマート会計',
    tagline: 'レシートを撮るだけで帳簿が完成',
    scanBtn: 'レシートをスキャン',
    analyzing: '分析中...',
    analyzingSub: 'AIが内容を読み取っています',
    readDone: '読み取り完了',
    labelDate: '日付',
    labelMerchant: '店舗名',
    labelAmount: '金額',
    question: 'これは何のお買い物でしたか？',
    questionSub: 'タップして選んでください',
    cat1emoji: '🏢',
    cat1title: 'オフィス用品',
    cat1sub: '消耗品費',
    cat2emoji: '🎁',
    cat2title: 'お客様への贈り物',
    cat2sub: '交際費',
    cat3emoji: '🏠',
    cat3title: '個人的な買い物',
    cat3sub: '非業務',
    successTitle: '登録完了！',
    successSub: '仕訳が自動で記録されました',
    footer: 'Powered by AI · スマート会計',
    langBtn: '中文',
  },
  zh: {
    appName: '智能会计助手',
    tagline: '拍照即可完成记账',
    scanBtn: '扫描发票',
    analyzing: '正在分析...',
    analyzingSub: 'AI 正在识别内容',
    readDone: '识别完成',
    labelDate: '日期',
    labelMerchant: '商家名称',
    labelAmount: '金额',
    question: '这是什么类型的消费？',
    questionSub: '请点击选择',
    cat1emoji: '🏢',
    cat1title: '办公设备',
    cat1sub: '日常用品',
    cat2emoji: '🎁',
    cat2title: '客户礼品',
    cat2sub: '接待交际',
    cat3emoji: '🏠',
    cat3title: '个人消费',
    cat3sub: '非业务',
    successTitle: '登记完成！',
    successSub: '已自动记录凭证',
    footer: 'Powered by AI · 智能会计',
    langBtn: '日本語',
  },
} as const;

type Lang = keyof typeof i18n;
type AppState = 'idle' | 'loading' | 'result' | 'done';

interface ReceiptData {
  date: string;
  merchant: string;
  amount: number;
  category: string;
  confidence: number;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [lang, setLang] = useState<Lang>('ja');
  const [state, setState] = useState<AppState>('idle');
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const t = i18n[lang];

  // Scan → loading → result
  const handleScan = async () => {
    setState('loading');
    setTimeout(async () => {
      try {
        const res = await fetch('/api/analyze', { method: 'POST' });
        const data: ReceiptData = await res.json();
        setReceipt(data);
      } catch {
        // fallback mock if API unreachable
        setReceipt({
          date: '2026-06-09',
          merchant: 'コクヨ 新宿店',
          amount: 3850,
          category: 'office_supplies',
          confidence: 0.45,
        });
      }
      setState('result');
    }, 2000);
  };

  // Category selected → done → back to idle
  const handleCategorySelect = () => {
    setState('done');
    setTimeout(() => {
      setState('idle');
      setReceipt(null);
    }, 2500);
  };

  return (
    <main
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #e0e7ff 0%, #f0fdf4 100%)' }}
    >
      {/* ── Phone Shell ─────────────────────────────────────────────────────── */}
      <div
        className="w-full bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxWidth: '400px', minHeight: '720px' }}
      >
        {/* Header */}
        <div
          className="px-6 py-5 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
        >
          <div>
            <h1 className="text-white font-extrabold text-lg leading-tight tracking-tight">
              {t.appName}
            </h1>
            <p className="text-indigo-200 text-xs mt-0.5">{t.tagline}</p>
          </div>
          <button
            onClick={() => setLang(lang === 'ja' ? 'zh' : 'ja')}
            className="text-white text-sm border border-white/30 rounded-full px-3 py-1.5 hover:bg-white/20 active:bg-white/30 transition-all font-medium"
          >
            {t.langBtn}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">

          {/* ── State 1: Idle ──────────────────────────────────────────────── */}
          {state === 'idle' && (
            <div className="flex flex-col items-center gap-8 w-full">
              {/* Illustration area */}
              <div className="flex flex-col items-center gap-3">
                <div
                  className="w-28 h-28 rounded-full flex items-center justify-center shadow-inner"
                  style={{ background: 'linear-gradient(135deg, #ede9fe 0%, #dbeafe 100%)' }}
                >
                  <Camera className="w-14 h-14 text-indigo-500" strokeWidth={1.5} />
                </div>
                <div className="flex gap-1.5">
                  {['📄', '🤖', '📊'].map((emoji, i) => (
                    <span
                      key={i}
                      className="text-xl bg-gray-50 rounded-xl px-3 py-1.5 shadow-sm border border-gray-100"
                    >
                      {emoji}
                    </span>
                  ))}
                </div>
              </div>

              {/* CTA Button */}
              <button
                onClick={handleScan}
                className="w-full text-white font-bold text-lg py-5 rounded-2xl shadow-lg hover:shadow-xl hover:brightness-105 active:scale-[0.97] transition-all flex items-center justify-center gap-3"
                style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
              >
                <Camera className="w-6 h-6" />
                {t.scanBtn}
              </button>

              {/* Recent badge (decorative) */}
              <div className="w-full bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">
                  {lang === 'ja' ? '最近の登録' : '最近记录'}
                </p>
                {[
                  { emoji: '☕', name: lang === 'ja' ? 'スターバックス' : '星巴克', amount: '¥680', color: 'text-green-600' },
                  { emoji: '🍱', name: lang === 'ja' ? '松屋 渋谷店' : '松屋 涩谷店', amount: '¥750', color: 'text-orange-600' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{item.emoji}</span>
                      <span className="text-sm text-gray-600">{item.name}</span>
                    </div>
                    <span className={`text-sm font-semibold ${item.color}`}>{item.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── State 2: Loading ───────────────────────────────────────────── */}
          {state === 'loading' && (
            <div className="flex flex-col items-center gap-5">
              <div className="relative">
                {/* Outer pulse ring */}
                <div className="absolute inset-0 rounded-full bg-indigo-100 animate-ping opacity-40" />
                <div className="w-24 h-24 rounded-full bg-indigo-50 flex items-center justify-center relative">
                  <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-gray-800 font-bold text-xl">{t.analyzing}</p>
                <p className="text-gray-400 text-sm mt-1">{t.analyzingSub}</p>
              </div>
              {/* Progress dots */}
              <div className="flex gap-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-indigo-300 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── State 3: Result ────────────────────────────────────────────── */}
          {state === 'result' && receipt && (
            <div className="w-full flex flex-col gap-5">
              {/* Receipt card */}
              <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full inline-block" />
                  <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                    {t.readDone}
                  </span>
                </div>
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">{t.labelDate}</span>
                    <span className="text-gray-800 font-medium text-sm">{receipt.date}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">{t.labelMerchant}</span>
                    <span className="text-gray-800 font-medium text-sm">{receipt.merchant}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                    <span className="text-gray-400 text-sm">{t.labelAmount}</span>
                    <span className="text-2xl font-extrabold text-indigo-600">
                      ¥{receipt.amount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Question prompt */}
              <div className="text-center">
                <p className="text-gray-800 font-bold text-base">{t.question}</p>
                <p className="text-gray-400 text-xs mt-1">{t.questionSub}</p>
              </div>

              {/* Category buttons */}
              <div className="flex flex-col gap-3">
                {/* Office */}
                <button
                  onClick={handleCategorySelect}
                  className="w-full bg-blue-50 hover:bg-blue-100 border-2 border-blue-200 hover:border-blue-400 rounded-2xl p-4 flex items-center gap-4 transition-all active:scale-[0.97] text-left"
                >
                  <span className="text-3xl leading-none">{t.cat1emoji}</span>
                  <div>
                    <p className="font-bold text-blue-700 text-base">{t.cat1title}</p>
                    <p className="text-blue-400 text-xs mt-0.5">{t.cat1sub}</p>
                  </div>
                </button>

                {/* Gift / Entertainment */}
                <button
                  onClick={handleCategorySelect}
                  className="w-full bg-pink-50 hover:bg-pink-100 border-2 border-pink-200 hover:border-pink-400 rounded-2xl p-4 flex items-center gap-4 transition-all active:scale-[0.97] text-left"
                >
                  <span className="text-3xl leading-none">{t.cat2emoji}</span>
                  <div>
                    <p className="font-bold text-pink-700 text-base">{t.cat2title}</p>
                    <p className="text-pink-400 text-xs mt-0.5">{t.cat2sub}</p>
                  </div>
                </button>

                {/* Personal */}
                <button
                  onClick={handleCategorySelect}
                  className="w-full bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-200 hover:border-emerald-400 rounded-2xl p-4 flex items-center gap-4 transition-all active:scale-[0.97] text-left"
                >
                  <span className="text-3xl leading-none">{t.cat3emoji}</span>
                  <div>
                    <p className="font-bold text-emerald-700 text-base">{t.cat3title}</p>
                    <p className="text-emerald-400 text-xs mt-0.5">{t.cat3sub}</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ── State 4: Done ──────────────────────────────────────────────── */}
          {state === 'done' && (
            <div className="flex flex-col items-center gap-5">
              <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center shadow-inner">
                <CheckCircle2 className="w-14 h-14 text-emerald-500" strokeWidth={1.5} />
              </div>
              <div className="text-center">
                <p className="text-gray-800 font-extrabold text-2xl">{t.successTitle}</p>
                <p className="text-gray-400 text-sm mt-1">{t.successSub}</p>
              </div>
              {/* Confetti dots (decorative) */}
              <div className="flex gap-2">
                {['bg-indigo-400', 'bg-pink-400', 'bg-emerald-400', 'bg-yellow-400'].map(
                  (color, i) => (
                    <div key={i} className={`w-2.5 h-2.5 rounded-full ${color}`} />
                  )
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5">
          <p className="text-center text-gray-300 text-xs">{t.footer}</p>
        </div>
      </div>
    </main>
  );
}
