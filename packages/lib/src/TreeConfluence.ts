import { doc, p } from "@atlaskit/adf-utils/builders";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { LoaderAdaptor, RequiredConfluenceClient } from "./adaptors";
import { prepareAdfToUpload } from "./AdfProcessing";
import { ConsoleLogger } from './ILogger';
import {
	ConfluenceAdfFile,
	ConfluenceNode,
	ConfluenceTreeNode,
	LocalAdfFile,
	LocalAdfFileTreeNode,
} from "./Publisher";
import { ConfluenceSettings } from "./Settings";

const blankPageAdf: string = JSON.stringify(doc(p("Page not published yet")));
// Create a default logger
const logger = new ConsoleLogger();

function flattenTree(
	node: ConfluenceTreeNode,
	ancestors: string[] = [],
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
			nodes.push(...flattenTree(child, [...ancestors, file.pageId]));
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
		const errorMsg = "Missing file on node";
		logger.error(errorMsg);
		throw new Error(errorMsg);
	}

	let version: number;
	let adfContent: JSONDocNode | undefined;
	let pageTitle = "";
	let contentType = "page";
	let ancestors: { id: string }[] = [];
	let lastUpdatedBy: string | undefined;
	const file: ConfluenceAdfFile = {
		...node.file,
		pageId: node.file.pageId || "",
		spaceKey,
		pageUrl: "",
	};

	const effectiveParentPageId = node.file.parentPageId && node.file.parentPageId.trim() !== ''
		? node.file.parentPageId
		: (parentPageId && parentPageId.trim() !== '' ? parentPageId : null);

	logger.debug(`Processing file: ${node.file.absoluteFilePath}, using parent page ID: ${effectiveParentPageId || '(none)'}`);

	if (createPage && effectiveParentPageId === null) {
		const errorMsg = `No parent page ID defined for file: ${node.file.absoluteFilePath}. In frontmatter mode, each PSF root must have a connie-parent-page-id defined.`;
		logger.error(errorMsg);
		throw new Error(errorMsg);
	}

	if (createPage) {
		try {
			logger.debug(`Ensuring page exists for: ${node.file.absoluteFilePath}`);
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
			version = pageDetails.version;
			adfContent = JSON.parse(pageDetails.existingAdf ?? "{}") as JSONDocNode;
			pageTitle = pageDetails.pageTitle;
			ancestors = pageDetails.ancestors;
			lastUpdatedBy = pageDetails.lastUpdatedBy;
			contentType = pageDetails.contentType;
			logger.debug(`Page exists with ID: ${file.pageId}, title: ${pageTitle}`);
		} catch (error) {
			logger.error(`Error ensuring page exists for: ${node.file.absoluteFilePath}: ${error instanceof Error ? error.message : String(error)}`);
			if (error instanceof Error && 'response' in error) {
				logger.error("API response error details:", JSON.stringify(error.response, null, 2));
			}
			throw error;
		}
	} else {
		version = 0;
		adfContent = doc(p());
		pageTitle = "";
		ancestors = [];
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

	const pageUrl = `${settings.confluenceBaseUrl}/wiki/spaces/${spaceKey}/pages/${file.pageId}/`;
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

async function ensurePageExists(
	confluenceClient: RequiredConfluenceClient,
	adaptor: LoaderAdaptor,
	file: LocalAdfFile,
	spaceKey: string,
	parentPageId: string,
	topPageId: string | null,
) {
	logger.debug(`Checking if page exists: ${file.absoluteFilePath}, pageId: ${file.pageId}`);

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
				version: contentById?.version?.number ?? 1,
				lastUpdatedBy:
					contentById?.version?.by?.accountId ?? "NO ACCOUNT ID",
				existingAdf: contentById?.body?.atlas_doc_format?.value,
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
				version: currentPage.version?.number ?? 1,
				lastUpdatedBy:
					currentPage.version?.by?.accountId ?? "NO ACCOUNT ID",
				existingAdf: currentPage.body?.atlas_doc_format?.value,
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
					version: pageDetails.version?.number ?? 1,
					lastUpdatedBy:
						pageDetails.version?.by?.accountId ?? "NO ACCOUNT ID",
					existingAdf: pageDetails.body?.atlas_doc_format?.value,
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
