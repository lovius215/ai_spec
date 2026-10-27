# sa-spec - システム分析 AI ワークスペース

[![npm version](https://img.shields.io/npm/v/@loviusc/sa-spec.svg)](https://www.npmjs.com/package/@loviusc/sa-spec)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

> 要件やアイデアを、確認可能・監査可能・コンフリクト検出可能なエンジニアリング仕様書へと整理する、AI主導開発向けシステム分析（SA）ドキュメント・ワークスペース。

<p align="center">
  <b>🌐 言語ナビゲーション (Languages):</b>
  <a href="./README.en.md"><b>English</b></a> |
  <a href="./README.zh-TW.md"><b>繁體中文</b></a> |
  <a href="./README.zh-CN.md"><b>简体中文</b></a> |
  <a href="./README.ja.md"><b>日本語</b></a> |
  <a href="./README.ko.md"><b>한국어</b></a>
</p>

---

## 概要

`sa-spec` は単なる AI ドキュメント生成ツールではなく、**AI コーディング前に行う「システム分析（System Analysis）ワークスペース」** です。

OpenSpec、Claude Code、OpenAI Codex、Gemini CLI などの AI 開発ツールがコード実装を始める前に、要件のスコープ、境界線、データモデル、API 規約、権限マトリクス、受入条件を事前に明確化し、安全で堅牢な開発境界を定義します。

AI ワークフローは 4 つの標準コマンド（エイリアス対応）で動作します：

| コマンド | エイリアス | 目的 | 説明 |
|---|---|---|---|
| `spec:init` | `sci` | 初期化 | `AGENTS.md`、ルールセット、指定言語のプロンプトを読み込みます。 |
| `spec:propose` | `scp` | 要件提案 | 既存の仕様を変更せず、目的・概要・初期フロー・確認事項を整理します。 |
| `spec:analyze` | `sca` | 分析と起草 | 既存の要件、API、DB スキーマとの競合をチェックし、問題がなければ SRS、UML、OpenAPI、DB スキーマのドラフトを作成します。 |
| `spec:commit` | `scc` | 確認と保存 | ユーザーが承認したバージョンを正式に採番・保存し、インデックスを更新して Git コミットを作成します。 |

各要件フォルダーには以下の標準成果物が生成されます：

```text
project/
  REQ-001-login/
    srs.md           # ソフトウェア要件仕様書 (SRS)
    uml/
      main.puml      # 独立した PlantUML 図（1ファイル1図の原則）
    openapi.yaml     # OpenAPI 3.0 ドラフト
    db-schema.md     # データベーススキーマ仕様書
    handoff.md       # AI 開発ツール向け引き継ぎ要約 (OpenSpec / Claude Code エントリポイント)
    history.md       # 変更履歴および意思決定ログ
```

---

## 設計思想

```text
sa-spec が仕様と境界を明確にし、AI 開発ツールが正しく実装する。
```

1. **防御的な影響評価**: `spec:analyze` は競合チェックを強制します。新しい要件が既存の権限、API シグネチャ、DB テーブルを意図せず上書き・破壊しないかを厳密に検証します。
2. **決定論的ステートマシン**: `propose -> analyze -> commit` の流れを遵守します。AI が未確認の業務ルールやテーブルカラムを勝手に捏造することを防ぎます。競合が発見された場合は生成を停止し、人間の指示を仰ぎます。
3. **AI 開発引き継ぎサマリー (`handoff.md`)**: 実装すべき内容、触れてはならない境界、API 契約、受入条件を凝縮し、後続の AI 開発ツールに安全なガイドラインを提供します。

---

## インストールと利用準備

### 前提環境
- Node.js 18 以上
- npm
- Git

### グローバルインストール

```bash
npm install -g @loviusc/sa-spec
```

インストールの確認：

```bash
sa-spec help
sa-spec --version
```

---

## CLI コマンド一覧

| コマンド | 説明 |
|---|---|
| `sa-spec init [--full] [--lang <lang>]` | ワークスペースの骨格を初期化します（`zh-TW`、`en`、`zh-CN`、`ja`、`ko` に対応）。 |
| `sa-spec new [--id REQ-001] --name login [--branch]` | 要件テンプレートを作成します。`--id` を省略すると、Git 分岐を活用したドラフトモード（`feat/<name>`）で開始します。 |
| `sa-spec finalize --name login` | ドラフト要件に最新の連続番号を割り当て、フォルダー名を変更し、`{{REQ_ID}}` を置換してインデックスを再生成します。 |
| `sa-spec reindex` | `project/REQ-*` ディレクトリをスキャンし、数値順にソートされた `project/index.md` を自動再構築します。 |
| `sa-spec check` | 必須ファイルとシステム仕様の状態を検証します。 |
| `sa-spec status` | 要件とシステム仕様の概要ステータスを表示します。 |
| `sa-spec doctor` | ワークスペースの依存関係と整合性を診断します。 |
| `sa-spec upgrade [--dry-run]` | 既存の言語設定を保持したまま、ルールとスキルを最新版にアップグレードします。 |

---

## チーム開発と Git-Flow（遅延採番アーキテクチャ）

複数人での並行開発時に発生する「要件番号の競合」や「Git マージコンフリクト」を防ぐため、**Feature Branch 隔離 + 遅延バインディング（Late-Binding ID）** を採用しています：

```mermaid
flowchart TD
    A[要件提案: sa-spec new --name cart --branch] --> B[feat/cart ブランチを作成して切替<br/>ドラフトディレクトリ: project/cart/]
    B --> C[AI による分析: sca<br/>内部で {{REQ_ID}} プレースホルダー使用<br/>master の最新仕様との競合予防チェック]
    C --> D{ユーザー承認?<br/>scc または finalize を実行}
    D --> E[master から最新の利用可能番号 N を取得]
    E --> F[project/REQ-N+1-cart/ にリネーム<br/>{{REQ_ID}} を正式番号に一括置換]
    F --> G[sa-spec reindex: index.md を動的に再生成]
    G --> H[master へマージ: 競合ゼロ、連番維持！]
```

1. **ドラフト時は番号を奪い合わない**: `sa-spec new --name cart --branch` でブランチを切り、`{{REQ_ID}}` を使って作業します。途中で要件を破棄する場合も、ブランチを削除するだけで済み、欠番（ゴーストID）を残しません。
2. **基線同期で競合見落としを防止**: `spec:analyze` の実行前に master の最新状態を取得し、他メンバーがマージした最新の API やテーブル変更を反映して競合チェックを行います。
3. **マージ確定時に正式採番**: `sa-spec finalize` または `scc` で master 上の最新番号を取得してリネームします。
4. **インデックスのコンフリクト解消**: `sa-spec reindex` でディレクトリから常に決定論的に `project/index.md` を再構築します。

---

## 国際化（i18n）対応

`sa-spec` は 5 つの主要言語を正式にサポートしています：

| コード | 言語名 | 文体・表記ガイドライン | 技術用語の取り扱い原則 |
|---|---|---|---|
| `ja` | **日本語** | 日本語技術文体（です/ます、またはである調） | 業界標準の英語用語を維持（`REST API`, `Webhook`, `JWT`） |
| `en` | **English** | 100% 標準的な技術英文 | 原文の標準英語 |
| `zh-TW` | **繁體中文** (既定) | 台湾の標準的な技術用語 | 業界標準の英語用語を維持（`REST API`, `Webhook`, `JWT`） |
| `zh-CN` | **简体中文** | 中国本土の標準的な技術用語 | 業界標準の英語用語を維持（`REST API`, `Webhook`, `JWT`） |
| `ko` | **한국어** | 韓国語の専門技術文体と敬語 | 業界標準の英語用語を維持（`REST API`, `Webhook`, `JWT`） |

### 重要ルール：
1. **初期化時の言語確定**: `sa-spec init --lang ja` または `spec:init` 時に対話形式で言語を決定し、`project/system-spec.md` に記録します。
2. **単一言語の一貫性**: プロジェクト内の全仕様書は選択した言語に統一されます。
3. **技術専門用語の英語表記維持**: 非英語モードであっても、標準的な技術用語（`REST API`、`Webhook`、`JWT`、`OAuth 2.0`、`Payload`、`Idempotency Key`、`Redis` など）は無理な直訳を避け、**原語の英語表記を強制維持**します。
4. **アップグレード時の言語保護**: `sa-spec upgrade` は既存プロジェクトの言語を自動検知し、言語設定を勝手に変更しません。

---

## ライセンス

MIT © [lovius](https://github.com/lovius215)
