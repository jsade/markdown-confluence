import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { ADFProcessingPlugin } from "./ADFProcessingPlugins/types";
import { adfEqual } from "./AdfEqual";
import { PageContentType } from "./ConniePageConfig";
import { ConsoleLogger, ILogger } from './ILogger';
import { SettingsLoader } from "./SettingsLoader";
import { ensureAllFilesExistInConfluence } from "./TreeConfluence";
import { createFolderStructure as createLocalAdfTree } from "./TreeLocal";
import { LoaderAdaptor, RequiredConfluenceClient } from "./adaptors";
import { isEqual } from "./isEqual";

export interface LocalAdfFileTreeNode {
	name: string;
	children: LocalAdfFileTreeNode[];
	file?: LocalAdfFile;
}

interface FilePublishResult {
	successfulUploadResult?: UploadAdfFileResult;
	node: ConfluenceNode;
	reason?: string;
}

export interface LocalAdfFile {
	folderName: string;
	absoluteFilePath: string;
	fileName: string;
	contents: JSONDocNode;
	pageTitle: string;
	frontmatter: {
		[key: string]: unknown;
	};
	tags: string[];
	pageId: string | undefined;
	parentPageId?: string | undefined;
	parentFolderId?: string | undefined;
	dontChangeParentPageId: boolean;
	contentType: PageContentType;
	blogPostDate: string | undefined;
}

export interface ConfluenceAdfFile {
	folderName: string;
	absoluteFilePath: string;
	fileName: string;
	contents: JSONDocNode;
	pageTitle: string;
	frontmatter: {
		[key: string]: unknown;
	};
	tags: string[];
	dontChangeParentPageId: boolean;

	pageId: string;
	spaceKey: string;
	pageUrl: string;

	parentPageId?: string | undefined;
	parentFolderId?: string | undefined;

	contentType: PageContentType;
	blogPostDate: string | undefined;
}

interface ConfluencePageExistingData {
	adfContent: JSONDocNode;
	pageTitle: string;
	ancestors: Array<{ id: string }>;
	contentType: string;
}

export interface ConfluenceNode {
	file: ConfluenceAdfFile;
	version: number;
	lastUpdatedBy: string;
	existingPageData: ConfluencePageExistingData;
	ancestors: Array<{ id: string }>;
}

export interface ConfluenceTreeNode {
	file: ConfluenceAdfFile;
	version: number;
	lastUpdatedBy: string;
	existingPageData: ConfluencePageExistingData;
	children: ConfluenceTreeNode[];
}

export interface UploadAdfFileResult {
	adfFile: ConfluenceAdfFile;
	contentResult: "same" | "updated";
	imageResult: "same" | "updated";
	labelResult: "same" | "updated" | "error";
}

interface ConfluenceClientWithApiVersion {
	apiVersion?: 'v1' | 'v2';
	v2?: {
		folders?: {
			getFolderById: (id: string) => Promise<Record<string, unknown>>;
			createFolder: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
			updateFolder?: (id: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;
		};
	};
}

export class Publisher {
	private confluenceClient: RequiredConfluenceClient;
	private adaptor: LoaderAdaptor;
	private myAccountId: string | undefined;
	private settingsLoader: SettingsLoader;
	private logger: ILogger;

	constructor(
		adaptor: LoaderAdaptor,
		settingsLoader: SettingsLoader,
		confluenceClient: RequiredConfluenceClient,
		// @ts-expect-error - Parameter is required for API compatibility but not used
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		adfProcessingPlugins: ADFProcessingPlugin<unknown, unknown>[],
		logger: ILogger = new ConsoleLogger(),
	) {
		this.adaptor = adaptor;
		this.confluenceClient = confluenceClient;
		this.settingsLoader = settingsLoader;
		this.logger = logger;
	}

