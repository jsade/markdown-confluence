import {
	BinaryFile,
	ConfluencePageConfig,
	ConfluenceUploadSettings,
	FilesToUpload,
	LoaderAdaptor,
	MarkdownFile,
} from "@markdown-confluence/lib";
import { lookup } from "mime-types";
import { App, MetadataCache, TFile, Vault } from "obsidian";
import { Logger, LogLevel } from "../utils";

export default class ObsidianAdaptor implements LoaderAdaptor {
	vault: Vault;
	metadataCache: MetadataCache;
	settings: ConfluenceUploadSettings.ConfluenceSettings;
	app: App;
	private logger: Logger;

	constructor(
		vault: Vault,
		metadataCache: MetadataCache,
		settings: ConfluenceUploadSettings.ConfluenceSettings,
		app: App,
	) {
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.settings = settings;
		this.app = app;
		this.logger = Logger.createDefault();
		this.logger.updateOptions({
			prefix: "ObsidianAdaptor",
			minLevel: ('logLevel' in this.settings ? this.settings.logLevel as unknown as LogLevel : LogLevel.SILENT),
		});
	}

	async getMarkdownFilesToUpload(): Promise<FilesToUpload> {
		this.logger.debug(`Getting markdown files to upload using mode: ${this.settings.publishingMode}`);

		// Check publishing mode from settings and call appropriate method
		if (this.settings.publishingMode === "frontmatter") {
			return this.getFrontmatterModeMarkdownFilesToUpload();
		} else {
			// Default to legacy mode
			return this.getLegacyMarkdownFilesToUpload();
		}
	}

	async getLegacyMarkdownFilesToUpload(): Promise<FilesToUpload> {
		const files = this.vault.getMarkdownFiles();
		this.logger.debug(`Found ${files.length} total markdown files in vault`);
		const filesToPublish = [];
		for (const file of files) {
			try {
				if (file.path.endsWith(".excalidraw")) {
					this.logger.debug(`Skipping excalidraw file: ${file.path}`);
					continue;
				}

				const fileFM = this.metadataCache.getCache(file.path);
				if (!fileFM) {
					this.logger.warn(`Missing file in metadata cache: ${file.path}`);
					throw new Error("Missing File in Metadata Cache");
				}
				const frontMatter = fileFM.frontmatter;

				if (
					(file.path.startsWith(this.settings.folderToPublish) &&
						(!frontMatter ||
							frontMatter["connie-publish"] !== false)) ||
					(frontMatter && frontMatter["connie-publish"] === true)
				) {
					this.logger.debug(`Adding file to publish: ${file.path}`);
					filesToPublish.push(file);
				} else {
					this.logger.debug(`Skipping file: ${file.path}`);
				}
			} catch (error) {
				this.logger.error(`Error processing file: ${error instanceof Error ? error.message : String(error)}`);
				//ignore
			}
		}
		this.logger.info(`Found ${filesToPublish.length} files to publish`);
		const filesToUpload = [];

		for (const file of filesToPublish) {
			const markdownFile = await this.loadMarkdownFile(file.path);
			filesToUpload.push(markdownFile);
		}

		return filesToUpload;
	}

	async getFrontmatterModeMarkdownFilesToUpload(): Promise<FilesToUpload> {
		this.logger.info("Using frontmatter mode to find files to upload");
		const filesForUpload: MarkdownFile[] = [];
		const psfMap = await this.findPSFsByFrontmatter();

		if (psfMap.size === 0) {
			this.logger.warn("No PSF Folder Notes found. No files will be published.");
			return filesForUpload;
		}

		// First, sort PSFs by path length to handle nested PSFs correctly
		// This ensures parent PSFs are processed before child PSFs
		const sortedPSFs = Array.from(psfMap.entries()).sort((a, b) => a[0].length - b[0].length);

		// Keep track of which files are assigned to PSFs to avoid duplicates
		const assignedFiles = new Set<string>();

		// Process each PSF
		for (const [folderPath, parentPageId] of sortedPSFs) {
			this.logger.debug(`Processing PSF: ${folderPath} (Target Page ID: ${parentPageId})`);

			// 1. First include the PSF Folder Note itself
			const folderName = folderPath.substring(folderPath.lastIndexOf('/') + 1);
			const folderNotePath = `${folderPath}/${folderName}.md`;

			try {
				const folderNote = await this.loadMarkdownFile(folderNotePath);
				// The folder note already has the connie-parent-page-id frontmatter
				filesForUpload.push(folderNote);
				assignedFiles.add(folderNotePath);
				this.logger.debug(`Added PSF Folder Note: ${folderNotePath}`);
			} catch (error) {
				this.logger.error(`Error loading PSF Folder Note ${folderNotePath}:`, error);
			}

			// 2. Get all markdown files in this PSF
			const allMarkdownFiles = this.vault.getMarkdownFiles();
			const psfFiles = allMarkdownFiles.filter(file => {
				// Conditions to include a file:
				// 1. It's in the PSF folder
				// 2. It's not already assigned to another PSF
				// 3. It's not an excalidraw file
				// 4. It's not in a child PSF (handled in a later iteration)
				return file.path.startsWith(folderPath + '/') &&
					!assignedFiles.has(file.path) &&
					!file.path.endsWith('.excalidraw');
			});

			// 3. Check if any file is in a child PSF (to exclude it)
			const childPSFs = sortedPSFs.filter(([path, _]) =>
				path !== folderPath && path.startsWith(folderPath + '/'));

			// Process each file in this PSF
			for (const file of psfFiles) {
				// Skip if this file is in a child PSF
				const isInChildPSF = childPSFs.some(([childPath, _]) =>
					file.path.startsWith(childPath + '/'));

				if (isInChildPSF) {
					this.logger.debug(`Skipping file in child PSF: ${file.path}`);
					continue;
				}

				// Skip folder note if already processed
				if (file.path === folderNotePath) {
					continue;
				}

				try {
					const markdownFile = await this.loadMarkdownFile(file.path);

					// Override parent page ID if not explicitly set in the file's frontmatter
					// This allows individual files to override the PSF's parent page ID if needed
					if (!markdownFile.frontmatter['connie-parent-page-id']) {
						markdownFile.frontmatter['connie-parent-page-id'] = parentPageId;
					}

					filesForUpload.push(markdownFile);
					assignedFiles.add(file.path);
					this.logger.debug(`Added file: ${file.path}`);
				} catch (error) {
					this.logger.error(`Error processing file ${file.path}:`, error);
				}
			}
		}

		this.logger.info(`Found ${filesForUpload.length} files to publish in frontmatter mode`);
		return filesForUpload;
	}

