'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Camera, BarChart2, FileText, BookOpen,
  ChevronLeft, ChevronRight, Download, AlertTriangle,
  Check, Edit2, RefreshCw,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

// ── Types ────────────────────────────────────────────────────────────────────
type Lang = 'ja' | 'zh';
type ScanState = 'idle' | 'preview' | 'loading' | 'result' | 'saving' | 'done';
type TabId = 'scan' | 'journal' | 'analysis' | 'export';

interface ScanResult {
  date: string; merchant: string; amount: number;
  category: string; confidence: number;
  tax_rate: number; tax_amount: number; amount_before_tax: number;
  invoice_number: string | null; debit_account: string; credit_account: string;
}

interface Receipt {
  id: string; date: string; merchant: string; amount: number;
  category: string; category_label: string;
  tax_rate?: number; tax_amount?: number; amount_before_tax?: number;
  invoice_number?: string | null; debit_account?: string; credit_account?: string;
  created_at: string;
}

interface ReportData {
  receipts: Receipt[];
  categoryBreakdown: { category: string; label: string; total: number; count: number }[];
  monthlyTotals: { month: string; total: number }[];
  total: number; count: number; month: string;
}

interface Anomaly { type: string; message: string; severity: 'high' | 'medium'; }

// ── Constants ────────────────────────────────────────────────────────────────
const DEBIT_ACCOUNTS = ['消耗品費','交際費','旅費交通費','会議費','広告宣伝費','通信費','水道光熱費','地代家賃','雑費'];
const CREDIT_ACCOUNTS = ['現金','未払金','普通預金'];
const PIE_COLORS = ['#6C63FF','#FF6B9D','#43C59E','#FFB347','#87CEEB','#DDA0DD'];

const CATS = [
  { id: 'office_supplies', emoji: '🏢', color: 'blue'  },
  { id: 'entertainment',   emoji: '🎁', color: 'pink'  },
  { id: 'personal',        emoji: '🏠', color: 'green' },
] as const;

// ── i18n ─────────────────────────────────────────────────────────────────────
const T = {
  ja: {
    appName:'スマート会計', subtitle:'AIで仕訳・精算書を自動作成',
    switchLang:'中文',
    scan:'スキャン', journal:'仕訳帳', analysis:'分析', export:'出力',
    scanBtn:'レシートをスキャン', preview:'この画像を分析する', analyzing:'AI分析中…',
    readComplete:'読み取り完了',
    date:'日付', merchant:'店舗名', amount:'金額（税込）',
    amountBeforeTax:'税抜金額', taxAmount:'消費税', invoiceNumber:'インボイス番号',
    invoiceDetected:'T番号確認済',
    journalPreview:'仕訳プレビュー', debit:'借方', credit:'貸方',
    editAccounts:'勘定科目を変更',
    question:'これは何のお買い物でしたか？', tapSelect:'タップして選んでください',
    saving:'保存中…', saved:'保存しました！', scanAnother:'続けてスキャン',
    tax8:'軽減税率8%', tax10:'標準税率10%',
    catLabel:{ office_supplies:'オフィス用品', entertainment:'お客様への贈り物', personal:'個人的な買い物' },
    catSub:{ office_supplies:'消耗品費', entertainment:'交際費', personal:'非業務' },
    thisMonth:'今月の合計', recentHistory:'最近の取引', noHistory:'取引がありません',
    journalEntries:'仕訳一覧', noData:'データがありません',
    anomalyTitle:'異常検知', noAnomalies:'異常は検出されませんでした',
    monthly:'月別推移', byCategory:'カテゴリ別', total:'合計', count:'件数', totalTax:'消費税合計',
    exportTitle:'出力・精算書', exportNote:'CSVを会計ソフトへ取り込めます',
    exportFreee:'freee形式 CSV', exportMF:'マネーフォワード形式 CSV',
    expenseReport:'経費精算書を開く（印刷用）',
    csvInfo:'• freee：仕訳帳形式（借方・貸方・税区分）\n• MF：明細形式（科目・金額）\n• 精算書：ブラウザから印刷→PDF保存可',
  },
  zh: {
    appName:'智能会计', subtitle:'AI自动生成分录与报销单',
    switchLang:'日本語',
    scan:'扫描', journal:'分录', analysis:'分析', export:'导出',
    scanBtn:'扫描收据', preview:'分析此图片', analyzing:'AI分析中…',
    readComplete:'读取完成',
    date:'日期', merchant:'商户名', amount:'金额（含税）',
    amountBeforeTax:'税前金额', taxAmount:'消费税', invoiceNumber:'发票编号',
    invoiceDetected:'T号已确认',
    journalPreview:'分录预览', debit:'借方', credit:'贷方',
    editAccounts:'修改会计科目',
    question:'这是什么消费？', tapSelect:'点击选择',
    saving:'保存中…', saved:'已保存！', scanAnother:'继续扫描',
    tax8:'轻减税率8%', tax10:'标准税率10%',
    catLabel:{ office_supplies:'办公用品', entertainment:'客户礼品', personal:'个人消费' },
    catSub:{ office_supplies:'办公耗材费', entertainment:'交际费', personal:'非业务' },
    thisMonth:'本月合计', recentHistory:'近期交易', noHistory:'暂无交易',
    journalEntries:'分录列表', noData:'暂无数据',
    anomalyTitle:'异常检测', noAnomalies:'未检测到异常',
    monthly:'月度趋势', byCategory:'按类别', total:'合计', count:'笔数', totalTax:'消费税合计',
    exportTitle:'导出与报销单', exportNote:'下载CSV后可导入会计软件',
    exportFreee:'freee格式 CSV', exportMF:'MoneyForward格式 CSV',
    expenseReport:'生成费用报销单（打印用）',
    csvInfo:'• freee：日记账格式（借方・贷方・税区分）\n• MF：明细格式（科目・金额）\n• 报销单：浏览器打印→保存PDF',
  },
} as const;

