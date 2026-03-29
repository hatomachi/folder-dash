import { App, MarkdownView, Notice, Plugin, TFile, TFolder, normalizePath, MarkdownRenderer, Modal, Setting } from 'obsidian';
import { DEFAULT_SETTINGS, FolderDashSettings, FolderDashSettingTab } from "./settings";

class ReasonInputModal extends Modal {
	onSubmit: (result: string) => void;
	result: string = '';

	constructor(app: App, onSubmit: (result: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'ブロックの理由を入力してください' });

		new Setting(contentEl)
			.setName('理由')
			.addText((text) =>
				text.onChange((value) => {
					this.result = value;
				}).inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						this.close();
						this.onSubmit(this.result);
					}
				})
			);

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('記録する')
					.setCta()
					.onClick(() => {
						this.close();
						this.onSubmit(this.result);
					})
			);
	}

	onClose() {
		let { contentEl } = this;
		contentEl.empty();
	}
}


export default class FolderDashPlugin extends Plugin {
	settings: FolderDashSettings;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon('folder-sync', 'Folder Dash', (evt: MouseEvent) => {
			this.createOrOpenSummaryNote();
		});

		this.addCommand({
			id: 'create-open-folder-summary',
			name: '現在のフォルダにまとめノートを作成/開く',
			callback: () => this.createOrOpenSummaryNote(),
		});

		this.addSettingTab(new FolderDashSettingTab(this.app, this));

