# フォルダダッシュ (folder-dash) アーキテクチャガイド

本ドキュメントは、本プラグインの機能改修やエンハンス開発を行う開発者・メンテナー向けの設計・実装方針資料です。

## システムアーキテクチャの基本方針
- **Gitでの差分管理を最優先したステートレス設計**: プラグイン内部に隠しJSONデータベースや特殊な永続化ストレージを持たず、**すべての状態データ（メトリクス、履歴、担当者）は `_Summary.md` のYAMLフロントマター（プロパティ）内にプレーンテキストとして保持**します。これにより、別環境での作業やチームメンバー間でのタスク状態の共有が、通常のGitフローに自然と乗る堅牢な設計となっています。
- **動的コードブロックレンダリング**: 描画は Obsidian の `MarkdownPostProcessor` API を活用し、専用のコードブロック（````folder-summary````）をフックして動的にHTMLUIパネル（メトリクステーブル、ファイル一覧、履歴タイムライン）を生成する仕組みを採用しています。

## 担当者（ユーザー）の自動取得の仕組み
チームメンバーに「プラグインの設定画面から自分の名前を入力する」という手間を掛けさせないため、各個人のローカルGit設定環境を利用しています。
- Obsidian は Electron（Node.js）環境上で動作するという特性を利用し、`child_process` モジュールの `exec` を呼び出して `git config user.name` コマンドを非同期実行しています。
- `app.vault.adapter` 経由で取得した Vault（プロジェクト）のルート絶対パスをカレントディレクトリ（`cwd`）として参照するため、グローバル設定だけでなく当該リポジトリ固有の config 設定にも正確に対応します。
- 取得エラー時やGit未設定環境下では例外をキャッチし、`'Unknown User'` へフォールバックする安全な作りとしています。

## データ構造（スキーマ）
`_Summary.md` に追記・更新されるフロントマターは以下の構造を前提としています。
```yaml
assignee: string             # 現在の主担当者（自動取得されたGit名）。アクションを起こしたユーザー名でテイクオーバー（上書き更新）される。
status: string               # 現在の状態（'not-started', 'in-progress', 'blocked', 'completed'）
created_at: string           # まとめノート生成時のISO日時文字列
started_at: string           # 最初に「着手」ボタンが押されたISO日時文字列
completed_at: string         # 最初に「完了」ボタンが押されたISO日時文字列
work_time_minutes: number    # 着手状態（in-progress）であった累積時間（分単位）
block_time_minutes: number   # ブロック状態（blocked）であった累積時間（分単位）
last_toggled_at: string      # 最後にステータス遷移が起きたISO日時文字列（累積時間計算の中間状態として利用）
history: Array<{             # アンドン・テイクオーバーの作業履歴（タイムライン）
  time: string,              # アクション発生のISO日時
  action: string,            # 'start' | 'block' | 'complete'
  user: string,              # そのアクションを実行したGitユーザー名
  reason?: string            # 'block' アクション時にModalから入力された待機理由
}>
```

## UIと状態の分離に関する工夫
### `processFrontMatter` による安全な状態更新
ダッシュボード上のボタン（UI側）からの状態変更リクエストは、すべて Obsidian 標準 API の `app.fileManager.processFrontMatter(file, callback)` を通じてキューへ渡されます。
このメソッドを利用することで、フロントマターのパース、オブジェクト変更の適用、そして再シリアライズがスレッドセーフに行われます。ユーザーがエディタ上で同じファイルのメタデータをマニュアル編集している最中であっても、データの競合（コンフリクト）や破損リスクを最小化しています。

### プロパティビューのコンパクト化設計 (Phase 9)
ダッシュボードとしてのデザイン要件を満たしつつ、表示領域を圧迫する大量の履歴メタデータ問題を「純粋なCSSとイベントフック」で解決しています。
- `styles.css` にて `.is-enhance-board-summary .metadata-container` に対する `max-height` 制限と `opacity` の半透明化、およびホバー時の展開トランジション（CSSアニメーション）を一括定義しています。
- `main.ts` では `workspace.on('file-open')` イベントリスナーを使用し、現在有効な `MarkdownView` が開いているファイル名が `_Summary.md` であるかどうかを常時監視しています。
- 条件に合致した場合のみ動的にコンテナ（`view.containerEl`）へ `is-enhance-board-summary` クラスを付け外しすることで、グローバルな Obsidian UI（他のノート等）へ副作用を与えずに、ダッシュボード固有画面のビューのみを安全にハックする巧妙な設計となっています。
