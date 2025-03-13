import { doc, p } from "@atlaskit/adf-utils/builders";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { LoaderAdaptor, RequiredConfluenceClient } from "./adaptors";
import { prepareAdfToUpload } from "./AdfProcessing";
import { PageContentType } from "./ConniePageConfig";
import { ConsoleLogger } from './ILogger';
import {
	ConfluenceAdfFile,
	ConfluenceNode,
	ConfluenceTreeNode,
	LocalAdfFile,
	LocalAdfFileTreeNode,
} from "./Publisher";
import { ConfluenceSettings } from "./Settings";

// Define types used throughout the file
interface ConfluenceClientV2 {
	v2: {
		folders?: {
			createFolder: (params: { spaceId: string; title: string; parentId?: string }) => Promise<V2FolderResponse>;
			[key: string]: unknown;
		};
		[key: string]: unknown;
	};
	apiVersion?: 'v1' | 'v2';
}

// Define the V2 folder response type
interface V2FolderResponse {
	id: string;
	title: string;
	spaceId: string;
	parentId?: string;
	status?: string;
	version?: {
		number?: number;
		authorId?: string;
		message?: string;
	};
	[key: string]: unknown;
}

// Add a type for errors with response
interface ErrorWithResponse extends Error {
	response: {
		[key: string]: unknown;
	};
}

const blankPageAdf: string = JSON.stringify(doc(p("Page not published yet")));
// Create a default logger
const logger = new ConsoleLogger();

function flattenTree(
	node: ConfluenceTreeNode,
	ancestors: Array<{ id: string }> = [],
): ConfluenceNode[] {
	const nodes: ConfluenceNode[] = [];
	const { file, version, lastUpdatedBy, existingPageData, children } = node;

	if (ancestors.length > 0) {
		nodes.push({
			file,
			version,
			lastUpdatedBy,
			existingPageData,
			ancestors,
		});
	}

	if (children) {
		children.forEach((child) => {
			nodes.push(...flattenTree(child, [...ancestors, { id: file.pageId }]));
		});
	}

	return nodes;
}

export async function ensureAllFilesExistInConfluence(
	confluenceClient: RequiredConfluenceClient,
	adaptor: LoaderAdaptor,
	node: LocalAdfFileTreeNode,
	spaceKey: string,
	parentPageId: string | null,
	topPageId: string | null,
	settings: ConfluenceSettings,
): Promise<ConfluenceNode[]> {
	logger.info(`Ensuring files exist in Confluence for space: ${spaceKey}, parent: ${parentPageId}, top: ${topPageId}`);

	try {
		const confluenceNode = await createFileStructureInConfluence(
			settings,
			confluenceClient,
			adaptor,
			node,
			spaceKey,
			parentPageId,
			topPageId,
			false,
		);

		const pages = flattenTree(confluenceNode);
		logger.info(`Found ${pages.length} pages in Confluence structure`);

		prepareAdfToUpload(pages, settings);

		return pages;
	} catch (error) {
		logger.error(`Error ensuring files exist in Confluence: ${error instanceof Error ? error.message : String(error)}`);
		if (error instanceof Error && 'response' in error) {
			logger.error("API response error details:", JSON.stringify(error.response, null, 2));
		}
		throw error;
	}
}

