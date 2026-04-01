import { App, MarkdownView, Notice, Plugin, TFile, TFolder, normalizePath, MarkdownRenderer, Modal, Setting } from 'obsidian';
import { DEFAULT_SETTINGS, FolderDashSettings, FolderDashSettingTab } from "./settings";
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

async function getGitUser(app: App): Promise<string> {
	try {
		// Obtains the root path of the active Vault
		const basePath = (app.vault.adapter as any).getBasePath ? (app.vault.adapter as any).getBasePath() : '';
		if (!basePath) return 'Unknown User';

		const { stdout } = await execPromise('git config user.name', { cwd: basePath });
		const name = stdout.trim();
		return name || 'Unknown User';
	} catch (e) {
		return 'Unknown User';
	}
}

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

// Phase 8: ファイル名入力用モーダル
class FileNameInputModal extends Modal {
	onSubmit: (result: string) => void;
	result: string = '';
	title: string;

	constructor(app: App, title: string, onSubmit: (result: string) => void) {
		super(app);
		this.title = title;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: this.title });

		new Setting(contentEl)
			.setName('ファイル名')
			.addText((text) =>
				text.onChange((value) => {
					this.result = value;
				}).inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						this.close();
						let finalName = this.result.trim();
						if (!finalName) finalName = '無題のノート';
						this.onSubmit(finalName);
					}
				})
			);

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('作成する')
					.setCta()
					.onClick(() => {
						this.close();
						let finalName = this.result.trim();
						if (!finalName) finalName = '無題のノート';
						this.onSubmit(finalName);
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

		// Phase 9: ワークスペースの file-open イベントを監視してクラスを付与/剥奪
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) {
					if (file && file.name === '_Summary.md') {
						view.containerEl.classList.add('is-enhance-board-summary');
					} else {
						view.containerEl.classList.remove('is-enhance-board-summary');
					}
				}
			})
		);

		this.app.workspace.onLayoutReady(() => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view && view.file && view.file.name === '_Summary.md') {
				view.containerEl.classList.add('is-enhance-board-summary');
			}
		});

		// --- [Phase 2 〜 10: コードブロックプロセッサの登録] ---
		this.registerMarkdownCodeBlockProcessor("folder-summary", async (source, el, ctx) => {
			const sourceFile = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
			if (!(sourceFile instanceof TFile)) return;

			const parentFolder = sourceFile.parent;
			if (!parentFolder) return;

			// UI 1: メトリクス・アクション（ヘッダーパネル）
			const summaryCache = this.app.metadataCache.getFileCache(sourceFile);
			const sfm = summaryCache?.frontmatter || {};

			const currentAssignee = sfm['assignee'] || '未設定';
			const currentStatus = sfm['status'] || 'not-started';
			const workTimeMins = sfm['work_time_minutes'] || 0;
			const blockTimeMins = sfm['block_time_minutes'] || 0;

			const formatDate = (isoString?: string) => isoString ? new Date(isoString).toLocaleString() : '未記録';
			const startedAt = formatDate(sfm['started_at']);
			const completedAt = formatDate(sfm['completed_at']);

			const headerDiv = el.createDiv({ cls: 'folder-dash-header', attr: { style: 'background: var(--background-secondary); padding: 15px; border-radius: 8px; margin-bottom: 20px;' } });

			const mxTable = headerDiv.createEl('table', { attr: { style: 'width: 100%; text-align: left; margin-bottom: 15px; border-collapse: collapse;' } });
			const tr1 = mxTable.createEl('tr');
			tr1.createEl('th', { text: '担当者', attr: { style: 'padding-bottom: 5px; border-bottom: 1px solid var(--background-modifier-border);' } });
			tr1.createEl('th', { text: 'ステータス', attr: { style: 'padding-bottom: 5px; border-bottom: 1px solid var(--background-modifier-border);' } });
			tr1.createEl('th', { text: '着手日', attr: { style: 'padding-bottom: 5px; border-bottom: 1px solid var(--background-modifier-border);' } });
			tr1.createEl('th', { text: '完成日', attr: { style: 'padding-bottom: 5px; border-bottom: 1px solid var(--background-modifier-border);' } });
			tr1.createEl('th', { text: '稼働時間', attr: { style: 'padding-bottom: 5px; border-bottom: 1px solid var(--background-modifier-border);' } });
			tr1.createEl('th', { text: 'ブロック時間', attr: { style: 'padding-bottom: 5px; border-bottom: 1px solid var(--background-modifier-border);' } });

			const tr2 = mxTable.createEl('tr');
			tr2.createEl('td', { text: currentAssignee, attr: { style: 'padding-top: 8px; font-weight: bold;' } });
			tr2.createEl('td', { text: currentStatus, attr: { style: 'padding-top: 8px;' } });
			tr2.createEl('td', { text: startedAt, attr: { style: 'padding-top: 8px;' } });
			tr2.createEl('td', { text: completedAt, attr: { style: 'padding-top: 8px;' } });
			tr2.createEl('td', { text: `${workTimeMins} 分`, attr: { style: 'padding-top: 8px;' } });
			tr2.createEl('td', { text: `${blockTimeMins} 分`, attr: { style: 'padding-top: 8px;' } });

			const btnGroup = headerDiv.createDiv({ cls: 'folder-dash-buttons', attr: { style: 'display: flex; gap: 10px;' } });

			const updateStatus = async (newStatus: string, actionName: string, reason?: string) => {
				const currentUser = await getGitUser(this.app);

				await this.app.fileManager.processFrontMatter(sourceFile, (frontmatter) => {
					const now = new Date();
					const nowStr = now.toISOString();

					frontmatter['assignee'] = currentUser;

					if (newStatus === 'in-progress' && !frontmatter['started_at']) {
						frontmatter['started_at'] = nowStr;
					}
					if (newStatus === 'completed' && !frontmatter['completed_at']) {
						frontmatter['completed_at'] = nowStr;
					}

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

					frontmatter['status'] = newStatus;

					if (newStatus !== 'completed') {
						frontmatter['last_toggled_at'] = nowStr;
					} else {
						delete frontmatter['last_toggled_at'];
					}

					let history = frontmatter['history'];
					if (!Array.isArray(history)) history = [];

					const eventLog: any = { time: nowStr, action: actionName, user: currentUser };
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


			// UI 2: ファイルリスト（Phase 6 カテゴリ別表示 ＋ Phase 7 詳細表示と降順ソート）
			interface FileItem { file: TFile, mtime: number, assignee: string }
			const categoryGroups: Record<string, FileItem[]> = {};
			this.settings.noteCategories.forEach(cat => {
				categoryGroups[cat.id] = [];
			});
			const others: FileItem[] = [];

			for (const child of parentFolder.children) {
				if (child instanceof TFile && child.extension === 'md' && child.name !== '_Summary.md') {
					const cache = this.app.metadataCache.getFileCache(child);
					const frontmatter = cache?.frontmatter;

					const fileItem: FileItem = {
						file: child,
						mtime: child.stat.mtime,
						assignee: frontmatter ? (frontmatter['assignee'] || '未設定') : '未設定'
					};

					let matched = false;

					if (frontmatter) {
						const typeConf = frontmatter['type'] || '';
						const tagsConf = frontmatter['tags'] || frontmatter['tag'] || [];
						const typeStr = String(typeConf).toLowerCase();
						const tagsArr = Array.isArray(tagsConf) ? tagsConf.map(t => String(t).toLowerCase()) : [String(tagsConf).toLowerCase()];

						for (const cat of this.settings.noteCategories) {
							if (typeStr === cat.id.toLowerCase() || tagsArr.some(t => t.includes(cat.id.toLowerCase()))) {
								const group = categoryGroups[cat.id];
								if (group) group.push(fileItem);
								matched = true;
								break;
							}
						}
					}

					if (!matched) {
						others.push(fileItem);
					}
				}
			}

			// Phase 10: アイテムをフォーマットし降順にソートするヘルパー
			const formatAndSortItems = (items: FileItem[]): string[] => {
				items.sort((a, b) => b.mtime - a.mtime); // mtimeが大きい（新しい）順に降順ソート
				return items.map(item => {
					// @ts-ignore
					const dateStr = window.moment ? window.moment(item.mtime).format('YYYY-MM-DD HH:mm') : new Date(item.mtime).toLocaleString();

					// Phase 10: Inject `data-filepath` onto the link Wrapper so we can find it
					return `- <span class="folder-dash-item-link" data-filepath="${item.file.path}">[[${item.file.path}|${item.file.basename}]]</span> <span style="font-size: 0.85em; color: var(--text-muted); margin-left: 8px;">👤 担当: ${item.assignee} &nbsp;|&nbsp; 🕒 更新: ${dateStr}</span>`;
				});
			};

			// Phase 8: ヘッダー＋インライン追加ボタンの描画ロジック
			const renderSection = async (title: string, items: FileItem[], catId?: string) => {
				const sectionWrapper = el.createDiv({ cls: 'folder-dash-section', attr: { style: 'margin-top: 20px;' } });

				// タイトルと追加ボタンを含むヘッダーコンテナ
				const titleHeader = sectionWrapper.createDiv({ attr: { style: 'display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid var(--background-modifier-border); padding-bottom: 5px; margin-bottom: 10px;' } });
				titleHeader.createEl('h3', { text: title, attr: { style: 'margin: 0;' } });

				// 「＋ 追加」ボタン
				const addBtn = titleHeader.createEl('button', { text: '＋ 追加', attr: { style: 'font-size: 0.8em; padding: 4px 10px; height: auto;' } });
				addBtn.onclick = async () => {
					new FileNameInputModal(this.app, `「${title}」の新規作成`, async (fileName) => {
						const newFilePath = normalizePath(`${parentFolder.path}/${fileName}.md`);
						const currentUser = await getGitUser(this.app);

						// 動的にフロントマターを生成
						let typeProp = catId ? `\ntype: ${catId}` : '';
						const template = `---
assignee: ${currentUser}${typeProp}
---
# ${fileName}
`;
						try {
							const newFile = await this.app.vault.create(newFilePath, template);
							await this.app.workspace.getLeaf(false).openFile(newFile as TFile);
							new Notice(`${fileName}.md を作成しました。`);
						} catch (e) {
							console.error(e);
							new Notice('作成に失敗しました。同名のファイルが存在するか確認してください。');
						}
					}).open();
				};

				// リストアイテムの描画と、Phase 10 のセレクトメニューインジェクション
				if (items.length > 0) {
					const formattedStrings = formatAndSortItems(items);
					const markdownText = `${formattedStrings.join('\n')}\n`;
					const listWrapper = sectionWrapper.createDiv();
					await MarkdownRenderer.renderMarkdown(markdownText, listWrapper, ctx.sourcePath, this);

					// Phase 10: MarkdownRenderer 完了後に DOM を探して <select> を注入
					listWrapper.querySelectorAll('.folder-dash-item-link').forEach(span => {
						const pathAttr = span.getAttribute('data-filepath');
						if (!pathAttr) return;

						const selectEl = document.createElement('select');
						selectEl.className = 'folder-dash-category-select';

						// Populate Options from Settings
						this.settings.noteCategories.forEach(c => {
							const opt = document.createElement('option');
							opt.value = c.id;
							opt.text = c.name;
							if (catId === c.id) opt.selected = true; // Set self as selected
							selectEl.appendChild(opt);
						});

						const noneOpt = document.createElement('option');
						noneOpt.value = 'none';
						noneOpt.text = '未分類/その他';
						if (!catId) noneOpt.selected = true;
						selectEl.appendChild(noneOpt);

						// Attach event map
						selectEl.onchange = async () => {
							const targetFile = this.app.vault.getAbstractFileByPath(pathAttr);
							if (targetFile instanceof TFile) {
								await this.app.fileManager.processFrontMatter(targetFile, (fm) => {
									if (selectEl.value === 'none') {
										delete fm['type'];
									} else {
										fm['type'] = selectEl.value;
									}
								});
								// Since processFrontMatter invokes Obsidian events, the UI block is auto-replacing!
								new Notice(`ノートの種別を更新しました`);
							}
						};

						// Insert DOM element right after the Span tag
						if (span.parentNode) {
							span.parentNode.insertBefore(selectEl, span.nextSibling);
						}
					});

				} else {
					sectionWrapper.createEl('p', { text: 'アイテムがありません。', attr: { style: 'color: var(--text-muted); font-size: 0.9em; margin-top: 5px;' } });
				}
			};

			for (const cat of this.settings.noteCategories) {
				await renderSection(cat.name, categoryGroups[cat.id] || [], cat.id);
			}
			await renderSection('📁 その他 (Others)', others, undefined); // その他はカテゴリIDなし

			// UI 3: 作業履歴 (History Timeline)
			const historyObj = sfm['history'] || [];
			if (Array.isArray(historyObj) && historyObj.length > 0) {
				const historyDiv = el.createDiv({ attr: { style: 'margin-top: 30px; border-top: 1px solid var(--background-modifier-border); padding-top: 15px;' } });
				historyDiv.createEl('h3', { text: '⏳ 作業履歴 (Timeline)' });
				const ul = historyDiv.createEl('ul');
				for (const h of historyObj) {
					const t = new Date(h.time).toLocaleString();
					const actionIcon = h.action === 'start' ? '▶' : h.action === 'block' ? '⏸' : h.action === 'complete' ? '✅' : '⏺';

					const li = ul.createEl('li');
					li.innerHTML = `${actionIcon} ${t} - <b>${String(h.action).toUpperCase()}</b>${h.user ? ` by <i>${h.user}</i>` : ''}${h.reason ? ` <span style="color:var(--text-muted)">(理由: ${h.reason})</span>` : ''}`;
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

			const currentUser = await getGitUser(this.app);

			const template = `---
assignee: ${currentUser}
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