	async publish(publishFilter?: string) {
		const settings = this.settingsLoader.load();
		this.logger.info("Starting publish process with settings:", JSON.stringify(settings, null, 2));

		try {
			if (!this.myAccountId) {
				this.logger.info("Fetching current user information");
				try {
					const currentUser = await this.confluenceClient.users.getCurrentUser();
					this.myAccountId = currentUser.accountId;
					this.logger.info(`Current user account ID: ${this.myAccountId}`);
				} catch (error) {
					this.logger.error("Error fetching current user:", error instanceof Error ? error.message : String(error));
					if (error instanceof Error && 'response' in error) {
						this.logger.error("API response error details:", JSON.stringify(error.response, null, 2));
					}
					throw error;
				}
			}

			// In legacy mode, use the global parent page ID
			// In frontmatter mode, parentPageId will be set per file in the adaptor
			const isLegacyMode = !settings.publishingMode || settings.publishingMode === "legacy";
			const globalParentPageId = settings.confluenceParentId;

			this.logger.info(`Publishing mode: ${isLegacyMode ? 'legacy' : 'frontmatter'}`);
			if (isLegacyMode) {
				this.logger.info(`Using global parent page ID: ${globalParentPageId}`);
			}

			// Only fetch parent page info in legacy mode
			let spaceToPublishTo;
			if (isLegacyMode) {
				this.logger.info(`Fetching parent page info for ID: ${globalParentPageId}`);
				try {
					const parentPage = await this.confluenceClient.content.getContentById({
						id: globalParentPageId,
						expand: ["body.atlas_doc_format", "space"],
					});
					if (!parentPage.space) {
						throw new Error("Missing Space Key");
					}
					spaceToPublishTo = parentPage.space;
					this.logger.info(`Publishing to space: ${spaceToPublishTo.key}`);
				} catch (error) {
					this.logger.error(`Error fetching parent page (ID: ${globalParentPageId}):`, error instanceof Error ? error.message : String(error));
					if (error instanceof Error && 'response' in error) {
						this.logger.error("API response error details:", JSON.stringify(error.response, null, 2));
					}
					throw error;
				}
			} else {
				// In frontmatter mode, we need to find a valid page to get the space
				// We never use the global parent page ID in frontmatter mode!!!
				try {
					this.logger.info("Frontmatter mode: attempting to determine space to publish to");

					// Try to use files with parent page IDs if we can access them
					let parentPageIds: string[] = [];
					try {
						// Check if the adaptor has a method to find PSFs
						// This is Obsidian-specific and might not be available in all adaptors
						if ('findPSFsByFrontmatter' in this.adaptor && typeof this.adaptor.findPSFsByFrontmatter === 'function') {
							this.logger.info("Attempting to collect parent page IDs from PSF Folder Notes");
							// The adaptor may have the findPSFsByFrontmatter method, but we need to cast it to handle it properly
							interface AdaptorWithPSFs extends LoaderAdaptor {
								findPSFsByFrontmatter(): Promise<Map<string, string>>;
							}
							const psfMap = await (this.adaptor as AdaptorWithPSFs).findPSFsByFrontmatter();
							parentPageIds = Array.from(psfMap.values())
								.filter((id): id is string => typeof id === 'string' && id.trim() !== '');
							this.logger.info(`Found ${parentPageIds.length} parent page IDs in PSF Folder Notes`);
						}
					} catch (psfError) {
						this.logger.warn("Could not collect parent page IDs from files:", psfError instanceof Error ? psfError.message : String(psfError));
						parentPageIds = [];
					}

					// Try to get space from any valid parent page ID
					let spaceFound = false;

					// First check all parent page IDs from files
					for (const parentId of parentPageIds) {
						if (spaceFound) break;

						try {
							this.logger.info(`Trying to get space from parent page ID: ${parentId}`);
							const parentPage = await this.confluenceClient.content.getContentById({
								id: parentId,
								expand: ["space"],
							});

							if (parentPage && parentPage.space) {
								spaceToPublishTo = parentPage.space;
								this.logger.info(`Found space from parent page ID ${parentId}: ${spaceToPublishTo.key}`);
								spaceFound = true;
							}
						} catch (error) {
							this.logger.warn(`Could not fetch parent page with ID ${parentId}: ${error instanceof Error ? error.message : String(error)}`);
						}
					}


					// If we still don't have a space, try to get it from any page
					if (!spaceFound) {

						throw new Error("No space found from parent pages");
					}
				} catch (error) {
					this.logger.error("Error in frontmatter mode space determination:", error instanceof Error ? error.message : String(error));
					if (error instanceof Error && 'response' in error) {
						this.logger.error("API response error details:", JSON.stringify(error.response, null, 2));
					}
					throw error;
				}
			}

			this.logger.info("Fetching files to upload");
			let files;
			try {
				files = await this.adaptor.getMarkdownFilesToUpload();
				this.logger.info(`Found ${files.length} files to upload`);
			} catch (error) {
				this.logger.error("Error fetching files to upload:", error instanceof Error ? error.message : String(error));
				throw error;
			}

			this.logger.info("Creating folder structure");
			const folderTree = createLocalAdfTree(files, settings);

			let confluencePagesToPublish;

			// Make sure we have a space to publish to
			if (!spaceToPublishTo || !spaceToPublishTo.key) {
				const errorMsg = "Failed to determine a valid Confluence space to publish to";
				this.logger.error(errorMsg);
				throw new Error(errorMsg);
			}

			const spaceKey = spaceToPublishTo.key;
			this.logger.info(`Publishing to space: ${spaceKey}`);

			if (isLegacyMode) {
				// In legacy mode, use the global parent page ID for both parameters
				this.logger.info(`Ensuring files exist in Confluence (legacy mode) with parent page ID: ${globalParentPageId}`);
				try {
					confluencePagesToPublish = await ensureAllFilesExistInConfluence(
						this.confluenceClient,
						this.adaptor,
						folderTree,
						spaceKey,
						globalParentPageId,
						globalParentPageId,
						settings,
					);
					this.logger.info(`Found ${confluencePagesToPublish.length} pages to publish in Confluence`);
				} catch (error) {
					this.logger.error("Error ensuring files exist in Confluence (legacy mode):", error instanceof Error ? error.message : String(error));
					if (error instanceof Error && 'response' in error) {
						this.logger.error("API response error details:", JSON.stringify(error.response, null, 2));
					}
					throw error;
				}
			} else {
				// In frontmatter mode, we use null as the root parent
				// This allows each file to use its own parent page ID from the frontmatter
				this.logger.info("Using frontmatter mode - respecting connie-parent-page-id in each file");
				try {
					confluencePagesToPublish = await ensureAllFilesExistInConfluence(
						this.confluenceClient,
						this.adaptor,
						folderTree,
						spaceKey,
						null, // Don't force a specific root parent in frontmatter mode
						null, // Don't force a specific parent ID in frontmatter mode
						settings,
					);
					this.logger.info(`Found ${confluencePagesToPublish.length} pages to publish in Confluence (frontmatter mode)`);
				} catch (error) {
					this.logger.error("Error ensuring files exist in Confluence (frontmatter mode):", error instanceof Error ? error.message : String(error));
					if (error instanceof Error && 'response' in error) {
						this.logger.error("API response error details:", JSON.stringify(error.response, null, 2));
					}
					throw error;
				}
			}

			if (publishFilter) {
				this.logger.info(`Filtering pages by path: ${publishFilter}`);
				confluencePagesToPublish = confluencePagesToPublish.filter(
					(file) => file.file.absoluteFilePath === publishFilter,
				);
				this.logger.info(`After filtering: ${confluencePagesToPublish.length} pages to publish`);
			}

			this.logger.info(`Publishing ${confluencePagesToPublish.length} files to Confluence`);
			const adrFileTasks = confluencePagesToPublish.map((file) => {
				return this.publishFile(file);
			});

			const adrFiles = await Promise.all(adrFileTasks);

			// Log summary of results
			const successful = adrFiles.filter(result => result.successfulUploadResult).length;
			const failed = adrFiles.filter(result => result.reason).length;
			this.logger.info(`Publish complete. Results: ${successful} successful, ${failed} failed`);

			// Log failed files
			if (failed > 0) {
				this.logger.error("Failed files:");
				adrFiles.forEach(result => {
					if (result.reason) {
						this.logger.error(`- ${result.node.file.absoluteFilePath}: ${result.reason}`);
					}
				});
			}

			return adrFiles;
		} catch (error) {
			this.logger.error("Unexpected error during publish process:", error instanceof Error ? error.message : String(error));
			if (error instanceof Error && 'response' in error) {
				this.logger.error("API response error details:", JSON.stringify(error.response, null, 2));
			}
			throw error;
		}
	}