export async function createFileStructureInConfluence(
	settings: ConfluenceSettings,
	confluenceClient: RequiredConfluenceClient,
	adaptor: LoaderAdaptor,
	node: LocalAdfFileTreeNode,
	spaceKey: string,
	parentPageId: string | null,
	topPageId: string | null,
	createPage = true,
): Promise<ConfluenceTreeNode> {
	if (!node.file) {
		return {
			file: {
				folderName: "",
				absoluteFilePath: "",
				fileName: "",
				contents: doc(p()),
				pageTitle: "",
				frontmatter: {},
				tags: [],
				dontChangeParentPageId: false,
				pageId: "",
				spaceKey: "",
				pageUrl: "",
				contentType: "page",
				blogPostDate: undefined,
			},
			version: 0,
			lastUpdatedBy: "",
			children: [],
			existingPageData: {
				adfContent: doc(p()),
				pageTitle: "",
				ancestors: [],
				contentType: "page",
			},
		};
	}

	const effectiveParentPageId = parentPageId;
	let ancestors: { id: string }[] = [];
	let version = 0;
	let adfContent: JSONDocNode = doc(p());
	let pageTitle = "";
	let lastUpdatedBy = "";
	let contentType = node.file.contentType;
	const file: ConfluenceAdfFile = {
		...node.file,
		pageId: node.file.pageId || "",
		spaceKey,
		pageUrl: "",
	};

	if (createPage && effectiveParentPageId === null) {
		const errorMsg = `No parent page ID defined for file: ${node.file.absoluteFilePath}. In frontmatter mode, each PSF root must have a connie-parent-page-id defined.`;
		logger.error(errorMsg);
		throw new Error(errorMsg);
	}

	if (createPage) {
		logger.info(`Checking confluence page existence for: ${node.file.absoluteFilePath}, content type: ${node.file.contentType}`);

		try {
			logger.debug(`Ensuring page exists for: ${node.file.absoluteFilePath}, content type: ${node.file.contentType}`);

			// Check if we're using the v2 API
			const isV2Api = 'apiVersion' in confluenceClient && confluenceClient.apiVersion === 'v2';
			const apiVersion = 'apiVersion' in confluenceClient ? (confluenceClient as unknown as { apiVersion?: string }).apiVersion || 'undefined' : 'undefined';

			logger.info(`API version detection: isV2Api = ${isV2Api}, apiVersion = ${apiVersion}`);
			logger.info(`Client properties: ${Object.keys(confluenceClient).join(', ')}`);

			// Handle folders differently for v2 API


			if (node.file.contentType === 'folder') {
				logger.info(`Content type is FOLDER: ${node.file.pageTitle}`);
				logger.info(`Folder details: absoluteFilePath=${node.file.absoluteFilePath}, contentType=${node.file.contentType}`);
			}


			if (node.file.contentType === 'folder' && isV2Api && 'v2' in confluenceClient) {
				logger.info(`Creating/updating folder using API v2: ${node.file.pageTitle}`);
				logger.info(`Folder details: absoluteFilePath=${node.file.absoluteFilePath}, contentType=${node.file.contentType}`);

				try {
					let folderId = node.file.pageId;
					logger.info(`Existing folder ID: ${folderId || 'none'}`);

					// If we have a folder ID, try to get it first
					if (folderId) {
						try {
							logger.info(`Attempting to get existing folder with ID: ${folderId}`);
							const existingFolder = await confluenceClient.v2.folders.getFolderById(folderId);
							logger.info(`Found existing folder: ${JSON.stringify(existingFolder)}`);

							file.pageId = existingFolder.id;
							file.spaceKey = spaceKey;
							version = existingFolder['version'] && typeof existingFolder['version'] === 'object'
								? (existingFolder['version'] as Record<string, unknown>)['number'] as number || 0
								: 0;
							pageTitle = existingFolder.title;
							contentType = "folder"; // This is only used internally, not in the API call
							ancestors = existingFolder['parentId'] ? [{ id: existingFolder['parentId'] as string }] : [];
							lastUpdatedBy = existingFolder['version'] && typeof existingFolder['version'] === 'object'
								? (existingFolder['version'] as Record<string, unknown>)['authorId'] as string || ''
								: '';

							logger.debug(`Folder exists with ID: ${file.pageId}, title: ${pageTitle}, version: ${version}`);

							// Important: For API v2, we don't update folders using content endpoints
							// All folder operations should use the dedicated folder endpoints
						} catch (error) {
							logger.warn(`Folder with ID ${folderId} not found, will create new folder. Error: ${error instanceof Error ? error.message : String(error)}`);
							if (error instanceof Error && 'response' in error) {
								logger.warn(`API error response for folder lookup: ${JSON.stringify((error as ErrorWithResponse).response, null, 2)}`);
							}
							folderId = ''; // Reset so we create a new one
						}
					}

					// If we don't have a folder ID or couldn't find an existing one, create a new folder
					if (!folderId) {
						// For API v2, we need to get the space ID from the space key
						let spaceId: string;
						logger.info(`Converting space key "${spaceKey}" to a space ID for API v2 folder creation`);

						// Determine if we already have a numeric space ID or an alphanumeric space key
						const isNumericSpaceId = /^\d+$/.test(spaceKey);

						if (isNumericSpaceId) {
							// If spaceKey is already numeric, assume it's already a space ID
							logger.info(`Space key "${spaceKey}" appears to be numeric, treating as a space ID`);
							spaceId = spaceKey;
						} else {
							// If spaceKey is alphanumeric, we need to look up the corresponding space ID
							try {
								logger.info(`Looking up space ID for key: ${spaceKey}`);
								const spaceResponse = await confluenceClient.space.getSpace({
									spaceKey: spaceKey,
									expand: ['id']
								});

								if (spaceResponse && spaceResponse.id) {
									// Convert to string as IDs are often numeric but API expects string
									spaceId = String(spaceResponse.id);
									logger.info(`Resolved space ID for key ${spaceKey}: ${spaceId}`);
								} else {
									// Error - couldn't find space ID
									throw new Error(`Could not find space ID for key ${spaceKey}`);
								}
							} catch (error) {
								logger.error(`Error getting space ID for key ${spaceKey}: ${error instanceof Error ? error.message : String(error)}`);
								if (error instanceof Error && 'response' in error) {
									logger.error(`API error response: ${JSON.stringify((error as ErrorWithResponse).response, null, 2)}`);
								}
								throw new Error(`Failed to get space ID for key ${spaceKey}. V2 folder API requires a valid space ID.`);
							}
						}

						interface FolderCreateParams {
							spaceId: string;
							title: string;
							parentId?: string;
						}

						const folderParams: FolderCreateParams = {
							spaceId: spaceId, // Now we're using the properly resolved space ID
							title: node.file.pageTitle
						};

						// Add parent ID if we have one
						if (effectiveParentPageId) {
							folderParams.parentId = effectiveParentPageId;
							logger.info(`Using parent ID for folder: ${effectiveParentPageId}`);
						} else {
							logger.warn(`No parent ID for folder: ${node.file.pageTitle}. This folder will be created at the root level.`);
						}

						logger.info(`Creating folder with params: ${JSON.stringify(folderParams)}`);

						// Use a more specific type casting
						const clientWithV2 = confluenceClient as unknown as ConfluenceClientV2;
						logger.info(`v2 API properties available: ${Object.keys(clientWithV2.v2).join(', ')}`);

						// Check if the 'folders' property exists
						if ('folders' in clientWithV2.v2) {
							logger.info(`v2.folders methods available: ${Object.keys(clientWithV2.v2.folders || {}).join(', ')}`);
						} else {
							logger.error(`CRITICAL ERROR: v2.folders API is not available in the client! This will cause the "Type is not a custom content type : folder" error.`);
						}

						try {
							logger.info(`Calling createFolder with params: ${JSON.stringify(folderParams)}`);
							const newFolder = await (clientWithV2.v2.folders?.createFolder(folderParams) ||
								Promise.reject(new Error("v2.folders.createFolder is not available")));
							logger.info(`Create folder response: ${JSON.stringify(newFolder, null, 2)}`);

							logger.info(`Created new folder: ${newFolder.title} (${newFolder.id})`);

							// Update the file with the new folder ID
							file.pageId = newFolder.id;
							file.spaceKey = spaceKey;
							version = newFolder['version'] && typeof newFolder['version'] === 'object'
								? (newFolder['version'] as Record<string, unknown>)['number'] as number || 0
								: 0;
							pageTitle = newFolder.title;
							contentType = "folder";
							ancestors = newFolder['parentId'] ? [{ id: newFolder['parentId'] as string }] : [];
							lastUpdatedBy = newFolder['version'] && typeof newFolder['version'] === 'object'
								? (newFolder['version'] as Record<string, unknown>)['authorId'] as string || ''
								: '';

							logger.info(`Updated file object with new folder data: pageId=${file.pageId}, title=${pageTitle}, contentType=${contentType}`);

							// Update the file's metadata in source
							await adaptor.updateMarkdownValues(file.absoluteFilePath, {
								publish: true,
								pageId: newFolder.id,
							});
							logger.info(`Updated source file metadata with new folder ID: ${newFolder.id}`);
						} catch (error) {
							logger.error(`Error calling createFolder: ${error instanceof Error ? error.message : String(error)}`);
							if (error instanceof Error && 'response' in error) {
								const response = (error as ErrorWithResponse).response;
								logger.error(`API error response: ${JSON.stringify(response, null, 2)}`);

								// Check if this is the specific folder content type error
								if (typeof response === 'object' && response &&
									'message' in response && typeof response['message'] === 'string') {
									logger.error(`API error message: ${response['message']}`);

									if (response['message'].includes('Type is not a custom content type : folder')) {
										logger.error(`CRITICAL: Detected "Type is not a custom content type : folder" error. Make sure you are using the dedicated folder endpoints in API v2.`);
										logger.error(`This indicates the code is still trying to create a folder as a custom content type instead of using the dedicated folder endpoints.`);
									}
								}
							}
							throw error;
						}
					}
				} catch (error) {
					logger.error(`Error creating/updating folder: ${error instanceof Error ? error.message : String(error)}`);
					if (error instanceof Error && 'response' in error) {
						logger.error("API response error details:", JSON.stringify((error as { response: unknown }).response, null, 2));
					}
					throw error;
				}
			} else {
				// Handle regular pages or folders with API v1
				logger.info(`Using standard content endpoint for ${isV2Api ? 'API v2' : 'API v1'} and content type: ${node.file.contentType}`);
				// If this is a folder and we're using API v1, use the standard content endpoint
				// If this is a regular page, use the standard content endpoint
				const pageDetails = await ensurePageExists(
					confluenceClient,
					adaptor,
					node.file,
					spaceKey,
					effectiveParentPageId as string,
					topPageId || effectiveParentPageId as string,
				);
				file.pageId = pageDetails.id;
				file.spaceKey = pageDetails.spaceKey;
				const versionData = pageDetails['version'] as { number?: number; by?: { accountId?: string } };
				version = versionData.number || 0;
				adfContent = JSON.parse(pageDetails.existingAdf ?? "{}") as JSONDocNode;
				pageTitle = pageDetails.pageTitle;
				ancestors = pageDetails.ancestors as { id: string }[];
				lastUpdatedBy = pageDetails.lastUpdatedBy;
				contentType = pageDetails.contentType as PageContentType;
				logger.debug(`Page exists with ID: ${file.pageId}, title: ${pageTitle}`);
			}
		} catch (error) {
			logger.error(`Error ensuring page exists for: ${node.file.absoluteFilePath}: ${error instanceof Error ? error.message : String(error)}`);
			if (error instanceof Error && 'response' in error) {
				logger.error("API response error details:", JSON.stringify((error as { response: unknown }).response, null, 2));
			}
			throw error;
		}
	} else {
		version = 0;
		adfContent = doc(p());
		pageTitle = "";
		ancestors = [];
		lastUpdatedBy = "";
		contentType = "page";
	}

	logger.debug(`Processing ${node.children.length} children for: ${node.file.absoluteFilePath}`);
	const childDetailsTasks = node.children.map((childNode) => {
		return createFileStructureInConfluence(
			settings,
			confluenceClient,
			adaptor,
			childNode,
			spaceKey,
			file.pageId,
			topPageId || effectiveParentPageId as string,
			true,
		);
	});

	const childDetails = await Promise.all(childDetailsTasks);
	logger.debug(`Processed ${childDetails.length} children for: ${node.file.absoluteFilePath}`);

	const pageUrl = contentType === 'folder'
		? `${settings.confluenceBaseUrl}/wiki/spaces/${spaceKey}/browse/folders/${file.pageId}`
		: `${settings.confluenceBaseUrl}/wiki/spaces/${spaceKey}/pages/${file.pageId}/`;

	return {
		file: { ...file, pageUrl },
		version,
		lastUpdatedBy: lastUpdatedBy ?? "",
		children: childDetails,
		existingPageData: {
			adfContent,
			pageTitle,
			ancestors,
			contentType,
		},
	};
}

