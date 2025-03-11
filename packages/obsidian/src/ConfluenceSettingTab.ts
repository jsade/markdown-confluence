import { App, PluginSettingTab, Setting, TextComponent } from "obsidian";
import ConfluencePlugin from "./main";

export class ConfluenceSettingTab extends PluginSettingTab {
	plugin: ConfluencePlugin;

	constructor(app: App, plugin: ConfluencePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", {
			text: "Confluence Integration",
		});

		// Atlassian Connection
		containerEl.createEl("h2", { text: "Connection" });

		new Setting(containerEl)
			.setName("Confluence Domain")
			.setDesc('Your Confluence domain (e.g., "https://mysite.atlassian.net")')
			.addText((text) =>
				text
					.setPlaceholder("https://mysite.atlassian.net")
					.setValue(this.plugin.settings.confluenceBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.confluenceBaseUrl = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Atlassian Username")
			.setDesc('Your Atlassian account email (e.g., "username@domain.com")')
			.addText((text) =>
				text
					.setPlaceholder("username@domain.com")
					.setValue(this.plugin.settings.atlassianUserName)
					.onChange(async (value) => {
						this.plugin.settings.atlassianUserName = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Atlassian API Token")
			.setDesc("Your Atlassian API token (kept secure in your vault)")
			.addText((text) =>
				text
					.setPlaceholder("Enter your API token")
					.setValue(this.plugin.settings.atlassianApiToken)
					.onChange(async (value) => {
						this.plugin.settings.atlassianApiToken = value;
						await this.plugin.saveSettings();
					}),
			);

		// containerEl.createEl("hr");

		// Publishing
		containerEl.createEl("h2", { text: "Publishing" });

		new Setting(containerEl)
			.setName("Confluence Parent Page ID")
			.setDesc("Page ID under which your content will be published")
			.addText((text) =>
				text
					.setPlaceholder("23232345645")
					.setValue(this.plugin.settings.confluenceParentId)
					.onChange(async (value) => {
						this.plugin.settings.confluenceParentId = value;
						await this.plugin.saveSettings();
					}),
			);

		const folderSetting = new Setting(containerEl)
			.setName("Folder to publish")
			.setDesc(
				"Specify the folder containing files to publish. Files can be excluded using YAML frontmatter."
			)
			.addText((text) => {
				const textComponent = text
					.setPlaceholder("my-confluence-content")
					.setValue(this.plugin.settings.folderToPublish)
					.onChange(async (value) => {
						// Check if folder exists
						const folderExists = this.app.vault.getAbstractFileByPath(value) !== null;

						// Update UI based on validation
						if (value && !folderExists) {
							textComponent.inputEl.addClass("is-invalid");
							folderValidationEl.setText("⚠️ This folder doesn't exist in your vault");
							folderValidationEl.show();
						} else {
							textComponent.inputEl.removeClass("is-invalid");
							folderValidationEl.hide();
						}

						// Still save the value (user might create the folder later)
						this.plugin.settings.folderToPublish = value;
						await this.plugin.saveSettings();
					});

				return textComponent;
			});

		// Add validation message element
		const folderValidationEl = folderSetting.descEl.createDiv("validation-error");
		folderValidationEl.addClass("setting-item-description");
		folderValidationEl.addClass("text-error");
		folderValidationEl.style.marginTop = "8px";
		folderValidationEl.hide();

		// Validate on initial load
		if (this.plugin.settings.folderToPublish) {
			const folderExists = this.app.vault.getAbstractFileByPath(this.plugin.settings.folderToPublish) !== null;
			if (!folderExists) {
				const textComponent = folderSetting.components[0] as TextComponent;
				if (textComponent?.inputEl) {
					textComponent.inputEl.addClass("is-invalid");
					folderValidationEl.setText("⚠️ This folder doesn't exist in your vault");
					folderValidationEl.show();
				}
			}
		}

		// containerEl.createEl("hr");

		// Display
		containerEl.createEl("h2", { text: "Display" });

		new Setting(containerEl)
			.setName("Use first header as page title")
			.setDesc("When enabled, the first heading in the file will be used as the Confluence page title instead of the filename")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.firstHeadingPageTitle)
					.onChange(async (value) => {
						this.plugin.settings.firstHeadingPageTitle = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Mermaid Diagram Theme")
			.setDesc("Select the theme to apply to mermaid diagrams in your Confluence pages")
			.addDropdown((dropdown) => {
				/* eslint-disable @typescript-eslint/naming-convention */
				dropdown
					.addOptions({
						"match-obsidian": "Match Obsidian",
						"light-obsidian": "Obsidian Theme - Light",
						"dark-obsidian": "Obsidian Theme - Dark",
						default: "Mermaid - Default",
						neutral: "Mermaid - Neutral",
						dark: "Mermaid - Dark",
						forest: "Mermaid - Forest",
					})
					.setValue(this.plugin.settings.mermaidTheme)
					.onChange(async (value) => {
						// @ts-expect-error
						this.plugin.settings.mermaidTheme = value;
						await this.plugin.saveSettings();
					});
				/* eslint-enable @typescript-eslint/naming-convention */
			});

		// Add a footer with helpful information
		containerEl.createEl("div", {
			text: "Need help? Refer to the plugin documentation or create an issue on GitHub.",
			cls: "setting-item-description",
		});
	}
}
