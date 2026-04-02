import { App, Notice, Plugin, TFile, TFolder, normalizePath } from 'obsidian';
import { DEFAULT_SETTINGS, FolderDashSettings, FolderDashSettingTab } from "./settings";
import { exec } from 'child_process';
import { promisify } from 'util';
import { VIEW_TYPE_FOLDER_DASH, FolderDashView } from './view';

const execPromise = promisify(exec);

export default class FolderDashPlugin extends Plugin {
	settings: FolderDashSettings;

	async getGitUser(): Promise<string> {
		try {
			const basePath = (this.app.vault.adapter as any).getBasePath ? (this.app.vault.adapter as any).getBasePath() : '';
			if (!basePath) return 'Unknown User';

			const { stdout } = await execPromise('git config user.name', { cwd: basePath });
			const name = stdout.trim();
			return name || 'Unknown User';
		} catch (e) {
			return 'Unknown User';
		}
	}

	async onload() {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_FOLDER_DASH, (leaf) => new FolderDashView(leaf, this));

		this.addRibbonIcon('folder-sync', 'Folder Dash', (evt: MouseEvent) => {
			this.activateView();
		});

		this.addCommand({
			id: 'open-folder-dash-view',
			name: '左ペインに Folder Dash を開く',
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: 'create-open-folder-summary',
			name: '現在のフォルダにまとめノートを作成/開く',
			callback: () => this.createOrOpenSummaryNote(),
		});

		this.addSettingTab(new FolderDashSettingTab(this.app, this));

		// Monitor file-open event
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file) {
					const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_FOLDER_DASH);
					for (const leaf of leaves) {
						const view = leaf.view;
						if (view instanceof FolderDashView) {
							view.setFolder(file.parent, file);
						}
					}
				} else {
					const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_FOLDER_DASH);
					for (const leaf of leaves) {
						const view = leaf.view;
						if (view instanceof FolderDashView) {
							view.setFolder(null, null);
						}
					}
				}
			})
		);

		// Monitor file changes to refresh dashboard automatically
		this.registerEvent(
			this.app.metadataCache.on('changed', (file, data, cache) => {
				const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_FOLDER_DASH);
				for (const leaf of leaves) {
					const view = leaf.view;
					if (view instanceof FolderDashView && view.currentFolder === file.parent) {
						// Optionally we could debounce this refresh
						view.refresh();
					}
				}
			})
		);

		this.app.workspace.onLayoutReady(() => {
			// Initialize with the current active file
			this.activateView().then(() => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_FOLDER_DASH);
					for (const leaf of leaves) {
						const view = leaf.view;
						if (view instanceof FolderDashView) {
							view.setFolder(activeFile.parent, activeFile);
						}
					}
				}
			});
		});
	}

	onunload() {
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_FOLDER_DASH)[0];

		if (!leaf) {
			const leftLeaf = workspace.getLeftLeaf(false);
			if (leftLeaf) {
				await leftLeaf.setViewState({ type: VIEW_TYPE_FOLDER_DASH, active: true });
				leaf = leftLeaf;
			}
		}

		if (leaf) workspace.revealLeaf(leaf);
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

		await this.createOrOpenSummaryNoteForFolder(parentFolder);
	}

	async createOrOpenSummaryNoteForFolder(parentFolder: TFolder) {
		const summaryFileName = '_Summary.md';
		const summaryFilePath = normalizePath(`${parentFolder.path}/${summaryFileName}`);
		let summaryFile = this.app.vault.getAbstractFileByPath(summaryFilePath);

		if (summaryFile instanceof TFile) {
			await this.app.workspace.getLeaf(false).openFile(summaryFile);
		} else {
			const now = new window.Date();
			const isoString = now.toISOString();

			const currentUser = await this.getGitUser();

			const template = `---
assignee: ${currentUser}
status: ${this.settings.defaultStatus || 'not-started'}
created_at: ${isoString}
work_time_minutes: 0
block_time_minutes: 0
---
# ${parentFolder.name} 

<!-- summary auto-generated -->
`;
			try {
				const newFile = await this.app.vault.create(summaryFilePath, template);
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