// Helper function to create a new folder using API v2 folder endpoints
async function createNewFolderV2(
	confluenceClient: RequiredConfluenceClient,
	adaptor: LoaderAdaptor,
	file: LocalAdfFile,
	spaceKey: string,
	parentId: string
) {
	logger.info(`Creating new folder with V2 API: ${file.pageTitle}`);

	// Type cast the client to access v2 APIs
	const clientWithV2 = confluenceClient as unknown as ConfluenceClientV2;

	// Convert space key to space ID for V2 API
	let spaceId: string;
	const isNumericSpaceId = /^\d+$/.test(spaceKey);

	if (isNumericSpaceId) {
		// If spaceKey is already numeric, assume it's already a space ID
		logger.info(`Space key "${spaceKey}" appears to be numeric, treating as a space ID`);
		spaceId = spaceKey;
	} else {
		// Need to look up the space ID from the alphanumeric space key
		try {
			logger.info(`Looking up space ID for key: ${spaceKey}`);
			const spaceResponse = await confluenceClient.space.getSpace({
				spaceKey: spaceKey,
				expand: ['id']
			});

			// Get the actual space ID
			if (spaceResponse && spaceResponse.id) {
				spaceId = String(spaceResponse.id);
				logger.info(`Resolved space ID for key ${spaceKey}: ${spaceId}`);
			} else {
				throw new Error(`Could not find space ID for key ${spaceKey}`);
			}
		} catch (error) {
			logger.error(`Error getting space ID for key ${spaceKey}: ${error instanceof Error ? error.message : String(error)}`);
			if (error instanceof Error && 'response' in error) {
				logger.error(`API error response: ${JSON.stringify((error as ErrorWithResponse).response, null, 2)}`);
			}
			throw new Error(`Failed to get space ID for key ${spaceKey}. V2 folder API requires a valid space ID.`);
		}
	}

	// Determine effective parent ID - in V2 API, we can only use one parent ID
	// Since this is a folder, prefer parentFolderId over parentPageId
	// But if neither exists in frontmatter, use the provided parentId parameter
	let effectiveParentId = parentId;

	// If this folder has a specific parent folder ID in frontmatter, use that
	if (file.parentFolderId) {
		effectiveParentId = file.parentFolderId;
		logger.info(`Using parent folder ID from frontmatter: ${effectiveParentId}`);
	}
	// Otherwise, if it has a parent page ID in frontmatter, use that
	else if (file.parentPageId) {
		effectiveParentId = file.parentPageId;
		logger.info(`Using parent page ID from frontmatter: ${effectiveParentId}`);
	}
	// If no parent ID in frontmatter, use the provided parameter (comes from tree structure)
	else {
		logger.info(`Using effective parent ID from tree structure: ${effectiveParentId}`);
	}

	const folderParams = {
		spaceId: spaceId,
		title: file.pageTitle,
		parentId: effectiveParentId
	};

	logger.info(`Creating new folder with params: ${JSON.stringify(folderParams)}`);

	if (!clientWithV2.v2?.folders?.createFolder) {
		throw new Error("v2.folders.createFolder is not available on this client");
	}

	const newFolder = await clientWithV2.v2.folders.createFolder(folderParams);
	logger.info(`Folder created successfully with ID: ${newFolder.id}`);

	// Update the file metadata
	await adaptor.updateMarkdownValues(file.absoluteFilePath, {
		publish: true,
		pageId: newFolder.id,
	});

	return {
		id: newFolder.id,
		title: file.pageTitle,
		version: newFolder['version'] ? (newFolder['version'] as { number?: number })?.number ?? 1 : 1,
		lastUpdatedBy: newFolder['version'] ? (newFolder['version'] as { authorId?: string })?.authorId ?? "NO ACCOUNT ID" : "NO ACCOUNT ID",
		existingAdf: undefined,
		pageTitle: newFolder.title,
		spaceKey,
		ancestors: newFolder['parentId'] ? [{ id: newFolder['parentId'] as string }] : [],
		contentType: "folder",
	} as const;
}