	async loadMarkdownFile(absoluteFilePath: string): Promise<MarkdownFile> {
		this.logger.debug(`Loading markdown file: ${absoluteFilePath}`);
		const file = this.app.vault.getAbstractFileByPath(absoluteFilePath);
		if (!(file instanceof TFile)) {
			throw new Error("Not a TFile");
		}

		const fileFM = this.metadataCache.getCache(file.path);
		if (!fileFM) {
			throw new Error("Missing File in Metadata Cache");
		}
		const frontMatter = fileFM.frontmatter;

		const parsedFrontMatter: Record<string, unknown> = {};
		if (frontMatter) {
			for (const [key, value] of Object.entries(frontMatter)) {
				parsedFrontMatter[key] = value;
			}
		}

		return {
			pageTitle: file.basename,
			folderName: file.parent?.name ?? "",
			absoluteFilePath: file.path,
			fileName: file.name,
			contents: await this.vault.cachedRead(file),
			frontmatter: parsedFrontMatter,
		};
	}

	async readBinary(
		path: string,
		referencedFromFilePath: string,
	): Promise<BinaryFile | false> {
		this.logger.debug(`Reading binary file: ${path} (referenced from ${referencedFromFilePath})`);
		const testing = this.metadataCache.getFirstLinkpathDest(
			path,
			referencedFromFilePath,
		);
		if (testing) {
			const files = await this.vault.readBinary(testing);
			const mimeType =
				lookup(testing.extension) || "application/octet-stream";
			return {
				contents: files,
				filePath: testing.path,
				filename: testing.name,
				mimeType: mimeType,
			};
		}

		return false;
	}
	async updateMarkdownValues(
		absoluteFilePath: string,
		values: Partial<ConfluencePageConfig.ConfluencePerPageAllValues>,
	): Promise<void> {
		this.logger.debug(`Updating markdown values for: ${absoluteFilePath}`, values);
		const config = ConfluencePageConfig.conniePerPageConfig;
		const file = this.app.vault.getAbstractFileByPath(absoluteFilePath);
		if (file instanceof TFile) {
			this.app.fileManager.processFrontMatter(file, (fm) => {
				for (const propertyKey in config) {
					if (!config.hasOwnProperty(propertyKey)) {
						continue;
					}

					const { key } =
						config[
						propertyKey as keyof ConfluencePageConfig.ConfluencePerPageConfig
						];
					const value =
						values[
						propertyKey as keyof ConfluencePageConfig.ConfluencePerPageAllValues
						];
					if (propertyKey in values) {
						fm[key] = value;
					}
				}
			});
		}
	}

	async findPSFsByFrontmatter(): Promise<Map<string, string>> {
		const allMarkdownFiles = this.vault.getMarkdownFiles();
		const psfMap = new Map<string, string>();
		this.logger.debug(`Scanning ${allMarkdownFiles.length} markdown files for PSF Folder Notes...`);

		// Find all Folder Notes with connie-parent-page-id
		for (const file of allMarkdownFiles) {
			const filePath = file.path;
			const metadata = this.metadataCache.getCache(filePath);

			if (metadata?.frontmatter?.['connie-parent-page-id']) {
				const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
				const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
				const folderName = folderPath.substring(folderPath.lastIndexOf('/') + 1);
				this.logger.debug(`Found file with connie-parent-page-id: ${fileName} (${filePath}) with parent page ID: ${metadata.frontmatter['connie-parent-page-id']}`);

				// Check if this is a Folder Note (filename matches folder name)
				if (fileName === `${folderName}.md`) {
					this.logger.info(`Found PSF Folder Note: ${folderPath} with parent page ID: ${metadata.frontmatter['connie-parent-page-id']}`);
					psfMap.set(folderPath, metadata.frontmatter['connie-parent-page-id']);
				} else {
					this.logger.debug(`File ${filePath} has connie-parent-page-id but is not a Folder Note (${fileName} != ${folderName}.md)`);
				}
			}
		}

		if (psfMap.size === 0) {
			this.logger.warn("No PSF Folder Notes found. Make sure to create folder notes with the connie-parent-page-id frontmatter.");
		} else {
			this.logger.info(`Found ${psfMap.size} PSF Folder Notes: ${Array.from(psfMap.keys()).join(', ')}`);
		}

		return psfMap;
	}
}