		// --- [Phase 2, 3 & 4: コードブロックプロセッサの登録（TOCメトリクス＋機能）] ---
		this.registerMarkdownCodeBlockProcessor("folder-summary", async (source, el, ctx) => {
			const sourceFile = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
			if (!(sourceFile instanceof TFile)) return;

			const parentFolder = sourceFile.parent;
			if (!parentFolder) return;

			// UI 1: メトリクス・アクション（ヘッダーパネル）
			const summaryCache = this.app.metadataCache.getFileCache(sourceFile);
			const sfm = summaryCache?.frontmatter || {};

			const currentStatus = sfm['status'] || 'not-started';
			const workTimeMins = sfm['work_time_minutes'] || 0;
			const blockTimeMins = sfm['block_time_minutes'] || 0;

			// Format dates
			const formatDate = (isoString?: string) => isoString ? new Date(isoString).toLocaleString() : '未記録';
			const startedAt = formatDate(sfm['started_at']);
			const completedAt = formatDate(sfm['completed_at']);

			const headerDiv = el.createDiv({ cls: 'folder-dash-header', attr: { style: 'background: var(--background-secondary); padding: 15px; border-radius: 8px; margin-bottom: 20px;' } });

			// Metrics Table
			const mxTable = headerDiv.createEl('table', { attr: { style: 'width: 100%; text-align: left; margin-bottom: 15px; border-collapse: collapse;' } });
			const tr1 = mxTable.createEl('tr');
			tr1.createEl('th', { text: 'ステータス', attr: { style: 'padding-bottom: 5px; border-bottom: 1px solid var(--background-modifier-border);' } });
			tr1.createEl('th', { text: '着手日', attr: { style: 'padding-bottom: 5px; border-bottom: 1px solid var(--background-modifier-border);' } });
			tr1.createEl('th', { text: '完成日', attr: { style: 'padding-bottom: 5px; border-bottom: 1px solid var(--background-modifier-border);' } });
			tr1.createEl('th', { text: '稼働時間', attr: { style: 'padding-bottom: 5px; border-bottom: 1px solid var(--background-modifier-border);' } });
			tr1.createEl('th', { text: 'ブロック時間', attr: { style: 'padding-bottom: 5px; border-bottom: 1px solid var(--background-modifier-border);' } });

			const tr2 = mxTable.createEl('tr');
			tr2.createEl('td', { text: currentStatus, attr: { style: 'padding-top: 8px;' } });
			tr2.createEl('td', { text: startedAt, attr: { style: 'padding-top: 8px;' } });
			tr2.createEl('td', { text: completedAt, attr: { style: 'padding-top: 8px;' } });
			tr2.createEl('td', { text: `${workTimeMins} 分`, attr: { style: 'padding-top: 8px;' } });
			tr2.createEl('td', { text: `${blockTimeMins} 分`, attr: { style: 'padding-top: 8px;' } });

			// Buttons
			const btnGroup = headerDiv.createDiv({ cls: 'folder-dash-buttons', attr: { style: 'display: flex; gap: 10px;' } });

			const updateStatus = async (newStatus: string, actionName: string, reason?: string) => {
				await this.app.fileManager.processFrontMatter(sourceFile, (frontmatter) => {
					const now = new Date();
					const nowStr = now.toISOString();

					// 着手日・完成日の記録 (一度記録されたら上書きしない)
					if (newStatus === 'in-progress' && !frontmatter['started_at']) {
						frontmatter['started_at'] = nowStr;
					}
					if (newStatus === 'completed' && !frontmatter['completed_at']) {
						frontmatter['completed_at'] = nowStr;
					}

					// 経過時間の計算と加算
					const lastToggled = frontmatter['last_toggled_at'];
					if (lastToggled) {
						const diffMs = now.getTime() - new Date(lastToggled).getTime();
						const diffMins = Math.floor(diffMs / 60000);

						if (frontmatter['status'] === 'in-progress') {
							frontmatter['work_time_minutes'] = (frontmatter['work_time_minutes'] || 0) + diffMins;
						} else if (frontmatter['status'] === 'blocked') {
							frontmatter['block_time_minutes'] = (frontmatter['block_time_minutes'] || 0) + diffMins;
						}
					}

					// ステータス更新
					frontmatter['status'] = newStatus;

					if (newStatus !== 'completed') {
						frontmatter['last_toggled_at'] = nowStr;
					} else {
						delete frontmatter['last_toggled_at'];
					}

					// 作業履歴(History)の記録
					let history = frontmatter['history'];
					if (!Array.isArray(history)) history = [];

					const eventLog: any = { time: nowStr, action: actionName };
					if (reason) eventLog.reason = reason;

					history.push(eventLog);
					frontmatter['history'] = history;
				});
			};

			const startBtn = btnGroup.createEl('button', { text: '▶ 着手 (Start)' });
			const blockBtn = btnGroup.createEl('button', { text: '⏸ ブロック (Block)' });
			const compBtn = btnGroup.createEl('button', { text: '✅ 完了 (Complete)' });

			if (currentStatus === 'completed') {
				startBtn.disabled = true; blockBtn.disabled = true; compBtn.disabled = true;
			} else if (currentStatus === 'in-progress') {
				startBtn.disabled = true;
			} else if (currentStatus === 'blocked') {
				blockBtn.disabled = true;
			} else if (currentStatus === 'not-started') {
				blockBtn.disabled = true; compBtn.disabled = true;
			}

			startBtn.onclick = () => updateStatus('in-progress', 'start');
			compBtn.onclick = () => updateStatus('completed', 'complete');
			blockBtn.onclick = () => {
				new ReasonInputModal(this.app, (reason) => {
					updateStatus('blocked', 'block', reason || '理由なし');
				}).open();
			};


			// UI 2: ファイルリスト（Phase 3 自動分類）
			const deliverables: string[] = [];
			const memos: string[] = [];
			const others: string[] = [];

			for (const child of parentFolder.children) {
				if (child instanceof TFile && child.extension === 'md' && child.name !== '_Summary.md') {
					const cache = this.app.metadataCache.getFileCache(child);
					const frontmatter = cache?.frontmatter;

					let isDeliverable = false;
					let isMemo = false;

					if (frontmatter) {
						const typeConf = frontmatter['type'] || '';
						const tagsConf = frontmatter['tags'] || frontmatter['tag'] || [];
						const typeStr = String(typeConf).toLowerCase();
						const tagsArr = Array.isArray(tagsConf) ? tagsConf.map(t => String(t).toLowerCase()) : [String(tagsConf).toLowerCase()];

						if (['deliverable', '成果物', 'product'].includes(typeStr) || tagsArr.some(t => t.includes('deliverable') || t.includes('成果物'))) {
							isDeliverable = true;
						} else if (['memo', 'メモ', 'note'].includes(typeStr) || tagsArr.some(t => t.includes('memo') || t.includes('メモ') || t.includes('note'))) {
							isMemo = true;
						}
					}

					const linkItem = `- [[${child.path}|${child.basename}]]`;
					if (isDeliverable) deliverables.push(linkItem);
					else if (isMemo) memos.push(linkItem);
					else others.push(linkItem);
				}
			}

			const renderSection = async (title: string, items: string[]) => {
				if (items.length > 0) {
					const markdownText = `**${title}**\n${items.join('\n')}\n`;
					const wrapper = el.createDiv({ cls: 'folder-dash-section' });
					await MarkdownRenderer.renderMarkdown(markdownText, wrapper, ctx.sourcePath, this);
				}
			};

			if (deliverables.length === 0 && memos.length === 0 && others.length === 0) {
				el.createEl('p', { text: 'このフォルダには他のMarkdownファイルがありません。' });
			} else {
				await renderSection('🌟 成果物 (Deliverables)', deliverables);
				await renderSection('📝 メモ (Memos)', memos);
				await renderSection('📁 その他 (Others)', others);
			}

			// UI 3: 作業履歴 (History Timeline)
			const historyObj = sfm['history'] || [];
			if (Array.isArray(historyObj) && historyObj.length > 0) {
				const historyDiv = el.createDiv({ attr: { style: 'margin-top: 30px; border-top: 1px solid var(--background-modifier-border); padding-top: 15px;' } });
				historyDiv.createEl('h3', { text: '⏳ 作業履歴 (Timeline)' });
				const ul = historyDiv.createEl('ul');
				for (const h of historyObj) {
					const t = new Date(h.time).toLocaleString();
					const actionIcon = h.action === 'start' ? '▶' : h.action === 'block' ? '⏸' : h.action === 'complete' ? '✅' : '⏺';
					const listText = `${actionIcon} ${t} - ${h.action.toUpperCase()}${h.reason ? ` (理由: ${h.reason})` : ''}`;
					ul.createEl('li', { text: listText });
				}
			}
		});
	}

	onunload() {
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

		const summaryFileName = '_Summary.md';
		const summaryFilePath = normalizePath(`${parentFolder.path}/${summaryFileName}`);
		let summaryFile = this.app.vault.getAbstractFileByPath(summaryFilePath);

		if (summaryFile instanceof TFile) {
			await this.app.workspace.getLeaf(false).openFile(summaryFile);
		} else {
			const now = new window.Date();
			const isoString = now.toISOString();

			const template = `---
status: ${this.settings.defaultStatus || 'not-started'}
created_at: ${isoString}
work_time_minutes: 0
block_time_minutes: 0
---
# ${parentFolder.name} 

\`\`\`folder-summary
\`\`\`
`;
			try {
				const newFile = await this.app.vault.create(summaryFilePath, template);
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