async function ensurePageExists(
	confluenceClient: RequiredConfluenceClient,
	adaptor: LoaderAdaptor,
	file: LocalAdfFile,
	spaceKey: string,
	parentPageId: string,
	topPageId: string | null,
) {
	logger.debug(`Checking if page exists: ${file.absoluteFilePath}, pageId: ${file.pageId}`);
	logger.info(`Content type being checked: ${file.contentType}`);
	logger.info(`API version check in ensurePageExists: ${'apiVersion' in confluenceClient ? confluenceClient.apiVersion : 'not available'}`);

	// Check if we're using the v2 API
	const isV2Api = 'apiVersion' in confluenceClient && confluenceClient.apiVersion === 'v2';
	logger.info(`Is using API v2 in ensurePageExists: ${isV2Api}, contentType: ${file.contentType}`);

	// If this is a folder and we're using API v2, skip the regular content checks
	if (file.contentType === 'folder' && isV2Api && 'v2' in confluenceClient) {
		logger.info(`CRITICAL CHECK: Skipping regular content checks for folder in API v2: ${file.pageTitle}`);

		const clientWithV2 = confluenceClient as unknown as ConfluenceClientV2;
		logger.info(`v2 API properties available: ${Object.keys(clientWithV2.v2).join(', ')}`);

		// Check if the 'folders' property exists
		if ('folders' in clientWithV2.v2) {
			logger.info(`v2.folders methods available: ${Object.keys(clientWithV2.v2.folders || {}).join(', ')}`);
		} else {
			logger.error(`CRITICAL ERROR: v2.folders API is not available in the client! This will cause the "Type is not a custom content type : folder" error.`);
		}

		// Create a new folder using v2 API
		try {
			// Convert space key to space ID for V2 API
			let spaceId: string;
			const isNumericSpaceId = /^\d+$/.test(spaceKey);

			if (isNumericSpaceId) {
				// If spaceKey is already numeric, assume it's already a space ID
				logger.info(`Space key "${spaceKey}" appears to be numeric, treating as a space ID`);
				spaceId = spaceKey;
			} else {
				// Need to look up the space ID from the alphanumeric space key
				try {
					logger.info(`Looking up space ID for key: ${spaceKey}`);
					const spaceResponse = await confluenceClient.space.getSpace({
						spaceKey: spaceKey,
						expand: ['id']
					});

					// Get the actual space ID
					if (spaceResponse && spaceResponse.id) {
						spaceId = String(spaceResponse.id);
						logger.info(`Resolved space ID for key ${spaceKey}: ${spaceId}`);
					} else {
						throw new Error(`Could not find space ID for key ${spaceKey}`);
					}
				} catch (error) {
					logger.error(`Error getting space ID for key ${spaceKey}: ${error instanceof Error ? error.message : String(error)}`);
					if (error instanceof Error && 'response' in error) {
						logger.error(`API error response: ${JSON.stringify((error as ErrorWithResponse).response, null, 2)}`);
					}
					throw new Error(`Failed to get space ID for key ${spaceKey}. V2 folder API requires a valid space ID.`);
				}
			}

			// Determine the appropriate parent ID to use
			let effectiveParentId = parentPageId;

			// For folders, check if we have a specific parent folder ID
			if (file.parentFolderId) {
				effectiveParentId = file.parentFolderId;
				logger.info(`Using specific parent folder ID from frontmatter: ${effectiveParentId}`);
			}

			const folderParams = {
				spaceId: spaceId,  // Now using the properly resolved numeric space ID
				title: file.pageTitle,
				parentId: effectiveParentId
			};

			logger.info(`FOLDER CREATION CHECK - Creating new folder with API v2: ${JSON.stringify(folderParams)}`);
			logger.info(`This should use the dedicated folder endpoint, not custom content endpoint`);

			const newFolder = await (clientWithV2.v2.folders?.createFolder(folderParams) ||
				Promise.reject(new Error("v2.folders.createFolder is not available")));

			logger.info(`Folder successfully created with ID: ${newFolder.id}`);

			await adaptor.updateMarkdownValues(file.absoluteFilePath, {
				publish: true,
				pageId: newFolder.id,
			});

			return {
				id: newFolder.id,
				title: file.pageTitle,
				version: newFolder['version'] ? (newFolder['version'] as { number?: number })?.number ?? 1 : 1,
				lastUpdatedBy: newFolder['version'] ? (newFolder['version'] as { authorId?: string })?.authorId ?? "NO ACCOUNT ID" : "NO ACCOUNT ID",
				existingAdf: undefined,
				pageTitle: newFolder.title,
				spaceKey,
				ancestors: newFolder['parentId'] ? [{ id: newFolder['parentId'] as string }] : [],
				contentType: "folder",
			} as const;
		} catch (error) {
			logger.error(`CRITICAL ERROR in folder creation: ${error instanceof Error ? error.message : String(error)}`);
			if (error instanceof Error && 'response' in error) {
				// Type assertion for the error object with a response property
				type ErrorWithResponse = Error & {
					response: {
						message?: string;
						[key: string]: unknown;
					}
				};

				const errorWithResponse = error as ErrorWithResponse;
				logger.error(`API response error details: ${JSON.stringify(errorWithResponse.response, null, 2)}`);

				// Check if this is the specific folder content type error
				if (errorWithResponse.response?.['message'] &&
					typeof errorWithResponse.response['message'] === 'string' &&
					errorWithResponse.response['message'].includes('Type is not a custom content type : folder')) {
					logger.error(`CRITICAL: Detected "Type is not a custom content type : folder" error in ensurePageExists.`);
					logger.error(`This indicates we're trying to create a folder through the custom content endpoint instead of the folder endpoint.`);

					// Log more details about the client configuration
					logger.error(`Make sure this folder creation is going through v2.folders.createFolder, not content.createContent`);
				}
			}
			throw error;
		}
	}

	if (file.pageId) {
		try {
			logger.debug(`Page has ID ${file.pageId}, fetching page details from Confluence`);
			const contentById = await confluenceClient.content.getContentById({
				id: file.pageId,
				expand: [
					"version",
					"body.atlas_doc_format",
					"ancestors",
					"space",
				],
			});

			if (!contentById.space?.key) {
				const errorMsg = "Missing Space Key";
				logger.error(errorMsg);
				throw new Error(errorMsg);
			}

			logger.debug(`Found existing page with ID: ${file.pageId}, title: ${contentById.title}, space: ${contentById.space.key}`);

			await adaptor.updateMarkdownValues(file.absoluteFilePath, {
				publish: true,
				pageId: contentById.id,
			});

			return {
				id: contentById.id,
				title: file.pageTitle,
				version: contentById?.['version']?.['number'] ?? 1,
				lastUpdatedBy:
					contentById?.['version']?.['by']?.['accountId'] ?? "NO ACCOUNT ID",
				existingAdf: contentById?.['body']?.['atlas_doc_format']?.['value'],
				spaceKey: contentById.space.key,
				pageTitle: contentById.title,
				ancestors:
					contentById.ancestors?.map((ancestor) => ({
						id: ancestor.id,
					})) ?? [],
				contentType: contentById.type,
			} as const;
		} catch (error: unknown) {
			logger.error(`Error fetching page with ID ${file.pageId}: ${error instanceof Error ? error.message : String(error)}`);

			if (
				error instanceof Error &&
				"response" in error &&
				typeof error.response === "object" &&
				error.response &&
				"status" in error.response &&
				typeof error.response.status === "number"
			) {
				logger.error(`API response status: ${error.response.status}`);
				logger.error(`API response details: ${JSON.stringify(error.response, null, 2)}`);

				if (error.response.status === 404) {
					logger.warn(`Page with ID ${file.pageId} not found, will create a new page`);
					await adaptor.updateMarkdownValues(file.absoluteFilePath, {
						publish: false,
						pageId: undefined,
					});
				}
			}

			throw error;
		}
	}

	// Try to find page by title
	// For API v2, we need to handle folders differently
	const isApiV2 = 'apiVersion' in confluenceClient && confluenceClient.apiVersion === 'v2';

	// Skip content search for folders when using API v2, as folders aren't valid content types in v2
	if (file.contentType === 'folder' && isApiV2 && 'v2' in confluenceClient) {
		logger.info(`Skipping content search for folder in API v2: ${file.pageTitle}`);
		logger.info(`Creating new folder directly using folder endpoints instead`);

		// Proceed directly to folder creation for API v2 (handled below)
		return await createNewFolderV2(confluenceClient, adaptor, file, spaceKey,
			file.parentFolderId || parentPageId); // Use specific parent folder ID if available
	}

	const searchParams = {
		type: file.contentType,
		spaceKey,
		title: file.pageTitle,
		expand: ["version", "body.atlas_doc_format", "ancestors"],
	};

	logger.debug(`Searching for page by title: ${file.pageTitle}, type: ${file.contentType}, space: ${spaceKey}`);

	try {
		const contentByTitle = await confluenceClient.content.getContent(
			searchParams,
		);

		const currentPage = contentByTitle.results[0];

		if (currentPage) {
			logger.debug(`Found existing page by title: ${file.pageTitle}, ID: ${currentPage.id}`);

			if (
				topPageId &&
				file.contentType === "page" &&
				!currentPage.ancestors?.some((ancestor) => ancestor.id == topPageId)
			) {
				const errorMsg = `${file.pageTitle} is trying to overwrite a page outside the page tree from the selected top page`;
				logger.error(errorMsg);
				throw new Error(errorMsg);
			}

			await adaptor.updateMarkdownValues(file.absoluteFilePath, {
				publish: true,
				pageId: currentPage.id,
			});
			return {
				id: currentPage.id,
				title: file.pageTitle,
				version: currentPage['version']?.['number'] ?? 1,
				lastUpdatedBy:
					currentPage['version']?.['by']?.['accountId'] ?? "NO ACCOUNT ID",
				existingAdf: currentPage['body']?.['atlas_doc_format']?.['value'],
				pageTitle: currentPage.title,
				spaceKey,
				ancestors:
					currentPage.ancestors?.map((ancestor) => ({
						id: ancestor.id,
					})) ?? [],
				contentType: currentPage.type,
			} as const;
		} else {
			logger.debug(`Page not found by title, creating new page: ${file.pageTitle}, type: ${file.contentType}, space: ${spaceKey}`);

			const creatingBlankPageRequest = {
				space: { key: spaceKey },
				...(file.contentType === "page" && parentPageId && parentPageId.trim() !== ''
					? { ancestors: [{ id: parentPageId }] }
					: {}),
				title: file.pageTitle,
				type: file.contentType,
				body: {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					atlas_doc_format: {
						value: blankPageAdf,
						representation: "atlas_doc_format",
					},
				},
				expand: ["version", "body.atlas_doc_format", "ancestors"],
			};

			// Log a warning if the page should have an ancestor but doesn't
			if (file.contentType === "page" && (!parentPageId || parentPageId.trim() === '')) {
				logger.warn(`Creating page "${file.pageTitle}" without a parent page ID. This may cause the page to be placed at the root level. Check your frontmatter settings.`);
			}

			logger.debug(`Creating blank page with request: ${JSON.stringify({
				title: creatingBlankPageRequest.title,
				type: creatingBlankPageRequest.type,
				space: creatingBlankPageRequest.space,
				ancestorsCount: file.contentType === "page" && parentPageId && parentPageId.trim() !== '' ? 1 : 0,
				parentPageId: file.contentType === "page" && parentPageId && parentPageId.trim() !== '' ? parentPageId : undefined
			})}`);

			// Log parent-child relationship in more detail
			if (file.contentType === "page") {
				if (parentPageId && parentPageId.trim() !== '') {
					logger.info(`Creating page "${file.pageTitle}" with parent page ID: ${parentPageId}`);

					// Verify parent page exists
					try {
						const parentPage = await confluenceClient.content.getContentById({
							id: parentPageId,
							expand: ["title"]
						});
						logger.info(`Parent page verified: "${parentPage.title}" (${parentPageId})`);
					} catch (error) {
						logger.error(`Error verifying parent page existence: ${error instanceof Error ? error.message : String(error)}`);
						logger.error(`The parent page ID ${parentPageId} might not exist or is not accessible. This will cause HTTP 400 errors when creating pages.`);
						if (error instanceof Error && 'response' in error) {
							logger.error(`API response error details: ${JSON.stringify(error.response, null, 2)}`);
						}
						// Continue with the create attempt anyway, as this will demonstrate the actual error
					}
				} else {
					logger.warn(`Creating page "${file.pageTitle}" at root level because parent page ID is empty or missing.`);
				}
			}

			try {
				const pageDetails = await confluenceClient.content.createContent(
					creatingBlankPageRequest,
				);

				logger.debug(`Page created successfully with ID: ${pageDetails.id}, title: ${pageDetails.title}`);

				await adaptor.updateMarkdownValues(file.absoluteFilePath, {
					publish: true,
					pageId: pageDetails.id,
				});
				return {
					id: pageDetails.id,
					title: file.pageTitle,
					version: pageDetails['version']?.['number'] ?? 1,
					lastUpdatedBy:
						pageDetails['version']?.['by']?.['accountId'] ?? "NO ACCOUNT ID",
					existingAdf: pageDetails['body']?.['atlas_doc_format']?.['value'],
					pageTitle: pageDetails.title,
					ancestors:
						pageDetails.ancestors?.map((ancestor) => ({
							id: ancestor.id,
						})) ?? [],
					spaceKey,
					contentType: pageDetails.type,
				} as const;
			} catch (error) {
				logger.error(`Error creating page: ${error instanceof Error ? error.message : String(error)}`);
				if (error instanceof Error && 'response' in error) {
					logger.error(`API response error details: ${JSON.stringify(error.response, null, 2)}`);
				}
				throw error;
			}
		}
	} catch (error) {
		logger.error(`Error searching for page by title: ${error instanceof Error ? error.message : String(error)}`);
		if (error instanceof Error && 'response' in error) {
			logger.error(`API response error details: ${JSON.stringify(error.response, null, 2)}`);
		}
		throw error;
	}
}