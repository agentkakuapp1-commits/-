'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Camera, BarChart2, FileText, BookOpen,
  ChevronLeft, ChevronRight, Download, AlertTriangle,
  Check, Edit2, RefreshCw, Trash2, X, Images, Loader2,
  CheckCircle2, Settings, Plus, Menu, List,
  Sparkles, Brain, Zap, ChevronDown, ShieldCheck, TrendingUp,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────
type Lang = 'ja' | 'zh';
type ScanState = 'idle' | 'preview' | 'loading' | 'result' | 'saving' | 'done';
type TabId = 'scan' | 'journal' | 'analysis' | 'export';
type ScanMode = 'single' | 'batch';

interface LineItem { name_ja: string; name_zh: string; qty: number; unit_price: number; name?: string /* legacy */; }

interface ScanResult {
  date: string; merchant: string; item_ja: string; item_zh: string; line_items: LineItem[]; amount: number;
  category: string; confidence: number;
  tax_rate: number; tax_amount: number; amount_before_tax: number;
  invoice_number: string | null; debit_account: string; credit_account: string;
}

interface BatchItem extends ScanResult {
  index: number;
  file: File;
  previewUrl: string;
  status: 'pending' | 'analyzing' | 'done' | 'error';
  editDebit: string;
  editCredit: string;
  category: string;
  saved?: boolean;
  error?: string;
}

interface Receipt {
  id: string; date: string; merchant: string;
  item?: string /* legacy */; item_ja?: string; item_zh?: string; line_items?: LineItem[]; amount: number;
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

// ── AI CFO (on-demand) types ─────────────────────────────────────────────────
// 1取引につきAIが提示する仕訳シナリオ（パターンA / B）
interface AiScenario {
  key: 'A' | 'B';
  label: string;
  debit: string;
  credit: string;
  taxCategory: string;
  deductible: number;   // 損金算入額（円）
  note: string;
  recommended: boolean;
}
interface AiResult {
  scenarios: AiScenario[];
  rationale: string;    // 推奨理由（言語連動）
  confidence: number;   // 0-100
  lang: Lang;           // どの言語で生成したか（言語パラメータ付与の証跡）
}
type AiPhase = 'idle' | 'loading' | 'ready';
interface RowAi {
  phase: AiPhase;
  step: number;             // ローディングの段階
  result: AiResult | null;
  chosen: 'A' | 'B' | null; // 採用シナリオ
}

// ── Constants ──────────────────────────────────────────────────────────────────
// Default account lists — user can edit these in AccountMaster modal
const DEFAULT_DEBIT: string[]  = ['消耗品費','交際費','旅費交通費','会議費','広告宣伝費','通信費','水道光熱費','地代家賃','外注費','福利厚生費','修繕費','雑費'];
const DEFAULT_CREDIT: string[] = ['現金','未払金','普通預金','クレジットカード'];

// For backwards compat — component reads from state, these are just used as fallback
const DEBIT_ACCOUNTS  = DEFAULT_DEBIT;
const CREDIT_ACCOUNTS = DEFAULT_CREDIT;
const PIE_COLORS      = ['#6C63FF','#FF6B9D','#43C59E','#FFB347','#87CEEB','#DDA0DD'];

const CATS = [
  { id: 'office_supplies', emoji: '🏢', color: 'blue'  },
  { id: 'entertainment',   emoji: '🎁', color: 'pink'  },
  { id: 'personal',        emoji: '🏠', color: 'green' },
] as const;

// ── i18n ───────────────────────────────────────────────────────────────────────
const T = {
  ja: {
    appName:'大鶴会計', subtitle:'AIで仕訳・精算書を自動作成',
    switchLang:'中文',
    scan:'スキャン', journal:'仕訳帳', analysis:'分析', export:'出力',
    scanBtn:'レシートをスキャン', batchBtn:'まとめてスキャン',
    preview:'この画像を分析する', analyzing:'AI分析中…',
    readComplete:'読み取り完了',
    date:'日付', merchant:'店舗名', item:'品目', itemPlaceholder:'例：コピー用紙・文具',
    lineItems:'明細', qty:'個数', unitPrice:'単価', subtotal:'小計', addLine:'明細を追加', itemName:'品目名',
    nameJa:'品目名（日本語）', nameZh:'品目名（中文）', itemJa:'品目（日本語）', itemZh:'品目（中文）',
    amount:'金額（税込）',
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
    deleteConfirm:'この仕訳を削除しますか？', delete:'削除', cancel:'キャンセル',
    anomalyTitle:'異常検知', noAnomalies:'異常は検出されませんでした',
    monthly:'月別推移', byCategory:'カテゴリ別', total:'合計', count:'件数', totalTax:'消費税合計',
    exportTitle:'出力・精算書', exportNote:'CSVを会計ソフトへ取り込めます',
    exportFreee:'freee形式 CSV', exportMF:'マネーフォワード形式 CSV',
    expenseReport:'経費精算書を開く（印刷用）',
    csvInfo:'• freee：仕訳帳形式（借方・貸方・税区分）\n• MF：明細形式（科目・金額）\n• 精算書：ブラウザから印刷→PDF保存可',
    batchTitle:'まとめてスキャン', batchSelect:'写真を選ぶ（複数可）',
    batchAnalyze:'まとめて分析する', batchSaveAll:'全て保存',
    batchProgress:'分析中…', batchDone:'分析完了',
    batchSaved:'保存済み',
    selectCategory:'カテゴリを選択',
    kanriReport:'経費管理表を開く（印刷用）',
    purchaseReport:'購入明細表を開く（いつ・何を・いくら）',
    bsReport:'貸借対照表を開く（印刷用）',
    accountMaster:'勘定科目マスタ',
    debitAccounts:'借方勘定科目（費用）',
    creditAccounts:'貸方勘定科目（支払）',
    addAccount:'科目を追加',
    accountPlaceholder:'例：接待交際費',
    bsTitle:'貸借対照表（月次）',
    bsDebitSide:'借方（費用の部）',
    bsCreditSide:'貸方（支払の部）',
    bsTotal:'合計',
    taxBreakdown:'消費税内訳',
    tax8label:'軽減税率8%対象',
    tax10label:'標準税率10%対象',
    taxTotalLabel:'消費税合計',
    noDataBs:'この月のデータがありません',
    ai: {
      standardMode:'スタンダード', cfoMode:'CFOモード', cfoHint:'AIが全取引を自動最適化',
      consult:'AIに相談', reconsult:'再分析',
      steps:['取引データを構造化中…','複雑な会計基準を照合中…','税務シミュレーションを実行中…','最適なシナリオを生成中…'],
      chooseScenario:'採用する仕訳パターンを選択', scenario:'パターン', recommended:'AI推奨',
      rationaleTitle:'AIの推奨理由', confidence:'信頼度',
      debit:'借方', credit:'貸方', taxCategory:'課税区分', deductible:'損金算入額',
      approve:'この内容で承認', reject:'却下', applied:'最適化を適用しました',
      generatedNote:(l:string)=>`この提案は「${l}」で生成`,
      manualEdit:'手動で勘定科目を変更', save:'保存する', cancel:'キャンセル', updated:'更新しました',
      langName:'日本語',
    },
  },
  zh: {
    appName:'大鹤会计', subtitle:'AI自动生成分录与报销单',
    switchLang:'日本語',
    scan:'扫描', journal:'分录', analysis:'分析', export:'导出',
    scanBtn:'扫描收据', batchBtn:'批量扫描',
    preview:'分析此图片', analyzing:'AI分析中…',
    readComplete:'读取完成',
    date:'日期', merchant:'商户名', item:'品目', itemPlaceholder:'例：复印纸・文具',
    lineItems:'明细', qty:'数量', unitPrice:'单价', subtotal:'小计', addLine:'添加明细', itemName:'品名',
    nameJa:'品名（日语）', nameZh:'品名（中文）', itemJa:'品目（日语）', itemZh:'品目（中文）',
    amount:'金额（含税）',
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
    deleteConfirm:'删除此分录？', delete:'删除', cancel:'取消',
    anomalyTitle:'异常检测', noAnomalies:'未检测到异常',
    monthly:'月度趋势', byCategory:'按类别', total:'合计', count:'笔数', totalTax:'消费税合计',
    exportTitle:'导出与报销单', exportNote:'下载CSV后可导入会计软件',
    exportFreee:'freee格式 CSV', exportMF:'MoneyForward格式 CSV',
    expenseReport:'生成费用报销单（打印用）',
    csvInfo:'• freee：日记账格式（借方・贷方・税区分）\n• MF：明细格式（科目・金额）\n• 报销单：浏览器打印→保存PDF',
    batchTitle:'批量扫描', batchSelect:'选择照片（可多选）',
    batchAnalyze:'批量分析', batchSaveAll:'全部保存',
    batchProgress:'分析中…', batchDone:'分析完成',
    batchSaved:'已保存',
    selectCategory:'选择类别',
    kanriReport:'费用管理表（打印用）',
    purchaseReport:'购买明细表（何时・买什么・多少钱）',
    bsReport:'资产负债表（打印用）',
    accountMaster:'会计科目管理',
    debitAccounts:'借方科目（费用）',
    creditAccounts:'贷方科目（支付）',
    addAccount:'添加科目',
    accountPlaceholder:'例：招待费',
    bsTitle:'月次资产负债表',
    bsDebitSide:'借方（费用）',
    bsCreditSide:'贷方（支付方式）',
    bsTotal:'合计',
    taxBreakdown:'消费税明细',
    tax8label:'轻减税率8%',
    tax10label:'标准税率10%',
    taxTotalLabel:'消费税合计',
    noDataBs:'本月暂无数据',
    ai: {
      standardMode:'标准模式', cfoMode:'CFO模式', cfoHint:'AI 自动优化所有交易',
      consult:'咨询 AI', reconsult:'重新分析',
      steps:['正在结构化交易数据…','正在比对复杂会计准则…','正在执行税务模拟…','正在生成最优方案…'],
      chooseScenario:'请选择要采用的分录方案', scenario:'方案', recommended:'AI 推荐',
      rationaleTitle:'AI 推荐理由', confidence:'置信度',
      debit:'借方', credit:'贷方', taxCategory:'税务类别', deductible:'可抵扣金额',
      approve:'批准此方案', reject:'拒绝', applied:'已应用优化',
      generatedNote:(l:string)=>`本建议以「${l}」生成`,
      manualEdit:'手动修改会计科目', save:'保存', cancel:'取消', updated:'已更新',
      langName:'中文',
    },
  },
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────
function prevMonth(m: string) {
  const d = new Date(m + '-01'); d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}
function nextMonth(m: string) {
  const d = new Date(m + '-01'); d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 7);
}
function currentMonth() { return new Date().toISOString().slice(0, 7); }

// ── Mock AI 推論器 ───────────────────────────────────────────────────────────
// 現在の言語(lang)をパラメータとして受け取り、提案理由・シナリオ説明を
// 言語連動で返す。実際のAPIは呼ばず、ローカルでトークン消費ゼロ。
function buildAiResult(r: Receipt, lang: Lang): AiResult {
  const abs = Math.abs(r.amount);
  const big = abs >= 100000;           // 高額資産か
  const cur = r.debit_account ?? '消耗品費';

  const tpl = {
    ja: {
      a: {
        key: 'A' as const, label: '節税重視プラン',
        debit: big ? '工具器具備品' : cur,
        credit: r.credit_account ?? '現金',
        taxCategory: '課税仕入 10%',
        deductible: big ? Math.round(abs * 0.25) : abs,
        note: big
          ? '少額減価償却資産の特例を適用し当期で即時償却します。'
          : '全額を当期費用として損金算入します。',
        recommended: true,
      },
      b: {
        key: 'B' as const, label: '資産計上プラン',
        debit: big ? '備品（資産計上）' : '消耗品費',
        credit: r.credit_account ?? '未払金',
        taxCategory: big ? '課税仕入 / 資産計上' : '課税仕入 10%',
        deductible: big ? Math.round(abs * 0.1) : Math.round(abs * 0.9),
        note: big
          ? '通常の減価償却（耐用年数4年）で平準化します。'
          : '翌期繰越を見据えた保守的な処理です。',
        recommended: false,
      },
      rationale: big
        ? '30万円未満のため少額減価償却資産の特例（即時償却）が利用可能です。当期利益を圧縮でき納税額を最適化できるため、資産計上よりパターンAを推奨します。'
        : '経費性が明確で金額も小さいため、当期費用として全額損金算入するのが最もシンプルかつ有利です。証憑添付で税務リスクも最小化されます。',
    },
    zh: {
      a: {
        key: 'A' as const, label: '节税优先方案',
        debit: big ? '工具器具' : cur,
        credit: r.credit_account ?? '现金',
        taxCategory: '应税进项 10%',
        deductible: big ? Math.round(abs * 0.25) : abs,
        note: big
          ? '适用小额折旧资产特例，当期即时摊销。'
          : '全额作为当期费用计入损金。',
        recommended: true,
      },
      b: {
        key: 'B' as const, label: '资产化方案',
        debit: big ? '设备（资产化）' : '易耗品费',
        credit: r.credit_account ?? '应付账款',
        taxCategory: big ? '应税进项 / 资产化' : '应税进项 10%',
        deductible: big ? Math.round(abs * 0.1) : Math.round(abs * 0.9),
        note: big
          ? '按常规折旧（使用年限4年）平摊处理。'
          : '着眼于次期结转的稳健处理。',
        recommended: false,
      },
      rationale: big
        ? '由于金额低于30万日元，可适用小额折旧资产特例（即时摊销），能压缩当期利润、优化纳税额，故相比资产化更推荐方案A。'
        : '费用属性明确且金额较小，作为当期费用全额计入损金最为简洁且有利。附上凭证即可将税务风险降至最低。',
    },
  }[lang];

  return {
    scenarios: [tpl.a, tpl.b],
    rationale: tpl.rationale,
    confidence: big ? 91 : 88,
    lang,
  };
}

// ── Logo with fallback ─────────────────────────────────────────────────────────
function LogoImg() {
  const [ok, setOk] = useState(true);
  return ok ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.jpeg"
      alt="大鶴会計"
      className="w-10 h-10 rounded-full object-cover flex-shrink-0 border-2 border-white/30"
      onError={() => setOk(false)}
    />
  ) : (
    <div className="w-10 h-10 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0 text-lg border-2 border-white/30">
      🦢
    </div>
  );
}

