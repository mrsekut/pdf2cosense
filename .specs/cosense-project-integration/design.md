# 設計書: pdf2cosense と Cosense プロジェクト統合

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Layer                           │
│                       (src/cli.ts)                          │
│  - コマンドライン引数の解析                                    │
│  - オプション管理 (--isbn, --create-project, --auth-only)    │
│  - 各フェーズの実行制御                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Service Layer                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │   Browser    │ │     Auth     │ │    CosenseApi        │ │
│  │   Service    │ │   Service    │ │      Service         │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐                          │
│  │   Project    │ │    Import    │                          │
│  │   Service    │ │   Service    │                          │
│  └──────────────┘ └──────────────┘                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    External Dependencies                    │
│  - Playwright (Browser Automation)                          │
│  - Cosense REST API                                         │
│  - FileSystem (@effect/platform)                            │
└─────────────────────────────────────────────────────────────┘
```

## ディレクトリ構成

```
src/
├── cli.ts                    # CLI エントリーポイント（拡張）
├── pdf-to-json.ts            # Rust プロセス実行（既存）
├── uploader.ts               # アップロード統合（リファクタ）
├── types.ts                  # 型定義（拡張）
└── services/
    ├── browser.ts            # Playwright ブラウザ操作
    ├── auth.ts               # 認証情報管理
    ├── cosense-api.ts        # Cosense API クライアント
    ├── project.ts            # プロジェクト作成
    └── import.ts             # JSON インポート
```

## モジュール設計

### 1. Browser Service (`src/services/browser.ts`)

Playwright のブラウザ操作を Effect でラップする。

```typescript
import { Effect, Context, Layer, Schema } from "effect";
import { chromium, type BrowserContext, type Page } from "playwright";

// 設定型
export type LaunchOptions = {
  profileDir?: string;
  headless?: boolean;
  storageStatePath?: string;
};

// サービス定義
export class BrowserService extends Context.Tag("BrowserService")<
  BrowserService,
  {
    readonly launch: (options?: LaunchOptions) => Effect.Effect<BrowserContext, BrowserError>;
    readonly close: (context: BrowserContext) => Effect.Effect<void, BrowserError>;
    readonly saveStorageState: (context: BrowserContext, path: string) => Effect.Effect<void, BrowserError>;
  }
>() {}

// Live 実装
export const BrowserServiceLive = Layer.succeed(
  BrowserService,
  {
    launch: (options = {}) =>
      Effect.tryPromise({
        try: async () => {
          const { profileDir = "./browser-profile", headless = false, storageStatePath } = options;
          return await chromium.launchPersistentContext(profileDir, {
            headless,
            channel: "chrome",
            args: ["--disable-blink-features=AutomationControlled"],
            ...(storageStatePath && { storageState: storageStatePath }),
          });
        },
        catch: (cause) => new BrowserError({ message: "Failed to launch browser", cause }),
      }),

    close: (context) =>
      Effect.tryPromise({
        try: () => context.close(),
        catch: (cause) => new BrowserError({ message: "Failed to close browser", cause }),
      }),

    saveStorageState: (context, path) =>
      Effect.tryPromise({
        try: () => context.storageState({ path }),
        catch: (cause) => new BrowserError({ message: "Failed to save storage state", cause }),
      }),
  }
);

// エラー型
class BrowserError extends Schema.TaggedError<BrowserError>()(
  "BrowserError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  }
) {}
```

### 2. Auth Service (`src/services/auth.ts`)

認証情報の保存・読み込み・検証を行う。

```typescript
import { Effect, Context, Layer, Schema } from "effect";
import * as Fs from "@effect/platform/FileSystem";

// 認証データ型
export type AuthData = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
  }>;
};

const DEFAULT_AUTH_PATH = "auth.json";

// サービス定義
export class AuthService extends Context.Tag("AuthService")<
  AuthService,
  {
    readonly exists: (path?: string) => Effect.Effect<boolean, AuthError>;
    readonly load: (path?: string) => Effect.Effect<AuthData, AuthError>;
    readonly getSid: (path?: string) => Effect.Effect<string, AuthError>;
    readonly isValid: (sid: string) => Effect.Effect<boolean, AuthError>;
  }
