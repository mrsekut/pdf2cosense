# Design: pdf-to-json を TypeScript で再実装

## ディレクトリ構成

```
src/
├── cli.ts                      # CLI エントリポイント（変更）
├── pdf-to-json/                # 新規ディレクトリ
│   ├── index.ts                # エクスポート
│   ├── pdfToJson.ts            # メイン処理
│   ├── pdfToImages.ts          # PDF → 画像変換
│   ├── generatePage.ts         # ページ生成（Gyazo アップロード + OCR）
│   ├── renderPage.ts           # Page 型定義 & レンダリング
│   ├── files.ts                # ファイル操作ユーティリティ
│   └── services/
│       ├── Gyazo.ts            # Gyazo Service
│       └── Config.ts           # Config Service
└── features/
    └── ...                     # 既存のまま
```

## 型定義

### Page 型

```typescript
interface Page {
  title: string;
  lines: string[];
}

interface Project {
  pages: Page[];
}
```

### エラー型

```typescript
class PdfToJsonError extends Schema.TaggedError<PdfToJsonError>()(
  'PdfToJsonError',
  { message: Schema.String, cause: Schema.optional(Schema.Unknown) }
) {}

class GyazoError extends Schema.TaggedError<GyazoError>()(
  'GyazoError',
  { message: Schema.String, cause: Schema.optional(Schema.Unknown) }
) {}

class MutoolError extends Schema.TaggedError<MutoolError>()(
  'MutoolError',
  { message: Schema.String, cause: Schema.optional(Schema.Unknown) }
) {}
```

## Service 設計

### Config Service

```typescript
class Config extends Context.Tag("Config")<Config, {
  readonly workspaceDir: string;
  readonly profile: Option<string>;
  readonly gyazoToken: string;
}>() {}

const ConfigLive = Layer.effect(
  Config,
  Effect.gen(function* () {
    const gyazoToken = yield* Effect.try(() => process.env.GYAZO_TOKEN)
      .pipe(Effect.filterOrFail(Boolean, () => new Error("GYAZO_TOKEN not set")));

    return {
      workspaceDir: "./workspace",
      profile: Option.some("mrsekut-merry-firends/mrsekut"),
      gyazoToken,
    };
  })
);
```

### Gyazo Service

```typescript
class Gyazo extends Context.Tag("Gyazo")<Gyazo, {
  readonly upload: (imagePath: string) => Effect.Effect<string, GyazoError>;
  readonly getOcrText: (imageId: string) => Effect.Effect<string, GyazoError>;
}>() {}

const GyazoLive = Layer.effect(
  Gyazo,
  Effect.gen(function* () {
    const config = yield* Config;

    return {
      upload: (imagePath) => uploadWithRetry(config.gyazoToken, imagePath),
      getOcrText: (imageId) => getOcrTextWithRetry(config.gyazoToken, imageId),
    };
  })
);
```

#### upload 実装

- `POST https://upload.gyazo.com/api/upload`
- FormData で画像ファイルを送信
- レスポンスから `image_id` を取得
- リトライ: 最大 5 回、3 秒間隔

#### getOcrText 実装

- `GET https://api.gyazo.com/api/images/{imageId}?access_token={token}`
- レスポンスの `ocr.description` を取得
- OCR 未完了の場合は空文字列が返るのでリトライ
- リトライ: 最大 10 回、10 秒間隔

## モジュール設計

### pdfToJson.ts

メインの処理フロー：

```typescript
export const pdfToJson: Effect.Effect<
  string[],
  PdfToJsonError | GyazoError | MutoolError,
  Config | Gyazo | FileSystem | Path
>
```

1. `getPdfPaths(workspaceDir)` で PDF ファイル一覧を取得
2. `pdfsToImages(pdfPaths)` で全 PDF を画像に変換
3. `getImageDirs(workspaceDir)` で画像ディレクトリ一覧を取得
4. 各ディレクトリに対して `dirToCosense(dirPath)` を実行
5. 生成された JSON ファイルのパス一覧を返す

### pdfToImages.ts

```typescript
export const pdfsToImages: (
  pdfPaths: string[]
) => Effect.Effect<string[], MutoolError, FileSystem | Path>
```

- `mutool` コマンドの存在確認
- 各 PDF に対して並行で `pdfToImages` を実行
- `Command.make("mutool", "convert", ...)` で変換

### generatePage.ts

```typescript
export const generatePage: (
  index: number,
  imagePath: string,
  totalPages: number
) => Effect.Effect<Page, GyazoError, Gyazo>
```

1. Gyazo に画像をアップロード
2. 10 秒待機（OCR 処理待ち）
3. OCR テキストを取得
4. `renderPage()` でページを生成

### renderPage.ts

```typescript
export const renderPage: (
  index: number,
  totalPages: number,
  gyazoImageId: string,
  ocrText: string
) => Page
```

ページ内容のフォーマット：
```
{title}
prev: [{prev}]
next: [{next}]
[[https://gyazo.com/{imageId}]]

> {ocrLine1}
> {ocrLine2}
...
```

### files.ts

```typescript
export const getPdfPaths: (dir: string) => Effect.Effect<string[], Error, FileSystem>
export const getImageDirs: (dir: string) => Effect.Effect<string[], Error, FileSystem>
export const getImages: (dir: string) => Effect.Effect<string[], Error, FileSystem>
```

## 並行処理

- `Effect.forEach` with `{ concurrency: 50 }` でセマフォ相当の制御
- PDF 変換は順次処理（mutool の負荷を考慮）
- Gyazo アップロード + OCR は並行処理

## 進捗表示

- `Effect.logInfo` でシンプルなログ出力
- 将来的に `@effect/cli` の ProgressBar を検討

## CLI 統合

### 変更前 (src/pdf-to-json.ts)

```typescript
// cargo run を呼び出し
const command = Command.make('cargo', 'run').pipe(
  Command.workingDirectory(PDF_TO_JSON_DIR),
);
```

### 変更後 (src/pdf-to-json.ts)

```typescript
import { pdfToJson } from './pdf-to-json/index.ts';

export const runPdfToJson = pdfToJson.pipe(
  Effect.provide(GyazoLive),
  Effect.provide(ConfigLive),
);
```

## Layer 構成

```
ConfigLive
    ↓
GyazoLive (depends on Config)
    ↓
pdfToJson (depends on Config, Gyazo, FileSystem, Path)
```

## テスト戦略

- Service をモック化してユニットテスト可能
- `Gyazo` Service を TestLayer に差し替えることで API 呼び出しをスキップ
