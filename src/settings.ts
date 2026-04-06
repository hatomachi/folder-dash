import { App, PluginSettingTab, Setting } from "obsidian";
import FolderDashPlugin from "./main";

export interface NoteCategory {
	id: string;
	name: string;
}

export interface EpicCategory {
	id: string;   // Epic frontmatterの category フィールドと一致する文字列
	label: string; // Agenda view の大見出し表示名
}

export interface VisibilityClassification {
	name: string;
	folder: string;
}

export interface FolderDashSettings {
	defaultStatus: string;
	noteCategories: NoteCategory[];
	epicCategories: EpicCategory[];
	blockReasons: string[];
	visibilitySettings: VisibilityClassification[];
}

export const DEFAULT_SETTINGS: FolderDashSettings = {
	defaultStatus: '着手前',
	noteCategories: [
		{ id: 'deliverable', name: '🌟 成果物' },
		{ id: 'self-check', name: '✅ レビュー前セルフチェックシート' },
		{ id: 'review', name: '💬 レビュー指摘' },
		{ id: 'meeting', name: '📅 打合せ' },
		{ id: 'memo', name: '📝 メモ' }
	],
	epicCategories: [
		{ id: '維持管理', label: '🛠 維持管理' },
		{ id: '個別テーマ', label: '🚀 個別テーマ' },
		{ id: 'ナレッジ', label: '📚 ナレッジ' }
	],
	blockReasons: ['休憩', '別作業に入るため', '退勤'],
	visibilitySettings: [
		{ name: '社員限定', folder: 'kb_nrionly' },
		{ name: '開発会社共用', folder: 'kb_shared' }
	]
}

export class FolderDashSettingTab extends PluginSettingTab {
	plugin: FolderDashPlugin;

	constructor(app: App, plugin: FolderDashPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('デフォルトステータス')
			.setDesc('まとめノート作成時の初期ステータス')
			.addText(text => text
				.setPlaceholder('例: 着手前')
				.setValue(this.plugin.settings.defaultStatus)
				.onChange(async (value) => {
					this.plugin.settings.defaultStatus = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', { text: 'ノート種別カスタマイズ' });
		containerEl.createEl('p', { text: 'ダッシュボード上で自動分類されるカテゴリを定義します。「ID」はファイルのプロパティの type に指定する文字列と一致させてください。' });

		this.plugin.settings.noteCategories.forEach((category, index) => {
			const setting = new Setting(containerEl)
				.setName(`カテゴリ ${index + 1}`)
				.addText(text => text
					.setPlaceholder('ID (e.g. deliverable)')
					.setValue(category.id)
					.onChange(async (value) => {
						category.id = value;
						await this.plugin.saveSettings();
					})
				)
				.addText(text => text
					.setPlaceholder('表示名 (e.g. 🌟 成果物)')
					.setValue(category.name)
					.onChange(async (value) => {
						category.name = value;
						await this.plugin.saveSettings();
					})
				)
				.addButton(btn => btn
					.setButtonText('削除')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.noteCategories.splice(index, 1);
						await this.plugin.saveSettings();
						this.display(); // 再描画
					})
				);
		});

		new Setting(containerEl)
			.addButton(btn => btn
				.setButtonText('カテゴリを追加')
				.setCta()
				.onClick(async () => {
					this.plugin.settings.noteCategories.push({ id: `new-category-${Date.now()}`, name: '新規カテゴリ' });
					await this.plugin.saveSettings();
					this.display(); // 再描画
				})
			);

		containerEl.createEl('h3', { text: 'エピックカテゴリのカスタマイズ' });
		containerEl.createEl('p', { text: 'Agenda viewの大見出しとして表示されるカテゴリを定義します。「ID」はEpicのfrontmatterの category に指定する文字列と一致させてください。' });

		this.plugin.settings.epicCategories.forEach((cat, index) => {
			new Setting(containerEl)
				.setName(`カテゴリ ${index + 1}`)
				.addText(text => text
					.setPlaceholder('ID (e.g. 維持管理)')
					.setValue(cat.id)
					.onChange(async (value) => {
						cat.id = value;
						await this.plugin.saveSettings();
					})
				)
				.addText(text => text
					.setPlaceholder('表示名 (e.g. 🛠 維持管理)')
					.setValue(cat.label)
					.onChange(async (value) => {
						cat.label = value;
						await this.plugin.saveSettings();
					})
				)
				.addButton(btn => btn
					.setButtonText('削除')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.epicCategories.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					})
				);
		});

		new Setting(containerEl)
			.addButton(btn => btn
				.setButtonText('カテゴリを追加')
				.setCta()
				.onClick(async () => {
					this.plugin.settings.epicCategories.push({ id: `new-category-${Date.now()}`, label: '新規カテゴリ' });
					await this.plugin.saveSettings();
					this.display();
				})
			);

		containerEl.createEl('h3', { text: 'ブロック理由の設定' });
		containerEl.createEl('p', { text: 'ブロックの理由として選択できるバッジの候補を設定します。' });

		this.plugin.settings.blockReasons.forEach((reason, index) => {
			new Setting(containerEl)
				.setName(`理由 ${index + 1}`)
				.addText(text => text
					.setPlaceholder('理由 (e.g. 休憩)')
					.setValue(reason)
					.onChange(async (value) => {
						this.plugin.settings.blockReasons[index] = value;
						await this.plugin.saveSettings();
					})
				)
				.addButton(btn => btn
					.setButtonText('削除')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.blockReasons.splice(index, 1);
						await this.plugin.saveSettings();
						this.display(); // 再描画
					})
				);
		});

		new Setting(containerEl)
			.addButton(btn => btn
				.setButtonText('理由を追加')
				.setCta()
				.onClick(async () => {
					this.plugin.settings.blockReasons.push('新しい理由');
					await this.plugin.saveSettings();
					this.display(); // 再描画
					this.display(); // 再描画
				})
			);

		containerEl.createEl('h3', { text: '公開範囲（Visibility）のカスタマイズ' });
		containerEl.createEl('p', { text: 'ダッシュボード上で選択できる公開範囲とその保存フォルダ名を定義します。' });

		this.plugin.settings.visibilitySettings.forEach((visibility, index) => {
			new Setting(containerEl)
				.setName(`公開範囲 ${index + 1}`)
				.addText(text => text
					.setPlaceholder('表示名 (e.g. 社員限定)')
					.setValue(visibility.name)
					.onChange(async (value) => {
						visibility.name = value;
						await this.plugin.saveSettings();
					})
				)
				.addText(text => text
					.setPlaceholder('フォルダ名 (e.g. nrionly)')
					.setValue(visibility.folder)
					.onChange(async (value) => {
						visibility.folder = value;
						await this.plugin.saveSettings();
					})
				)
				.addButton(btn => btn
					.setButtonText('削除')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.visibilitySettings.splice(index, 1);
						await this.plugin.saveSettings();
						this.display(); // 再描画
					})
				);
		});

		new Setting(containerEl)
			.addButton(btn => btn
				.setButtonText('公開範囲を追加')
				.setCta()
				.onClick(async () => {
					this.plugin.settings.visibilitySettings.push({ name: '新規公開範囲', folder: 'new-folder' });
					await this.plugin.saveSettings();
					this.display(); // 再描画
				})
			);
	}
}
