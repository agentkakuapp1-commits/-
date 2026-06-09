# スマート会計 — セットアップ手順

## 1. プロジェクト作成

```bash
npx create-next-app@latest smart-kaikei \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias="@/*"

cd smart-kaikei
```

> `--app` で App Router が有効になります。`--tailwind` で Tailwind CSS が自動設定されます。

---

## 2. lucide-react をインストール

```bash
npm install lucide-react
```

---

## 3. ファイルを配置

以下の2ファイルを上書きコピーしてください。

| ファイル | 内容 |
|---|---|
| `app/page.tsx` | フロントエンド（言語切替・スキャン→分析→カテゴリ選択） |
| `app/api/analyze/route.ts` | APIモック（ダミーJSON返却） |

> `app/api/analyze/` ディレクトリは存在しない場合、先に作成してください：
> ```bash
> mkdir -p app/api/analyze
> ```

---

## 4. 開発サーバー起動

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いてください。

---

## 5. 動作確認

| 操作 | 期待される動作 |
|---|---|
| 「レシートをスキャン」ボタンをタップ | ローディングスピナーが2秒表示される |
| 2秒後 | レシート情報（日付・店舗名・金額）が表示される |
| カテゴリボタンをタップ | 「登録完了！」が表示され、2.5秒後に初期画面に戻る |
| ヘッダーの「中文」ボタン | 画面全体が中国語に切り替わる |

---

## 6. 将来の AI 連携（オプション）

### Gemini Vision API

```bash
npm install @google/generative-ai
```

`app/api/analyze/route.ts` のコメントアウト部分を有効にし、`.env.local` に追加：

```
GEMINI_API_KEY=your_key_here
```

### OpenAI GPT-4o

```bash
npm install openai
```

`.env.local` に追加：

```
OPENAI_API_KEY=your_key_here
```

---

## ディレクトリ構成（最終形）

```
smart-kaikei/
├── app/
│   ├── page.tsx              ← フロントエンド
│   ├── api/
│   │   └── analyze/
│   │       └── route.ts      ← API モック
│   ├── layout.tsx            ← 自動生成（そのままでOK）
│   └── globals.css           ← 自動生成（そのままでOK）
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```