>() {}

// デフォルトパス
const DEFAULT_AUTH_PATH = "auth.json";

// Live 実装
export const AuthServiceLive = Layer.effect(
  AuthService,
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;

    return {
      exists: (path = DEFAULT_AUTH_PATH) =>
        fs.exists(path).pipe(
          Effect.mapError((e) => new AuthError(`Failed to check auth file: ${e}`))
        ),

      load: (path = DEFAULT_AUTH_PATH) =>
        Effect.gen(function* () {
          const content = yield* fs.readFileString(path);
          return JSON.parse(content) as AuthData;
        }).pipe(
          Effect.mapError((e) => new AuthError(`Failed to load auth: ${e}`))
        ),

      getSid: (path = DEFAULT_AUTH_PATH) =>
        Effect.gen(function* () {
          const auth = yield* this.load(path);
          const sidCookie = auth.cookies.find(
            (c) => c.name === "connect.sid" && c.domain.includes("scrapbox.io")
          );
          if (!sidCookie) {
            return yield* Effect.fail(new AuthError("connect.sid not found"));
          }
          return sidCookie.value;
        }),

      isValid: (sid) =>
        Effect.tryPromise({
          try: async () => {
            const res = await fetch("https://scrapbox.io/api/users/me", {
              headers: { Cookie: `connect.sid=${sid}` },
            });
            return res.ok;
          },
          catch: () => new AuthError("Failed to validate auth"),
        }),
    };
  })
);
```

### 3. Cosense API Service (`src/services/cosense-api.ts`)

Cosense の REST API を操作する。

```typescript
import { Effect, Context, Layer, Schema } from "effect";

// エラー型
export class CosenseApiError extends Schema.TaggedError<CosenseApiError>()(
  "CosenseApiError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  }
) {}

// ページ型
export type Page = {
  title: string;
  lines: string[];
};

// サービス定義
export class CosenseApiService extends Context.Tag("CosenseApiService")<
  CosenseApiService,
  {
    readonly getCsrfToken: (sid: string) => Effect.Effect<string, CosenseApiError>;
    readonly importPages: (
      projectName: string,
      pages: Page[],
      sid: string
    ) => Effect.Effect<{ message: string }, CosenseApiError>;
  }
>() {}

