import { ItemView, WorkspaceLeaf, TFolder, TFile, Notice, Modal, Setting, App, normalizePath } from 'obsidian';
import FolderDashPlugin from './main';

export const VIEW_TYPE_FOLDER_DASH = 'folder-dash-view';
export const VIEW_TYPE_BACKLOG_BOARD = 'folder-dash-backlog-view';

export const TASK_MARKER_FILE = '_Task.md';
export const EPIC_MARKER_FILE = '_Epic.md';

export class ReasonInputModal extends Modal {
    onSubmit: (result: string) => void;
    result: string = '';
    blockReasons: string[];

    constructor(app: App, blockReasons: string[], onSubmit: (result: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
        this.blockReasons = blockReasons;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'ブロックの理由を入力してください' });

        let textComponent: import("obsidian").TextComponent | null = null;
        new Setting(contentEl)
            .setName('理由')
            .addText((text) => {
                textComponent = text;
                text.onChange((value) => {
                    this.result = value;
                }).inputEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.close();
                        this.onSubmit(this.result);
                    }
                });
            });

        if (this.blockReasons && this.blockReasons.length > 0) {
            const badgeContainer = contentEl.createDiv({ attr: { style: 'display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; margin-bottom: 20px;' } });
            for (const reason of this.blockReasons) {
                const badge = badgeContainer.createEl('button', { text: reason, attr: { style: 'font-size: 0.8em; padding: 4px 8px; height: auto;' } });
                badge.onclick = () => {
                    this.result = reason;
                    if (textComponent) {
                        textComponent.setValue(reason);
                    }
                };
            }
        }

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

export class FileNameInputModal extends Modal {
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

        let textComponent: import("obsidian").TextComponent | null = null;

        const today = new Date();
        const yy = String(today.getFullYear()).slice(-2);
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const dateStr = `${yy}${mm}${dd}_`;

        const badgeContainer = contentEl.createDiv({ attr: { style: 'display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;' } });
        const badge = badgeContainer.createEl('button', { text: dateStr, attr: { style: 'font-size: 0.8em; padding: 4px 8px; height: auto;' } });
        badge.onclick = () => {
            this.result = dateStr + this.result;
            if (textComponent) {
                textComponent.setValue(this.result);
            }
        };

        new Setting(contentEl)
            .setName('ファイル名')
            .addText((text) => {
                textComponent = text;
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
                });
            });

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

export class LatestUpdateModal extends Modal {
    onSubmit: (result: string) => void;
    initialText: string;

