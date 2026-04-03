import { ItemView, WorkspaceLeaf, TFolder, TFile, Notice, Modal, Setting, App, normalizePath } from 'obsidian';
import FolderDashPlugin from './main';

export const VIEW_TYPE_FOLDER_DASH = 'folder-dash-view';

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

        const summaryFilePath = normalizePath(`${parentFolder.path}/_Summary.md`);
        const summaryFile = this.app.vault.getAbstractFileByPath(summaryFilePath);

        if (!(summaryFile instanceof TFile)) {
            const wrapper = container.createDiv({ attr: { style: 'text-align: center;' } });
            wrapper.createEl('p', { text: 'このフォルダにはまとめノート (_Summary.md) がありません。' });
            const btn = wrapper.createEl('button', { text: 'まとめノートを作成する', cls: 'mod-cta' });
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