// Live 実装
export const CosenseApiServiceLive = Layer.succeed(
  CosenseApiService,
  {
    getCsrfToken: (sid) =>
      Effect.tryPromise({
        try: async () => {
          const res = await fetch("https://scrapbox.io/api/users/me", {
            headers: { Cookie: `connect.sid=${sid}` },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = (await res.json()) as { csrfToken: string };
          return json.csrfToken;
        },
        catch: (e) => new CosenseApiError(`Failed to get CSRF token: ${e}`),
      }),

    importPages: (projectName, pages, sid) =>
      Effect.gen(function* () {
        const csrfToken = yield* CosenseApiService.getCsrfToken(sid);

        return yield* Effect.tryPromise({
          try: async () => {
            const formData = new FormData();
            const file = new File(
              [JSON.stringify({ pages })],
              "import.json",
              { type: "application/octet-stream" }
            );
            formData.append("import-file", file);
            formData.append("name", "import.json");

            const res = await fetch(
              `https://scrapbox.io/api/page-data/import/${projectName}.json`,
              {
                method: "POST",
                headers: {
                  Cookie: `connect.sid=${sid}`,
                  Accept: "application/json, text/plain, */*",
                  "X-CSRF-TOKEN": csrfToken,
                },
                body: formData,
              }
            );

            if (!res.ok) {
              const body = await res.text();
              throw new Error(`${res.status} ${res.statusText}: ${body}`);
            }

            return (await res.json()) as { message: string };
          },
          catch: (e) => new CosenseApiError(`Import failed: ${e}`),
        });
      }),
  }
);
```

### 4. Project Service (`src/services/project.ts`)

Playwright を使ったプロジェクト作成を行う。

```typescript
import { Effect, Context, Layer, Schema } from "effect";
import type { BrowserContext, Page } from "playwright";
import { BrowserService } from "./browser";

// エラー型
export class ProjectError extends Schema.TaggedError<ProjectError>()(
  "ProjectError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  }
) {}

// オプション型
export type CreateProjectOptions = {
  isbn: string;
  dryRun?: boolean;
};

// サービス定義
export class ProjectService extends Context.Tag("ProjectService")<
  ProjectService,
  {
    readonly create: (options: CreateProjectOptions) => Effect.Effect<string, ProjectError>;
  }
>() {}

// Live 実装
export const ProjectServiceLive = Layer.effect(
  ProjectService,
  Effect.gen(function* () {
    const browser = yield* BrowserService;

    return {
      create: ({ isbn, dryRun = false }) =>
        Effect.gen(function* () {
          const context = yield* browser.launch({ storageStatePath: "auth.json" });

          try {
            const page = context.pages()[0] || (yield* Effect.tryPromise({
              try: () => context.newPage(),
              catch: (e) => new ProjectError(`Failed to create page: ${e}`),
            }));

            // プロジェクト作成ページへ
            yield* Effect.tryPromise({
              try: () => page.goto("https://scrapbox.io/projects/new"),
              catch: (e) => new ProjectError(`Navigation failed: ${e}`),
            });

            yield* Effect.tryPromise({
              try: () => page.waitForLoadState("networkidle"),
              catch: (e) => new ProjectError(`Page load failed: ${e}`),
            });

            const projectUrl = `mrsekut-book-${isbn}`;

            // フォーム入力
            yield* fillProjectForm(page, projectUrl);

            if (!dryRun) {
              // Create ボタンをクリック
              yield* Effect.tryPromise({
                try: () => page.getByRole("button", { name: "Create" }).click(),
                catch: (e) => new ProjectError(`Failed to click Create: ${e}`),
              });

              // リダイレクト待機
              yield* Effect.tryPromise({
                try: () => page.waitForURL(`**/scrapbox.io/${projectUrl}/**`, { timeout: 10000 }),
                catch: () => new ProjectError(`Project creation may have failed`),
              });
            }

            return projectUrl;
          } finally {
            yield* browser.close(context);
          }
        }),
    };
  })
);

// フォーム入力ヘルパー
const fillProjectForm = (page: Page, projectUrl: string) =>
  Effect.tryPromise({
    try: async () => {
      await page.getByRole("textbox", { name: "Project URL" }).fill(projectUrl);
      await page.getByRole("radio", { name: "Private Project" }).click();
      await page.getByRole("radio", { name: /Personal/ }).click();
      await page.getByRole("radio", { name: "gyazo.com" }).click();
    },
    catch: (e) => new ProjectError(`Failed to fill form: ${e}`),
  });
```

### 5. Import Service (`src/services/import.ts`)

JSON インポートの統合処理を行う。

```typescript
import { Effect, Context, Layer, Schema } from "effect";
import * as Fs from "@effect/platform/FileSystem";
import { AuthService } from "./auth";
import { CosenseApiService, type Page } from "./cosense-api";

// エラー型
export class ImportError extends Schema.TaggedError<ImportError>()(
  "ImportError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  }
) {}

// インポートデータ型
type ImportData = {
  pages: Page[];
};

// サービス定義
export class ImportService extends Context.Tag("ImportService")<
  ImportService,
  {
    readonly importFromFile: (
      projectName: string,
      jsonPath: string
    ) => Effect.Effect<{ message: string; pageCount: number }, ImportError>;
  }
>() {}

// Live 実装
export const ImportServiceLive = Layer.effect(
  ImportService,
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;
    const auth = yield* AuthService;
    const api = yield* CosenseApiService;

    return {
      importFromFile: (projectName, jsonPath) =>
        Effect.gen(function* () {
          // JSON 読み込み
          const content = yield* fs.readFileString(jsonPath).pipe(
            Effect.mapError((e) => new ImportError(`Failed to read JSON: ${e}`))
          );
          const data: ImportData = JSON.parse(content);

          yield* Effect.logInfo(`Importing ${data.pages.length} pages to /${projectName}`);

          // 認証情報取得
          const sid = yield* auth.getSid().pipe(
            Effect.mapError((e) => new ImportError(`Auth error: ${e}`))
          );

          // インポート実行
          const result = yield* api.importPages(projectName, data.pages, sid).pipe(
            Effect.mapError((e) => new ImportError(`Import error: ${e}`))
          );

          yield* Effect.logInfo(`Import completed: ${result.message}`);

          return { message: result.message, pageCount: data.pages.length };
        }),
    };
  })
);
```

## CLI 設計

### コマンド

```bash
bun run src/cli.ts
```

オプションは設けず、シンプルに実行する。ISBN は実行時にインタラクティブに問い合わせる。

### コマンドフロー

```typescript
// cli.ts の主要フロー
Effect.gen(function* () {
  // 1. JSON 生成（Rust）
  const jsonFiles = yield* runPdfToJson;
  yield* Effect.logInfo(`Found ${jsonFiles.length} JSON files`);

  // 2. 各 JSON ファイルを処理
  for (const jsonFile of jsonFiles) {
    // ファイル情報を表示
    const pageCount = yield* getPageCount(jsonFile);
    yield* Effect.logInfo(`Processing: ${path.basename(jsonFile)} (${pageCount} pages)`);

    // ISBN をインタラクティブに問い合わせ
    const isbn = yield* promptIsbn();

    // プロジェクト作成
    yield* Effect.logInfo(`Creating project: mrsekut-book-${isbn}`);
    const projectName = yield* ProjectService.create({ isbn });
    yield* Effect.logInfo(`Project created`);

    // API 認識待ち
    yield* Effect.sleep("3 seconds");

    // インポート
    yield* Effect.logInfo(`Importing ${pageCount} pages`);
    yield* ImportService.importFromFile(projectName, jsonFile);
    yield* Effect.logInfo(`Done`);
  }

  yield* Effect.logInfo(`All ${jsonFiles.length} books processed`);
});
```

### インタラクティブ入力

```typescript
// ISBN を stdin から読み取る
const promptIsbn = () =>
  Effect.gen(function* () {
    yield* Effect.log("Enter ISBN: ");
    const isbn = yield* readLine();
    return isbn.trim();
  });
