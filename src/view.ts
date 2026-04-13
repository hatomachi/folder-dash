import { ItemView, WorkspaceLeaf, TFolder, TFile, Notice, Modal, Setting, App, normalizePath } from 'obsidian';
import FolderDashPlugin from './main';
import { ReasonInputModal, FileNameInputModal, LatestUpdateModal, EpicCreateModal, TaskCreateModal, EpicPropertyEditModal, EpicEditModal } from './modals';
import { parseSearchKeywords, matchesAllKeywords } from './utils/searchFilter';

export { ReasonInputModal, FileNameInputModal, LatestUpdateModal, EpicCreateModal, TaskCreateModal, EpicPropertyEditModal, EpicEditModal };

export const VIEW_TYPE_FOLDER_DASH = 'folder-dash-view';
export const VIEW_TYPE_BACKLOG_BOARD = 'folder-dash-backlog-view';

export const TASK_MARKER_FILE = '_Task.md';
export const EPIC_MARKER_FILE = '_Epic.md';

export class SystemOrderModal extends Modal {
    view: FolderDashBacklogView;

    constructor(app: App, view: FolderDashBacklogView) {
        super(app);
        this.view = view;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: '🔄 システム順を管理' });
        contentEl.createEl('p', { text: 'rank を変更すると、カテゴリ・公開範囲を問わず該当システムの全 _system.md を一括更新します。', attr: { style: 'color: var(--text-muted); font-size: 0.85em; margin-top: -10px; margin-bottom: 20px;' } });

        // Collect all _system.md files
        const systemFilePaths = (this.app.metadataCache as any).getCachedFiles().filter((p: string) => p.endsWith('_system.md'));

        // Group by system name, pick representative rank
        const systemMap: Record<string, { rank: number, files: TFile[] }> = {};
        for (const sysFilePath of systemFilePaths) {
            const sysFile = this.app.vault.getAbstractFileByPath(sysFilePath);
            if (sysFile instanceof TFile && sysFile.parent) {
                const systemName = sysFile.parent.name;
                const cache = this.app.metadataCache.getFileCache(sysFile);
                const r = cache?.frontmatter?.rank;
                const rank = typeof r === 'number' ? r : 999;

                if (!systemMap[systemName]) {
                    systemMap[systemName] = { rank, files: [] };
                }
                systemMap[systemName].files.push(sysFile);

                // Prefer rank from 維持管理 category file as representative
                if (sysFilePath.includes('維持管理')) {
                    systemMap[systemName].rank = rank;
                }
            }
        }

        // Sort by rank for display
        const sortedSystems = Object.entries(systemMap).sort((a, b) => {
            if (a[1].rank !== b[1].rank) return a[1].rank - b[1].rank;
            return a[0].localeCompare(b[0]);
        });

        if (sortedSystems.length === 0) {
            contentEl.createEl('p', { text: 'システムが見つかりません。', attr: { style: 'color: var(--text-muted);' } });
            return;
        }

        const editedRanks: Record<string, number> = {};

        const listContainer = contentEl.createDiv({ attr: { style: 'display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; max-height: 400px; overflow-y: auto;' } });

        for (const [systemName, data] of sortedSystems) {
            editedRanks[systemName] = data.rank;

            const row = listContainer.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 4px; background: var(--background-secondary);' } });
            row.createSpan({ text: `💻 ${systemName}`, attr: { style: 'flex: 1; font-weight: 600;' } });
            row.createSpan({ text: `(${data.files.length}件)`, attr: { style: 'color: var(--text-muted); font-size: 0.8em; margin-right: 8px;' } });

            const input = row.createEl('input', { type: 'number', attr: { value: String(data.rank), style: 'width: 70px; padding: 4px 6px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); text-align: center;' } });
            input.addEventListener('change', () => {
                editedRanks[systemName] = parseInt(input.value) || 999;
            });
        }

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('保存')
                    .setCta()
                    .onClick(async () => {
                        const promises: Promise<void>[] = [];

                        for (const [systemName, data] of sortedSystems) {
                            const newRank = editedRanks[systemName];
                            if (newRank !== data.rank) {
                                // Update ALL _system.md files for this system name
                                for (const file of data.files) {
                                    promises.push(
                                        this.app.fileManager.processFrontMatter(file, (fm) => {
                                            fm['rank'] = newRank;
                                        })
                                    );
                                }
                            }
                        }

                        if (promises.length > 0) {
                            await Promise.all(promises);
                            new Notice(`${promises.length} 件の _system.md を更新しました`);
                        }

                        this.close();
                        this.view.renderBoard();
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

export class EpicOrderModal extends Modal {
    view: FolderDashBacklogView;
    filterCategory: string;
    systemName: string;
    epicsMap: Record<string, any>;

    constructor(app: App, view: FolderDashBacklogView, filterCategory: string, systemName: string, epicsMap: Record<string, any>) {
        super(app);
        this.view = view;
        this.filterCategory = filterCategory;
        this.systemName = systemName;
        this.epicsMap = epicsMap;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: `↕️ エピック順を管理 — ${this.systemName}` });
        contentEl.createEl('p', { text: `「${this.systemName}」内のエピックの並び順 (rank) を変更します。`, attr: { style: 'color: var(--text-muted); font-size: 0.85em; margin-top: -10px; margin-bottom: 20px;' } });

        // Get epics that belong to this system
        const systemEpics = Object.values(this.epicsMap).filter((e: any) => e.system === this.systemName);

        // Sort by current rank
        systemEpics.sort((a: any, b: any) => {
            const rankA = a.rank ?? 999;
            const rankB = b.rank ?? 999;
            if (rankA !== rankB) return rankA - rankB;
            return a.name.localeCompare(b.name);
        });

        if (systemEpics.length === 0) {
            contentEl.createEl('p', { text: 'このシステムにはエピックがありません。', attr: { style: 'color: var(--text-muted);' } });
            return;
        }

        const editedRanks: Record<string, number> = {};

        const listContainer = contentEl.createDiv({ attr: { style: 'display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; max-height: 400px; overflow-y: auto;' } });

        for (const epic of systemEpics) {
            const epicData = epic as any;
            editedRanks[epicData.path] = epicData.rank ?? 999;

            const row = listContainer.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 4px; background: var(--background-secondary);' } });
            row.createSpan({ text: `📁 ${epicData.name}`, attr: { style: 'flex: 1; font-weight: 600;' } });

            const badge = row.createSpan({ text: epicData.category, attr: { style: 'font-size: 0.7em; padding: 2px 6px; border-radius: 4px; background: var(--background-secondary-alt); border: 1px solid var(--background-modifier-border); margin-right: 8px;' } });

            const input = row.createEl('input', { type: 'number', attr: { value: String(epicData.rank ?? 999), style: 'width: 70px; padding: 4px 6px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); text-align: center;' } });
            input.addEventListener('change', () => {
                editedRanks[epicData.path] = parseInt(input.value) || 999;
            });
        }

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('保存')
                    .setCta()
                    .onClick(async () => {
                        const promises: Promise<void>[] = [];

                        for (const epic of systemEpics) {
                            const epicData = epic as any;
                            const newRank = editedRanks[epicData.path];
                            const oldRank = epicData.rank ?? 999;
                            if (newRank !== oldRank) {
                                promises.push(
                                    this.app.fileManager.processFrontMatter(epicData.file, (fm: any) => {
                                        fm['rank'] = newRank;
                                    })
                                );
                            }
                        }

                        if (promises.length > 0) {
                            await Promise.all(promises);
                            new Notice(`${promises.length} 件のエピックの rank を更新しました`);
                        }

                        this.close();
                        this.view.renderBoard();
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

        const epicFilePath = normalizePath(`${parentFolder.path}/${EPIC_MARKER_FILE}`);
        const epicFile = this.app.vault.getAbstractFileByPath(epicFilePath);
        if (epicFile instanceof TFile) {
            await this.renderEpicDashboard(container, parentFolder, epicFile);
            return;
        }

        // Check for _system.md → System Dashboard
        const systemFilePath = normalizePath(`${parentFolder.path}/_system.md`);
        const systemFile = this.app.vault.getAbstractFileByPath(systemFilePath);
        if (systemFile instanceof TFile) {
            await this.renderSystemDashboard(container, parentFolder, systemFile);
            return;
        }

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

        const currentAssigneeRaw = sfm['assignee'];
        const currentAssignee = Array.isArray(currentAssigneeRaw) ? currentAssigneeRaw.join(', ') : (currentAssigneeRaw || '未設定');
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

        // ── タスク詳細編集セクション ──
        const editSection = container.createDiv({ attr: { style: 'margin-bottom: 20px;' } });
        editSection.createEl('h3', { text: '📝 詳細メモ', attr: { style: 'font-size: 1em; margin-bottom: 12px; color: var(--text-muted);' } });

        const createTaskEditCallout = (
            icon: string,
            label: string,
            fmKey: string,
            borderColor: string,
            bgColor: string,
            placeholder: string
        ) => {
            const block = editSection.createDiv({ attr: { style: `border-left: 4px solid ${borderColor}; background: ${bgColor}; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px;` } });

            // 見出しとツールバーを横並びに
            const headerRow = block.createDiv({ attr: { style: 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;' } });
            headerRow.createDiv({ attr: { style: `font-weight: bold; font-size: 0.9em; color: ${borderColor};` }, text: `${icon} ${label}` });

            const toolbar = headerRow.createDiv({ attr: { style: 'display: flex; gap: 4px;' } });

            const ta = block.createEl('textarea', {
                attr: {
                    placeholder,
                    rows: '2',
                    style: 'width: 100%; min-height: 36px; overflow: hidden; resize: none; font-family: inherit; font-size: 0.9em; line-height: 1.6; padding: 5px 7px; border-radius: 4px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); color: var(--text-normal); box-sizing: border-box;'
                }
            });
            ta.value = sfm[fmKey] || '';

            // 選択テキストを色付き span でラップ
            const wrapText = async (color: string) => {
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                const text = ta.value;
                const selectedText = text.substring(start, end);
                if (!selectedText) {
                    new Notice('テキストを選択してください');
                    return;
                }
                const before = text.substring(0, start);
                const after = text.substring(end);
                ta.value = `${before}<span style="color: ${color};">${selectedText}</span>${after}`;
                await this.app.fileManager.processFrontMatter(summaryFile, (fm) => {
                    fm[fmKey] = ta.value;
                });
                autoResize();
                ta.focus();
                ta.setSelectionRange(start, start + selectedText.length + 23 + color.length + 9);
            };

            const redBtn = toolbar.createEl('button', { text: '🔴 赤字', attr: { style: 'font-size: 0.75em; padding: 2px 6px; height: auto;' } });
            redBtn.onclick = () => wrapText('red');
            const blueBtn = toolbar.createEl('button', { text: '🔵 青字', attr: { style: 'font-size: 0.75em; padding: 2px 6px; height: auto;' } });
            blueBtn.onclick = () => wrapText('blue');

            const autoResize = () => {
                ta.style.height = 'auto';
                ta.style.height = Math.max(36, ta.scrollHeight) + 'px';
            };
            setTimeout(autoResize, 0);
            ta.addEventListener('input', autoResize);

            ta.addEventListener('change', async () => {
                await this.app.fileManager.processFrontMatter(summaryFile, (fm) => {
                    fm[fmKey] = ta.value;
                });
            });
        };

        createTaskEditCallout(
            '💬', '状況説明', 'latest_update',
            '#2d7ad6', 'rgba(45,122,214,0.06)',
            '【上長向け】進捗の全体感、完了見込み、ブロッカーの有無\n(例) 実装完了しテスト中。他への影響はなく明日リリース予定。'
        );
        createTaskEditCallout(
            '🔄', '昨日の振り返り', 'yesterday',
            '#6f42c1', 'rgba(111,66,193,0.06)',
            '【自省用】昨日の計画に対する結果、気づき・反省\n(例) 〇〇の実装で想定より1時間超過。事前の仕様確認が甘かった。'
        );
        createTaskEditCallout(
            '🎯', '本日やること', 'today',
            '#e36209', 'rgba(227,98,9,0.06)',
            '【朝会用】今日終わらせる具体的なアクション\n(例) 残りのテストを消化し、15時までにPRを作成してレビュー依頼する。'
        );

        // FILE LISTS
        await this.renderNoteList(container, parentFolder);

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

    private async renderEpicDashboard(container: HTMLElement, parentFolder: TFolder, epicFile: TFile) {
        const cache = this.app.metadataCache.getFileCache(epicFile);
        const fm = cache?.frontmatter || {};

        const HeaderContainer = container.createDiv({ attr: { style: 'display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;' } });
        const title = fm['title'] || parentFolder.name;
        HeaderContainer.createEl('h2', { text: `${title}`, attr: { style: 'margin: 0; font-size: 1.4em; word-break: break-all;' } });

        const addTaskBtn = HeaderContainer.createEl('button', { text: '＋ タスク追加', cls: 'mod-cta', attr: { style: 'padding: 4px 10px; height: auto;' } });
        addTaskBtn.onclick = () => {
            new TaskCreateModal(this.app, parentFolder.path, async (taskName: string) => {
                const taskFolderPath = parentFolder.path === '/' ? normalizePath(taskName) : normalizePath(`${parentFolder.path}/${taskName}`);
                try {
                    await this.app.vault.createFolder(taskFolderPath);
                    const taskFilePath = normalizePath(`${taskFolderPath}/${TASK_MARKER_FILE}`);
                    const now = new Date().toISOString();
                    const defaultStatus = this.plugin.settings.defaultStatus || '未着手';
                    let relPathToEpic = parentFolder.path;
                    const content = `---
title: "${taskName}"
status: "${defaultStatus}"
assignee: "未設定"
created_at: "${now}"
latest_update: ""
theme: "${relPathToEpic}"
---
`;
                    await this.app.vault.create(taskFilePath, content);
                    new Notice(`タスク「${taskName}」を作成しました`);
                } catch (e: any) {
                    console.error(e);
                    new Notice(`作成失敗: 同名のフォルダが既に存在する可能性があります`);
                }
            }).open();
        };

        const badgesRow = container.createDiv({ attr: { style: 'display: flex; gap: 6px; margin-bottom: 20px; align-items: center; flex-wrap: wrap;' } });
        const visibility = fm['visibility'] || '未設定';
        const category = fm['category'] || '未分類';
        const system = fm['system'] || '未設定';

        const createBadge = (text: string, color: string) => {
            badgesRow.createSpan({ text, attr: { style: `font-size: 0.8em; padding: 3px 8px; border-radius: 4px; background: ${color}; color: var(--text-normal); border: 1px solid var(--background-modifier-border); font-weight: bold;` } });
        };
        createBadge(visibility, 'var(--background-secondary-alt)');
        createBadge(category, 'var(--background-secondary-alt)');
        createBadge(system, 'var(--interactive-accent-hover)');

        const createTextareaSection = (label: string, fmKey: string, height: string, withToolbar = false) => {
            container.createEl('h4', { text: label, attr: { style: 'margin-bottom: 5px; margin-top: 15px;' } });
            
            let textArea: HTMLTextAreaElement;
            if (withToolbar) {
                const toolbar = container.createDiv({ attr: { style: 'display: flex; gap: 8px; margin-bottom: 8px;' } });
                textArea = container.createEl('textarea', { attr: { style: `width: 100%; height: ${height}; margin-bottom: 10px; resize: vertical; font-family: inherit; padding: 8px; border-radius: 4px; background: var(--background-primary); border: 1px solid var(--background-modifier-border);` } });
                
                const wrapText = async (color: string) => {
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
                    await saveValue();
                    textArea.focus();
                    textArea.setSelectionRange(start, start + selectedText.length + 23 + color.length + 9);
                };
                
                const redBtn = toolbar.createEl('button', { text: '🔴 赤字', attr: { style: 'font-size: 0.8em; padding: 4px 8px; height: auto;' } });
                redBtn.onclick = () => wrapText('red');
                const blueBtn = toolbar.createEl('button', { text: '🔵 青字', attr: { style: 'font-size: 0.8em; padding: 4px 8px; height: auto;' } });
                blueBtn.onclick = () => wrapText('blue');
            } else {
                textArea = container.createEl('textarea', { attr: { style: `width: 100%; height: ${height}; margin-bottom: 10px; resize: vertical; font-family: inherit; padding: 8px; border-radius: 4px; background: var(--background-primary); border: 1px solid var(--background-modifier-border);` } });
            }

            textArea.value = fm[fmKey] || '';

            const saveValue = async () => {
                await this.app.fileManager.processFrontMatter(epicFile, (frontmatter) => {
                    frontmatter[fmKey] = textArea.value;
                });
            };

            textArea.addEventListener('change', saveValue);
        };

        createTextareaSection('概況 (overview)', 'overview', '100px', true);
        createTextareaSection('スケジュール (schedule)', 'schedule', '100px');
        createTextareaSection('課題 (issues)', 'issues', '100px', true);

        // FILE LISTS
        await this.renderNoteList(container, parentFolder);
    }

    private async renderSystemDashboard(container: HTMLElement, parentFolder: TFolder, systemFile: TFile) {
        const cache = this.app.metadataCache.getFileCache(systemFile);
        const fm = cache?.frontmatter || {};
        const systemName = parentFolder.name;

        // Detect visibility from path
        const visSettings = this.plugin.settings.visibilitySettings;
        let currentVisibility = '';
        for (const vis of visSettings) {
            if (parentFolder.path.startsWith(vis.folder)) {
                currentVisibility = vis.name;
                break;
            }
        }

        // Detect category from path
        const epicCats = this.plugin.settings.epicCategories || [];
        let currentCategory = '';
        for (const cat of epicCats) {
            if (parentFolder.path.includes(cat.id)) {
                currentCategory = cat.id;
                break;
            }
        }

        // Header
        const headerContainer = container.createDiv({ attr: { style: 'display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;' } });
        headerContainer.createEl('h2', { text: `💻 ${systemName}`, attr: { style: 'margin: 0; font-size: 1.4em;' } });

        // Badges
        const badgesRow = container.createDiv({ attr: { style: 'display: flex; gap: 6px; margin-bottom: 20px; align-items: center; flex-wrap: wrap;' } });
        const createBadge = (text: string, color: string) => {
            badgesRow.createSpan({ text, attr: { style: `font-size: 0.8em; padding: 3px 8px; border-radius: 4px; background: ${color}; color: var(--text-normal); border: 1px solid var(--background-modifier-border); font-weight: bold;` } });
        };
        if (currentVisibility) createBadge(currentVisibility, 'var(--background-secondary-alt)');
        if (currentCategory) createBadge(currentCategory, 'var(--background-secondary-alt)');
        createBadge(`rank: ${fm['rank'] ?? '未設定'}`, 'var(--interactive-accent-hover)');

        // System properties section
        const propsDiv = container.createDiv({ cls: 'folder-dash-header', attr: { style: 'background: var(--background-secondary); padding: 15px; border-radius: 8px; margin-bottom: 20px;' } });
        propsDiv.createEl('h3', { text: '⚙️ システムプロパティ', attr: { style: 'margin: 0 0 10px 0; font-size: 1.1em;' } });

        const grid = propsDiv.createDiv({ attr: { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9em;' } });
        const createStat = (label: string, val: string) => {
            const d = grid.createDiv();
            d.createSpan({ text: label + ': ', attr: { style: 'color: var(--text-muted);' } });
            d.createSpan({ text: val, attr: { style: 'font-weight: bold;' } });
        };
        createStat('パス', parentFolder.path);
        createStat('Rank', String(fm['rank'] ?? '未設定'));
        if (currentVisibility) createStat('公開範囲', currentVisibility);
        if (currentCategory) createStat('カテゴリ', currentCategory);

        // Related Epics section
        const epicsDiv = container.createDiv({ attr: { style: 'margin-bottom: 20px;' } });
        const epicsSectionHeader = epicsDiv.createDiv({ attr: { style: 'display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 5px; margin-bottom: 8px;' } });
        epicsSectionHeader.createEl('h3', { text: '📁 エピック一覧', attr: { style: 'margin: 0; font-size: 1.1em;' } });

        const epicChildren: { name: string, path: string, file: TFile, fm: any }[] = [];
        for (const child of parentFolder.children) {
            if (child instanceof TFolder) {
                const epicPath = normalizePath(`${child.path}/${EPIC_MARKER_FILE}`);
                const ef = this.app.vault.getAbstractFileByPath(epicPath);
                if (ef instanceof TFile) {
                    const ecache = this.app.metadataCache.getFileCache(ef);
                    epicChildren.push({ name: child.name, path: child.path, file: ef, fm: ecache?.frontmatter || {} });
                }
            }
        }

        // Sort epics by rank
        epicChildren.sort((a, b) => {
            const rankA = typeof a.fm.rank === 'number' ? a.fm.rank : 999;
            const rankB = typeof b.fm.rank === 'number' ? b.fm.rank : 999;
            if (rankA !== rankB) return rankA - rankB;
            return a.name.localeCompare(b.name);
        });

        if (epicChildren.length > 0) {
            const ul = epicsDiv.createEl('ul', { attr: { style: 'list-style-type: none; padding-left: 0; margin-top: 5px;' } });
            for (const epic of epicChildren) {
                const li = ul.createEl('li', { attr: { style: 'margin-bottom: 6px; display: flex; align-items: center; gap: 8px;' } });

                const statusIcon = epic.fm.status === '完了' || epic.fm.status === 'completed' ? '✅' : '📁';
                const link = li.createEl('a', { text: `${statusIcon} ${epic.name}`, cls: 'internal-link', attr: { style: 'font-weight: 600; cursor: pointer;' } });
                link.onclick = (e) => {
                    e.preventDefault();
                    this.app.workspace.getLeaf(false).openFile(epic.file);
                };

                if (epic.fm.rank !== undefined) {
                    li.createSpan({ text: `rank: ${epic.fm.rank}`, attr: { style: 'font-size: 0.75em; padding: 2px 6px; border-radius: 4px; background: var(--background-modifier-border); color: var(--text-muted);' } });
                }

                const overview = epic.fm.overview || '';
                if (overview) {
                    const overviewSpan = li.createSpan({ attr: { style: 'font-size: 0.8em; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px;' } });
                    overviewSpan.textContent = overview;
                }
            }
        } else {
            epicsDiv.createEl('p', { text: 'このシステムにエピックはありません。', attr: { style: 'color: var(--text-muted); font-size: 0.9em;' } });
        }

        // Notes section - find all notes directly in this system folder
        await this.renderNoteList(container, parentFolder, '_system.md');
    }

    private async renderNoteList(container: HTMLElement, parentFolder: TFolder, extraExclude?: string) {
        const categoryGroups: Record<string, FileItem[]> = {};
        this.plugin.settings.noteCategories.forEach(cat => {
            categoryGroups[cat.id] = [];
        });
        const others: FileItem[] = [];

        for (const child of parentFolder.children) {
            if (child instanceof TFile && child.extension === 'md' && child.name !== TASK_MARKER_FILE && child.name !== EPIC_MARKER_FILE && (!extraExclude || child.name !== extraExclude)) {
                const cache = this.app.metadataCache.getFileCache(child);
                const frontmatter = cache?.frontmatter;

                let assigneeStr = '未設定';
                if (frontmatter) {
                    const rawAssignee = frontmatter['assignee'];
                    if (Array.isArray(rawAssignee)) assigneeStr = rawAssignee.join(', ');
                    else if (rawAssignee) assigneeStr = String(rawAssignee);
                }

                const fileItem: FileItem = {
                    file: child,
                    mtime: child.stat.mtime,
                    assignee: assigneeStr
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
    currentMode: 'kanban' | 'agenda' = 'agenda';
    selectedAssignee: string = 'All';
    hiddenSystems: Set<string> = new Set();
    systemFilterOpen: boolean = false;
    selectedVisibility: string = 'All';
    doTodayFilterEnabled: boolean = false;
    searchQuery: string = '';
    isSearchFocused: boolean = false;
    searchCursorStart: number = 0;
    isSearchComposing: boolean = false;
    displayMode: 'standup' | 'report' | 'compact' = 'standup';

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

    async handleEpicCreate(name: string, visibility: string, category: string, system: string) {
        const visConf = this.plugin.settings.visibilitySettings.find(v => v.name === visibility);
        const baseFolder = visConf ? visConf.folder : 'shared';
        const folderPath = normalizePath(`${baseFolder}/${category}/${system}/${name}`);

        try {
            // Create intermediate folders if they don't exist
            const parts = folderPath.split('/');
            let currentPath = '';
            for (const part of parts) {
                if (!part) continue;
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                const existing = this.app.vault.getAbstractFileByPath(currentPath);
                if (!existing) {
                    await this.app.vault.createFolder(currentPath);
                }
            }

            const epicFilePath = normalizePath(`${folderPath}/${EPIC_MARKER_FILE}`);
            const now = new Date().toISOString();
            const content = `---
title: "${name}"
status: "未着手"
visibility: "${visibility}"
category: "${category}"
system: "${system}"
created_at: "${now}"
latest_update: ""
---
`;
            await this.app.vault.create(epicFilePath, content);
            new Notice(`エピック「${name}」を作成しました`);
            this.renderBoard();
        } catch (e: any) {
            console.error(e);
            new Notice(`作成失敗: フォルダ作成中にエラーが発生しました`);
        }
    }

    async onOpen() {
        await this.renderBoard();

        this.registerEvent(this.app.metadataCache.on('changed', (file) => {
            if (file.name === TASK_MARKER_FILE || file.name === EPIC_MARKER_FILE) {
                setTimeout(() => this.renderBoard(), 150);
            }
        }));
    }

    async renderBoard() {
        const container = this.contentEl;
        
        const activeEl = document.activeElement;
        if (activeEl && activeEl.classList && activeEl.classList.contains('folder-dash-search-input')) {
            this.isSearchFocused = true;
            try {
                this.searchCursorStart = (activeEl as HTMLInputElement).selectionStart || 0;
            } catch (e) {}
        } else {
            this.isSearchFocused = false;
        }

        container.empty();
        container.classList.add('folder-dash-board-view');

        const summaryPaths = (this.app.metadataCache as any).getCachedFiles().filter((path: string) => path.endsWith(TASK_MARKER_FILE));

        type EpicData = { name: string, path: string, overview: string, schedule: string, issues: string, file: TFile, visibility: string, category: string, system: string, rank: number };
        const epicsMap: Record<string, EpicData> = {};
        const epicFilePaths = (this.app.metadataCache as any).getCachedFiles().filter((p: string) => p.endsWith(EPIC_MARKER_FILE));
        const uniqueSystems = new Set<string>();
        const uniqueVisibilities = new Set<string>();

        const systemRanksMap: Record<string, number> = {};
        const systemFilePaths = (this.app.metadataCache as any).getCachedFiles().filter((p: string) => p.endsWith('_system.md'));
        for (const sysFilePath of systemFilePaths) {
            const sysFile = this.app.vault.getAbstractFileByPath(sysFilePath);
            if (sysFile instanceof TFile && sysFile.parent) {
                const systemName = sysFile.parent.name;
                const cache = this.app.metadataCache.getFileCache(sysFile);
                const r = cache?.frontmatter?.rank;
                systemRanksMap[systemName] = typeof r === 'number' ? r : 999;
            }
        }

        for (const epicFilePath of epicFilePaths) {
            const epicFile = this.app.vault.getAbstractFileByPath(epicFilePath);
            if (epicFile instanceof TFile && epicFile.parent) {
                const cache = this.app.metadataCache.getFileCache(epicFile);
                const fm = cache?.frontmatter || {};
                const visSettings = this.plugin.settings.visibilitySettings;
                const defaultVis = visSettings && visSettings.length > 0 ? (visSettings[0]?.name || '') : '';
                const visibility = fm['visibility'] || defaultVis;
                const category = fm['category'] || '維持管理';
                const system = fm['system'] || '未分類';

                const rankRaw = fm['rank'];
                const rank = typeof rankRaw === 'number' ? rankRaw : 999;

                epicsMap[epicFile.parent.path] = {
                    name: epicFile.parent.name,
                    path: epicFile.parent.path,
                    overview: fm['overview'] || '',
                    schedule: fm['schedule'] || '',
                    issues: fm['issues'] || '',
                    file: epicFile,
                    visibility, category, system, rank
                };
                if (system && system !== '未分類') uniqueSystems.add(system);
                if (visibility) uniqueVisibilities.add(visibility);
            }
        }

        type TaskData = { file: TFile, name: string, status: string, assignees: string[], mtime: number, theme: string, epicPath: string, latestUpdate: string, do_today: boolean, epicCategory: string, yesterday: string, today: string };
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
                    const assigneeRaw = fm['assignee'];
                    let assignees: string[] = [];
                    if (Array.isArray(assigneeRaw)) {
                        assignees = assigneeRaw.filter(a => a).map(a => String(a));
                    } else if (assigneeRaw) {
                        assignees = [String(assigneeRaw)];
                    } else {
                        assignees = ['未設定'];
                    }
                    if (assignees.length === 0) assignees = ['未設定'];
                    assignees.forEach(a => uniqueAssignees.add(a));
                    const do_today = fm['do_today'] === true;

                    const epicInfo = this.getEpicInfoForTask(abstractFile);
                    let theme = fm['theme'] || fm['epic'];
                    let themeIsPath = false;
                    let epicPath = '/';
                    if (!theme) {
                        theme = epicInfo ? epicInfo.path : (abstractFile.parent?.parent?.path || '/');
                        themeIsPath = true;
                        epicPath = epicInfo ? epicInfo.path : (abstractFile.parent?.parent?.path || '/');
                    } else {
                        // If theme is provided manually in frontmatter, we try to match it by name or path
                        // For consistency, we'll try to find a matching path if a name was provided
                        const matchedEpic = Object.values(epicsMap).find(e => e.name === theme || e.path === theme);
                        if (matchedEpic) {
                            theme = matchedEpic.path;
                            themeIsPath = true;
                        }
                        epicPath = epicInfo ? epicInfo.path : (abstractFile.parent?.parent?.path || '/');
                    }

                    const latestUpdate = fm['latest_update'] || '';
                    const situation = fm['situation'] || '';
                    const yesterday = fm['yesterday'] || '';
                    const today = fm['today'] || '';
                    const epicInfoData = epicsMap[theme];
                    const epicCategory = epicInfoData ? epicInfoData.category : 'その他';

                    allTasks.push({ file: abstractFile, name: title, status, assignees, mtime: abstractFile.stat.mtime, theme, epicPath, latestUpdate, do_today, epicCategory, yesterday, today });
                }
            }
        }

        const assigneesArray = Array.from(uniqueAssignees).sort();
        const systemsArray = Array.from(uniqueSystems).sort();
        const visibilitiesArray = Array.from(uniqueVisibilities).sort();

        const headerContainer = container.createDiv({ cls: 'backlog-header-sticky', attr: { style: 'padding-top: 10px; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;' } });
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

        const systemFilterContainer = controlsContainer.createDiv({ attr: { style: 'position: relative; display: inline-block;' } });
        const systemFilterBtn = systemFilterContainer.createEl('button', { text: `🌐 システム`, attr: { style: 'padding: 4px 8px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary);' } });

        const dropdownMenu = systemFilterContainer.createDiv({ attr: { style: this.systemFilterOpen ? 'display: block; position: absolute; top: calc(100% + 5px); left: 0; background: var(--background-primary); border: 1px solid var(--background-modifier-border); padding: 10px; z-index: 99; border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); min-width: 200px; max-height: 350px; overflow-y: auto;' : 'display: none;' } });

        const closeMenu = () => {
            if (this.systemFilterOpen) {
                this.systemFilterOpen = false;
                dropdownMenu.style.display = 'none';
                this.renderBoard();
                document.removeEventListener('click', outsideClickListener);
            }
        };

        const outsideClickListener = (e: MouseEvent) => {
            if (!document.body.contains(systemFilterContainer)) {
                // Cleanup if the menu is removed from DOM unexpectedly
                document.removeEventListener('click', outsideClickListener);
                return;
            }
            if (!systemFilterContainer.contains(e.target as Node)) {
                closeMenu();
            }
        };

        systemFilterBtn.onclick = (e) => {
            e.stopPropagation();
            this.systemFilterOpen = !this.systemFilterOpen;
            if (this.systemFilterOpen) {
                dropdownMenu.style.display = 'block';
                document.addEventListener('click', outsideClickListener);
            } else {
                closeMenu();
            }
        };

        const actionsDiv = dropdownMenu.createDiv({ attr: { style: 'display: flex; gap: 10px; margin-bottom: 10px; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 10px;' } });
        actionsDiv.createEl('button', { text: '全選択', attr: { style: 'flex: 1; font-size: 0.8em; padding: 4px;' } }).onclick = (e) => {
            e.stopPropagation();
            this.hiddenSystems.clear();
            dropdownMenu.querySelectorAll('input[type="checkbox"]').forEach((cb: HTMLInputElement) => cb.checked = true);
        };
        actionsDiv.createEl('button', { text: '全解除', attr: { style: 'flex: 1; font-size: 0.8em; padding: 4px;' } }).onclick = (e) => {
            e.stopPropagation();
            systemsArray.forEach(s => this.hiddenSystems.add(s));
            dropdownMenu.querySelectorAll('input[type="checkbox"]').forEach((cb: HTMLInputElement) => cb.checked = false);
        };

        const listDiv = dropdownMenu.createDiv({ attr: { style: 'display: flex; flex-direction: column; gap: 6px;' } });
        for (const sys of systemsArray) {
            const itemDiv = listDiv.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 6px; cursor: pointer;' } });
            const checkbox = itemDiv.createEl('input', { type: 'checkbox' });
            checkbox.checked = !this.hiddenSystems.has(sys);
            itemDiv.createSpan({ text: sys });

            checkbox.onchange = (e) => {
                e.stopPropagation();
                if (checkbox.checked) {
                    this.hiddenSystems.delete(sys);
                } else {
                    this.hiddenSystems.add(sys);
                }
            };
            itemDiv.onclick = (e) => {
                e.stopPropagation();
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            };
        }

        const visibilitySelect = controlsContainer.createEl('select', { attr: { style: 'padding: 4px 8px; border-radius: 4px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); color: var(--text-normal);' } });
        visibilitySelect.createEl('option', { value: 'All', text: '🔒 公開範囲 (All)' });
        for (const vis of visibilitiesArray) {
            const opt = visibilitySelect.createEl('option', { value: vis, text: vis });
            if (this.selectedVisibility === vis) opt.selected = true;
        }
        visibilitySelect.onchange = () => {
            this.selectedVisibility = visibilitySelect.value;
            this.renderBoard();
        };

        const searchInput = controlsContainer.createEl('input', { type: 'text', placeholder: 'パス検索 (複数キーワード可)...', cls: 'folder-dash-search-input', attr: { style: 'padding: 4px 8px; border-radius: 4px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); color: var(--text-normal); width: 220px;' } });
        searchInput.value = this.searchQuery;
        
        searchInput.addEventListener('compositionstart', () => { this.isSearchComposing = true; });
        searchInput.addEventListener('compositionend', (e: Event) => { 
            this.isSearchComposing = false;
            const el = e.target as HTMLInputElement;
            this.searchQuery = el.value;
            this.renderBoard();
        });
        
        searchInput.oninput = (e) => {
            if (this.isSearchComposing) return;
            const el = e.target as HTMLInputElement;
            this.searchQuery = el.value;
            this.renderBoard();
        };

        if (this.isSearchFocused) {
            setTimeout(() => {
                const el = container.querySelector('.folder-dash-search-input') as HTMLInputElement;
                if (el && !this.isSearchComposing) {
                    el.focus();
                    try {
                        el.setSelectionRange(this.searchCursorStart, this.searchCursorStart);
                    } catch (e) {}
                }
            }, 10);
        }

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

        if (this.currentMode === 'agenda') {
            const toggleAllBtn = controlsContainer.createEl('button', { text: '↕️ 一括開閉', attr: { style: 'background-color: transparent; border: 1px solid var(--background-modifier-border); color: var(--text-muted);' } });
            toggleAllBtn.onclick = () => {
                const detailsNodes = container.querySelectorAll('details');
                const anyOpen = Array.from(detailsNodes).some(d => d.hasAttribute('open'));
                detailsNodes.forEach(d => {
                    if (anyOpen) {
                        d.removeAttribute('open');
                    } else {
                        d.setAttribute('open', 'true');
                    }
                });
            };

            const modeLabels: Record<string, string> = {
                'standup': '☀️ 朝会モード',
                'report': '👔 報告モード',
                'compact': '📋 一覧モード'
            };
            const modeActiveStyle = 'background-color: var(--interactive-accent); color: var(--text-on-accent); border: none;';
            const modeInactiveStyle = 'background-color: transparent; border: 1px solid var(--background-modifier-border); color: var(--text-muted);';

            const displayModeBtn = controlsContainer.createEl('button', {
                text: modeLabels[this.displayMode],
                attr: { style: this.displayMode !== 'standup' ? modeActiveStyle : modeInactiveStyle }
            });
            displayModeBtn.onclick = () => {
                // サイクル: standup → report → compact → standup
                const cycle: Array<'standup' | 'report' | 'compact'> = ['standup', 'report', 'compact'];
                const idx = cycle.indexOf(this.displayMode);
                this.displayMode = cycle[(idx + 1) % cycle.length] ?? 'standup';

                container.classList.remove('report-mode-active', 'compact-mode-active');
                if (this.displayMode === 'report') {
                    container.classList.add('report-mode-active');
                } else if (this.displayMode === 'compact') {
                    container.classList.add('compact-mode-active');
                }
                displayModeBtn.textContent = modeLabels[this.displayMode] ?? '';
                displayModeBtn.setAttribute('style', this.displayMode !== 'standup' ? modeActiveStyle : modeInactiveStyle);
            };

            const systemOrderBtn = controlsContainer.createEl('button', { text: '🔄 システム順を管理', attr: { style: 'background-color: transparent; border: 1px solid var(--background-modifier-border); color: var(--text-muted);' } });
            systemOrderBtn.onclick = () => {
                new SystemOrderModal(this.app, this).open();
            };
        }

        // 初期状態のモードに応じたCSSクラスを付与
        if (this.displayMode === 'report') {
            container.classList.add('report-mode-active');
        } else if (this.displayMode === 'compact') {
            container.classList.add('compact-mode-active');
        }

        const newEpicBtn = controlsContainer.createEl('button', { text: '＋ 新規エピック', cls: 'mod-cta', attr: { style: 'padding: 4px 12px; height: auto;' } });
        newEpicBtn.onclick = () => {
            new EpicCreateModal(this.app, systemsArray, this.plugin.settings.visibilitySettings, this.plugin.settings.epicCategories, this.handleEpicCreate.bind(this)).open();
        };

        const keywords = parseSearchKeywords(this.searchQuery);

        const tasks = allTasks.filter(task => {
            if (this.selectedAssignee !== 'All' && !task.assignees.includes(this.selectedAssignee)) return false;
            if (this.doTodayFilterEnabled && !task.do_today) return false;

            const epicData = epicsMap[task.theme];
            // Fallback for manual theme strings that didn't resolve to a path
            if (!epicData && task.theme && task.theme !== '未分類' && task.theme !== '/') {
                // If we can't find epic data by path, try to filter by the theme string itself (legacy fallback)
                const legacyEpic = Object.values(epicsMap).find(e => e.name === task.theme);
                if (legacyEpic && this.hiddenSystems.has(legacyEpic.system)) return false;
            }

            if (epicData && this.hiddenSystems.has(epicData.system)) return false;
            if (this.selectedVisibility !== 'All' && (!epicData || epicData.visibility !== this.selectedVisibility)) return false;

            if (keywords.length > 0 && !matchesAllKeywords(task.file.path, keywords)) {
                return false;
            }

            return true;
        });

        // Also filter epicsMap so empty Epics won't show up if filtered out
        for (const [themeName, epicData] of Object.entries(epicsMap)) {
            if (this.hiddenSystems.has(epicData.system)) {
                delete epicsMap[themeName];
            } else if (this.selectedVisibility !== 'All' && epicData.visibility !== this.selectedVisibility) {
                delete epicsMap[themeName];
            } else if (keywords.length > 0) {
                const epicMatches = matchesAllKeywords(epicData.file.path, keywords);
                const hasMatchingTasks = tasks.some(t => t.theme === themeName);
                if (!epicMatches && !hasMatchingTasks) {
                    delete epicsMap[themeName];
                }
            }
        }

        // When assignee/doToday filter is active, hide epics with no matching tasks
        if (this.selectedAssignee !== 'All' || this.doTodayFilterEnabled) {
            const taskThemes = new Set(tasks.map(t => t.theme));
            for (const epicPath of Object.keys(epicsMap)) {
                if (!taskThemes.has(epicPath)) {
                    delete epicsMap[epicPath];
                }
            }
        }

        if (this.currentMode === 'kanban') {
            this.renderKanban(container, tasks);
        } else {
            this.renderAgenda(container, tasks, epicsMap, systemRanksMap);
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

    renderAgenda(container: HTMLElement, tasks: any[], epicsMap: Record<string, any>, systemRanksMap: Record<string, number>) {
        const systemsArray = Array.from(new Set(Object.values(epicsMap)
            .map((e: any) => e.system)
            .filter(s => s && s !== '未分類')
        )).sort((a, b) => {
            const rankA = systemRanksMap[a] ?? 999;
            const rankB = systemRanksMap[b] ?? 999;
            if (rankA !== rankB) return rankA - rankB;
            return a.localeCompare(b);
        }) as string[];
        
        const agendaDiv = container.createDiv({ attr: { style: 'display: flex; flex-direction: column; gap: 20px; padding-bottom: 20px;' } });

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
        for (const [epicName, epicData] of Object.entries(epicsMap)) {
            if (!grouped[epicName]) {
                grouped[epicName] = [];
            }
            if (!epicPaths[epicName]) {
                epicPaths[epicName] = epicData.path;
            }
        }

        const allThemes = Object.keys(grouped).sort((a, b) => {
            const epicA = epicsMap[a];
            const epicB = epicsMap[b];
            if (epicA && epicB) {
                const rankA = epicA.rank ?? 999;
                const rankB = epicB.rank ?? 999;
                if (rankA !== rankB) return rankA - rankB;
                return epicA.name.localeCompare(epicB.name);
            }
            return a.localeCompare(b);
        });

        const renderCategorySection = (categoryTitle: string, filterCategory: string) => {
            const categoryThemes = allThemes.filter(theme => {
                const epic = epicsMap[theme];
                const cat = epic ? epic.category : 'その他';
                return filterCategory === 'all' || cat === filterCategory;
            });

            if (categoryThemes.length === 0) return;

            const sectionDiv = agendaDiv.createDiv({ attr: { style: 'margin-bottom: 30px;' } });
            sectionDiv.createEl('h2', { text: categoryTitle, attr: { style: 'border-bottom: 2px solid var(--background-modifier-border); padding-bottom: 5px; margin-bottom: 15px;' } });

            const systemGroups: Record<string, string[]> = {};
            for (const theme of categoryThemes) {
                const epic = epicsMap[theme];
                const sys = epic ? (epic.system || '未分類') : '未分類';
                if (!systemGroups[sys]) systemGroups[sys] = [];
                systemGroups[sys].push(theme);
            }

            const sortedSystems = Object.keys(systemGroups).sort((a, b) => {
                const rankA = systemRanksMap[a] ?? 999;
                const rankB = systemRanksMap[b] ?? 999;
                if (rankA !== rankB) return rankA - rankB;
                return a.localeCompare(b);
            });

            for (const sys of sortedSystems) {
                const themes = systemGroups[sys];
                if (!themes || themes.length === 0) continue;

                const sysHeaderContainer = sectionDiv.createDiv({ attr: { style: 'display: flex; justify-content: space-between; align-items: center; margin-top: 15px; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 1px dashed var(--background-modifier-border);' } });
                sysHeaderContainer.createEl('h3', { text: `💻 ${sys}`, attr: { style: 'color: var(--text-muted); font-size: 1.1em; margin: 0;' } });

                const sysButtonGroup = sysHeaderContainer.createDiv({ attr: { style: 'display: flex; gap: 4px; align-items: center;' } });

                const epicOrderBtn = sysButtonGroup.createEl('button', { text: '↕️', attr: { title: `「${sys}」のエピック順を管理`, style: 'background: transparent; border: none; box-shadow: none; cursor: pointer; padding: 2px 5px; font-size: 1.1em; opacity: 0.7;' } });
                epicOrderBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    new EpicOrderModal(this.app, this, filterCategory, sys, epicsMap).open();
                };

                const sysSettingsBtn = sysButtonGroup.createEl('button', { text: '⚙️', attr: { title: 'システム設定 (_system.md)', style: 'background: transparent; border: none; box-shadow: none; cursor: pointer; padding: 2px 5px; font-size: 1.1em; opacity: 0.7;' } });
                sysSettingsBtn.onclick = async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    let systemRootPath = '';
                    for (const theme of themes) {
                        const epic = epicsMap[theme];
                        if (epic && epic.file && epic.file.parent && epic.file.parent.parent) {
                            systemRootPath = epic.file.parent.parent.path;
                            break;
                        }
                    }

                    if (!systemRootPath) {
                        new Notice('システムのルートフォルダが見つかりません');
                        return;
                    }

                    const systemFilePath = normalizePath(`${systemRootPath}/_system.md`);
                    let systemFile = this.app.vault.getAbstractFileByPath(systemFilePath);

                    if (!(systemFile instanceof TFile)) {
                        try {
                            systemFile = await this.app.vault.create(systemFilePath, "---\nrank: 10\n---\n");
                            new Notice('システム設定を作成しました');
                        } catch (err) {
                            console.error(err);
                            new Notice('システム設定の作成に失敗しました');
                            return;
                        }
                    }

                    await this.app.workspace.getLeaf(false).openFile(systemFile as TFile);
                };

                for (const theme of themes) {
                    const themeDetails = sectionDiv.createEl('details', { attr: { style: 'background: var(--background-secondary); border-radius: 8px; padding: 15px; margin-bottom: 15px;', open: 'true' } });

                    const themeSummary = themeDetails.createEl('summary', { attr: { style: 'display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 10px; margin-bottom: 10px; cursor: pointer; user-select: none;' } });

                    const summaryLeft = themeSummary.createDiv({ attr: { style: 'display: flex; flex-direction: column; gap: 5px; flex-grow: 1;' } });
                    const titleRow = summaryLeft.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 10px;' } });

                    const epicData = epicsMap[theme];
                    const displayedName = epicData ? epicData.name : theme;
                    const titleRowInner = titleRow.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 6px;' } });
                    titleRowInner.createEl('h3', { text: `📁 ${displayedName}`, attr: { style: 'margin: 0; display: inline-block;' } });
                    
                    if (epicData && epicData.file) {
                        const linkBtn = titleRowInner.createEl('button', { text: '📄', attr: { title: 'Epicを開く（左ペインに詳細表示）', style: 'background: transparent; border: none; box-shadow: none; cursor: pointer; padding: 2px 5px; font-size: 1.1em; opacity: 0.7;' } });
                        linkBtn.onclick = async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            await this.app.workspace.getLeaf(false).openFile(epicData.file);
                        };
                    }
                    
                    const overviewText = epicData ? epicData.overview : '';
                    const scheduleText = epicData ? epicData.schedule : '';
                    const issuesText = epicData ? epicData.issues : '';

                    if (epicData && epicData.visibility) {
                        const badgesRow = titleRow.createDiv({ attr: { style: 'display: flex; gap: 4px; align-items: center;' } });
                        badgesRow.createSpan({ text: epicData.visibility, attr: { style: 'font-size: 0.7em; padding: 2px 6px; border-radius: 4px; background: var(--background-secondary-alt); color: var(--text-normal); border: 1px solid var(--background-modifier-border);' } });
                    }

                    if (overviewText || scheduleText || issuesText) {
                        const calloutContainer = summaryLeft.createDiv({ cls: 'fd-epic-callouts', attr: { style: 'display: flex; flex-direction: column; gap: 10px; margin-top: 10px;' } });
                        if (overviewText) {
                            const block = calloutContainer.createDiv({ cls: 'fd-callout fd-callout-overview' });
                            block.createDiv({ cls: 'fd-callout-title', text: 'ℹ️ 概況' });
                            const body = block.createDiv({ cls: 'fd-callout-body' });
                            body.innerHTML = overviewText;
                        }
                        if (scheduleText) {
                            const block = calloutContainer.createDiv({ cls: 'fd-callout fd-callout-schedule' });
                            block.createDiv({ cls: 'fd-callout-title', text: '📅 スケジュール' });
                            const body = block.createDiv({ cls: 'fd-callout-body' });
                            body.innerHTML = scheduleText;
                        }
                        if (issuesText) {
                            const block = calloutContainer.createDiv({ cls: 'fd-callout fd-callout-issues' });
                            block.createDiv({ cls: 'fd-callout-title', text: '⚠️ 課題' });
                            const body = block.createDiv({ cls: 'fd-callout-body' });
                            body.innerHTML = issuesText;
                        }
                    }



                    const themeTasks = grouped[theme];

                    let parentPath = epicPaths[theme] || '/';
                    if (parentPath === '/' && themeTasks && themeTasks.length > 0) {
                        const validTask = themeTasks.find(t => t.epicPath && t.epicPath !== '/');
                        parentPath = validTask ? validTask.epicPath : (themeTasks[0].epicPath || '/');
                    }

                    const tasksDiv = themeDetails.createDiv({ attr: { style: 'display: flex; flex-direction: column; gap: 10px; margin-top: 10px;' } });

                    if (themeTasks) {
                        themeTasks.sort((a, b) => b.mtime - a.mtime);

                        for (const task of themeTasks) {
                            this.renderTaskCard(tasksDiv, task, 'agenda');
                        }
                    }

                    // Add task button at the bottom of the task list
                    const addTaskBtn = tasksDiv.createEl('button', { text: '＋ タスクを追加', attr: { style: 'background: transparent; border: 1px dashed var(--background-modifier-border); color: var(--text-muted); font-size: 0.85em; padding: 8px 12px; border-radius: 6px; cursor: pointer; width: 100%; text-align: center; opacity: 0.8; transition: opacity 0.15s ease;' } });
                    addTaskBtn.onmouseenter = () => { addTaskBtn.style.opacity = '1'; addTaskBtn.style.borderColor = 'var(--interactive-accent)'; addTaskBtn.style.color = 'var(--interactive-accent)'; };
                    addTaskBtn.onmouseleave = () => { addTaskBtn.style.opacity = '0.8'; addTaskBtn.style.borderColor = 'var(--background-modifier-border)'; addTaskBtn.style.color = 'var(--text-muted)'; };
                    addTaskBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        new TaskCreateModal(this.app, parentPath, async (taskName: string) => {
                            const taskFolderPath = parentPath === '/' ? normalizePath(taskName) : normalizePath(`${parentPath}/${taskName}`);
                            try {
                                await this.app.vault.createFolder(taskFolderPath);
                                const taskFilePath = normalizePath(`${taskFolderPath}/${TASK_MARKER_FILE}`);
                                const now = new Date().toISOString();
                                const defaultStatus = this.plugin.settings.defaultStatus || '未着手';
                                const content = `---\ntitle: "${taskName}"\nstatus: "${defaultStatus}"\nassignee: "未設定"\ncreated_at: "${now}"\nlatest_update: ""\n---\n`;
                                await this.app.vault.create(taskFilePath, content);
                                new Notice(`タスク「${taskName}」を作成しました`);
                                this.renderBoard();
                            } catch (e: any) {
                                console.error(e);
                                new Notice(`作成失敗: 同名のフォルダが既に存在する可能性があります`);
                            }
                        }).open();
                    };
                }

                const inlineAddContainer = sectionDiv.createDiv({ attr: { style: 'margin-top: 5px; margin-bottom: 20px; padding-left: 10px;' } });
                const inlineAddBtn = inlineAddContainer.createEl('button', {
                    text: `＋ 「${sys}」にエピックを追加`,
                    attr: { style: 'background: transparent; border: 1px dashed var(--interactive-accent); color: var(--interactive-accent); font-size: 0.85em; padding: 4px 12px; border-radius: 4px; cursor: pointer; opacity: 0.8;' }
                });
                inlineAddBtn.onclick = () => {
                    new EpicCreateModal(
                        this.app, 
                        systemsArray, 
                        this.plugin.settings.visibilitySettings, 
                        this.plugin.settings.epicCategories, 
                        this.handleEpicCreate.bind(this),
                        this.plugin.settings.epicCategories.find(c => c.id === filterCategory) ? filterCategory : undefined,
                        sys
                    ).open();
                };
            }
        };

        const epicCats = this.plugin.settings.epicCategories || [];
        const knownCatIds = new Set(epicCats.map(c => c.id));

        for (const cat of epicCats) {
            renderCategorySection(cat.label, cat.id);
        }

        // Settings に存在しないカテゴリのエピックは「その他」としてまとめて表示
        const otherThemes = allThemes.filter(theme => {
            const epic = epicsMap[theme];
            const cat = epic ? epic.category : 'その他';
            return !knownCatIds.has(cat);
        });
        if (otherThemes.length > 0) {
            renderCategorySection('📦 その他', 'その他');
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

        topRow.createSpan({ text: `👤 担当: ${Array.isArray(task.assignees) ? task.assignees.join(', ') : task.assignee}`, attr: { style: 'font-size: 0.8em; color: var(--text-muted); margin-left: 10px;' } });

        if (viewMode === 'agenda') {
            const taskCallouts = mainContent.createDiv({ cls: 'fd-task-callouts', attr: { style: 'display: flex; flex-direction: column; gap: 8px; margin-top: 8px;' } });

            // ── ヘルパー: 閲覧専用コールアウトブロック（値がある場合のみ表示）──
            const createTaskCalloutReadonly = (
                parent: HTMLElement,
                icon: string,
                label: string,
                currentValue: string,
                borderColor: string,
                bgColor: string,
                extraCls?: string
            ) => {
                if (!currentValue) return; // 値がなければ非表示
                const block = parent.createDiv({ cls: `fd-task-callout${extraCls ? ' ' + extraCls : ''}`, attr: { style: `border-left: 4px solid ${borderColor}; background: ${bgColor}; border-radius: 6px; padding: 8px 12px;` } });
                block.createDiv({ cls: 'fd-task-callout-title', attr: { style: `font-weight: bold; font-size: 0.9em; color: ${borderColor}; margin-bottom: 4px;` }, text: `${icon} ${label}` });
                const body = block.createDiv({ cls: 'fd-task-callout-body', attr: { style: 'font-size: 0.9em; line-height: 1.6; color: var(--text-normal); white-space: pre-wrap; word-break: break-word;' } });
                body.innerHTML = currentValue;
            };

            createTaskCalloutReadonly(
                taskCallouts,
                '💬', '状況説明', task.latestUpdate,
                '#2d7ad6', 'rgba(45,122,214,0.06)'
            );
            createTaskCalloutReadonly(
                taskCallouts,
                '🔄', '昨日の振り返り', task.yesterday,
                '#6f42c1', 'rgba(111,66,193,0.06)',
                'standup-item'
            );
            createTaskCalloutReadonly(
                taskCallouts,
                '🎯', '本日やること', task.today,
                '#e36209', 'rgba(227,98,9,0.06)',
                'standup-item'
            );
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
