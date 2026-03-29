import {App, PluginSettingTab, Setting} from "obsidian";
import FolderDashPlugin from "./main";

export interface FolderDashSettings {
	// Future settings for the plugin can be added here
	defaultStatus: string;
}

export const DEFAULT_SETTINGS: FolderDashSettings = {
	defaultStatus: '着手前'
}

export class FolderDashSettingTab extends PluginSettingTab {
	plugin: FolderDashPlugin;

	constructor(app: App, plugin: FolderDashPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

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
	}
}