```

## エラーハンドリング戦略

### エラー型の階層

```
Error
├── BrowserError      # ブラウザ操作エラー
├── AuthError         # 認証エラー
├── CosenseApiError   # API エラー
├── ProjectError      # プロジェクト作成エラー
├── ImportError       # インポートエラー
└── PdfToJsonError    # Rust プロセスエラー（既存）
```

### エラーリカバリー

```typescript
// 認証エラー時の再ログイン
const withAuthRecovery = <A, E>(effect: Effect.Effect<A, E | AuthError>) =>
  effect.pipe(
    Effect.catchTag("AuthError", (e) =>
      Effect.gen(function* () {
        yield* Effect.logWarning("認証が無効です。再ログインしてください。");
        yield* saveAuth();
        return yield* effect; // リトライ
      })
    )
  );
```

## 認証フロー

```
┌─────────────────────────────────────────────┐
│           ユーザーがコマンド実行              │
└─────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│         auth.json が存在するか？             │
└─────────────────────────────────────────────┘
          │                        │
         Yes                       No
          │                        │
          ▼                        ▼
┌──────────────────┐    ┌──────────────────────┐
│ SID を読み込み    │    │ ブラウザ起動          │
│ 有効性を検証      │    │ ユーザーがログイン     │
└──────────────────┘    │ Enter で続行          │
          │             │ auth.json 保存        │
          ▼             └──────────────────────┘