	private async publishFile(
		node: ConfluenceNode,
	): Promise<FilePublishResult> {
		this.logger.info(`Publishing file: ${node.file.absoluteFilePath}`);
		try {
			const successfulUploadResult = await this.updatePageContent(
				node.ancestors,
				node.version,
				node.existingPageData,
				node.file,
				node.lastUpdatedBy,
			);

			this.logger.info(`Successfully published: ${node.file.absoluteFilePath} (content: ${successfulUploadResult.contentResult}, images: ${successfulUploadResult.imageResult}, labels: ${successfulUploadResult.labelResult})`);
			return {
				node,
				successfulUploadResult,
			};
		} catch (e: unknown) {
			this.logger.error(`Error publishing file ${node.file.absoluteFilePath}:`, e instanceof Error ? e.message : String(e));

			// Log more detailed error information
			if (e instanceof Error) {
				if ('response' in e) {
					// This is likely an Axios or similar API error
					this.logger.error("API response error details:", JSON.stringify(e.response, null, 2));
				}
				if (e.stack) {
					this.logger.error("Error stack trace:", e.stack);
				}

				return {
					node,
					reason: e.message,
				};
			}

			return {
				node,
				reason: JSON.stringify(e), // TODO: Understand why this doesn't show error message properly
			};
		}
	}

