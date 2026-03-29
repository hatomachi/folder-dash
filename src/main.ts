import { App, MarkdownView, Notice, Plugin, TFile, TFolder, normalizePath, MarkdownRenderer } from 'obsidian';
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

		// --- [Phase 2: コードブロックプロセッサの登録] ---
		this.registerMarkdownCodeBlockProcessor("folder-summary", async (source, el, ctx) => {
			const sourceFile = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
			if (!(sourceFile instanceof TFile)) return;

			const parentFolder = sourceFile.parent;
			if (!parentFolder) return;

			// 同一フォルダ内のMarkdownファイルを取得 (_Summary.md を除く)
			const links: string[] = [];
			for (const child of parentFolder.children) {
				if (child instanceof TFile && child.extension === 'md' && child.name !== '_Summary.md') {
					// Obsidianの内部リンク記法でリストアイテムを作成
					// パスを指定することで、同名ファイルが存在した場合の名前の衝突を避ける
					links.push(`- [[${child.path}|${child.basename}]]`);
				}
			}

			el.empty();
			if (links.length > 0) {
				// MarkdownRendererを用いて、リンク文字列を実際のHTMLとしてレンダリングする
				await MarkdownRenderer.renderMarkdown(links.join('\n'), el, ctx.sourcePath, this);
			} else {
				el.createEl('p', { text: 'このフォルダには他のMarkdownファイルがありません。' });
			}
		});
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
