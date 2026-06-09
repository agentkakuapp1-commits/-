'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Camera, Loader2, CheckCircle2, TrendingUp, BarChart2, Download,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { Receipt } from '@/lib/supabase';

// ── i18n ──────────────────────────────────────────────────────────────────────
const i18n = {
  ja: {
    appName: 'スマート会計',
    tagline: 'レシートを撮るだけで帳簿が完成',
    tabScan: 'スキャン', tabReport: 'レポート',
    scanBtn: 'レシートをスキャン',
    analyzeBtn: '分析する', retakeBtn: 'やり直す',
    analyzing: '分析中...', analyzingSub: 'AIが内容を読み取っています',
    readDone: '読み取り完了',
    labelDate: '日付', labelMerchant: '店舗名', labelAmount: '金額',
    question: 'これは何のお買い物でしたか？', questionSub: 'タップして選んでください',
    cat1emoji: '🏢', cat1title: 'オフィス用品',    cat1sub: '消耗品費',
    cat2emoji: '🎁', cat2title: 'お客様への贈り物', cat2sub: '交際費',
    cat3emoji: '🏠', cat3title: '個人的な買い物',  cat3sub: '非業務',
    successTitle: '登録完了！', successSub: '仕訳が自動で記録されました',
    recentTitle: '最近の登録', monthlyTitle: '今月の合計',
    noHistory: 'まだ登録がありません', saving: '保存中...',
    reportTitle: '月次レポート',
    totalLabel: '合計金額', countLabel: '件数',
    catLabel: 'カテゴリ別', trendLabel: '月次推移',
    csvBtn: 'CSVエクスポート', noData: 'データがありません',
    langBtn: '中文',
  },
  zh: {
    appName: '智能会计助手',
    tagline: '拍照即可完成记账',
    tabScan: '扫描', tabReport: '报表',
    scanBtn: '扫描发票',
    analyzeBtn: '开始分析', retakeBtn: '重新拍摄',
    analyzing: '正在分析...', analyzingSub: 'AI 正在识别内容',
    readDone: '识别完成',
    labelDate: '日期', labelMerchant: '商家名称', labelAmount: '金额',
    question: '这是什么类型的消费？', questionSub: '请点击选择',
    cat1emoji: '🏢', cat1title: '办公设备',    cat1sub: '日常用品',
    cat2emoji: '🎁', cat2title: '客户礼品',    cat2sub: '接待交际',
    cat3emoji: '🏠', cat3title: '个人消费',    cat3sub: '非业务',
    successTitle: '登记完成！', successSub: '已自动记录凭证',
    recentTitle: '最近记录', monthlyTitle: '本月合计',
    noHistory: '暂无记录', saving: '保存中...',
    reportTitle: '月度报表',
    totalLabel: '合计金额', countLabel: '件数',
    catLabel: '分类明细', trendLabel: '月度趋势',
    csvBtn: '导出 CSV', noData: '暂无数据',
    langBtn: '日本語',
  },
} as const;

type Lang = keyof typeof i18n;
type ScanState = 'idle' | 'preview' | 'loading' | 'result' | 'saving' | 'done';
type Tab = 'scan' | 'report';

interface ReceiptData {
  date: string; merchant: string; amount: number;
  category: string; confidence: number;
}
interface ReportData {
  receipts: Receipt[];
  categoryBreakdown: { category: string; label: string; total: number; count: number }[];
  monthlyTotals: { month: string; total: number }[];
  total: number; count: number; month: string;
}

