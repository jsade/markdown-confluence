import {
	ConfluencePageConfig,
	ConfluenceUploadSettings,
	MermaidRendererPlugin,
	Publisher,
	RequiredConfluenceClient,
	SettingsLoader,
	UploadAdfFileResult
} from "@markdown-confluence/lib";
import { ElectronMermaidRenderer } from "@markdown-confluence/mermaid-electron-renderer";
import { Mermaid } from "mermaid";
import { App, MarkdownView, Notice, Plugin, PluginManifest, Workspace, loadMermaid } from "obsidian";
import ObsidianAdaptor from "./adaptors/obsidian";
import { CompletedModal } from "./CompletedModal";
import {
	ConfluencePerPageForm,
	ConfluencePerPageUIValues,
	mapFrontmatterToConfluencePerPageUIValues,
} from "./ConfluencePerPageForm";
import { ConfluenceSettingTab } from "./ConfluenceSettingTab";
import { ObsidianConfluenceClient } from "./MyBaseClient";
import { LogLevel, Logger } from "./utils";
import { ObsidianLoggerAdapter } from "./utils/LoggerAdapter";

export interface ObsidianPluginSettings
	extends ConfluenceUploadSettings.ConfluenceSettings {
	mermaidTheme:
	| "match-obsidian"
	| "light-obsidian"
	| "dark-obsidian"
	| "default"
	| "neutral"
	| "dark"
	| "forest";
	logLevel: LogLevel;
	publishingMode: "legacy" | "frontmatter";
}

interface FailedFile {
	fileName: string;
	reason: string;
}

interface UploadResults {
	errorMessage: string | null;
	failedFiles: FailedFile[];
	filesUploadResult: UploadAdfFileResult[];
}

class ObsidianSettingsLoader extends SettingsLoader {
	private settings: ObsidianPluginSettings;

	constructor(settings: ObsidianPluginSettings) {
		super();
		this.settings = settings;
	}

	override load() {
		return this.settings;
	}

	override loadPartial() {
		return this.settings;
	}
}