	private async updatePageContent(
		ancestors: Array<{ id: string }>,
		pageVersionNumber: number,
		existingPageData: ConfluencePageExistingData,
		adfFile: ConfluenceAdfFile,
		lastUpdatedBy: string,
	): Promise<UploadAdfFileResult> {
		this.logger.debug(`Updating page content for: ${adfFile.absoluteFilePath}, page ID: ${adfFile.pageId}`);
		this.logger.info(`Content type: ${adfFile.contentType}, existing content type: ${existingPageData.contentType}`);
		this.logger.info(`API version check: ${'apiVersion' in this.confluenceClient ? (this.confluenceClient as unknown as ConfluenceClientWithApiVersion).apiVersion : 'not available'}`);

		if (lastUpdatedBy !== this.myAccountId && lastUpdatedBy !== null && lastUpdatedBy !== '') {
			const errorMsg = `Page last updated by another user. Won't publish over their changes. MyAccountId: ${this.myAccountId}, Last Updated By: ${lastUpdatedBy}`;
			this.logger.error(errorMsg);
			throw new Error(errorMsg);
		}

		// Check if we're using API v2
		const confluenceClientWithV2 = this.confluenceClient as unknown as ConfluenceClientWithApiVersion;
		const isV2Api = 'apiVersion' in this.confluenceClient && confluenceClientWithV2.apiVersion === 'v2';
		this.logger.info(`Is using API v2: ${isV2Api}, apiVersion: ${confluenceClientWithV2.apiVersion || 'not set'}`);

		// For folders in API v2, we don't validate content type as they use dedicated endpoints
		if (adfFile.contentType === 'folder' && isV2Api) {
			this.logger.info(`Using API v2 for folder: ${adfFile.pageTitle} (folder ID: ${adfFile.pageId})`);
			this.logger.info(`Skipping content type validation for folder with API v2`);
		} else if (existingPageData.contentType !== adfFile.contentType) {
			const errorMsg = `Cannot convert between content types. From ${existingPageData.contentType} to ${adfFile.contentType}`;
			this.logger.error(errorMsg);
			throw new Error(errorMsg);
		}

		const result: UploadAdfFileResult = {
			adfFile,
			contentResult: "same",
			imageResult: "same",
			labelResult: "same",
		};

		const adfToUpload = adfFile.contents;

		// Process PDF files first
		// ...

		// Check if this is a folder and we're using API v2 - folders require special handling
		if (adfFile.contentType === 'folder' && isV2Api) {
			// Folders don't have content to update in v2, just handle title and parent if needed
			this.logger.info(`Handling folder update for: ${adfFile.pageTitle} (ID: ${adfFile.pageId})`);

			if (isV2Api && 'v2' in this.confluenceClient) {
				this.logger.info(`Using API v2 folder endpoints for folder: ${adfFile.pageTitle}`);

				if (confluenceClientWithV2.v2?.folders) {
					this.logger.info(`v2.folders methods available: ${Object.keys(confluenceClientWithV2.v2.folders).join(', ')}`);

					// Determine if we need to update the folder (title or parent changed)
					const titleChanged = adfFile.pageTitle !== existingPageData.pageTitle;

					// We only handle parent ID during creation, not updates per requirement
					// However, check if we have the updateFolder method available for future use
					if (titleChanged && 'updateFolder' in confluenceClientWithV2.v2.folders) {
						this.logger.info(`Updating folder title from "${existingPageData.pageTitle}" to "${adfFile.pageTitle}"`);

						try {
							// Update only the title
							await confluenceClientWithV2.v2.folders.updateFolder(adfFile.pageId, {
								title: adfFile.pageTitle
							});

							result.contentResult = "updated";
							this.logger.info(`Folder title updated successfully for: ${adfFile.pageId}`);
						} catch (error) {
							this.logger.error(`Error updating folder: ${error instanceof Error ? error.message : String(error)}`);
							if (error instanceof Error && 'response' in error) {
								this.logger.error(`API error response: ${JSON.stringify((error as { response: unknown }).response, null, 2)}`);
							}
							throw error;
						}
					}

					// We're done with folder handling in v2
					return result;
				} else {
					this.logger.error(`v2.folders API is not available in the client! This will cause the "Type is not a custom content type : folder" error.`);
				}
			}
		}

		// Regular page content update logic for pages, blog posts, or folders in v1 API
		if (!adfEqual(adfToUpload, existingPageData.adfContent)) {
			this.logger.debug(`Content has changed for: ${adfFile.absoluteFilePath}`);

			// Check if the page title has changed
			const titleIsDifferent = adfFile.pageTitle !== existingPageData.pageTitle;

			// We need to pass the ancestors through otherwise Confluence returns a 400 error
			// If there are no ancestors it means the page is at the root of the space and we don't need to pass them
			interface ContentUpdateData {
				id: string;
				title: string;
				type: string;
				space: { key: string };
				version: { number: number };
				body: {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					atlas_doc_format: {
						value: string;
						representation: string;
					};
				};
				ancestors?: Array<{ id: string }>;
				blogpost?: { version: { when: string } };
			}

			const contentUpdateData: ContentUpdateData = {
				id: adfFile.pageId,
				title: adfFile.pageTitle,
				type: existingPageData.contentType,
				space: { key: adfFile.spaceKey },
				version: { number: pageVersionNumber + 1 },
				body: {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					atlas_doc_format: {
						value: JSON.stringify(adfToUpload),
						representation: "atlas_doc_format",
					},
				},
			};

			// Handle the parent page/folder ID for the content update
			// Only set ancestors if the dontChangeParentPageId flag is false
			if (!adfFile.dontChangeParentPageId) {
				// Determine the appropriate parent ID based on content type and parentFolderId
				// A page cannot have both connie-parent-page-id AND connie-parent-folder-id per requirement
				let parentId: string | undefined;

				if (adfFile.parentPageId) {
					this.logger.debug(`Using parent page ID from frontmatter: ${adfFile.parentPageId}`);
					parentId = adfFile.parentPageId;
				}

				// If we have a parent ID, set it in the ancestors array
				if (parentId) {
					this.logger.debug(`Setting ancestors for update to: ${parentId}`);
					contentUpdateData.ancestors = [{ id: parentId }];
				} else if (ancestors.length > 0 && ancestors[0] !== undefined) {
					// Fall back to existing ancestors if we don't have a parent ID from frontmatter
					this.logger.debug(`Using existing ancestors for update: ${ancestors[0]}`);
					contentUpdateData.ancestors = [{ id: ancestors[0].id }];
				}
			} else {
				this.logger.debug(`Not changing parent page ID due to 'connie-dont-change-parent-page' flag`);
				// Preserve existing ancestry if flag is set
				if (ancestors.length > 0 && ancestors[0] !== undefined) {
					contentUpdateData.ancestors = [{ id: ancestors[0].id }];
				}
			}

			if (adfFile.blogPostDate) {
				contentUpdateData.blogpost = { version: { when: adfFile.blogPostDate } };
			}

			if (isEqual(JSON.stringify(adfToUpload), JSON.stringify(existingPageData.adfContent))) {
				// Only update version and/or title
				if (titleIsDifferent) {
					this.logger.debug(`Title has changed for: ${adfFile.absoluteFilePath}`);
					this.logger.debug(`Updating title from "${existingPageData.pageTitle}" to "${adfFile.pageTitle}"`);

					result.contentResult = "updated";

					this.logger.debug(`Updating content for: ${adfFile.absoluteFilePath}`);

					await this.confluenceClient.content.updateContent(contentUpdateData);
				} else {
					this.logger.debug(`Content has not changed for: ${adfFile.absoluteFilePath}`);
				}
			} else {
				this.logger.debug(`Content has changed for: ${adfFile.absoluteFilePath}`);
				result.contentResult = "updated";

				this.logger.debug(`Updating content for: ${adfFile.absoluteFilePath}`);

				await this.confluenceClient.content.updateContent(contentUpdateData);
			}
		} else {
			this.logger.debug(`Content has not changed for: ${adfFile.absoluteFilePath}`);
		}

		// Always ensure labels match, even if content hasn't changed
		await this.updateLabels(adfFile, result);

		return result;
	}

