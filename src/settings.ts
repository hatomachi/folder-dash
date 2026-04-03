import { App, PluginSettingTab, Setting } from "obsidian";
import FolderDashPlugin from "./main";

export interface NoteCategory {
	id: string;
	name: string;
}

export interface FolderDashSettings {
	defaultStatus: string;
	noteCategories: NoteCategory[];
	blockReasons: string[];
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
	blockReasons: ['休憩', '別作業に入るため', '退勤']
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
				})
			);
	}
}