export default class ConfluencePlugin extends Plugin {
	settings!: ObsidianPluginSettings;
	private isSyncing = false;
	workspace!: Workspace;
	publisher!: Publisher;
	adaptor!: ObsidianAdaptor;
	private logger: Logger;

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);
		this.logger = Logger.createDefault();
	}

	activeLeafPath(workspace: Workspace): string | undefined {
		return workspace.getActiveViewOfType(MarkdownView)?.file?.path;
	}

	async init() {
		this.logger.debug("Initializing plugin");
		await this.loadSettings();

		this.logger.updateOptions({
			minLevel: this.settings.logLevel
		});

		this.logger.info(`Initializing with publishing mode: ${this.settings.publishingMode}`);
		if (this.settings.publishingMode === "frontmatter") {
			this.logger.info("Using Frontmatter mode - Content will be published based on PSF Folder Notes with connie-parent-page-id");
		} else {
			this.logger.info(`Using Legacy mode - Publishing from folder: ${this.settings.folderToPublish} to parent page ID: ${this.settings.confluenceParentId}`);
		}

		this.adaptor = new ObsidianAdaptor(
			this.app.vault,
			this.app.metadataCache,
			this.settings,
			this.app
		);

		// Create a logger adapter for the lib package
		const libLogger = new ObsidianLoggerAdapter(this.logger);

		// Create a settings loader with the current settings
		const settingsLoader = new ObsidianSettingsLoader(this.settings);

		// Create the Confluence client
		const confluenceClient = new ObsidianConfluenceClient({
			host: this.settings.confluenceBaseUrl || '',
			authentication: {
				basic: {
					email: this.settings.atlassianUserName || '',
					apiToken: this.settings.atlassianApiToken || ''
				}
			}
		});

		// Try to detect API v2 support
		try {
			this.logger.info("Checking for Confluence API v2 support");
			await confluenceClient.detectApiV2();
			this.logger.info(`Using Confluence API version: ${confluenceClient.apiVersion}`);
		} catch (error) {
			this.logger.warn("Failed to detect Confluence API version, defaulting to v1", error);
		}

		this.publisher = new Publisher(
			this.adaptor,
			settingsLoader,
			confluenceClient as RequiredConfluenceClient,
			[new MermaidRendererPlugin(new ElectronMermaidRenderer(
				[], // extraStyleSheets
				[], // extraStyles
				{ theme: this.settings.mermaidTheme } // mermaidConfig
			))],
			libLogger
		);

		this.logger.debug("Plugin initialized", {
			publishingMode: this.settings.publishingMode
		});
	}

	async getMermaidItems() {
		this.logger.debug("Getting Mermaid items");
		const extraStyles: string[] = [];
		const extraStyleSheets: string[] = [];
		let bodyStyles = "";
		const body = document.querySelector("body") as HTMLBodyElement;

		switch (this.settings.mermaidTheme) {
			case "default":
			case "neutral":
			case "dark":
			case "forest":
				return {
					extraStyleSheets,
					extraStyles,
					mermaidConfig: { theme: this.settings.mermaidTheme },
					bodyStyles,
				};
			case "match-obsidian":
				bodyStyles = body.className;
				break;
			case "dark-obsidian":
				bodyStyles = "theme-dark";
				break;
			case "light-obsidian":
				bodyStyles = "theme-dark";
				break;
			default:
				throw new Error("Missing theme");
		}

		extraStyleSheets.push("app://obsidian.md/app.css");

		// @ts-expect-error
		const cssTheme = this.app.vault?.getConfig("cssTheme") as string;
		if (cssTheme) {
			const fileExists = await this.app.vault.adapter.exists(
				`.obsidian/themes/${cssTheme}/theme.css`,
			);
			if (fileExists) {
				const themeCss = await this.app.vault.adapter.read(
					`.obsidian/themes/${cssTheme}/theme.css`,
				);
				extraStyles.push(themeCss);
			}
		}

		const cssSnippets =
			// @ts-expect-error
			(this.app.vault?.getConfig("enabledCssSnippets") as string[]) ?? [];
		for (const snippet of cssSnippets) {
			const fileExists = await this.app.vault.adapter.exists(
				`.obsidian/snippets/${snippet}.css`,
			);
			if (fileExists) {
				const themeCss = await this.app.vault.adapter.read(
					`.obsidian/snippets/${snippet}.css`,
				);
				extraStyles.push(themeCss);
			}
		}

		return {
			extraStyleSheets,
			extraStyles,
			mermaidConfig: (
				(await loadMermaid()) as Mermaid
			).mermaidAPI.getConfig(),
			bodyStyles,
		};
	}

	async doPublish(publishFilter?: string): Promise<UploadResults> {
		this.logger.info("Starting publication process", { publishFilter });

		// Show notice about publishing mode
		if (this.settings.publishingMode === "frontmatter") {
			new Notice("Publishing using Frontmatter mode - Using PSF Folder Notes with connie-parent-page-id");
		} else {
			new Notice(`Publishing using Legacy mode - From folder: ${this.settings.folderToPublish}`);
		}

		try {
			const adrFiles = await this.publisher.publish(publishFilter);

			const returnVal: UploadResults = {
				errorMessage: null,
				failedFiles: [],
				filesUploadResult: [],
			};

			adrFiles.forEach((element) => {
				if (element.successfulUploadResult) {
					returnVal.filesUploadResult.push(
						element.successfulUploadResult,
					);
					return;
				}

				returnVal.failedFiles.push({
					fileName: element.node.file.absoluteFilePath,
					reason: element.reason ?? "No Reason Provided",
				});
			});

			this.logger.info(`Publication complete. Results: ${returnVal.filesUploadResult.length} files uploaded, ${returnVal.failedFiles.length} failed`);
			return returnVal;
		} catch (error) {
			this.logger.error("Error during publication", error);
			return {
				errorMessage: error instanceof Error ? error.message : JSON.stringify(error),
				failedFiles: [],
				filesUploadResult: [],
			};
		}
	}

	override async onload() {
		this.logger.info("Loading Confluence plugin");
		await this.init();

		// Add ribbon icon for Confluence Publish
		this.addRibbonIcon(
			"cloud",
			"Publish All to Confluence",
			async () => {
				await this.publishAllToConfluence();
			},
		);

		// Add command to publish all notes
		this.addCommand({
			id: "publish-all-to-confluence",
			name: "Publish All to Confluence",
			hotkeys: [],
			callback: async () => {
				await this.publishAllToConfluence();
			},
		});

		// Add command to test PSF detection in frontmatter mode
		if (this.settings.publishingMode === "frontmatter") {
			this.addCommand({
				id: "test-psf-detection",
				name: "Debug: Test PSF Detection",
				hotkeys: [],
				callback: async () => {
					await this.testPSFDetection();
				},
			});

			// Add command to test API version detection
			this.addCommand({
				id: "test-api-version",
				name: "Debug: Test Confluence API Version",
				hotkeys: [],
				callback: async () => {
					await this.testApiVersion();
				},
			});
		}

		// Add command to publish open file
		this.addCommand({
			id: "publish-current",
			name: "Publish Current File to Confluence",
			checkCallback: (checking: boolean) => {
				if (!this.isSyncing) {
					if (!checking) {
						this.isSyncing = true;
						this.doPublish(this.activeLeafPath(this.workspace))
							.then((stats) => {
								new CompletedModal(this.app, {
									uploadResults: stats,
								}).open();
							})
							.catch((error) => {
								if (error instanceof Error) {
									new CompletedModal(this.app, {
										uploadResults: {
											errorMessage: error.message,
											failedFiles: [],
											filesUploadResult: [],
										},
									}).open();
								} else {
									new CompletedModal(this.app, {
										uploadResults: {
											errorMessage: JSON.stringify(error),
											failedFiles: [],
											filesUploadResult: [],
										},
									}).open();
								}
							})
							.finally(() => {
								this.isSyncing = false;
							});
					}
					return true;
				}
				return true;
			},
		});

		this.addCommand({
			id: "enable-publishing",
			name: "Enable publishing to Confluence",
			editorCheckCallback: (checking, _editor, view) => {
				if (!view.file) {
					return false;
				}

				if (checking) {
					const frontMatter = this.app.metadataCache.getCache(
						view.file.path,
					)?.frontmatter;
					const file = view.file;
					const enabledForPublishing =
						(file.path.startsWith(this.settings.folderToPublish) &&
							(!frontMatter ||
								frontMatter["connie-publish"] !== false)) ||
						(frontMatter && frontMatter["connie-publish"] === true);
					return !enabledForPublishing;
				}

				this.app.fileManager.processFrontMatter(
					view.file,
					(frontmatter) => {
						if (
							view.file &&
							view.file.path.startsWith(
								this.settings.folderToPublish,
							)
						) {
							delete frontmatter["connie-publish"];
						} else {
							frontmatter["connie-publish"] = true;
						}
					},
				);
				return true;
			},
		});

		this.addCommand({
			id: "disable-publishing",
			name: "Disable publishing to Confluence",
			editorCheckCallback: (checking, _editor, view) => {
				if (!view.file) {
					return false;
				}

				if (checking) {
					const frontMatter = this.app.metadataCache.getCache(
						view.file.path,
					)?.frontmatter;
					const file = view.file;
					const enabledForPublishing =
						(file.path.startsWith(this.settings.folderToPublish) &&
							(!frontMatter ||
								frontMatter["connie-publish"] !== false)) ||
						(frontMatter && frontMatter["connie-publish"] === true);
					return enabledForPublishing;
				}

				this.app.fileManager.processFrontMatter(
					view.file,
					(frontmatter) => {
						if (
							view.file &&
							view.file.path.startsWith(
								this.settings.folderToPublish,
							)
						) {
							frontmatter["connie-publish"] = false;
						} else {
							delete frontmatter["connie-publish"];
						}
					},
				);
				return true;
			},
		});

		this.addCommand({
			id: "page-settings",
			name: "Update Confluence Page Settings",
			editorCallback: (_editor, view) => {
				if (!view.file) {
					return false;
				}

				const frontMatter = this.app.metadataCache.getCache(
					view.file.path,
				)?.frontmatter;

				const file = view.file;

				new ConfluencePerPageForm(this.app, {
					config: ConfluencePageConfig.conniePerPageConfig,
					initialValues:
						mapFrontmatterToConfluencePerPageUIValues(frontMatter),
					onSubmit: (values, close) => {
						const valuesToSet: Partial<ConfluencePageConfig.ConfluencePerPageAllValues> =
							{};
						for (const propertyKey in values) {
							if (
								Object.prototype.hasOwnProperty.call(
									values,
									propertyKey,
								)
							) {
								const element =
									values[
									propertyKey as keyof ConfluencePerPageUIValues
									];
								if (element.isSet) {
									valuesToSet[
										propertyKey as keyof ConfluencePerPageUIValues
									] = element.value as never;
								}
							}
						}
						this.adaptor.updateMarkdownValues(
							file.path,
							valuesToSet,
						);
						close();
					},
				}).open();
				return true;
			},
		});

		this.addSettingTab(new ConfluenceSettingTab(this.app, this));

		this.logger.info("Confluence plugin loaded successfully");
	}

	override async onunload() {
		this.logger.info("Unloading Confluence plugin");
	}

	async loadSettings() {
		this.logger.debug("Loading plugin settings");
		this.settings = Object.assign(
			{
				...ConfluenceUploadSettings.DEFAULT_SETTINGS,
				atlassianApiToken: '',
				atlassianUserName: '',
				confluenceBaseUrl: '',
				confluenceParentId: '',
				rootPage: '',
				spaceKey: '',
				skipImages: false,
				debugMode: false,
				updateExistingImages: false,
				mermaidTheme: "match-obsidian",
				logLevel: LogLevel.SILENT,
				publishingMode: "legacy",
			},
			await this.loadData()
		);

		// Ensure publishingMode is set to a valid value
		if (!this.settings.publishingMode || !["legacy", "frontmatter"].includes(this.settings.publishingMode)) {
			this.logger.debug("Invalid or missing publishingMode, setting to legacy");
			this.settings.publishingMode = "legacy";
		}

		if (this.logger) {
			this.logger.updateOptions({
				minLevel: this.settings.logLevel as LogLevel
			});
		}
		this.logger.debug("Settings loaded successfully", {
			mode: this.settings.publishingMode
		});
	}

	async saveSettings() {
		this.logger.debug("Saving plugin settings");
		await this.saveData(this.settings);
		await this.init();
		this.logger.debug("Settings saved successfully");
	}

	async testPSFDetection() {
		this.logger.info("Testing PSF detection in frontmatter mode");

		if (this.settings.publishingMode !== "frontmatter") {
			new Notice("This command only works in Frontmatter Mode. Please change your Publishing Mode in settings.");
			return;
		}

		try {
			// Get PSFs
			const psfMap = await this.adaptor.findPSFsByFrontmatter();

			if (psfMap.size === 0) {
				new Notice("No PSFs found. Make sure you have Folder Notes with connie-parent-page-id frontmatter.");
				return;
			}

			// Show results in notice
			new Notice(`Found ${psfMap.size} PSFs. Check console for details.`);

			// Log detailed results
			this.logger.info(`Found ${psfMap.size} PSFs:`);
			for (const [folderPath, parentPageId] of psfMap.entries()) {
				this.logger.info(`- PSF: ${folderPath} -> Target Page ID: ${parentPageId}`);
			}

			// Get files that would be published
			const filesToUpload = await this.adaptor.getMarkdownFilesToUpload();
			this.logger.info(`Would publish ${filesToUpload.length} files:`);

			for (const file of filesToUpload) {
				const parentId = file.frontmatter["connie-parent-page-id"];
				this.logger.info(`- File: ${file.absoluteFilePath} -> Target Parent ID: ${parentId}`);
			}
		} catch (error) {
			this.logger.error("Error testing PSF detection:", error);
			new Notice(`Error testing PSF detection: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async testApiVersion() {
		this.logger.info("Testing Confluence API version detection");

		try {
			const client = new ObsidianConfluenceClient({
				host: this.settings.confluenceBaseUrl || '',
				authentication: {
					basic: {
						email: this.settings.atlassianUserName || '',
						apiToken: this.settings.atlassianApiToken || ''
					}
				}
			});

			// Try to detect API v2 support
			const hasApiV2 = await client.detectApiV2();

			if (hasApiV2) {
				const message = `Confluence API v2 is available! This means folder support is available.`;
				this.logger.info(message);
				new Notice(message);

				// Try to test folder endpoints specifically
				try {
					await client.fetch('/api/v2/spaces?limit=1', {
						headers: { Accept: 'application/json' }
					});

					const spaceMessage = 'Successfully accessed spaces via API v2';
					this.logger.info(spaceMessage);
					new Notice(spaceMessage);

				} catch (spaceError) {
					const errorMessage = `Error accessing API v2 spaces: ${spaceError instanceof Error ? spaceError.message : String(spaceError)}`;
					this.logger.error(errorMessage);
					new Notice(errorMessage);
				}
			} else {
				const message = `Confluence API v2 is NOT available. Folder support requires API v2.`;
				this.logger.warn(message);
				new Notice(message);
			}
		} catch (error) {
			const errorMessage = `Error testing API version: ${error instanceof Error ? error.message : String(error)}`;
			this.logger.error(errorMessage);
			new Notice(errorMessage);
		}
	}

	async publishAllToConfluence() {
		if (this.isSyncing) {
			new Notice("Publishing already in progress");
			return;
		}

		this.isSyncing = true;
		try {
			const stats = await this.doPublish();
			new CompletedModal(this.app, {
				uploadResults: stats,
			}).open();
		} catch (error) {
			if (error instanceof Error) {
				new CompletedModal(this.app, {
					uploadResults: {
						errorMessage: error.message,
						failedFiles: [],
						filesUploadResult: [],
					},
				}).open();
			} else {
				new CompletedModal(this.app, {
					uploadResults: {
						errorMessage: JSON.stringify(error),
						failedFiles: [],
						filesUploadResult: [],
					},
				}).open();
			}
		} finally {
			this.isSyncing = false;
		}
	}
}