	/**
	 * Updates labels for a page or folder
	 */
	private async updateLabels(
		adfFile: ConfluenceAdfFile,
		result: UploadAdfFileResult
	): Promise<void> {
		try {
			this.logger.debug(`Getting current labels for: ${adfFile.pageId}`);
			const currentLabels = await this.confluenceClient.contentLabels.getLabelsForContent({
				id: adfFile.pageId,
			});

			// There is probably a nicer way to do this checking
			const currentLabelSet = new Set<string>();
			currentLabels.results.forEach((label: { name: string }) => currentLabelSet.add(label.name));

			const requiredLabelSet = new Set<string>(adfFile.tags);

			// Determine labels to add (required but not current)
			const labelsToAdd = [...requiredLabelSet].filter(
				(label) => !currentLabelSet.has(label)
			);

			// Determine labels to remove (current but not required)
			const labelsToRemove = [...currentLabelSet].filter(
				(label) => !requiredLabelSet.has(label)
			);

			if (labelsToAdd.length > 0 || labelsToRemove.length > 0) {
				result.labelResult = "updated";
			}

			// Add missing labels
			if (labelsToAdd.length > 0) {
				this.logger.debug(`Adding labels to ${adfFile.pageId}: ${labelsToAdd.join(", ")}`);
				await this.confluenceClient.contentLabels.addLabelsToContent({
					id: adfFile.pageId,
					body: labelsToAdd.map((label) => ({ prefix: 'global', name: label })),
				});
			}

			// Remove unnecessary labels
			for (const labelToRemove of labelsToRemove) {
				this.logger.debug(`Removing label from ${adfFile.pageId}: ${labelToRemove}`);
				await this.confluenceClient.contentLabels.removeLabelFromContentUsingQueryParameter({
					id: adfFile.pageId,
					name: labelToRemove,
				});
			}
		} catch (error) {
			this.logger.error(`Error updating labels: ${error instanceof Error ? error.message : String(error)}`);
			// Don't throw the error, as it's not critical for publication
			result.labelResult = "error";
		}
	}

	/** 
	 * @deprecated This method is not used and will be removed in a future version
	 */
	// @ts-expect-error - Method is kept for future reference but not used
	private async uploadPages(confluencePagesToPublish: ConfluenceNode[]): Promise<UploadAdfFileResult[]> {
		const results: UploadAdfFileResult[] = [];
		for (const page of confluencePagesToPublish) {
			const ancestors = page.ancestors;

			this.logger.debug(`Page has ${ancestors.length} ancestors: ${ancestors.map(a => a.id).join(', ')}`);

			// Rest of the method...
		}
		return results;
	}
}