function MascotImg({ className }: { className?: string }) {
  const [ok, setOk] = useState(true);
  return ok ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/mascot.jpeg" alt="" className={className} onError={() => setOk(false)} />
  ) : null;
}

// 言語に依存しない AI 辞書の型（ja/zh どちらの t.ai も代入可能）
interface AiDict {
  standardMode: string; cfoMode: string; cfoHint: string;
  consult: string; reconsult: string;
  steps: readonly string[];
  chooseScenario: string; scenario: string; recommended: string;
  rationaleTitle: string; confidence: string;
  debit: string; credit: string; taxCategory: string; deductible: string;
  approve: string; reject: string; applied: string;
  generatedNote: (l: string) => string;
  manualEdit: string; save: string; cancel: string; updated: string;
  langName: string;
}

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;

// 言語に応じて品目名／品目要約を選ぶ（旧データは fallback）
const liName = (li: LineItem, lang: Lang) =>
  (lang === 'zh' ? li.name_zh : li.name_ja) || li.name_ja || li.name_zh || li.name || '';
const itemText = (r: { item_ja?: string; item_zh?: string; item?: string }, lang: Lang) =>
  (lang === 'zh' ? r.item_zh : r.item_ja) || r.item_ja || r.item_zh || r.item || '';

// ── 明細（品目ごとの個数・単価）表示 ────────────────────────────────────────
function LineItemsView({ items, lang, labels }: {
  items: LineItem[];
  lang: Lang;
  labels: { lineItems: string; subtotal: string };
}) {
  if (!items || items.length === 0) return null;
  const total = items.reduce((s, li) => s + li.qty * li.unit_price, 0);
  return (
    <div className="mt-2 rounded-xl border border-gray-100 bg-white overflow-hidden">
      <div className="bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-gray-600 border-b border-gray-100">
        {labels.lineItems}
      </div>
      <div className="divide-y divide-gray-50">
        {items.map((li, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
            <span className="text-gray-700 flex-1 truncate">{liName(li, lang)}</span>
            <span className="text-gray-400 mx-2 whitespace-nowrap">×{li.qty} @{yen(li.unit_price)}</span>
            <span className="font-medium text-gray-800 whitespace-nowrap">{yen(li.qty * li.unit_price)}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between px-3 py-1.5 text-[11px] font-bold bg-slate-50 border-t border-gray-100">
        <span className="text-gray-500">{labels.subtotal}</span>
        <span className="text-indigo-600">{yen(total)}</span>
      </div>
    </div>
  );
}

// ── 明細の手動編集（行の追加・削除・編集／日中の品目名） ─────────────────────
function LineItemsEditor({ items, onChange, labels }: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  labels: { lineItems: string; qty: string; unitPrice: string; addLine: string; nameJa: string; nameZh: string };
}) {
  const upd = (i: number, patch: Partial<LineItem>) =>
    onChange(items.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, { name_ja: '', name_zh: '', qty: 1, unit_price: 0 }]);
  return (
    <div className="space-y-2">
      <label className="text-[11px] text-gray-500">{labels.lineItems}</label>
      {items.map((li, i) => (
        <div key={i} className="rounded-lg border border-gray-200 bg-white p-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input value={li.name_ja} onChange={e => upd(i, { name_ja: e.target.value })} placeholder={labels.nameJa}
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-400" />
            <button onClick={() => remove(i)} className="text-gray-300 hover:text-red-400 p-0.5 flex-shrink-0"><X size={13} /></button>
          </div>
          <input value={li.name_zh} onChange={e => upd(i, { name_zh: e.target.value })} placeholder={labels.nameZh}
            className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-400" />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-400 w-8">{labels.qty}</span>
            <input type="number" min={1} value={li.qty}
              onChange={e => upd(i, { qty: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
              className="w-14 border border-gray-300 rounded-lg px-1.5 py-1 text-xs text-center focus:outline-none focus:border-indigo-400" />
            <span className="text-[10px] text-gray-400 w-8 text-right">{labels.unitPrice}</span>
            <input type="number" min={0} value={li.unit_price}
              onChange={e => upd(i, { unit_price: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
              className="flex-1 border border-gray-300 rounded-lg px-1.5 py-1 text-xs text-right focus:outline-none focus:border-indigo-400" />
          </div>
        </div>
      ))}
      <button onClick={add} className="inline-flex items-center gap-1 text-[11px] text-indigo-600">
        <Plus size={12} />{labels.addLine}
      </button>
    </div>
  );
}

// ── 段階的ローディング（期待感を高めるUX） ──────────────────────────────────
function AiLoadingBox({ step, d }: { step: number; d: AiDict }) {
  const steps = d.steps;
  const pct = Math.min(((step + 1) / steps.length) * 100, 100);
  return (
    <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-indigo-50 p-3.5 mt-2">
      <div className="flex items-center gap-2 mb-2.5">
        <Loader2 size={14} className="animate-spin text-violet-600" />
        <span key={step} className="text-xs font-medium text-violet-800">
          {steps[Math.min(step, steps.length - 1)]}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-violet-100 mb-3">
        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }} />
      </div>
      <ul className="space-y-1 mb-3">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-[11px]">
            {i < step ? <CheckCircle2 size={13} className="text-emerald-500" />
              : i === step ? <Loader2 size={13} className="animate-spin text-violet-500" />
              : <span className="w-3 h-3 rounded-full border border-gray-300" />}
            <span className={i <= step ? 'text-gray-700' : 'text-gray-400'}>{s}</span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        {[0, 1].map(i => (
          <div key={i} className="space-y-1.5 rounded-lg bg-white/70 p-2.5">
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-slate-200" />
            <div className="h-2 w-full animate-pulse rounded bg-slate-200" />
            <div className="h-2 w-4/5 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 結果展開（A/B Diff + 推奨理由 + 承認） ──────────────────────────────────
function AiResultBox({
  amount, result, chosen, d, onChoose, onApprove, onReject,
}: {
  amount: number;
  result: AiResult;
  chosen: 'A' | 'B' | null;
  d: AiDict;
  onChoose: (k: 'A' | 'B') => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [openRationale, setOpenRationale] = useState(true);
  return (
    <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/60 to-white p-3.5 mt-2 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-1.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-800">
          <Brain size={14} className="text-violet-600" />{d.chooseScenario}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
          <ShieldCheck size={12} />{d.confidence} {result.confidence}%
        </span>
      </div>

      {/* A/B カード（モバイル幅なので縦積み） */}
      <div className="space-y-2">
        {result.scenarios.map(sc => {
          const sel = chosen === sc.key;
          return (
            <button key={sc.key} onClick={() => onChoose(sc.key)}
              className={`relative w-full rounded-xl border-2 p-3 text-left transition-all ${
                sel ? 'border-violet-500 bg-violet-50' : 'border-gray-200 bg-white'
              }`}>
              {sc.recommended && (
                <span className="absolute -top-2 right-2 inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  <Sparkles size={9} />{d.recommended}
                </span>
              )}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-violet-600">{d.scenario} {sc.key} · {sc.label}</span>
                {sel && <CheckCircle2 size={14} className="text-violet-600" />}
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between"><span className="text-gray-500">{d.debit}</span><span className="font-medium text-gray-800">{sc.debit}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{d.credit}</span><span className="font-medium text-gray-800">{sc.credit}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{d.taxCategory}</span><span className="font-medium text-gray-800">{sc.taxCategory}</span></div>
                <div className="flex justify-between border-t border-gray-100 pt-1"><span className="text-gray-500">{d.deductible}</span><span className="font-bold text-emerald-600">{yen(sc.deductible)}</span></div>
              </div>
              <p className="mt-2 rounded-lg bg-slate-50 p-1.5 text-[10px] leading-relaxed text-gray-600">{sc.note}</p>
            </button>
          );
        })}
      </div>

      {/* 推奨理由アコーディオン */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <button onClick={() => setOpenRationale(v => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-left">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
            <TrendingUp size={13} className="text-violet-600" />{d.rationaleTitle}
          </span>
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${openRationale ? 'rotate-180' : ''}`} />
        </button>
        <div className={`grid transition-all duration-300 ${openRationale ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="overflow-hidden">
            <p className="px-3 pb-3 text-[11px] leading-relaxed text-gray-600">{result.rationale}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-gray-400">{d.generatedNote(d.langName)}</span>
        <div className="flex gap-2">
          <button onClick={onReject}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            <X size={13} />{d.reject}
          </button>
          <button onClick={onApprove} disabled={!chosen}
            className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow disabled:opacity-40">
            <Check size={13} />{d.approve}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function Home() {
  const [lang, setLang]       = useState<Lang>('ja');
  const [tab, setTab]         = useState<TabId>('scan');
  const [scanMode, setScanMode] = useState<ScanMode>('single');

  // Single scan
  const [scan, setScan]       = useState<ScanState>('idle');
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [editDebit,  setEditDebit]  = useState('消耗品費');
  const [editCredit, setEditCredit] = useState('現金');
  const [showEditor, setShowEditor] = useState(false);

  // Batch scan
  const [batchItems,    setBatchItems]    = useState<BatchItem[]>([]);
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [batchProgress,  setBatchProgress]  = useState(0);
  const [batchDoneCount, setBatchDoneCount] = useState(0);
  const [showCatPicker, setShowCatPicker] = useState<number | null>(null);

  // Data
  const [receipts,    setReceipts]    = useState<Receipt[]>([]);
  const [monthTotal,  setMonthTotal]  = useState(0);
  const [journalMonth, setJournalMonth] = useState(currentMonth);
  const [report,      setReport]      = useState<ReportData | null>(null);
  const [reportMonth, setReportMonth] = useState(currentMonth);
  const [exportMonth, setExportMonth] = useState(currentMonth);
  const [anomalies,   setAnomalies]   = useState<Anomaly[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // ── AI CFO (on-demand) state ──────────────────────────────────────────────
  const [cfoMode, setCfoMode] = useState(false);
  const [aiStates, setAiStates] = useState<Record<string, RowAi>>({});
  const aiTimers = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});

  // ── Manual account-edit state (確定後に勘定科目を変更) ──────────────────────
  const [editingId,        setEditingId]        = useState<string | null>(null);
  const [editDraftItemJa,  setEditDraftItemJa]  = useState('');
  const [editDraftItemZh,  setEditDraftItemZh]  = useState('');
  const [editDraftLines,   setEditDraftLines]   = useState<LineItem[]>([]);
  const [editDraftDebit,  setEditDraftDebit]  = useState('');
  const [editDraftCredit, setEditDraftCredit] = useState('');
  const [savingEdit,      setSavingEdit]      = useState(false);

  // Account master state
  const [showAccountMaster, setShowAccountMaster] = useState(false);
  const [masterDebits,  setMasterDebits]  = useState<string[]>(DEFAULT_DEBIT);
  const [masterCredits, setMasterCredits] = useState<string[]>(DEFAULT_CREDIT);
  const [newDebit,  setNewDebit]  = useState('');
  const [newCredit, setNewCredit] = useState('');

  // Balance sheet inline state
  const [bsData, setBsData] = useState<{
    debitMap: Record<string,number>;
    creditMap: Record<string,number>;
    tax8: number; tax10: number; taxTotal: number;
    total: number;
  } | null>(null);

  const fileRef      = useRef<HTMLInputElement>(null);
  const batchFileRef = useRef<HTMLInputElement>(null);
  const t = T[lang];

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadReceipts = useCallback(async () => {
    try {
      const r = await fetch('/api/receipts'); const j = await r.json();
      setReceipts(j.receipts ?? []); setMonthTotal(j.monthTotal ?? 0);
    } catch (_e) {}
  }, []);

  const loadReport = useCallback(async (m: string) => {
    try {
      const r = await fetch(`/api/report?month=${m}`); setReport(await r.json());
    } catch (_e) {}
  }, []);

  const loadAnomalies = useCallback(async (m: string) => {
    try {
      const r = await fetch(`/api/anomaly?month=${m}`); const j = await r.json();
      setAnomalies(j.alerts ?? []);
    } catch (_e) {}
  }, []);

  useEffect(() => {
    loadReceipts();
    const m = currentMonth();
    loadReport(m); loadAnomalies(m);
  }, [loadReceipts, loadReport, loadAnomalies]);

  // Compute inline balance sheet from receipts for a given month
  const computeBS = useCallback((month: string, allReceipts: Receipt[]) => {
    const filtered = allReceipts.filter(r => r.date?.startsWith(month));
    if (filtered.length === 0) { setBsData(null); return; }
    const debitMap: Record<string,number> = {};
    const creditMap: Record<string,number> = {};
    for (const r of filtered) {
      const da = r.debit_account  ?? '消耗品費';
      const ca = r.credit_account ?? '現金';
      debitMap[da]  = (debitMap[da]  ?? 0) + r.amount;
      creditMap[ca] = (creditMap[ca] ?? 0) + r.amount;
    }
    const tax8     = filtered.filter(r => (r.tax_rate ?? 10) === 8).reduce((s, r) => s + r.amount, 0);
    const tax10    = filtered.filter(r => (r.tax_rate ?? 10) === 10).reduce((s, r) => s + r.amount, 0);
    const taxTotal = filtered.reduce((s, r) => s + (r.tax_amount ?? 0), 0);
    const total    = filtered.reduce((s, r) => s + r.amount, 0);
    setBsData({ debitMap, creditMap, tax8, tax10, taxTotal, total });
  }, []);

  // Recompute BS whenever receipts or reportMonth changes
  useEffect(() => {
    computeBS(reportMonth, receipts);
  }, [receipts, reportMonth, computeBS]);

  // Journal month filtered + sorted
  const journalReceipts = receipts
    .filter(r => r.date?.startsWith(journalMonth))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Single scan ───────────────────────────────────────────────────────────
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
          date: scanResult.date, merchant: scanResult.merchant,
          item_ja: scanResult.item_ja, item_zh: scanResult.item_zh,
          line_items: scanResult.line_items, amount: scanResult.amount,
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

  // ── Batch scan ────────────────────────────────────────────────────────────
  const handleBatchSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    // APPEND to existing items instead of replacing
    setBatchItems(prev => {
      const offset = prev.length;
      const newItems: BatchItem[] = files.map((file, i) => ({
        index: offset + i, file,
        previewUrl: URL.createObjectURL(file),
        status: 'pending',
        date: '', merchant: '', item_ja: '', item_zh: '', line_items: [], amount: 0, category: 'office_supplies', confidence: 0,
        tax_rate: 10, tax_amount: 0, amount_before_tax: 0,
        invoice_number: null, debit_account: '消耗品費', credit_account: '現金',
        editDebit: '消耗品費', editCredit: '現金',
      }));
      return [...prev, ...newItems];
    });
    e.target.value = '';
  };

  const playComplete = () => {
    try {
      const audio = new Audio('/complete.mp3');
      audio.volume = 0.7;
      audio.play().catch(() => {});
    } catch (_e) {}
  };

  const handleBatchAnalyze = async () => {
    const pending = batchItems.filter(b => b.status === 'pending');
    if (pending.length === 0) return;
    setBatchAnalyzing(true);

    // Process one by one using /api/analyze (avoids Vercel 10s timeout)
    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];
      if (item.status !== 'pending') continue;

      // Mark this item as analyzing
      setBatchItems(prev => prev.map((b, idx) =>
        idx === i ? { ...b, status: 'analyzing' as const } : b
      ));

      try {
        const fd = new FormData();
        fd.append('image', item.file);
        const res = await fetch('/api/analyze', { method: 'POST', body: fd });
        const r = await res.json();

        setBatchItems(prev => prev.map((b, idx) =>
          idx === i ? {
            ...b,
            status: 'done' as const,
            date: r.date, merchant: r.merchant, item_ja: r.item_ja ?? '', item_zh: r.item_zh ?? '', line_items: r.line_items ?? [], amount: r.amount,
            confidence: r.confidence, tax_rate: r.tax_rate,
            tax_amount: r.tax_amount, amount_before_tax: r.amount_before_tax,
            invoice_number: r.invoice_number,
            debit_account: r.debit_account, editDebit: r.debit_account,
            credit_account: r.credit_account, editCredit: r.credit_account,
          } : b
        ));
      } catch {
        setBatchItems(prev => prev.map((b, idx) =>
          idx === i ? { ...b, status: 'error' as const } : b
        ));
      }
    }

    setBatchAnalyzing(false);
    playComplete();
  };

  const saveBatchItem = async (idx: number, cat: typeof CATS[number]) => {
    const it = batchItems[idx]; if (!it || it.saved) return;
    try {
      await fetch('/api/receipts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: it.date, merchant: it.merchant, item_ja: it.item_ja, item_zh: it.item_zh, line_items: it.line_items, amount: it.amount,
          category: cat.id, category_label: t.catLabel[cat.id],
          tax_rate: it.tax_rate, tax_amount: it.tax_amount,
          amount_before_tax: it.amount_before_tax,
          invoice_number: it.invoice_number,
          debit_account: it.editDebit, credit_account: it.editCredit,
        }),
      });
      setBatchItems(prev => prev.map((b, i) => i === idx ? { ...b, saved: true, category: cat.id } : b));
      setShowCatPicker(null);
      loadReceipts();
    } catch (_e) {}
  };

  const saveAllBatch = async () => {
    const unsaved = batchItems.filter(it => it.status === 'done' && !it.saved);
    await Promise.all(unsaved.map(it =>
      fetch('/api/receipts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: it.date, merchant: it.merchant, item_ja: it.item_ja, item_zh: it.item_zh, line_items: it.line_items, amount: it.amount,
          category: it.category || 'office_supplies',
          category_label: t.catLabel[(it.category as keyof typeof t.catLabel) ?? 'office_supplies'] ?? it.category,
          tax_rate: it.tax_rate, tax_amount: it.tax_amount,
          amount_before_tax: it.amount_before_tax,
          invoice_number: it.invoice_number,
          debit_account: it.editDebit, credit_account: it.editCredit,
        }),
      })
    ));
    setBatchItems(prev => prev.map(b => b.status === 'done' ? { ...b, saved: true } : b));
    loadReceipts();
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    await fetch(`/api/receipts/${id}`, { method: 'DELETE' });
    setDeleteTarget(null);
    loadReceipts();
  };

  // ── Persist account change (manual edit & AI approve で共用) ────────────────
  const patchReceipt = useCallback(
    async (id: string, fields: Partial<Pick<Receipt, 'item_ja' | 'item_zh' | 'line_items' | 'debit_account' | 'credit_account' | 'category' | 'category_label'>>) => {
      // 楽観的更新
      setReceipts(prev => prev.map(r => (r.id === id ? { ...r, ...fields } : r)));
      try {
        await fetch(`/api/receipts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });
      } catch (_e) {
        loadReceipts(); // 失敗時はサーバ状態へ戻す
      }
    },
    [loadReceipts]
  );

  // ── On-demand AI 実行（押された瞬間にだけ走る） ─────────────────────────────
  const runAi = useCallback(
    (r: Receipt) => {
      aiTimers.current[r.id]?.forEach(clearTimeout);
      aiTimers.current[r.id] = [];

      setAiStates(prev => ({ ...prev, [r.id]: { phase: 'loading', step: 0, result: null, chosen: null } }));

      const steps = T[lang].ai.steps.length;
      for (let i = 1; i < steps; i++) {
        const tm = setTimeout(() => {
          setAiStates(prev => ({ ...prev, [r.id]: { ...prev[r.id], step: i } }));
        }, i * 650);
        aiTimers.current[r.id].push(tm);
      }
      // ★ 現在の言語を渡して結果を生成
      const done = setTimeout(() => {
        const result = buildAiResult(r, lang);
        const rec = result.scenarios.find(s => s.recommended) ?? result.scenarios[0];
        setAiStates(prev => ({
          ...prev,
          [r.id]: { phase: 'ready', step: steps, result, chosen: rec.key },
        }));
      }, steps * 650 + 350);
      aiTimers.current[r.id].push(done);
    },
    [lang]
  );

  const chooseAi = (id: string, key: 'A' | 'B') =>
    setAiStates(prev => ({ ...prev, [id]: { ...prev[id], chosen: key } }));

  const closeAi = (id: string) => {
    aiTimers.current[id]?.forEach(clearTimeout);
    setAiStates(prev => {
      const next = { ...prev }; delete next[id]; return next;
    });
  };

  const approveAi = async (r: Receipt) => {
    const st = aiStates[r.id];
    const sc = st?.result?.scenarios.find(s => s.key === st.chosen);
    if (!sc) return;
    await patchReceipt(r.id, { debit_account: sc.debit, credit_account: sc.credit });
    closeAi(r.id);
  };

  // CFO モード切替: ON で表示中の全 idle 取引にAIを一括実行
  const handleCfoToggle = (on: boolean) => {
    setCfoMode(on);
    if (on) {
      journalReceipts.forEach(r => {
        const st = aiStates[r.id];
        if (!st || st.phase === 'idle') runAi(r);
      });
    }
  };

  // ── Manual edit (確定後に手動で勘定科目を変更) ─────────────────────────────
  const startManualEdit = (r: Receipt) => {
    closeAi(r.id);
    setEditingId(r.id);
    setEditDraftItemJa(r.item_ja ?? r.item ?? '');
    setEditDraftItemZh(r.item_zh ?? '');
    setEditDraftLines((r.line_items ?? []).map(li => ({
      name_ja: li.name_ja ?? li.name ?? '',
      name_zh: li.name_zh ?? li.name ?? '',
      qty: li.qty, unit_price: li.unit_price,
    })));
    setEditDraftDebit(r.debit_account ?? '消耗品費');
    setEditDraftCredit(r.credit_account ?? '現金');
  };
  const saveManualEdit = async (id: string) => {
    setSavingEdit(true);
    // 日本語名が空の行は除外して保存
    const cleanLines = editDraftLines
      .filter(li => li.name_ja.trim() || li.name_zh.trim())
      .map(li => ({ ...li, name_zh: li.name_zh.trim() || li.name_ja.trim() }));
    await patchReceipt(id, {
      item_ja: editDraftItemJa,
      item_zh: editDraftItemZh.trim() || editDraftItemJa,
      line_items: cleanLines,
      debit_account: editDraftDebit,
      credit_account: editDraftCredit,
    });
    setSavingEdit(false);
    setEditingId(null);
  };

  // タイマーのクリーンアップ
  useEffect(() => {
    const all = aiTimers.current;
    return () => { Object.values(all).forEach(arr => arr.forEach(clearTimeout)); };
  }, []);

  // 言語切替時、展開中のAI結果を即座に新言語へ再生成（解説テキストも瞬時に切替）
  useEffect(() => {
    setAiStates(prev => {
      let changed = false;
      const next: Record<string, RowAi> = {};
      for (const [id, s] of Object.entries(prev)) {
        if (s.phase === 'ready' && s.result && s.result.lang !== lang) {
          const rec = receipts.find(x => x.id === id);
          if (rec) { next[id] = { ...s, result: buildAiResult(rec, lang) }; changed = true; continue; }
        }
        next[id] = s;
      }
      return changed ? next : prev;
    });
  }, [lang, receipts]);

  // ── Month nav component ────────────────────────────────────────────────────
  const MonthNav = ({ value, onPrev, onNext }: { value: string; onPrev: () => void; onNext: () => void }) => (
    <div className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 shadow-sm">
      <button onClick={onPrev} className="p-1 text-gray-400 hover:text-gray-700"><ChevronLeft size={20} /></button>
      <span className="font-bold text-gray-800">{value}</span>
      <button onClick={onNext} className="p-1 text-gray-400 hover:text-gray-700"><ChevronRight size={20} /></button>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex justify-center">
      <div className="w-full max-w-[420px] flex flex-col min-h-screen">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-indigo-700 to-violet-700 text-white px-5 pt-10 pb-5 shadow-lg relative overflow-hidden">
          {/* mascot background silhouette */}
          <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none">
            <MascotImg className="h-28 object-contain" />
          </div>

          <div className="flex items-start justify-between relative">
            <div className="flex items-center gap-3">
              <LogoImg />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{t.appName}</h1>
                <p className="text-indigo-200 text-xs mt-0.5">{t.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowAccountMaster(true)}
                className="border border-white/40 p-1.5 rounded-full hover:bg-white/20 transition-colors"
                title={t.accountMaster}
              >
                <Settings size={15} />
              </button>
              <button
                onClick={() => setLang(l => l === 'ja' ? 'zh' : 'ja')}
                className="border border-white/40 text-xs px-3 py-1.5 rounded-full hover:bg-white/20 transition-colors"
              >
                {t.switchLang}
              </button>
            </div>
          </div>

          <div className="mt-4 bg-white/20 rounded-xl px-4 py-2.5 flex justify-between items-center relative">
            <span className="text-sm text-indigo-100">{t.thisMonth}</span>
            <span className="text-xl font-bold">¥{monthTotal.toLocaleString('ja-JP')}</span>
          </div>
        </div>

        {/* ── Content ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 pb-24">

          {/* ════ SCAN TAB ══════════════════════════════════════════════ */}
          {tab === 'scan' && (
            <>
              <input ref={fileRef} type="file" accept="image/*,application/pdf"
                {...({ capture: 'environment' } as object)}
                className="hidden" onChange={handleImageSelect} />
              <input ref={batchFileRef} type="file" accept="image/*,application/pdf" multiple
                className="hidden" onChange={handleBatchSelect} />

              {scanMode === 'single' && scan === 'idle' && (
                <>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-500 text-white py-5 rounded-2xl flex flex-col items-center gap-2 shadow-lg active:scale-95 transition-transform"
                    >
                      <Camera size={30} />
                      <span className="font-semibold text-sm">{t.scanBtn}</span>
                    </button>
                    <button
                      onClick={() => setScanMode('batch')}
                      className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-5 rounded-2xl flex flex-col items-center gap-2 shadow-lg active:scale-95 transition-transform"
                    >
                      <Images size={30} />
                      <span className="font-semibold text-sm">{t.batchBtn}</span>
                    </button>
                  </div>

                  {receipts.length > 0 && (
                    <div>
                      <h2 className="font-semibold text-gray-700 mb-2 text-sm">{t.recentHistory}</h2>
                      <div className="space-y-2">
                        {receipts.slice(0, 5).map(r => (
                          <div key={r.id} className="bg-white rounded-xl p-3 flex justify-between items-center shadow-sm">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-gray-800 truncate">{r.merchant}</div>
                              {itemText(r, lang) && <div className="text-xs text-indigo-500 truncate">🛍 {itemText(r, lang)}</div>}
                              <div className="text-xs text-gray-400">{r.date} · {r.debit_account ?? r.category_label}</div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="font-bold text-indigo-600 text-sm">¥{r.amount.toLocaleString('ja-JP')}</span>
                              <button onClick={() => setDeleteTarget(r.id)}
                                className="text-gray-300 hover:text-red-400 transition-colors p-1">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {receipts.length === 0 && (
                    <div className="flex flex-col items-center py-10 gap-3 text-gray-400">
                      <MascotImg className="w-32 opacity-60 object-contain" />
                      <p className="text-sm">{t.noHistory}</p>
                    </div>
                  )}
                </>
              )}

              {/* ── Batch mode UI ──────────────────────────────────────── */}
              {scanMode === 'batch' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-gray-800">{t.batchTitle}</h2>
                    <button onClick={() => { setScanMode('single'); setBatchItems([]); }}
                      className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                  </div>

                  {batchItems.length === 0 ? (
                    <button
                      onClick={() => batchFileRef.current?.click()}
                      className="w-full border-2 border-dashed border-indigo-300 rounded-2xl py-10 flex flex-col items-center gap-3 text-indigo-400 hover:bg-indigo-50 transition-colors active:scale-95"
                    >
                      <Images size={36} />
                      <span className="font-medium text-sm">{t.batchSelect}</span>
                    </button>
                  ) : (
                    <>
                      {/* progress summary */}
                      <div className="bg-white rounded-xl p-3 shadow-sm flex justify-between items-center text-sm">
                        <span className="text-gray-500">{batchItems.length}枚選択</span>
                        <span className="text-emerald-600 font-medium">
                          {batchItems.filter(b => b.status === 'done').length} / {batchItems.length} 完了
                        </span>
                      </div>

                      {/* thumbnails list */}
                      <div className="space-y-3">
                        {batchItems.map((item, idx) => (
                          <div key={idx} className={`bg-white rounded-2xl shadow-sm overflow-hidden border ${
                            item.saved ? 'border-emerald-200' : 'border-gray-100'
                          }`}>
                            <div className="flex gap-3 p-3">
                              {item.file?.type === 'application/pdf' ? (
                                <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                                  <FileText size={22} className="text-indigo-500" />
                                </div>
                              ) : (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={item.previewUrl} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                {item.status === 'pending' && (
                                  <div className="flex items-center gap-1 text-gray-400 text-sm">
                                    <Loader2 size={13} className="animate-spin" />待機中
                                  </div>
                                )}
                                {item.status === 'analyzing' && (
                                  <div className="flex items-center gap-1 text-indigo-500 text-sm">
                                    <Loader2 size={13} className="animate-spin" />{t.batchProgress}
                                  </div>
                                )}
                                {item.status === 'error' && (
                                  <div className="text-red-500 text-xs">読み取りエラー</div>
                                )}
                                {item.status === 'done' && (
                                  <>
                                    <div className="font-medium text-sm text-gray-800 truncate">{item.merchant}</div>
                                    <div className="text-xs text-gray-400">{item.date}</div>
                                    <div className="font-bold text-indigo-600 text-sm">¥{item.amount.toLocaleString('ja-JP')}</div>
                                    <div className="text-xs text-gray-400">{item.editDebit} / {item.editCredit}</div>
                                  </>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                {item.saved && (
                                  <span className="bg-emerald-100 text-emerald-600 text-xs px-2 py-0.5 rounded-full flex items-center gap-0.5">
                                    <CheckCircle2 size={10} />{t.batchSaved}
                                  </span>
                                )}
                                {item.status === 'done' && !item.saved && (
                                  <button
                                    onClick={() => setShowCatPicker(showCatPicker === idx ? null : idx)}
                                    className="bg-indigo-600 text-white text-xs px-2 py-1 rounded-lg"
                                  >保存</button>
                                )}
                                {item.status === 'pending' && (
                                  <button
                                    onClick={() => setBatchItems(prev => prev.filter((_, i) => i !== idx))}
                                    className="text-gray-300 hover:text-red-400 p-1">
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* inline category picker */}
                            {showCatPicker === idx && !item.saved && (
                              <div className="border-t border-gray-100 p-3 bg-gray-50">
                                <p className="text-xs text-gray-500 mb-2">{t.selectCategory}</p>
                                <div className="flex gap-2">
                                  {CATS.map(cat => (
                                    <button key={cat.id} onClick={() => saveBatchItem(idx, cat)}
                                      className={`flex-1 py-2 rounded-xl text-xs font-medium border-2 ${
                                        cat.color === 'blue'  ? 'border-blue-200 bg-blue-50 text-blue-700'  :
                                        cat.color === 'pink'  ? 'border-pink-200 bg-pink-50 text-pink-700'  :
                                                                'border-green-200 bg-green-50 text-green-700'
                                      }`}>
                                      {cat.emoji}<br />{t.catLabel[cat.id]}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* action buttons */}
                      <div className="space-y-2">
                        {/* 写真を追加ボタン（分析前なら常に表示） */}
                        {!batchAnalyzing && (
                          <button onClick={() => batchFileRef.current?.click()}
                            className="w-full border-2 border-dashed border-indigo-300 text-indigo-600 py-3 rounded-2xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-indigo-50 active:scale-95 transition-transform">
                            <Camera size={16} />写真を追加する
                          </button>
                        )}
                        {!batchAnalyzing && batchItems.some(b => b.status === 'pending') && (
                          <button onClick={handleBatchAnalyze}
                            className="w-full bg-indigo-600 text-white py-3.5 rounded-2xl font-semibold shadow flex items-center justify-center gap-2 active:scale-95 transition-transform">
                            <BarChart2 size={18} />{t.batchAnalyze}（{batchItems.filter(b => b.status === 'pending').length}枚）
                          </button>
                        )}
                        {batchAnalyzing && (
                          <div className="flex items-center justify-center gap-2 py-3 text-indigo-500">
                            <Loader2 size={18} className="animate-spin" />
                            {t.batchProgress}（{batchItems.filter(b => b.status === 'done' || b.status === 'error').length} / {batchItems.length}）
                          </div>
                        )}
                        {batchItems.some(b => b.status === 'done' && !b.saved) && !batchAnalyzing && (
                          <button onClick={saveAllBatch}
                            className="w-full bg-emerald-500 text-white py-3.5 rounded-2xl font-semibold shadow flex items-center justify-center gap-2 active:scale-95 transition-transform">
                            <Check size={18} />{t.batchSaveAll}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Single scan states */}
              {scanMode === 'single' && scan === 'preview' && imgPreview && (
                <div className="space-y-4">
                  {imgFile?.type === 'application/pdf' ? (
                    <div className="w-full rounded-2xl bg-gray-50 border border-gray-100 shadow flex flex-col items-center justify-center py-12 gap-2">
                      <FileText size={40} className="text-indigo-500" />
                      <span className="text-sm text-gray-500 truncate max-w-[80%]">{imgFile.name}</span>
                    </div>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={imgPreview} alt="preview" className="w-full rounded-2xl object-cover max-h-72 shadow" />
                  )}
                  <button onClick={handleAnalyze}
                    className="w-full bg-indigo-600 text-white py-3.5 rounded-2xl font-semibold shadow active:scale-95 transition-transform">
                    {t.preview}
                  </button>
                  <button onClick={resetScan} className="w-full text-gray-400 text-sm py-2">キャンセル</button>
                </div>
              )}

              {scanMode === 'single' && scan === 'loading' && (
                <div className="flex flex-col items-center py-16 gap-4">
                  <div className="w-14 h-14 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-gray-500 text-sm">{t.analyzing}</p>
                </div>
              )}

              {scanMode === 'single' && scan === 'result' && scanResult && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl shadow p-4 space-y-3">
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

                    <div className="space-y-1.5 border-b border-gray-100 pb-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t.date}</span>
                        <span className="font-medium">{scanResult.date}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t.merchant}</span>
                        <span className="font-medium">{scanResult.merchant}</span>
                      </div>
                      {itemText(scanResult, lang) && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">{t.item}</span>
                          <span className="font-medium text-right">{itemText(scanResult, lang)}</span>
                        </div>
                      )}
                      <LineItemsView items={scanResult.line_items} lang={lang} labels={{ lineItems: t.lineItems, subtotal: t.subtotal }} />
                    </div>

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

                    {scanResult.invoice_number && (
                      <div className="flex justify-between text-sm border-b border-gray-100 pb-3">
                        <span className="text-gray-500">{t.invoiceNumber}</span>
                        <span className="font-mono text-xs text-blue-700">{scanResult.invoice_number}</span>
                      </div>
                    )}

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
                            { label: t.debit,  val: editDebit,  set: setEditDebit,  opts: masterDebits },
                            { label: t.credit, val: editCredit, set: setEditCredit, opts: masterCredits },
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

              {scanMode === 'single' && scan === 'saving' && (
                <div className="flex flex-col items-center py-16 gap-3">
                  <div className="w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-gray-400 text-sm">{t.saving}</p>
                </div>
              )}

              {scanMode === 'single' && scan === 'done' && (
                <div className="flex flex-col items-center py-12 gap-5">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                    <Check size={32} className="text-emerald-600" />
                  </div>
                  <p className="font-semibold text-gray-700">{t.saved}</p>
                  <MascotImg className="w-28 object-contain opacity-80" />
                  <button onClick={resetScan}
                    className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-medium shadow active:scale-95 transition-transform">
                    {t.scanAnother}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ════ JOURNAL TAB ═══════════════════════════════════════════ */}
          {tab === 'journal' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-800">{t.journalEntries}</h2>
                <button onClick={loadReceipts} className="text-gray-400 hover:text-gray-600 p-1">
                  <RefreshCw size={15} />
                </button>
              </div>

              {/* ── スタンダード / CFO モード切替（オンデマンドAIのトリガー） ── */}
              <div className="inline-flex w-full rounded-xl bg-slate-100 p-1">
                <button onClick={() => handleCfoToggle(false)}
                  className={`flex-1 flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    !cfoMode ? 'bg-white text-gray-800 shadow' : 'text-gray-500'
                  }`}>
                  <Zap size={13} />{t.ai.standardMode}
                </button>
                <button onClick={() => handleCfoToggle(true)}
                  className={`flex-1 flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    cfoMode ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow' : 'text-gray-500'
                  }`}>
                  <Brain size={13} />{t.ai.cfoMode}
                </button>
              </div>
              {cfoMode && <p className="text-[11px] text-violet-600 -mt-2 px-1">{t.ai.cfoHint}</p>}

              <MonthNav
                value={journalMonth}
                onPrev={() => setJournalMonth(prevMonth(journalMonth))}
                onNext={() => setJournalMonth(nextMonth(journalMonth))}
              />

              {journalReceipts.length === 0 ? (
                <div className="flex flex-col items-center py-12 gap-3 text-gray-400">
                  <MascotImg className="w-24 opacity-40 object-contain" />
                  <p className="text-sm">{t.noData}</p>
                </div>
              ) : journalReceipts.map(r => {
                const st = aiStates[r.id];
                const editing = editingId === r.id;
                const phase = st?.phase ?? 'idle';
                return (
                <div key={r.id} className={`bg-white rounded-2xl shadow-sm p-4 border transition-all ${
                  phase === 'loading' || phase === 'ready' ? 'border-violet-200 ring-1 ring-violet-100' : 'border-gray-100'
                }`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-medium text-gray-800 text-sm">{r.merchant}</div>
                      {itemText(r, lang) && (
                        <div className="text-xs text-indigo-500 mt-0.5">🛍 {itemText(r, lang)}</div>
                      )}
                      <div className="text-xs text-gray-400 mt-0.5">{r.date}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-end gap-1">
                        {r.invoice_number && (
                          <span className="bg-blue-100 text-blue-600 text-xs px-1.5 py-0.5 rounded">{t.invoiceDetected}</span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          (r.tax_rate ?? 10) === 8 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'
                        }`}>{(r.tax_rate ?? 10) === 8 ? t.tax8 : t.tax10}</span>
                      </div>
                      <button onClick={() => setDeleteTarget(r.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors p-1">
                        <Trash2 size={15} />
                      </button>
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

                  {/* 明細（品目ごとの個数・単価） */}
                  {!editing && r.line_items && r.line_items.length > 0 && (
                    <LineItemsView items={r.line_items} lang={lang} labels={{ lineItems: t.lineItems, subtotal: t.subtotal }} />
                  )}

                  {/* ── アクション: 手動で勘定科目変更 / AIに相談 ── */}
                  {!editing && phase === 'idle' && (
                    <div className="flex items-center gap-2 mt-3">
                      <button onClick={() => startManualEdit(r)}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
                        <Edit2 size={13} />{t.ai.manualEdit}
                      </button>
                      <button onClick={() => runAi(r)}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:shadow-md">
                        <Sparkles size={13} />{t.ai.consult}
                      </button>
                    </div>
                  )}

                  {/* ── 手動で勘定科目を変更（確定後でも変更可） ── */}
                  {editing && (
                    <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
                      <div>
                        <label className="text-[11px] text-gray-500">{t.itemJa}</label>
                        <input value={editDraftItemJa} onChange={e => setEditDraftItemJa(e.target.value)}
                          placeholder={t.itemPlaceholder}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5 focus:outline-none focus:border-indigo-400" />
                      </div>
                      <div>
                        <label className="text-[11px] text-gray-500">{t.itemZh}</label>
                        <input value={editDraftItemZh} onChange={e => setEditDraftItemZh(e.target.value)}
                          placeholder="例：复印纸・文具"
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5 focus:outline-none focus:border-indigo-400" />
                      </div>
                      <LineItemsEditor
                        items={editDraftLines}
                        onChange={setEditDraftLines}
                        labels={{ lineItems: t.lineItems, qty: t.qty, unitPrice: t.unitPrice, addLine: t.addLine, nameJa: t.nameJa, nameZh: t.nameZh }}
                      />
                      {([
                        { label: t.debit,  val: editDraftDebit,  set: setEditDraftDebit,  opts: masterDebits },
                        { label: t.credit, val: editDraftCredit, set: setEditDraftCredit, opts: masterCredits },
                      ] as { label: string; val: string; set: (v: string) => void; opts: string[] }[]).map(({ label, val, set, opts }) => (
                        <div key={label}>
                          <label className="text-[11px] text-gray-500">{label}</label>
                          <select value={val} onChange={e => set(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5 focus:outline-none focus:border-indigo-400">
                            {opts.map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                      ))}
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setEditingId(null)}
                          className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600">
                          {t.ai.cancel}
                        </button>
                        <button onClick={() => saveManualEdit(r.id)} disabled={savingEdit}
                          className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                          {savingEdit ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}{t.ai.save}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── AI: 段階ローディング / 結果Diff ── */}
                  {phase === 'loading' && <AiLoadingBox step={st!.step} d={t.ai} />}
                  {phase === 'ready' && st!.result && (
                    <AiResultBox
                      amount={r.amount}
                      result={st!.result}
                      chosen={st!.chosen}
                      d={t.ai}
                      onChoose={(k) => chooseAi(r.id, k)}
                      onApprove={() => approveAi(r)}
                      onReject={() => closeAi(r.id)}
                    />
                  )}
                </div>
                );
              })}
            </div>
          )}

          {/* ════ ANALYSIS TAB ══════════════════════════════════════════ */}
          {tab === 'analysis' && (
            <div className="space-y-4">
              <MonthNav
                value={reportMonth}
                onPrev={() => {
                  const m = prevMonth(reportMonth); setReportMonth(m);
                  loadReport(m); loadAnomalies(m);
                }}
                onNext={() => {
                  const m = nextMonth(reportMonth); setReportMonth(m);
                  loadReport(m); loadAnomalies(m);
                }}
              />

              {/* ── Inline Balance Sheet ───────────────────────────── */}
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                <div className="bg-indigo-700 text-white px-4 py-2.5 flex items-center justify-between">
                  <span className="font-semibold text-sm flex items-center gap-1.5">
                    <List size={14} />{t.bsTitle}
                  </span>
                  <button onClick={() => window.open(`/api/export?format=bs&month=${reportMonth}`, '_blank')}
                    className="text-xs border border-white/40 px-2 py-0.5 rounded-full hover:bg-white/20">
                    印刷
                  </button>
                </div>
                {!bsData ? (
                  <div className="py-8 text-center text-gray-400 text-sm">{t.noDataBs}</div>
                ) : (
                  <div>
                    <div className="grid grid-cols-2 divide-x divide-gray-200">
                      {/* 借方 */}
                      <div>
                        <div className="bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 border-b border-gray-200">{t.bsDebitSide}</div>
                        {Object.entries(bsData.debitMap).sort((a,b)=>b[1]-a[1]).map(([k,v])=>(
                          <div key={k} className="flex justify-between px-3 py-1.5 border-b border-gray-100 text-xs">
                            <span className="text-gray-700">{k}</span>
                            <span className="font-medium">¥{v.toLocaleString('ja-JP')}</span>
                          </div>
                        ))}
                        <div className="flex justify-between px-3 py-2 bg-blue-50 text-xs font-bold">
                          <span>{t.bsTotal}</span>
                          <span className="text-blue-700">¥{bsData.total.toLocaleString('ja-JP')}</span>
                        </div>
                      </div>
                      {/* 貸方 */}
                      <div>
                        <div className="bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 border-b border-gray-200">{t.bsCreditSide}</div>
                        {Object.entries(bsData.creditMap).sort((a,b)=>b[1]-a[1]).map(([k,v])=>(
                          <div key={k} className="flex justify-between px-3 py-1.5 border-b border-gray-100 text-xs">
                            <span className="text-gray-700">{k}</span>
                            <span className="font-medium">¥{v.toLocaleString('ja-JP')}</span>
                          </div>
                        ))}
                        <div className="flex justify-between px-3 py-2 bg-emerald-50 text-xs font-bold">
                          <span>{t.bsTotal}</span>
                          <span className="text-emerald-700">¥{bsData.total.toLocaleString('ja-JP')}</span>
                        </div>
                      </div>
                    </div>
                    {/* Tax breakdown */}
                    <div className="px-3 py-2.5 bg-amber-50 border-t border-gray-200 space-y-1">
                      <div className="text-xs font-bold text-amber-700 mb-1">{t.taxBreakdown}</div>
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>{t.tax8label}</span><span>¥{bsData.tax8.toLocaleString('ja-JP')}</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>{t.tax10label}</span><span>¥{bsData.tax10.toLocaleString('ja-JP')}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold text-amber-700 pt-1 border-t border-amber-200">
                        <span>{t.taxTotalLabel}</span><span>¥{bsData.taxTotal.toLocaleString('ja-JP')}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

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

          {/* ════ EXPORT TAB ════════════════════════════════════════════ */}
          {tab === 'export' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-bold text-gray-800">{t.exportTitle}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{t.exportNote}</p>
              </div>

              <MonthNav
                value={exportMonth}
                onPrev={() => setExportMonth(prevMonth(exportMonth))}
                onNext={() => setExportMonth(nextMonth(exportMonth))}
              />

              <div className="space-y-3">
                <button onClick={async () => {
                  const blob = await (await fetch(`/api/export?format=freee&month=${exportMonth}`)).blob();
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                  a.download = `freee_${exportMonth}.csv`; a.click();
                }}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3.5 px-4 rounded-2xl flex items-center gap-3 font-medium shadow active:scale-95 transition-transform">
                  <Download size={18} />{t.exportFreee}
                </button>
                <button onClick={async () => {
                  const blob = await (await fetch(`/api/export?format=mf&month=${exportMonth}`)).blob();
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                  a.download = `mf_${exportMonth}.csv`; a.click();
                }}
                  className="w-full bg-sky-500 hover:bg-sky-600 text-white py-3.5 px-4 rounded-2xl flex items-center gap-3 font-medium shadow active:scale-95 transition-transform">
                  <Download size={18} />{t.exportMF}
                </button>
                <button onClick={() => window.open(`/api/export?format=expense&month=${exportMonth}`, '_blank')}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 px-4 rounded-2xl flex items-center gap-3 font-medium shadow active:scale-95 transition-transform">
                  <FileText size={18} />{t.expenseReport}
                </button>
                <button onClick={() => window.open(`/api/export?format=kanri&month=${exportMonth}`, '_blank')}
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white py-3.5 px-4 rounded-2xl flex items-center gap-3 font-medium shadow active:scale-95 transition-transform">
                  <List size={18} />{t.kanriReport}
                </button>
                <button onClick={() => window.open(`/api/export?format=items&month=${exportMonth}&lang=${lang}`, '_blank')}
                  className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white py-3.5 px-4 rounded-2xl flex items-center gap-3 font-medium shadow active:scale-95 transition-transform">
                  <FileText size={18} />{t.purchaseReport}
                </button>
                <button onClick={() => window.open(`/api/export?format=bs&month=${exportMonth}`, '_blank')}
                  className="w-full bg-slate-700 hover:bg-slate-800 text-white py-3.5 px-4 rounded-2xl flex items-center gap-3 font-medium shadow active:scale-95 transition-transform">
                  <BarChart2 size={18} />{t.bsReport}
                </button>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 whitespace-pre-line leading-5 border border-gray-200">
                {t.csvInfo}
              </div>
            </div>
          )}
        </div>

        {/* ── Account Master Modal ────────────────────────────────────── */}
        {showAccountMaster && (
          <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50"
            onClick={() => setShowAccountMaster(false)}>
            <div className="bg-white w-full max-w-[420px] rounded-t-3xl max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
                <h2 className="font-bold text-gray-800 flex items-center gap-2">
                  <Settings size={16} className="text-indigo-600" />{t.accountMaster}
                </h2>
                <button onClick={() => setShowAccountMaster(false)} className="text-gray-400">
                  <X size={20} />
                </button>
              </div>

              <div className="p-5 space-y-6 pb-10">
                {/* Debit accounts */}
                <div>
                  <h3 className="text-sm font-bold text-blue-700 mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />{t.debitAccounts}
                  </h3>
                  <div className="space-y-1.5">
                    {masterDebits.map((acc, i) => (
                      <div key={i} className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
                        <Menu size={13} className="text-gray-400 flex-shrink-0" />
                        <span className="flex-1 text-sm text-gray-700">{acc}</span>
                        <button onClick={() => setMasterDebits(prev => prev.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-400 p-0.5">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <input value={newDebit} onChange={e => setNewDebit(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newDebit.trim()) { setMasterDebits(p => [...p, newDebit.trim()]); setNewDebit(''); }}}
                      placeholder={t.accountPlaceholder}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
                    <button onClick={() => { if (newDebit.trim()) { setMasterDebits(p => [...p, newDebit.trim()]); setNewDebit(''); }}}
                      className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1">
                      <Plus size={13} />{t.addAccount}
                    </button>
                  </div>
                </div>

                {/* Credit accounts */}
                <div>
                  <h3 className="text-sm font-bold text-emerald-700 mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />{t.creditAccounts}
                  </h3>
                  <div className="space-y-1.5">
                    {masterCredits.map((acc, i) => (
                      <div key={i} className="flex items-center gap-2 bg-emerald-50 rounded-lg px-3 py-2">
                        <Menu size={13} className="text-gray-400 flex-shrink-0" />
                        <span className="flex-1 text-sm text-gray-700">{acc}</span>
                        <button onClick={() => setMasterCredits(prev => prev.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-400 p-0.5">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <input value={newCredit} onChange={e => setNewCredit(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newCredit.trim()) { setMasterCredits(p => [...p, newCredit.trim()]); setNewCredit(''); }}}
                      placeholder={t.accountPlaceholder}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
                    <button onClick={() => { if (newCredit.trim()) { setMasterCredits(p => [...p, newCredit.trim()]); setNewCredit(''); }}}
                      className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1">
                      <Plus size={13} />{t.addAccount}
                    </button>
                  </div>
                </div>

                <button onClick={() => { setMasterDebits(DEFAULT_DEBIT); setMasterCredits(DEFAULT_CREDIT); }}
                  className="w-full border border-gray-300 text-gray-500 py-2.5 rounded-xl text-sm">
                  デフォルトに戻す
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete confirm modal ────────────────────────────────────── */}
        {deleteTarget && (
          <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50"
            onClick={() => setDeleteTarget(null)}>
            <div className="bg-white w-full max-w-[420px] rounded-t-3xl p-6 pb-10"
              onClick={e => e.stopPropagation()}>
              <h3 className="font-bold text-gray-800 text-center mb-1">{t.deleteConfirm}</h3>
              <p className="text-xs text-gray-400 text-center mb-5">この操作は取り消せません</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)}
                  className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-2xl font-medium">
                  {t.cancel}
                </button>
                <button onClick={() => handleDelete(deleteTarget)}
                  className="flex-1 bg-red-500 text-white py-3 rounded-2xl font-medium">
                  {t.delete}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Bottom Nav ──────────────────────────────────────────────── */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] bg-white border-t border-gray-200 flex shadow-lg">
          {([
            { id: 'scan',     icon: Camera,   label: t.scan     },
            { id: 'journal',  icon: BookOpen,  label: t.journal  },
            { id: 'analysis', icon: BarChart2, label: t.analysis },
            { id: 'export',   icon: FileText,  label: t.export   },
          ] as { id: TabId; icon: React.ElementType; label: string }[]).map(({ id, icon: Icon, label }) => (
            <button key={id}
              onClick={() => { setTab(id); if (id !== 'scan') setScanMode('single'); }}
              className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs transition-colors ${
                tab === id ? 'text-indigo-600' : 'text-gray-400'
              }`}>
              <Icon size={22} />{label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
