import { App, MarkdownView, Notice, Plugin, TFile, normalizePath } from 'obsidian';
import { DEFAULT_SETTINGS, FolderDashSettings, FolderDashSettingTab } from "./settings";

export default class FolderDashPlugin extends Plugin {
	settings: FolderDashSettings;

	async onload() {
		await this.loadSettings();

		// プラグイン開発時用のリロード用アイコン（必要に応じて削除してください）
		this.addRibbonIcon('folder-sync', 'Folder Dash', (evt: MouseEvent) => {
			this.createOrOpenSummaryNote();
		});

		// 現在のフォルダにまとめノートを作成/開くコマンド
		this.addCommand({
			id: 'create-open-folder-summary',
			name: '現在のフォルダにまとめノートを作成/開く',
			callback: () => this.createOrOpenSummaryNote(),
		});

		// 設定タブの追加
		this.addSettingTab(new FolderDashSettingTab(this.app, this));

		// --- [Phase 2以降の拡張ポイント] ---
		// ここで MarkdownPostProcessor を登録し、`folder-summary` コードブロックを拡張します。
		// this.registerMarkdownCodeBlockProcessor("folder-summary", (source, el, ctx) => {
		//     // フォルダ内のファイル一覧を取得し、レンダリングする処理を実装
		// });
	}

	onunload() {
		// プラグイン無効化時のクリーンアップ処理
	}

	async createOrOpenSummaryNote() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('アクティブなファイルがありません。対象のフォルダ内のファイルを開いてから実行してください。');
			return;
		}

		const parentFolder = activeFile.parent;
		if (!parentFolder) {
			new Notice('親フォルダが見つかりませんでした。');
			return;
		}

		// ファイル名は固定で "_Summary.md" とする
		const summaryFileName = '_Summary.md';
		const summaryFilePath = normalizePath(`${parentFolder.path}/${summaryFileName}`);

		let summaryFile = this.app.vault.getAbstractFileByPath(summaryFilePath);

		if (summaryFile instanceof TFile) {
			// 既に存在する場合は開く
			await this.app.workspace.getLeaf(false).openFile(summaryFile);
		} else {
			// 存在しない場合は新規作成する
			// --- [Phase 3/4以降の拡張ポイント] ---
			// 初期ステータスや時間記録用のフィールドをYAMLに含めています
			const now = new window.Date();
			const isoString = now.toISOString();

			const template = `---
status: ${this.settings.defaultStatus}
created_at: ${isoString}
work_time_minutes: 0
---
# ${parentFolder.name} 

\`\`\`folder-summary
\`\`\`
`;
			try {
				const newFile = await this.app.vault.create(summaryFilePath, template);
				// 新しく作成したファイルを開く
				await this.app.workspace.getLeaf(false).openFile(newFile as TFile);
				new Notice(`${summaryFileName} を作成しました。`);
			} catch (error) {
				console.error('まとめノートの作成に失敗しました:', error);
				new Notice('まとめノートの作成に失敗しました。');
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<FolderDashSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