    constructor(app: App, initialText: string, onSubmit: (result: string) => void) {
        super(app);
        this.initialText = initialText;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: '最新状況の編集' });

        const toolbar = contentEl.createDiv({ attr: { style: 'display: flex; gap: 8px; margin-bottom: 8px;' } });

        const textArea = contentEl.createEl('textarea', { attr: { style: 'width: 100%; height: 150px; margin-bottom: 15px; font-family: inherit; padding: 8px;' } });
        textArea.value = this.initialText;

        const wrapText = (color: string) => {
            const start = textArea.selectionStart;
            const end = textArea.selectionEnd;
            const text = textArea.value;
            const selectedText = text.substring(start, end);
            if (!selectedText) {
                new Notice('テキストを選択してください');
                return;
            }
            const before = text.substring(0, start);
            const after = text.substring(end);
            textArea.value = `${before}<span style="color: ${color};">${selectedText}</span>${after}`;
            textArea.focus();
            textArea.setSelectionRange(start, start + selectedText.length + 23 + color.length + 9);
        };

        const redBtn = toolbar.createEl('button', { text: '🔴 赤字', attr: { style: 'font-size: 0.8em; padding: 4px 8px; height: auto;' } });
        redBtn.onclick = () => wrapText('red');

        const blueBtn = toolbar.createEl('button', { text: '🔵 青字', attr: { style: 'font-size: 0.8em; padding: 4px 8px; height: auto;' } });
        blueBtn.onclick = () => wrapText('blue');

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('保存する')
                    .setCta()
                    .onClick(() => {
                        this.close();
                        this.onSubmit(textArea.value);
                    })
            )
            .addButton((btn) =>
                btn
                    .setButtonText('キャンセル')
                    .onClick(() => {
                        this.close();
                    })
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class EpicCreateModal extends Modal {
    onSubmit: (name: string, basePath: string) => void;
    epicName: string = '';
    basePath: string = '';

    constructor(app: App, onSubmit: (name: string, basePath: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: '新規エピックの作成' });

        new Setting(contentEl)
            .setName('エピック名 (フォルダ名)')
            .addText((text) =>
                text.onChange((value) => {
                    this.epicName = value;
                }).inputEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.submit();
                    }
                })
            );

        const folders = this.app.vault.getAllLoadedFiles().filter(f => f instanceof TFolder) as TFolder[];
        const folderPaths = folders.map(f => f.path);

        new Setting(contentEl)
            .setName('作成先フォルダ')
            .setDesc('エピックのフォルダを配置するパスを選択します。')
            .addDropdown((dropdown) => {
                dropdown.addOption('/', '/ (Vaultルート)');
                folderPaths.forEach(p => {
                    if (p !== '/') dropdown.addOption(p, p);
                });
                dropdown.onChange((value) => {
                    this.basePath = value;
                });
            });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('作成')
                    .setCta()
                    .onClick(() => this.submit())
            )
            .addButton((btn) =>
                btn
                    .setButtonText('キャンセル')
                    .onClick(() => {
                        this.close();
                    })
            );
    }

    submit() {
        let name = this.epicName.trim();
        if (!name) name = '無題のエピック';
        this.close();
        this.onSubmit(name, this.basePath || '/');
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class TaskCreateModal extends Modal {
    onSubmit: (name: string) => void;
    taskName: string = '';
    parentPath: string;

    constructor(app: App, parentPath: string, onSubmit: (name: string) => void) {
        super(app);
        this.parentPath = parentPath;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: '新規タスクの作成' });
        contentEl.createEl('p', { text: `作成先: ${this.parentPath}`, attr: { style: 'color: var(--text-muted); font-size: 0.85em; margin-top: -10px; margin-bottom: 20px;' } });

        new Setting(contentEl)
            .setName('タスク名 (フォルダ名)')
            .addText((text) =>
                text.onChange((value) => {
                    this.taskName = value;
                }).inputEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.submit();
                    }
                })
            );

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('作成')
                    .setCta()
                    .onClick(() => this.submit())
            )
            .addButton((btn) =>
                btn
                    .setButtonText('キャンセル')
                    .onClick(() => {
                        this.close();
                    })
            );
    }

    submit() {
        let name = this.taskName.trim();
        if (!name) name = '無題のタスク';
        this.close();
        this.onSubmit(name);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

interface FileItem { file: TFile, mtime: number, assignee: string }

export class FolderDashView extends ItemView {
    plugin: FolderDashPlugin;
    currentFolder: TFolder | null = null;
    activeFile: TFile | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: FolderDashPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_FOLDER_DASH;
    }

    getDisplayText(): string {
        return 'Folder Dash';
    }

    getIcon(): string {
        return 'folder-sync';
    }

    async onOpen() {
        const container = this.contentEl;
        container.empty();
        container.createEl('h2', { text: 'Folder Dash', attr: { style: 'text-align: center; color: var(--text-muted); padding-top: 20px;' } });
        container.createEl('p', { text: 'メインペインでファイルを開くと、そのフォルダのダッシュボードが表示されます。', attr: { style: 'text-align: center; color: var(--text-muted); font-size: 0.9em;' } });
    }

    async onClose() {
        // Cleanup if needed
    }

    public async setFolder(folder: TFolder | null, activeFile: TFile | null = null) {
        this.activeFile = activeFile;
        if (this.currentFolder !== folder) {
            this.currentFolder = folder;
            await this.renderDashboard();
        } else {
            this.updateActiveFileHighlight();
        }
    }

    public updateActiveFileHighlight() {
        const container = this.contentEl;
        container.querySelectorAll('li.folder-dash-file-item').forEach(li => {
            if (this.activeFile && li.getAttribute('data-filepath') === this.activeFile.path) {
                li.classList.add('is-active-note');
            } else {
                li.classList.remove('is-active-note');
            }
        });
    }

    public async refresh() {
        await this.renderDashboard();
    }

    private async renderDashboard() {
        const container = this.contentEl;
        container.empty();

        if (!this.currentFolder) {
            container.createEl('h2', { text: 'Folder Dash', attr: { style: 'text-align: center; color: var(--text-muted); padding-top: 20px;' } });
            container.createEl('p', { text: 'メインペインでファイルを開くと、そのフォルダのダッシュボードが表示されます。', attr: { style: 'text-align: center; color: var(--text-muted); font-size: 0.9em;' } });
            return;
        }

        const parentFolder = this.currentFolder;
        container.createEl('h2', { text: `${parentFolder.name}`, attr: { style: 'margin-bottom: 20px;' } });

        const summaryFilePath = normalizePath(`${parentFolder.path}/${TASK_MARKER_FILE}`);
        const summaryFile = this.app.vault.getAbstractFileByPath(summaryFilePath);

        if (!(summaryFile instanceof TFile)) {
            const wrapper = container.createDiv({ attr: { style: 'text-align: center;' } });
            wrapper.createEl('p', { text: `このフォルダにはタスクノート (${TASK_MARKER_FILE}) がありません。` });
            const btn = wrapper.createEl('button', { text: 'タスクノートを作成する', cls: 'mod-cta' });
            btn.onclick = async () => {
                await this.plugin.createOrOpenSummaryNoteForFolder(parentFolder);
                await this.refresh();
            };
            return;
        }

        // Read metadata
        const summaryCache = this.app.metadataCache.getFileCache(summaryFile);
        const sfm = summaryCache?.frontmatter || {};

        const currentAssignee = sfm['assignee'] || '未設定';
        const currentStatus = sfm['status'] || 'not-started';
        const workTimeMins = sfm['work_time_minutes'] || 0;
        const blockTimeMins = sfm['block_time_minutes'] || 0;

        const formatDate = (isoString?: string) => isoString ? new Date(isoString).toLocaleString() : '未記録';
        const startedAt = formatDate(sfm['started_at']);
        const completedAt = formatDate(sfm['completed_at']);

        // HEADER
        const headerDiv = container.createDiv({ cls: 'folder-dash-header', attr: { style: 'background: var(--background-secondary); padding: 15px; border-radius: 8px; margin-bottom: 20px;' } });
        const grid = headerDiv.createDiv({ attr: { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; font-size: 0.9em;' } });

        const createStat = (parent: HTMLElement, label: string, val: string) => {
            const d = parent.createDiv();
            d.createSpan({ text: label + ': ', attr: { style: 'color: var(--text-muted);' } });
            d.createSpan({ text: val, attr: { style: 'font-weight: bold;' } });
        };

        createStat(grid, '担当者', currentAssignee);
        createStat(grid, 'ステータス', currentStatus);
        createStat(grid, '着手日', startedAt);
        createStat(grid, '完成日', completedAt);
        createStat(grid, '稼働時間', `${workTimeMins} 分`);
        createStat(grid, 'ブロック時間', `${blockTimeMins} 分`);

        // BUTTONS
        const btnGroup = headerDiv.createDiv({ cls: 'folder-dash-buttons', attr: { style: 'display: flex; gap: 8px; flex-wrap: wrap;' } });

        const updateStatus = async (newStatus: string, actionName: string, reason?: string) => {
            const currentUser = await this.plugin.getGitUser();

            await this.app.fileManager.processFrontMatter(summaryFile, (frontmatter) => {
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

            // Refresh UI locally to avoid waiting for metadata cache event sometimes missing
            setTimeout(() => this.refresh(), 200);
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
            new ReasonInputModal(this.app, this.plugin.settings.blockReasons || [], (reason) => {
                updateStatus('blocked', 'block', reason || '理由なし');
            }).open();
        };

        // FILE LISTS
        const categoryGroups: Record<string, FileItem[]> = {};
        this.plugin.settings.noteCategories.forEach(cat => {
            categoryGroups[cat.id] = [];
        });
        const others: FileItem[] = [];

        for (const child of parentFolder.children) {
            if (child instanceof TFile && child.extension === 'md' && child.name !== TASK_MARKER_FILE && child.name !== EPIC_MARKER_FILE) {
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

                    for (const cat of this.plugin.settings.noteCategories) {
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

        const renderSection = async (title: string, items: FileItem[], catId?: string) => {
            const sectionWrapper = container.createDiv({ cls: 'folder-dash-section', attr: { style: 'margin-top: 20px;' } });
            const titleHeader = sectionWrapper.createDiv({ attr: { style: 'display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 5px; margin-bottom: 8px;' } });
            titleHeader.createEl('h3', { text: title, attr: { style: 'margin: 0; font-size: 1.1em;' } });

            const addBtn = titleHeader.createEl('button', { text: '＋ 追加', attr: { style: 'font-size: 0.8em; padding: 4px 10px; height: auto;' } });
            addBtn.onclick = async () => {
                new FileNameInputModal(this.app, `「${title}」の新規作成`, async (fileName) => {
                    const newFilePath = normalizePath(`${parentFolder.path}/${fileName}.md`);
                    const currentUser = await this.plugin.getGitUser();

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
                        this.refresh();
                    } catch (e) {
                        console.error(e);
                        new Notice('作成に失敗しました。同名のファイルが存在するか確認してください。');
                    }
                }).open();
            };

            if (items.length > 0) {
                items.sort((a, b) => b.mtime - a.mtime);
                const ul = sectionWrapper.createEl('ul', { attr: { style: 'list-style-type: none; padding-left: 0; margin-top: 5px; margin-bottom: 15px;' } });

                for (const item of items) {
                    const isActive = this.activeFile && this.activeFile.path === item.file.path;
                    const classes = ['folder-dash-file-item'];
                    if (isActive) classes.push('is-active-note');

                    const li = ul.createEl('li', { cls: classes.join(' '), attr: { 'data-filepath': item.file.path, style: 'margin-bottom: 8px; display: flex; flex-direction: column;' } });
                    const topRow = li.createDiv({ attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });

                    // Main pane File Link
                    const a = topRow.createEl('a', { text: item.file.basename, cls: 'internal-link', attr: { style: 'font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' } });
                    a.onclick = (e) => {
                        e.preventDefault();
                        let mainLeaf = this.app.workspace.getMostRecentLeaf();
                        if (mainLeaf && mainLeaf.view.getViewType() === VIEW_TYPE_FOLDER_DASH) {
                            // fallback if it somehow got left pane active
                            mainLeaf = this.app.workspace.getLeaf(false);
                        }
                        // Safe bet: get a main workspace leaf (avoid left/right splits)
                        const targetLeaf = this.app.workspace.getLeaf(false);
                        targetLeaf.openFile(item.file);
                    };

                    // Metadata dropdown
                    const selectEl = topRow.createEl('select', { cls: 'folder-dash-category-select', attr: { style: 'max-width: 100px; font-size: 0.8em; margin-left: 5px;' } });
                    this.plugin.settings.noteCategories.forEach(c => {
                        const opt = selectEl.createEl('option', { value: c.id, text: c.name });
                        if (catId === c.id) opt.selected = true;
                    });
                    const noneOpt = selectEl.createEl('option', { value: 'none', text: '未分類/その他' });
                    if (!catId) noneOpt.selected = true;

                    selectEl.onchange = async () => {
                        await this.app.fileManager.processFrontMatter(item.file, (fm) => {
                            if (selectEl.value === 'none') {
                                delete fm['type'];
                            } else {
                                fm['type'] = selectEl.value;
                            }
                        });
                        new Notice(`ノートの種別を更新しました`);
                        setTimeout(() => this.refresh(), 200);
                    };

                    // Secondary Row (Metadata info)
                    // @ts-ignore
                    const dateStr = window.moment ? window.moment(item.mtime).format('MM/DD HH:mm') : new Date(item.mtime).toLocaleDateString();
                    const metaRow = li.createDiv({ attr: { style: 'font-size: 0.8em; color: var(--text-muted); margin-top: 2px;' } });
                    metaRow.innerText = `👤 ${item.assignee} | 🕒 ${dateStr}`;
                }
            } else {
                sectionWrapper.createEl('p', { text: 'アイテムがありません。', attr: { style: 'color: var(--text-muted); font-size: 0.9em; margin-top: 5px;' } });
            }
        };

        for (const cat of this.plugin.settings.noteCategories) {
            await renderSection(cat.name, categoryGroups[cat.id] || [], cat.id);
        }
        await renderSection('📁 その他 (Others)', others, undefined);

        // TIMELINE
        const historyObj = sfm['history'] || [];
        if (Array.isArray(historyObj) && historyObj.length > 0) {
            const historyDiv = container.createDiv({ attr: { style: 'margin-top: 30px; border-top: 1px solid var(--background-modifier-border); padding-top: 15px;' } });
            historyDiv.createEl('h3', { text: '⏳ 作業履歴 (Timeline)', attr: { style: 'font-size: 1.1em; margin-bottom: 10px;' } });
            const ul = historyDiv.createEl('ul', { attr: { style: 'list-style-type: none; padding-left: 0; font-size: 0.9em;' } });

            // Show newest first
            const reversedHistory = [...historyObj].reverse();

            for (const h of reversedHistory) {
                const t = new Date(h.time).toLocaleString();
                const actionIcon = h.action === 'start' ? '▶' : h.action === 'block' ? '⏸' : h.action === 'complete' ? '✅' : '⏺';

                const li = ul.createEl('li', { attr: { style: 'margin-bottom: 5px;' } });
                li.innerHTML = `${actionIcon} ${t} - <b>${String(h.action).toUpperCase()}</b>${h.user ? ` <span style="color:var(--text-muted)">by</span> ${h.user}` : ''}${h.reason ? `<br><span style="color:var(--text-muted); padding-left: 15px;">理由: ${h.reason}</span>` : ''}`;
            }
        }
    }
}

export async function updateSummaryStatus(
    app: App,
    plugin: FolderDashPlugin,
    summaryFile: TFile,
    newStatus: string,
    actionName: string,
    reason?: string
) {
    const currentUser = await plugin.getGitUser();

    await app.fileManager.processFrontMatter(summaryFile, (frontmatter) => {
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
}

export class FolderDashBacklogView extends ItemView {
    plugin: FolderDashPlugin;
    currentMode: 'kanban' | 'agenda' = 'kanban';
    selectedAssignee: string = 'All';
    doTodayFilterEnabled: boolean = false;

    constructor(leaf: WorkspaceLeaf, plugin: FolderDashPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_BACKLOG_BOARD;
    }

    getDisplayText(): string {
        return 'プロジェクトバックログ';
    }

    getIcon(): string {
        return 'kanban-square';
    }

    getEpicInfoForTask(taskFile: TFile): { name: string, path: string } | null {
        let currentFolder = taskFile.parent;
        while (currentFolder) {
            const prefix = currentFolder.path === '/' ? '' : currentFolder.path;
            const epicPath = normalizePath(`${prefix}/${EPIC_MARKER_FILE}`);
            const epicFile = this.app.vault.getAbstractFileByPath(epicPath);
            if (epicFile instanceof TFile) {
                return { name: currentFolder.name, path: currentFolder.path };
            }
            currentFolder = currentFolder.parent;
        }
        return null;
    }

    async onOpen() {
        await this.renderBoard();

        this.registerEvent(this.app.metadataCache.on('changed', (file) => {
            if (file.name === TASK_MARKER_FILE) {
                setTimeout(() => this.renderBoard(), 150);
            }
        }));
    }

    async renderBoard() {
        const container = this.contentEl;
        container.empty();
        container.classList.add('folder-dash-board-view');

        const summaryPaths = (this.app.metadataCache as any).getCachedFiles().filter((path: string) => path.endsWith(TASK_MARKER_FILE));

        type TaskData = { file: TFile, name: string, status: string, assignee: string, mtime: number, theme: string, epicPath: string, latestUpdate: string, do_today: boolean };
        const allTasks: TaskData[] = [];
        const uniqueAssignees = new Set<string>();

        for (const path of summaryPaths) {
            const abstractFile = this.app.vault.getAbstractFileByPath(path);
            if (abstractFile instanceof TFile) {
                const cache = this.app.metadataCache.getFileCache(abstractFile);
                if (cache) {
                    const fm = cache.frontmatter || {};
                    const title = fm['title'] || abstractFile.parent?.name || '無題のタスク';
                    const status = fm['status'] || 'not-started';
                    const assignee = fm['assignee'] || '未設定';
                    uniqueAssignees.add(assignee);
                    const do_today = fm['do_today'] === true;

                    const epicInfo = this.getEpicInfoForTask(abstractFile);
                    let theme = fm['theme'] || fm['epic'];
                    let epicPath = '/';
                    if (!theme) {
                        theme = epicInfo ? epicInfo.name : (abstractFile.parent?.parent?.name || '未分類');
                        epicPath = epicInfo ? epicInfo.path : (abstractFile.parent?.parent?.path || '/');
                    } else {
                        epicPath = epicInfo ? epicInfo.path : (abstractFile.parent?.parent?.path || '/');
                    }

                    const latestUpdate = fm['latest_update'] || '';
                    allTasks.push({ file: abstractFile, name: title, status, assignee, mtime: abstractFile.stat.mtime, theme, epicPath, latestUpdate, do_today });
                }
            }
        }

        const assigneesArray = Array.from(uniqueAssignees).sort();

        const headerContainer = container.createDiv({ attr: { style: 'margin-bottom: 20px; padding-top: 10px; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;' } });
        headerContainer.createEl('h2', { text: 'バックログボード', attr: { style: 'margin: 0;' } });

        const controlsContainer = headerContainer.createDiv({ attr: { style: 'display: flex; gap: 15px; align-items: center; flex-wrap: wrap;' } });

        const assigneeSelect = controlsContainer.createEl('select', { attr: { style: 'padding: 4px 8px; border-radius: 4px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); color: var(--text-normal);' } });
        assigneeSelect.createEl('option', { value: 'All', text: '👤 全員 (All)' });
        for (const assignee of assigneesArray) {
            const opt = assigneeSelect.createEl('option', { value: assignee, text: assignee });
            if (this.selectedAssignee === assignee) opt.selected = true;
        }
        assigneeSelect.onchange = () => {
            this.selectedAssignee = assigneeSelect.value;
            this.renderBoard();
        };

        const doTodayBtn = controlsContainer.createEl('button', { text: '🌟 今日やる', attr: { style: this.doTodayFilterEnabled ? 'background-color: var(--color-yellow, #e6b12a); color: #fff; font-weight: bold; border: none;' : 'background-color: transparent; border: 1px solid var(--background-modifier-border); color: var(--text-muted);' } });
        doTodayBtn.onclick = () => {
            this.doTodayFilterEnabled = !this.doTodayFilterEnabled;
            this.renderBoard();
        };

        const toggleGroup = controlsContainer.createDiv({ attr: { style: 'display: flex; gap: 5px; background: var(--background-secondary); padding: 4px; border-radius: 6px;' } });

        const activeStyle = 'background-color: var(--interactive-accent); color: var(--text-on-accent); padding: 4px 12px; border-radius: 4px; border: none; cursor: pointer; font-size: 0.9em;';
        const inactiveStyle = 'background-color: transparent; color: var(--text-muted); padding: 4px 12px; border-radius: 4px; border: none; cursor: pointer; font-size: 0.9em;';

        const kanbanBtn = toggleGroup.createEl('button', { text: 'Kanban', attr: { style: this.currentMode === 'kanban' ? activeStyle : inactiveStyle } });
        const agendaBtn = toggleGroup.createEl('button', { text: 'Agenda', attr: { style: this.currentMode === 'agenda' ? activeStyle : inactiveStyle } });

        kanbanBtn.onclick = () => { this.currentMode = 'kanban'; this.renderBoard(); };
        agendaBtn.onclick = () => { this.currentMode = 'agenda'; this.renderBoard(); };

        const newEpicBtn = controlsContainer.createEl('button', { text: '＋ 新規エピック', cls: 'mod-cta', attr: { style: 'padding: 4px 12px; height: auto;' } });
        newEpicBtn.onclick = () => {
            new EpicCreateModal(this.app, async (name, basePath) => {
                const folderPath = basePath === '/' ? normalizePath(name) : normalizePath(`${basePath}/${name}`);
                try {
                    await this.app.vault.createFolder(folderPath);
                    const epicFilePath = normalizePath(`${folderPath}/${EPIC_MARKER_FILE}`);
                    const now = new Date().toISOString();
                    const content = `---
title: "${name}"
status: "未着手"
created_at: "${now}"
latest_update: ""
---
`;
                    await this.app.vault.create(epicFilePath, content);
                    new Notice(`エピック「${name}」を作成しました`);
                    this.renderBoard();
                } catch (e: any) {
                    console.error(e);
                    new Notice(`作成失敗: 同名のフォルダが既に存在する可能性があります`);
                }
            }).open();
        };

        const tasks = allTasks.filter(task => {
            if (this.selectedAssignee !== 'All' && task.assignee !== this.selectedAssignee) return false;
            if (this.doTodayFilterEnabled && !task.do_today) return false;
            return true;
        });

        if (this.currentMode === 'kanban') {
            this.renderKanban(container, tasks);
        } else {
            this.renderAgenda(container, tasks);
        }
    }

    renderKanban(container: HTMLElement, tasks: any[]) {
        const columns = [
            { id: 'not-started', label: '未着手 (Not Started)' },
            { id: 'in-progress', label: '進行中 (In Progress)' },
            { id: 'blocked', label: 'ブロック (Blocked)' },
            { id: 'completed', label: '完了 (Completed)' }
        ];

        const boardDiv = container.createDiv({ attr: { style: 'display: flex; gap: 15px; overflow-x: auto; padding-bottom: 20px; min-height: 400px; align-items: flex-start;' } });

        for (const col of columns) {
            const colItems = tasks.filter(t => t.status === col.id);
            colItems.sort((a, b) => b.mtime - a.mtime);

            const colDiv = boardDiv.createDiv({ attr: { style: 'flex: 1; min-width: 250px; background: var(--background-secondary); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 10px;' } });

            const header = colDiv.createDiv({ attr: { style: 'font-weight: bold; padding-bottom: 8px; border-bottom: 1px solid var(--background-modifier-border); margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center;' } });
            header.createSpan({ text: col.label });
            header.createSpan({ text: String(colItems.length), attr: { style: 'background: var(--background-modifier-border); padding: 2px 8px; border-radius: 12px; font-size: 0.8em; color: var(--text-muted);' } });

            for (const task of colItems) {
                this.renderTaskCard(colDiv, task, 'kanban');
            }
        }
    }

    renderAgenda(container: HTMLElement, tasks: any[]) {
        const agendaDiv = container.createDiv({ attr: { style: 'display: flex; flex-direction: column; gap: 20px; padding-bottom: 20px;' } });

        // epicsMap: epicFolderName -> epicFolderPath
        const epicsMap: Record<string, string> = {};
        const epicFilePaths = (this.app.metadataCache as any).getCachedFiles().filter((p: string) => p.endsWith(EPIC_MARKER_FILE));
        for (const epicFilePath of epicFilePaths) {
            const epicFile = this.app.vault.getAbstractFileByPath(epicFilePath);
            if (epicFile instanceof TFile && epicFile.parent) {
                epicsMap[epicFile.parent.name] = epicFile.parent.path;
            }
        }

        // Group tasks by their theme
        const grouped: Record<string, typeof tasks> = {};
        const epicPaths: Record<string, string> = {};
        for (const task of tasks) {
            const arr = grouped[task.theme] || [];
            arr.push(task);
            grouped[task.theme] = arr;
            if (task.epicPath) epicPaths[task.theme] = task.epicPath;
        }

        // Ensure all Epics (even empty ones) appear
        for (const [epicName, epicPath] of Object.entries(epicsMap)) {
            if (!grouped[epicName]) {
                grouped[epicName] = [];
            }
            if (!epicPaths[epicName]) {
                epicPaths[epicName] = epicPath;
            }
        }

        const themes = Object.keys(grouped).sort();

        for (const theme of themes) {
            const themeDiv = agendaDiv.createDiv({ attr: { style: 'background: var(--background-secondary); border-radius: 8px; padding: 15px; display: flex; flex-direction: column; gap: 10px;' } });

            const themeHeader = themeDiv.createDiv({ attr: { style: 'display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 5px; margin-bottom: 5px;' } });
            themeHeader.createEl('h3', { text: `📁 ${theme}`, attr: { style: 'margin: 0;' } });

            const themeTasks = grouped[theme];

            let parentPath = epicPaths[theme] || '/';
            if (parentPath === '/' && themeTasks && themeTasks.length > 0) {
                const validTask = themeTasks.find(t => t.epicPath && t.epicPath !== '/');
                parentPath = validTask ? validTask.epicPath : (themeTasks[0].epicPath || '/');
            }

            const addTaskBtn = themeHeader.createEl('button', { text: '＋ タスク追加', attr: { style: 'font-size: 0.8em; padding: 4px 10px; height: auto; background-color: transparent; border: 1px solid var(--background-modifier-border); box-shadow: none;' } });
            addTaskBtn.onclick = () => {
                new TaskCreateModal(this.app, parentPath, async (taskName: string) => {
                    const taskFolderPath = parentPath === '/' ? normalizePath(taskName) : normalizePath(`${parentPath}/${taskName}`);
                    try {
                        await this.app.vault.createFolder(taskFolderPath);
                        const taskFilePath = normalizePath(`${taskFolderPath}/${TASK_MARKER_FILE}`);
                        const now = new Date().toISOString();
                        const defaultStatus = this.plugin.settings.defaultStatus || '未着手';
                        const content = `---
title: "${taskName}"
status: "${defaultStatus}"
assignee: "未設定"
created_at: "${now}"
latest_update: ""
---
`;
                        await this.app.vault.create(taskFilePath, content);
                        new Notice(`タスク「${taskName}」を作成しました`);
                        this.renderBoard();
                    } catch (e: any) {
                        console.error(e);
                        new Notice(`作成失敗: 同名のフォルダが既に存在する可能性があります`);
                    }
                }).open();
            };

            if (themeTasks) {
                themeTasks.sort((a, b) => b.mtime - a.mtime);

                for (const task of themeTasks) {
                    this.renderTaskCard(themeDiv, task, 'agenda');
                }
            }
        }
    }

    renderTaskCard(parentDiv: HTMLElement, task: any, viewMode: 'kanban' | 'agenda') {
        let cardStyle = viewMode === 'kanban'
            ? 'background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);'
            : 'background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 12px; display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);';

        if (task.do_today) {
            cardStyle += ' border-color: var(--color-yellow, #e6b12a); box-shadow: 0 0 5px rgba(230, 177, 42, 0.4);';
        }

        const card = parentDiv.createDiv({ attr: { style: cardStyle } });

        const mainContent = card.createDiv({ attr: { style: 'display: flex; flex-direction: column; gap: 4px; flex-grow: 1;' } });

        const topRow = mainContent.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 10px; flex-wrap: wrap;' } });

        const starBtn = topRow.createEl('button', { text: '🌟', attr: { style: task.do_today ? 'padding: 2px; font-size: 1.2em; background: transparent; border: none; box-shadow: none; cursor: pointer; filter: grayscale(0%); opacity: 1;' : 'padding: 2px; font-size: 1.2em; background: transparent; border: none; box-shadow: none; cursor: pointer; filter: grayscale(100%); opacity: 0.4;' } });
        starBtn.onclick = async () => {
            await this.app.fileManager.processFrontMatter(task.file, (fm) => {
                fm['do_today'] = !fm['do_today'];
            });
            this.renderBoard();
        };

        const statusMap: Record<string, string> = {
            'not-started': '⭕️ 未着手',
            'in-progress': '🏃 進行中',
            'blocked': '🛑 ブロック',
            'completed': '✅ 完了'
        };
        const statusText = statusMap[task.status] || task.status;
        topRow.createSpan({ text: statusText, attr: { style: 'font-size: 0.8em; background: var(--background-modifier-border); padding: 2px 6px; border-radius: 4px; white-space: nowrap;' } });

        const titleLink = topRow.createEl('a', { text: task.name, cls: 'internal-link', attr: { style: 'font-weight: bold; cursor: pointer; text-decoration: none;' } });
        titleLink.onclick = (e) => {
            e.preventDefault();
            this.app.workspace.getLeaf(false).openFile(task.file);
        };

        topRow.createSpan({ text: `👤 担当: ${task.assignee}`, attr: { style: 'font-size: 0.8em; color: var(--text-muted); margin-left: 10px;' } });

        if (viewMode === 'agenda') {
            const updateArea = mainContent.createDiv({ attr: { style: 'font-size: 0.85em; color: var(--text-normal); margin-top: 4px; padding-left: 5px; border-left: 2px solid var(--interactive-accent); display: flex; flex-direction: column; gap: 6px;' } });

            const contentDiv = updateArea.createDiv({ attr: { style: 'white-space: pre-wrap; line-height: 1.4;' } });
            if (task.latestUpdate) {
                // innerHTML renders formatting tags securely in this local app context
                contentDiv.innerHTML = `💬 ${task.latestUpdate}`;
            } else {
                contentDiv.innerHTML = `💬 <span style="color: var(--text-muted); font-style: italic;">(最新状況が未入力です)</span>`;
            }

            const editBtn = updateArea.createEl('button', { text: '📝 編集', attr: { style: 'align-self: flex-start; font-size: 0.75em; padding: 2px 8px; height: auto; background-color: transparent; border: 1px solid var(--background-modifier-border); box-shadow: none;' } });
            editBtn.onclick = () => {
                new LatestUpdateModal(this.app, task.latestUpdate || '', async (newText) => {
                    await this.app.fileManager.processFrontMatter(task.file, (fm) => {
                        fm['latest_update'] = newText;
                    });
                    this.renderBoard();
                }).open();
            };
        }

        const actionsDiv = card.createDiv({ attr: { style: 'display: flex; gap: 6px; flex-wrap: wrap; align-items: center; justify-content: flex-end; min-width: max-content;' } });

        const createQuickBtn = (label: string, newStatus: string, actionName: string, btnStyle: string = '') => {
            const btn = actionsDiv.createEl('button', { text: label, attr: { style: `font-size: 0.75em; padding: 4px 8px; height: auto; ${btnStyle}` } });
            btn.onclick = async () => {
                await updateSummaryStatus(this.app, this.plugin, task.file, newStatus, actionName);
                this.renderBoard();
            };
            return btn;
        };

        if (task.status === 'not-started') {
            createQuickBtn('▶ 着手', 'in-progress', 'start', 'background-color: var(--interactive-accent); color: var(--text-on-accent);');
        } else if (task.status === 'in-progress') {
            const blockBtn = actionsDiv.createEl('button', { text: '⏸ ブロック', attr: { style: 'font-size: 0.75em; padding: 4px 8px; height: auto;' } });
            blockBtn.onclick = async () => {
                new ReasonInputModal(this.app, this.plugin.settings.blockReasons || [], async (reason) => {
                    await updateSummaryStatus(this.app, this.plugin, task.file, 'blocked', 'block', reason || '理由なし');
                    this.renderBoard();
                }).open();
            };
            createQuickBtn('✅ 完了', 'completed', 'complete');
        } else if (task.status === 'blocked') {
            createQuickBtn('▶ 再開', 'in-progress', 'start', 'background-color: var(--interactive-accent); color: var(--text-on-accent);');
            createQuickBtn('✅ 完了', 'completed', 'complete');
        } else if (task.status === 'completed') {
            createQuickBtn('↩︎ 再開', 'in-progress', 'start');
        }
    }
}