// ── Component ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [lang, setLang]       = useState<Lang>('ja');
  const [tab, setTab]         = useState<TabId>('scan');
  const [scan, setScan]       = useState<ScanState>('idle');
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [editDebit,  setEditDebit]  = useState('消耗品費');
  const [editCredit, setEditCredit] = useState('現金');
  const [showEditor, setShowEditor] = useState(false);

  const [receipts,   setReceipts]   = useState<Receipt[]>([]);
  const [monthTotal, setMonthTotal] = useState(0);
  const [report,     setReport]     = useState<ReportData | null>(null);
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [anomalies,  setAnomalies]  = useState<Anomaly[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);
  const t = T[lang];

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadReceipts = useCallback(async () => {
    try {
      const r = await fetch('/api/receipts'); const j = await r.json();
      setReceipts(j.receipts ?? []); setMonthTotal(j.monthTotal ?? 0);
    } catch {}
  }, []);

  const loadReport = useCallback(async (m: string) => {
    try {
      const r = await fetch(`/api/report?month=${m}`); setReport(await r.json());
    } catch {}
  }, []);

  const loadAnomalies = useCallback(async (m: string) => {
    try {
      const r = await fetch(`/api/anomaly?month=${m}`); const j = await r.json();
      setAnomalies(j.alerts ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    loadReceipts();
    const m = new Date().toISOString().slice(0, 7);
    loadReport(m); loadAnomalies(m);
  }, [loadReceipts, loadReport, loadAnomalies]);

  const changeReportMonth = (delta: number) => {
    const d = new Date(reportMonth + '-01'); d.setMonth(d.getMonth() + delta);
    const m = d.toISOString().slice(0, 7);
    setReportMonth(m); loadReport(m); loadAnomalies(m);
  };

  // ── Scan handlers ───────────────────────────────────────────────────────────
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImgFile(file);
    const reader = new FileReader();
    reader.onload = ev => { setImgPreview(ev.target?.result as string); setScan('preview'); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAnalyze = async () => {
    setScan('loading');
    try {
      let data: ScanResult;
      if (imgFile) {
        const fd = new FormData(); fd.append('image', imgFile);
        data = await (await fetch('/api/analyze', { method: 'POST', body: fd })).json();
      } else {
        await new Promise(r => setTimeout(r, 1200));
        data = await (await fetch('/api/analyze', { method: 'POST' })).json();
      }
      setScanResult(data);
      setEditDebit(data.debit_account || '消耗品費');
      setEditCredit(data.credit_account || '現金');
      setShowEditor(false);
      setScan('result');
    } catch { setScan('idle'); }
  };

  const handleSave = async (cat: typeof CATS[number]) => {
    if (!scanResult) return;
    setScan('saving');
    try {
      await fetch('/api/receipts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: scanResult.date, merchant: scanResult.merchant, amount: scanResult.amount,
          category: cat.id, category_label: t.catLabel[cat.id],
          tax_rate: scanResult.tax_rate, tax_amount: scanResult.tax_amount,
          amount_before_tax: scanResult.amount_before_tax,
          invoice_number: scanResult.invoice_number,
          debit_account: editDebit, credit_account: editCredit,
        }),
      });
      setScan('done'); loadReceipts();
    } catch { setScan('result'); }
  };

  const resetScan = () => {
    setScan('idle'); setImgFile(null); setImgPreview(null); setScanResult(null);
  };

  // ── Export ──────────────────────────────────────────────────────────────────
  const downloadCSV = async (format: 'freee' | 'mf') => {
    const res = await fetch(`/api/export?format=${format}&month=${exportMonth}`);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${format}_${exportMonth}.csv`; a.click();
  };

  const openExpenseReport = () => {
    window.open(`/api/export?format=expense&month=${exportMonth}`, '_blank');
  };

  // ── Month nav helper ────────────────────────────────────────────────────────
  const MonthNav = ({ value, onChange }: { value: string; onChange: (d: number) => void }) => (
    <div className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 shadow-sm">
      <button onClick={() => onChange(-1)} className="p-1 text-gray-400 hover:text-gray-700">
        <ChevronLeft size={20} />
      </button>
      <span className="font-bold text-gray-800">{value}</span>
      <button onClick={() => onChange(1)} className="p-1 text-gray-400 hover:text-gray-700">
        <ChevronRight size={20} />
      </button>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex justify-center">
      <div className="w-full max-w-[420px] flex flex-col min-h-screen">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-5 pt-10 pb-5 shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t.appName}</h1>
              <p className="text-indigo-200 text-xs mt-0.5">{t.subtitle}</p>
            </div>
            <button
              onClick={() => setLang(l => l === 'ja' ? 'zh' : 'ja')}
              className="border border-white/40 text-xs px-3 py-1.5 rounded-full hover:bg-white/20 transition-colors"
            >
              {t.switchLang}
            </button>
          </div>
          <div className="mt-4 bg-white/20 rounded-xl px-4 py-2.5 flex justify-between items-center">
            <span className="text-sm text-indigo-100">{t.thisMonth}</span>
            <span className="text-xl font-bold">¥{monthTotal.toLocaleString('ja-JP')}</span>
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 pb-24">

          {/* ════ SCAN TAB ════════════════════════════════════════════════ */}
          {tab === 'scan' && (
            <>
              <input ref={fileRef} type="file" accept="image/*"
                {...({ capture: 'environment' } as object)}
                className="hidden" onChange={handleImageSelect} />

              {scan === 'idle' && (
                <>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white py-6 rounded-2xl flex flex-col items-center gap-2 shadow-lg active:scale-95 transition-transform"
                  >
                    <Camera size={36} />
                    <span className="font-semibold text-lg">{t.scanBtn}</span>
                  </button>
                  {receipts.length > 0 && (
                    <div>
                      <h2 className="font-semibold text-gray-700 mb-2 text-sm">{t.recentHistory}</h2>
                      <div className="space-y-2">
                        {receipts.slice(0, 5).map(r => (
                          <div key={r.id} className="bg-white rounded-xl p-3 flex justify-between items-center shadow-sm">
                            <div>
                              <div className="font-medium text-sm text-gray-800">{r.merchant}</div>
                              <div className="text-xs text-gray-400">{r.date} · {r.debit_account ?? r.category_label}</div>
                            </div>
                            <span className="font-bold text-indigo-600 text-sm">¥{r.amount.toLocaleString('ja-JP')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {scan === 'preview' && imgPreview && (
                <div className="space-y-4">
                  <img src={imgPreview} alt="preview" className="w-full rounded-2xl object-cover max-h-72 shadow" />
                  <button onClick={handleAnalyze}
                    className="w-full bg-indigo-600 text-white py-3.5 rounded-2xl font-semibold shadow active:scale-95 transition-transform">
                    {t.preview}
                  </button>
                  <button onClick={resetScan} className="w-full text-gray-400 text-sm py-2">キャンセル</button>
                </div>
              )}

              {scan === 'loading' && (
                <div className="flex flex-col items-center py-16 gap-4">
                  <div className="w-14 h-14 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-gray-500 text-sm">{t.analyzing}</p>
                </div>
              )}

              {scan === 'result' && scanResult && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl shadow p-4 space-y-3">
                    {/* header badges */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-sm text-gray-500">{t.readComplete}</span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap justify-end">
                        {scanResult.invoice_number && (
                          <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{t.invoiceDetected}</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          scanResult.tax_rate === 8 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-600'
                        }`}>{scanResult.tax_rate === 8 ? t.tax8 : t.tax10}</span>
                      </div>
                    </div>

                    {/* basic info */}
                    <div className="space-y-1.5 border-b border-gray-100 pb-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t.date}</span>
                        <span className="font-medium">{scanResult.date}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t.merchant}</span>
                        <span className="font-medium">{scanResult.merchant}</span>
                      </div>
                    </div>

                    {/* tax breakdown */}
                    <div className="space-y-1 border-b border-gray-100 pb-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t.amountBeforeTax}</span>
                        <span className="text-gray-700">¥{scanResult.amount_before_tax.toLocaleString('ja-JP')}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t.taxAmount}（{scanResult.tax_rate}%）</span>
                        <span className="text-gray-700">¥{scanResult.tax_amount.toLocaleString('ja-JP')}</span>
                      </div>
                      <div className="flex justify-between font-bold pt-0.5">
                        <span className="text-gray-800">{t.amount}</span>
                        <span className="text-indigo-600 text-lg">¥{scanResult.amount.toLocaleString('ja-JP')}</span>
                      </div>
                    </div>

                    {/* invoice number */}
                    {scanResult.invoice_number && (
                      <div className="flex justify-between text-sm border-b border-gray-100 pb-3">
                        <span className="text-gray-500">{t.invoiceNumber}</span>
                        <span className="font-mono text-xs text-blue-700">{scanResult.invoice_number}</span>
                      </div>
                    )}

                    {/* journal preview */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-700">{t.journalPreview}</span>
                        <button onClick={() => setShowEditor(v => !v)}
                          className="text-xs text-indigo-600 flex items-center gap-1">
                          <Edit2 size={11} />{t.editAccounts}
                        </button>
                      </div>

                      {showEditor ? (
                        <div className="space-y-2">
                          {([
                            { label: t.debit,  val: editDebit,  set: setEditDebit,  opts: DEBIT_ACCOUNTS },
                            { label: t.credit, val: editCredit, set: setEditCredit, opts: CREDIT_ACCOUNTS },
                          ] as { label: string; val: string; set: (v: string) => void; opts: string[] }[]).map(({ label, val, set, opts }) => (
                            <div key={label}>
                              <label className="text-xs text-gray-500">{label}</label>
                              <select value={val} onChange={e => set(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5 focus:outline-none focus:border-indigo-400">
                                {opts.map(o => <option key={o}>{o}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-slate-50 rounded-xl p-3 text-sm font-mono border border-slate-200">
                          <div className="flex justify-between">
                            <span className="text-blue-700">借: {editDebit}</span>
                            <span className="text-gray-600">¥{scanResult.amount.toLocaleString('ja-JP')}</span>
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-emerald-700">貸: {editCredit}</span>
                            <span className="text-gray-600">¥{scanResult.amount.toLocaleString('ja-JP')}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* category selection */}
                  <p className="text-center font-semibold text-gray-700">{t.question}</p>
                  <p className="text-center text-xs text-gray-400">{t.tapSelect}</p>
                  <div className="space-y-3">
                    {CATS.map(cat => (
                      <button key={cat.id} onClick={() => handleSave(cat)}
                        className={`w-full p-4 rounded-2xl border-2 flex items-center gap-3 text-left active:scale-95 transition-transform ${
                          cat.color === 'blue'  ? 'border-blue-200 bg-blue-50'   :
                          cat.color === 'pink'  ? 'border-pink-200 bg-pink-50'   :
                                                  'border-green-200 bg-green-50'
                        }`}>
                        <span className="text-2xl">{cat.emoji}</span>
                        <div>
                          <div className={`font-semibold text-sm ${
                            cat.color === 'blue'  ? 'text-blue-700'  :
                            cat.color === 'pink'  ? 'text-pink-700'  :
                                                    'text-green-700'
                          }`}>{t.catLabel[cat.id]}</div>
                          <div className="text-xs text-gray-400">{t.catSub[cat.id]}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {scan === 'saving' && (
                <div className="flex flex-col items-center py-16 gap-3">
                  <div className="w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-gray-400 text-sm">{t.saving}</p>
                </div>
              )}

              {scan === 'done' && (
                <div className="flex flex-col items-center py-16 gap-5">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                    <Check size={32} className="text-emerald-600" />
                  </div>
                  <p className="font-semibold text-gray-700">{t.saved}</p>
                  <button onClick={resetScan}
                    className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-medium shadow active:scale-95 transition-transform">
                    {t.scanAnother}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ════ JOURNAL TAB ════════════════════════════════════════════ */}
          {tab === 'journal' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-800">{t.journalEntries}</h2>
                <button onClick={loadReceipts} className="text-gray-400 hover:text-gray-600 p-1">
                  <RefreshCw size={15} />
                </button>
              </div>

              {receipts.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-sm">{t.noData}</div>
              ) : receipts.map(r => (
                <div key={r.id} className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-medium text-gray-800 text-sm">{r.merchant}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{r.date}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {r.invoice_number && (
                        <span className="bg-blue-100 text-blue-600 text-xs px-1.5 py-0.5 rounded">{t.invoiceDetected}</span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        (r.tax_rate ?? 10) === 8 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'
                      }`}>{(r.tax_rate ?? 10) === 8 ? t.tax8 : t.tax10}</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3 text-xs font-mono border border-slate-100">
                    <div className="flex justify-between">
                      <span className="text-blue-700">借: {r.debit_account ?? '消耗品費'}</span>
                      <span className="text-gray-600">¥{r.amount.toLocaleString('ja-JP')}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-emerald-700">貸: {r.credit_account ?? '現金'}</span>
                      <span className="text-gray-600">¥{r.amount.toLocaleString('ja-JP')}</span>
                    </div>
                  </div>

                  {(r.tax_amount ?? 0) > 0 && (
                    <div className="mt-1.5 text-xs text-gray-400 text-right">
                      税抜 ¥{(r.amount_before_tax ?? 0).toLocaleString('ja-JP')} + 消費税 ¥{(r.tax_amount ?? 0).toLocaleString('ja-JP')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ════ ANALYSIS TAB ═══════════════════════════════════════════ */}
          {tab === 'analysis' && (
            <div className="space-y-4">
              <MonthNav value={reportMonth} onChange={changeReportMonth} />

              {anomalies.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="font-semibold text-gray-700 flex items-center gap-1.5 text-sm">
                    <AlertTriangle size={14} className="text-amber-500" />{t.anomalyTitle}
                  </h3>
                  {anomalies.map((a, i) => (
                    <div key={i} className={`p-3 rounded-xl text-sm flex gap-2 border ${
                      a.severity === 'high' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'
                    }`}>
                      <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />{a.message}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-emerald-600 text-sm bg-emerald-50 rounded-xl px-4 py-3">
                  <Check size={14} />{t.noAnomalies}
                </div>
              )}

              {report && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      [t.total,    `¥${report.total.toLocaleString('ja-JP')}`],
                      [t.count,    `${report.count}件`],
                      [t.totalTax, `¥${report.receipts.reduce((s, r) => s + (r.tax_amount ?? 0), 0).toLocaleString('ja-JP')}`],
                    ] as [string, string][]).map(([label, val]) => (
                      <div key={label} className="bg-white rounded-xl p-3 shadow-sm text-center">
                        <div className="text-xs text-gray-500">{label}</div>
                        <div className="font-bold text-indigo-600 text-sm mt-0.5 leading-tight">{val}</div>
                      </div>
                    ))}
                  </div>

                  {report.categoryBreakdown.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">{t.byCategory}</h3>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={report.categoryBreakdown} dataKey="total" nameKey="label" cx="50%" cy="50%" outerRadius={72}>
                            {report.categoryBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: any) => `¥${Number(v).toLocaleString('ja-JP')}`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {report.monthlyTotals.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">{t.monthly}</h3>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={report.monthlyTotals}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" tickFormatter={(m: any) => String(m).slice(5)} tick={{ fontSize: 10 }} />
                          <YAxis tickFormatter={(v: any) => `${Math.round(Number(v)/1000)}k`} tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: any) => `¥${Number(v).toLocaleString('ja-JP')}`} />
                          <Bar dataKey="total" fill="#6C63FF" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ════ EXPORT TAB ═════════════════════════════════════════════ */}
          {tab === 'export' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-bold text-gray-800">{t.exportTitle}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{t.exportNote}</p>
              </div>

              <MonthNav
                value={exportMonth}
                onChange={d => {
                  const nd = new Date(exportMonth + '-01'); nd.setMonth(nd.getMonth() + d);
                  setExportMonth(nd.toISOString().slice(0, 7));
                }}
              />

              <div className="space-y-3">
                <button onClick={() => downloadCSV('freee')}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3.5 px-4 rounded-2xl flex items-center gap-3 font-medium shadow active:scale-95 transition-transform">
                  <Download size={18} />{t.exportFreee}
                </button>
                <button onClick={() => downloadCSV('mf')}
                  className="w-full bg-sky-500 hover:bg-sky-600 text-white py-3.5 px-4 rounded-2xl flex items-center gap-3 font-medium shadow active:scale-95 transition-transform">
                  <Download size={18} />{t.exportMF}
                </button>
                <button onClick={openExpenseReport}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 px-4 rounded-2xl flex items-center gap-3 font-medium shadow active:scale-95 transition-transform">
                  <FileText size={18} />{t.expenseReport}
                </button>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 whitespace-pre-line leading-5 border border-gray-200">
                {t.csvInfo}
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom Nav ──────────────────────────────────────────────────── */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] bg-white border-t border-gray-200 flex shadow-lg">
          <button onClick={() => setTab('scan')}
            className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs transition-colors ${tab === 'scan' ? 'text-indigo-600' : 'text-gray-400'}`}>
            <Camera size={22} />{t.scan}
          </button>
          <button onClick={() => setTab('journal')}
            className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs transition-colors ${tab === 'journal' ? 'text-indigo-600' : 'text-gray-400'}`}>
            <BookOpen size={22} />{t.journal}
          </button>
          <button onClick={() => setTab('analysis')}
            className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs transition-colors ${tab === 'analysis' ? 'text-indigo-600' : 'text-gray-400'}`}>
            <BarChart2 size={22} />{t.analysis}
          </button>
          <button onClick={() => setTab('export')}
            className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs transition-colors ${tab === 'export' ? 'text-indigo-600' : 'text-gray-400'}`}>
            <FileText size={22} />{t.export}
          </button>
        </nav>
      </div>
    </div>
  );
}