const CATS = [
  { key: 'office',         bg: 'bg-blue-50',    border: 'border-blue-200',    hover: 'hover:bg-blue-100 hover:border-blue-400',    text: 'text-blue-700',    sub: 'text-blue-400',    ek: 'cat1emoji' as const, tk: 'cat1title' as const, sk: 'cat1sub' as const },
  { key: 'entertainment',  bg: 'bg-pink-50',    border: 'border-pink-200',    hover: 'hover:bg-pink-100 hover:border-pink-400',    text: 'text-pink-700',    sub: 'text-pink-400',    ek: 'cat2emoji' as const, tk: 'cat2title' as const, sk: 'cat2sub' as const },
  { key: 'personal',       bg: 'bg-emerald-50', border: 'border-emerald-200', hover: 'hover:bg-emerald-100 hover:border-emerald-400', text: 'text-emerald-700', sub: 'text-emerald-400', ek: 'cat3emoji' as const, tk: 'cat3title' as const, sk: 'cat3sub' as const },
];
const CHART_COLORS = ['#4f46e5', '#ec4899', '#10b981', '#f59e0b', '#6366f1'];
const CAT_EMOJI: Record<string, string> = { office: '🏢', entertainment: '🎁', personal: '🏠' };

// ── Main Component ────────────────────────────────────────────────────────────
export default function Home() {
  const [lang, setLang]             = useState<Lang>('ja');
  const [tab, setTab]               = useState<Tab>('scan');
  const [scan, setScan]             = useState<ScanState>('idle');
  const [receipt, setReceipt]       = useState<ReceiptData | null>(null);
  const [history, setHistory]       = useState<Receipt[]>([]);
  const [monthly, setMonthly]       = useState(0);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [imgFile, setImgFile]       = useState<File | null>(null);
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [report, setReport]         = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const t = i18n[lang];

  // ── Data fetching ───────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/receipts');
      const d = await res.json();
      setHistory(d.receipts ?? []);
      setMonthly(d.monthlyTotal ?? 0);
    } catch {}
  }, []);

  const fetchReport = useCallback(async (month: string) => {
    setReportLoading(true);
    try {
      const res = await fetch(`/api/report?month=${month}`);
      setReport(await res.json());
    } catch {}
    setReportLoading(false);
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);
  useEffect(() => { if (tab === 'report') fetchReport(reportMonth); }, [tab, reportMonth, fetchReport]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgFile(file);
    setImgPreview(URL.createObjectURL(file));
    setScan('preview');
    // Reset input so same file can be reselected
    e.target.value = '';
  };

  const handleAnalyze = async () => {
    setScan('loading');
    try {
      let data: ReceiptData;
      if (imgFile) {
        const fd = new FormData();
        fd.append('image', imgFile);
        const res = await fetch('/api/analyze', { method: 'POST', body: fd });
        data = await res.json();
      } else {
        await new Promise(r => setTimeout(r, 2000));
        const res = await fetch('/api/analyze', { method: 'POST' });
        data = await res.json();
      }
      setReceipt(data);
      setScan('result');
    } catch {
      setReceipt({ date: new Date().toISOString().split('T')[0], merchant: 'エラー', amount: 0, category: 'unknown', confidence: 0 });
      setScan('result');
    }
  };

  const handleCategory = async (key: string, label: string) => {
    if (!receipt) return;
    setScan('saving');
    try {
      await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: receipt.date, merchant: receipt.merchant, amount: receipt.amount, category: key, category_label: label }),
      });
    } catch {}
    setScan('done');
    setTimeout(async () => {
      if (imgPreview) URL.revokeObjectURL(imgPreview);
      setImgPreview(null); setImgFile(null);
      await fetchHistory();
      setScan('idle'); setReceipt(null);
    }, 2000);
  };

  const changeMonth = (dir: 1 | -1) => {
    const d = new Date(`${reportMonth}-01`);
    d.setMonth(d.getMonth() + dir);
    const nm = d.toISOString().slice(0, 7);
    if (nm <= new Date().toISOString().slice(0, 7)) setReportMonth(nm);
  };

  const exportCSV = () => {
    if (!report) return;
    const rows = [
      ['日付', '店舗名', '金額', 'カテゴリ', '登録日'],
      ...report.receipts.map(r => [r.date, r.merchant, r.amount, r.category_label, r.created_at.slice(0, 10)]),
    ];
    const blob = new Blob(['﻿' + rows.map(r => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `receipts-${reportMonth}.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #e0e7ff 0%, #f0fdf4 100%)' }}>

      <div className="w-full bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxWidth: '400px', height: '720px' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="px-6 py-5 flex items-center justify-between flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
          <div>
            <h1 className="text-white font-extrabold text-lg leading-tight">{t.appName}</h1>
            <p className="text-indigo-200 text-xs mt-0.5">{t.tagline}</p>
          </div>
          <button onClick={() => setLang(lang === 'ja' ? 'zh' : 'ja')}
            className="text-white text-sm border border-white/30 rounded-full px-3 py-1.5 hover:bg-white/20 transition-all font-medium">
            {t.langBtn}
          </button>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Hidden file input */}
          <input ref={fileRef} type="file" accept="image/*"
            {...({ capture: 'environment' } as object)}
            className="hidden" onChange={handleImageSelect} />

          {/* ══ SCAN TAB ════════════════════════════════════════════════════ */}
          {tab === 'scan' && (
            <div className="flex flex-col items-center justify-center px-6 py-6 min-h-full">

              {/* IDLE */}
              {scan === 'idle' && (
                <div className="flex flex-col items-center gap-5 w-full">
                  {monthly > 0 && (
                    <div className="w-full rounded-2xl p-4 flex items-center justify-between"
                      style={{ background: 'linear-gradient(135deg, #ede9fe 0%, #dbeafe 100%)' }}>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-indigo-500" />
                        <span className="text-indigo-600 text-sm font-semibold">{t.monthlyTitle}</span>
                      </div>
                      <span className="text-indigo-700 font-extrabold text-xl">¥{monthly.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="w-24 h-24 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #ede9fe 0%, #dbeafe 100%)' }}>
                    <Camera className="w-12 h-12 text-indigo-500" strokeWidth={1.5} />
                  </div>
                  <button onClick={() => fileRef.current?.click()}
                    className="w-full text-white font-bold text-lg py-5 rounded-2xl shadow-lg hover:brightness-105 active:scale-[0.97] transition-all flex items-center justify-center gap-3"
                    style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
                    <Camera className="w-6 h-6" />{t.scanBtn}
                  </button>
                  <div className="w-full bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <p className="text-xs text-gray-400 font-semibold mb-3 uppercase tracking-wide">{t.recentTitle}</p>
                    {history.length === 0
                      ? <p className="text-gray-300 text-sm text-center py-2">{t.noHistory}</p>
                      : history.slice(0, 4).map(item => (
                        <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{CAT_EMOJI[item.category] ?? '📄'}</span>
                            <div>
                              <p className="text-sm text-gray-700 font-medium leading-tight">{item.merchant}</p>
                              <p className="text-xs text-gray-400">{item.date}</p>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-indigo-600">¥{item.amount.toLocaleString()}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* PREVIEW */}
              {scan === 'preview' && imgPreview && (
                <div className="w-full flex flex-col gap-4">
                  <div className="rounded-2xl overflow-hidden border border-gray-200 bg-gray-50">
                    <img src={imgPreview} alt="receipt preview" className="w-full max-h-56 object-contain" />
                  </div>
                  <button onClick={handleAnalyze}
                    className="w-full text-white font-bold text-lg py-5 rounded-2xl shadow-lg hover:brightness-105 active:scale-[0.97] transition-all flex items-center justify-center gap-3"
                    style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
                    <Camera className="w-6 h-6" />{t.analyzeBtn}
                  </button>
                  <button
                    onClick={() => { if (imgPreview) URL.revokeObjectURL(imgPreview); setImgPreview(null); setImgFile(null); setScan('idle'); setTimeout(() => fileRef.current?.click(), 100); }}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium py-3 rounded-2xl transition-all">
                    {t.retakeBtn}
                  </button>
                </div>
              )}

              {/* LOADING */}
              {scan === 'loading' && (
                <div className="flex flex-col items-center gap-5">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-indigo-100 animate-ping opacity-40" />
                    <div className="w-24 h-24 rounded-full bg-indigo-50 flex items-center justify-center relative">
                      <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-800 font-bold text-xl">{t.analyzing}</p>
                    <p className="text-gray-400 text-sm mt-1">{t.analyzingSub}</p>
                  </div>
                  <div className="flex gap-2">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-2 h-2 rounded-full bg-indigo-300 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}

              {/* RESULT */}
              {scan === 'result' && receipt && (
                <div className="w-full flex flex-col gap-5">
                  <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                      <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">{t.readDone}</span>
                    </div>
                    <div className="space-y-2.5">
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">{t.labelDate}</span>
                        <span className="text-gray-800 font-medium text-sm">{receipt.date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">{t.labelMerchant}</span>
                        <span className="text-gray-800 font-medium text-sm">{receipt.merchant}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                        <span className="text-gray-400 text-sm">{t.labelAmount}</span>
                        <span className="text-2xl font-extrabold text-indigo-600">¥{receipt.amount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-800 font-bold text-base">{t.question}</p>
                    <p className="text-gray-400 text-xs mt-1">{t.questionSub}</p>
                  </div>
                  <div className="flex flex-col gap-3">
                    {CATS.map(c => (
                      <button key={c.key} onClick={() => handleCategory(c.key, t[c.tk])}
                        className={`w-full ${c.bg} ${c.hover} border-2 ${c.border} rounded-2xl p-4 flex items-center gap-4 transition-all active:scale-[0.97] text-left`}>
                        <span className="text-3xl">{t[c.ek]}</span>
                        <div>
                          <p className={`font-bold ${c.text} text-base`}>{t[c.tk]}</p>
                          <p className={`${c.sub} text-xs mt-0.5`}>{t[c.sk]}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* SAVING */}
              {scan === 'saving' && (
                <div className="flex flex-col items-center gap-5">
                  <div className="w-24 h-24 rounded-full bg-indigo-50 flex items-center justify-center">
                    <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                  </div>
                  <p className="text-gray-600 font-medium text-lg">{t.saving}</p>
                </div>
              )}

              {/* DONE */}
              {scan === 'done' && (
                <div className="flex flex-col items-center gap-5">
                  <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-14 h-14 text-emerald-500" strokeWidth={1.5} />
                  </div>
                  <div className="text-center">
                    <p className="text-gray-800 font-extrabold text-2xl">{t.successTitle}</p>
                    <p className="text-gray-400 text-sm mt-1">{t.successSub}</p>
                  </div>
                  <div className="flex gap-2">
                    {['bg-indigo-400', 'bg-pink-400', 'bg-emerald-400', 'bg-yellow-400'].map((c, i) => (
                      <div key={i} className={`w-2.5 h-2.5 rounded-full ${c}`} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ REPORT TAB ══════════════════════════════════════════════════ */}
          {tab === 'report' && (
            <div className="px-4 py-5">
              {/* Month navigator */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => changeMonth(-1)}
                  className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-all text-sm font-bold">
                  ◀
                </button>
                <span className="text-gray-800 font-bold">{reportMonth}</span>
                <button onClick={() => changeMonth(1)}
                  disabled={reportMonth >= new Date().toISOString().slice(0, 7)}
                  className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-all text-sm font-bold disabled:opacity-30">
                  ▶
                </button>
              </div>

              {reportLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
                </div>
              ) : report ? (
                <div className="flex flex-col gap-4">

                  {/* Summary cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-indigo-50 rounded-2xl p-4 text-center">
                      <p className="text-indigo-400 text-xs font-semibold mb-1">{t.totalLabel}</p>
                      <p className="text-indigo-700 font-extrabold text-xl">¥{report.total.toLocaleString()}</p>
                    </div>
                    <div className="bg-emerald-50 rounded-2xl p-4 text-center">
                      <p className="text-emerald-400 text-xs font-semibold mb-1">{t.countLabel}</p>
                      <p className="text-emerald-700 font-extrabold text-xl">{report.count}件</p>
                    </div>
                  </div>

                  {/* Pie chart – category breakdown */}
                  {report.categoryBreakdown.length > 0 && (
                    <div className="bg-gray-50 rounded-2xl p-4">
                      <p className="text-gray-600 font-semibold text-sm mb-2">{t.catLabel}</p>
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie data={report.categoryBreakdown} dataKey="total" nameKey="label"
                            cx="50%" cy="50%" outerRadius={65} innerRadius={30}>
                            {report.categoryBreakdown.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          <Tooltip formatter={(v: any) => `¥${Number(v).toLocaleString()}`} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-col gap-1.5 mt-1">
                        {report.categoryBreakdown.map((cat, i) => (
                          <div key={cat.category} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                              <span className="text-xs text-gray-600">{cat.label}（{cat.count}件）</span>
                            </div>
                            <span className="text-xs font-semibold text-gray-700">¥{cat.total.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bar chart – monthly trend */}
                  {report.monthlyTotals.length > 1 && (
                    <div className="bg-gray-50 rounded-2xl p-4">
                      <p className="text-gray-600 font-semibold text-sm mb-2">{t.trendLabel}</p>
                      <ResponsiveContainer width="100%" height={120}>
                        <BarChart data={report.monthlyTotals} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                          <XAxis dataKey="month" tick={{ fontSize: 9 }}
                            tickFormatter={(m) => `${parseInt(String(m).slice(5))}月`} />
                          <YAxis tick={{ fontSize: 9 }} />
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          <Tooltip
                            formatter={(v: any) => `¥${Number(v).toLocaleString()}`}
                            labelFormatter={(m: any) => String(m)} />
                          <Bar dataKey="total" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* CSV export */}
                  {report.receipts.length > 0 && (
                    <button onClick={exportCSV}
                      className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-2xl flex items-center justify-center gap-2 transition-all">
                      <Download className="w-4 h-4" />{t.csvBtn}
                    </button>
                  )}

                  {/* Transaction list */}
                  {report.receipts.length === 0 ? (
                    <p className="text-center text-gray-300 text-sm py-6">{t.noData}</p>
                  ) : (
                    <div className="bg-gray-50 rounded-2xl overflow-hidden">
                      {report.receipts.map((item, i) => (
                        <div key={item.id}
                          className={`flex items-center justify-between p-3 ${i < report.receipts.length - 1 ? 'border-b border-gray-100' : ''}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{CAT_EMOJI[item.category] ?? '📄'}</span>
                            <div>
                              <p className="text-sm text-gray-700 font-medium leading-tight">{item.merchant}</p>
                              <p className="text-xs text-gray-400">{item.date} · {item.category_label}</p>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-indigo-600">¥{item.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center text-gray-300 text-sm py-16">{t.noData}</p>
              )}
            </div>
          )}
        </div>

        {/* ── Bottom Tabs ──────────────────────────────────────────────────── */}
        <div className="border-t border-gray-100 grid grid-cols-2 flex-shrink-0">
            <button onClick={() => setTab('scan')}
            className={`py-3 flex flex-col items-center gap-1 transition-all ${tab === 'scan' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
            <Camera className="w-5 h-5" />
            <span className="text-xs font-semibold">{t.tabScan}</span>
          </button>
          <button onClick={() => setTab('report')}
            className={`py-3 flex flex-col items-center gap-1 transition-all ${tab === 'report' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
            <BarChart2 className="w-5 h-5" />
            <span className="text-xs font-semibold">{t.tabReport}</span>
          </button>
        </div>
      </div>
    </main>
  );
}
