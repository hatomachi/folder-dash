import { Modal, Setting, App, Notice } from 'obsidian';

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
    onSubmit: (name: string, visibility: string, category: string, system: string) => void;
    epicName: string = '';
    visibility: string;
    category: string;
    system: string = '';
    existingSystems: string[];
    visibilitySettings: { name: string, folder: string }[];
    epicCategories: { id: string, label: string }[];

    constructor(
        app: App, 
        existingSystems: string[], 
        visibilitySettings: { name: string, folder: string }[], 
        epicCategories: { id: string, label: string }[], 
        onSubmit: (name: string, visibility: string, category: string, system: string) => void,
        defaultCategory?: string,
        defaultSystem?: string
    ) {
        super(app);
        this.existingSystems = existingSystems;
        this.visibilitySettings = visibilitySettings;
        this.epicCategories = epicCategories;
        this.visibility = visibilitySettings && visibilitySettings.length > 0 ? (visibilitySettings[0]?.name || '') : '';
        this.category = defaultCategory || (epicCategories && epicCategories.length > 0 ? (epicCategories[0]?.id || '') : '');
        this.system = defaultSystem || '';
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: '新規エピックの作成' });

        new Setting(contentEl)
            .setName('カテゴリ')
            .addDropdown(dropdown => {
                this.epicCategories.forEach(c => dropdown.addOption(c.id, c.id));
                dropdown.setValue(this.category);
                dropdown.onChange(value => this.category = value);
            });

        const datalist = contentEl.createEl('datalist', { attr: { id: 'epic-system-list' } });
        for (const sys of this.existingSystems) {
            datalist.createEl('option', { value: sys });
        }

        new Setting(contentEl)
            .setName('システム')
            .addText(text => {
                text.inputEl.setAttribute('list', 'epic-system-list');
                if (this.system) text.setValue(this.system);
                text.onChange(value => {
                    this.system = value;
                }).inputEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.submit();
                    }
                });
            });

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

        new Setting(contentEl)
            .setName('公開範囲')
            .addDropdown(dropdown => {
                this.visibilitySettings.forEach(v => dropdown.addOption(v.name, v.name));
                dropdown.setValue(this.visibility);
                dropdown.onChange(value => this.visibility = value);
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
        let sys = this.system.trim();
        if (!sys) sys = '未分類';
        this.close();
        this.onSubmit(name, this.visibility, this.category, sys);
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

export class EpicPropertyEditModal extends Modal {
    onSubmit: (visibility: string, category: string, system: string) => void;
    visibility: string;
    category: string;
    system: string;
    existingSystems: string[];
    visibilitySettings: { name: string, folder: string }[];
    epicCategories: { id: string, label: string }[];

    constructor(app: App, initVis: string, initCat: string, initSys: string, existingSystems: string[], visibilitySettings: { name: string, folder: string }[], epicCategories: { id: string, label: string }[], onSubmit: (visibility: string, category: string, system: string) => void) {
        super(app);
        this.visibilitySettings = visibilitySettings;
        this.epicCategories = epicCategories;
        this.visibility = initVis;
        this.category = initCat;
        this.system = initSys;
        this.existingSystems = existingSystems;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'エピック属性の編集' });
        contentEl.createEl('p', { text: '変更して保存すると、属性に応じたフォルダへ自動的に移動します。', attr: { style: 'color: var(--text-muted); font-size: 0.85em; margin-top: -10px; margin-bottom: 20px;' } });

        new Setting(contentEl)
            .setName('公開範囲')
            .addDropdown(dropdown => {
                this.visibilitySettings.forEach(v => dropdown.addOption(v.name, v.name));
                dropdown.setValue(this.visibility);
                dropdown.onChange(value => this.visibility = value);
            });

        new Setting(contentEl)
            .setName('カテゴリ')
            .addDropdown(dropdown => {
                this.epicCategories.forEach(c => dropdown.addOption(c.id, c.id));
                dropdown.setValue(this.category);
                dropdown.onChange(value => this.category = value);
            });

        const datalist = contentEl.createEl('datalist', { attr: { id: 'edit-epic-system-list' } });
        for (const sys of this.existingSystems) {
            datalist.createEl('option', { value: sys });
        }

        new Setting(contentEl)
            .setName('システム')
            .addText(text => {
                text.inputEl.setAttribute('list', 'edit-epic-system-list');
                text.setValue(this.system);
                text.onChange(value => {
                    this.system = value;
                }).inputEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.submit();
                    }
                });
            });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('保存')
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
        let sys = this.system.trim();
        if (!sys) sys = '未分類';
        this.close();
        this.onSubmit(this.visibility, this.category, sys);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class EpicEditModal extends Modal {
    onSubmit: (overview: string, schedule: string) => void;
    initialOverview: string;
    initialSchedule: string;
    overviewTextarea: HTMLTextAreaElement;
    scheduleTextarea: HTMLTextAreaElement;

    constructor(app: App, initialOverview: string, initialSchedule: string, onSubmit: (overview: string, schedule: string) => void) {
        super(app);
        this.initialOverview = initialOverview;
        this.initialSchedule = initialSchedule;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Epic情報の編集', attr: { style: 'margin-bottom: 20px;' } });

        const wrapText = (textArea: HTMLTextAreaElement, color: string) => {
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

        const createToolbar = (parent: HTMLElement, textArea: HTMLTextAreaElement) => {
            const toolbar = parent.createDiv({ attr: { style: 'display: flex; gap: 8px; margin-bottom: 8px;' } });
            const redBtn = toolbar.createEl('button', { text: '🔴 赤字', attr: { style: 'font-size: 0.8em; padding: 4px 8px; height: auto;' } });
            redBtn.onclick = () => wrapText(textArea, 'red');
            const blueBtn = toolbar.createEl('button', { text: '🔵 青字', attr: { style: 'font-size: 0.8em; padding: 4px 8px; height: auto;' } });
            blueBtn.onclick = () => wrapText(textArea, 'blue');
        };

        contentEl.createEl('h4', { text: '概況 (overview)', attr: { style: 'margin-bottom: 5px;' } });
        createToolbar(contentEl, this.overviewTextarea = contentEl.createEl('textarea', {
            attr: { style: 'width: 100%; height: 80px; margin-bottom: 15px; resize: vertical;' }
        }));
        this.overviewTextarea.value = this.initialOverview;

        contentEl.createEl('h4', { text: 'スケジュール (schedule)', attr: { style: 'margin-bottom: 5px;' } });
        createToolbar(contentEl, this.scheduleTextarea = contentEl.createEl('textarea', {
            attr: { style: 'width: 100%; height: 80px; margin-bottom: 15px; resize: vertical;' }
        }));
        this.scheduleTextarea.value = this.initialSchedule;

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('保存')
                    .setCta()
                    .onClick(() => {
                        this.onSubmit(this.overviewTextarea.value, this.scheduleTextarea.value);
                        this.close();
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