┌──────────────────┐              │
│    有効？        │              │
└──────────────────┘              │
    │           │                 │
   Yes          No ───────────────┘
    │
    ▼
┌──────────────────────────────────────────────┐
│              処理を続行                        │
└──────────────────────────────────────────────┘
```

## 型定義の拡張 (`src/types.ts`)

```typescript
// 既存
export interface CosensePage {
  title: string;
  lines: string[];
}

export interface CosenseProject {
  pages: CosensePage[];
}

// 新規追加
export interface AuthData {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
  }>;
}

export interface ImportResult {
  message: string;
  pageCount: number;
}

export interface CreateProjectResult {
  projectName: string;
  url: string;
}
```

## Layer の構成

```typescript
// 全サービスを結合した Layer
const MainLayer = Layer.mergeAll(
  BrowserServiceLive,
  AuthServiceLive,
  CosenseApiServiceLive,
  ProjectServiceLive,
  ImportServiceLive
).pipe(
  Layer.provide(Fs.layer) // FileSystem を提供
);

// CLI 実行時
cli(process.argv).pipe(
  Effect.provide(MainLayer),
  Effect.provide(BunContext.layer),
  BunRuntime.runMain
);
```

## 処理シーケンス

### プロジェクト作成とインポート

```
User                CLI                 Browser             Cosense
  │                  │                     │                   │
  │ --create-project │                     │                   │
  │ --isbn=XXX       │                     │                   │
  │ file.json        │                     │                   │
  │─────────────────>│                     │                   │
  │                  │                     │                   │
  │                  │ launch(auth.json)   │                   │
  │                  │────────────────────>│                   │
  │                  │                     │                   │
  │                  │      goto /projects/new                 │
  │                  │────────────────────>│                   │
  │                  │                     │                   │
  │                  │      fill form      │                   │
  │                  │────────────────────>│                   │
  │                  │                     │                   │
  │                  │      click Create   │                   │
  │                  │────────────────────>│──────────────────>│
  │                  │                     │   create project  │
  │                  │                     │<──────────────────│
  │                  │                     │                   │
  │                  │ close()             │                   │
  │                  │────────────────────>│                   │
  │                  │                     │                   │
  │                  │ wait 3s             │                   │
  │                  │                     │                   │
  │                  │        POST /api/page-data/import       │
  │                  │─────────────────────────────────────────>│
  │                  │                     │                   │
  │                  │<─────────────────────────────────────────│
  │<─────────────────│                     │                   │
  │   Done!          │                     │                   │
```

## 設計上の考慮事項

### 1. Effect の使い方

- すべての副作用を Effect でラップ
- `Effect.gen` + `yield*` で可読性の高いコード
- 型パラメータ (R, E, A) を明示して型安全性を確保
- Layer でサービスの依存関係を管理
- ロギングは `Effect.logInfo` / `Effect.logWarning` を使用（`Console.log` は使わない）

### 2. ファイル構成のルール

- メインの処理（export される関数）をファイルの上部に配置
- ヘルパー関数をその下に配置
- エラー型定義はファイルの最下部に配置
- エラー型は `Schema.TaggedError` を使用

```typescript
// 例: src/services/example.ts

// 1. メイン処理
export const mainFunction = Effect.gen(function* () {
  // ...
});

// 2. ヘルパー関数
const helperFunction = () => { /* ... */ };

// 3. エラー型（最下部）
class ExampleError extends Schema.TaggedError<ExampleError>()(
  "ExampleError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  }
) {}
```

### 3. テスタビリティ

- サービスを Context.Tag で定義し、テスト時にモック可能
- Playwright の操作は BrowserService に隔離

### 3. 参考実装との整合性

- `/Users/mrsekut/Desktop/cosense` の実装パターンを踏襲
- Google 認証回避の設定を維持
- API クライアントの実装を流用

### 4. 将来の拡張

- ISBN 自動抽出: 別モジュールで追加可能
- ソート・ピン留め: ProjectService に追加可能
- Rust → TypeScript 移行: pdf-to-json.ts を置き換え
