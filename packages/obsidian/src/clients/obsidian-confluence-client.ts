§/**
 * Obsidian Confluence Client
 * Main client for interacting with the Confluence API from Obsidian
 */

import { Config } from "confluence.js";
import { AttachmentsApi } from "./api/attachments-api";
import { ContentApi } from "./api/content-api";
import { LabelsApi } from "./api/labels-api";
import { SpaceApi } from "./api/space-api";
import { UsersApi } from "./api/users-api";
import { FoldersApi } from "./api/v2/folders-api";
import { MyBaseClient } from "./base-client";

export interface Folder {
	id: string;
	title: string;
	type: string;
	[key: string]: unknown;
}

/**
 * Main Confluence client for Obsidian integration, implementing all required API functionality
 * This is a refactored version of the original monolithic client, using composition of specialized API classes
 */
export class ObsidianConfluenceClient extends MyBaseClient {
	public content: ContentApi;
	public space: SpaceApi;
	public contentAttachments: AttachmentsApi;
	public contentLabels: LabelsApi;
	public users: UsersApi;

	// Additional v2 API functionality
	v2: {
		folders: {
			getFolderById: (id: string) => Promise<{
				id: string;
				title: string;
				[key: string]: unknown;
			}>;
			createFolder: (params: {
				spaceId: string;
				title: string;
				parentId?: string;
			}) => Promise<{
				id: string;
				title: string;
				[key: string]: unknown;
			}>;
		};
	};

	constructor(config: Config) {
		super(config);
		this.content = new ContentApi(this);
		this.space = new SpaceApi(this);
		this.contentAttachments = new AttachmentsApi(this);
		this.contentLabels = new LabelsApi(this);
		this.users = new UsersApi(this);

		// Initialize v2 API implementations
		this.v2 = {
			folders: {
				getFolderById: async (id: string) => {
					const foldersApi = new FoldersApi(this);
					return foldersApi.getFolderById(id);
				},
				createFolder: async (params: {
					spaceId: string;
					title: string;
					parentId?: string;
				}) => {
					const foldersApi = new FoldersApi(this);
					return foldersApi.createFolder(params);
				}
			}
		};
	}

	/**
	 * Find a folder by title in a space
	 * @param title Folder title to search for
	 * @param spaceKey Space key to search in
	 * @returns Folder details or null if not found
	 */
	async findFolderByTitle(title: string, spaceKey: string): Promise<{
		id: string;
		title: string;
		type: string;
		[key: string]: unknown;
	} | null> {
		this.logger.info(`Finding folder "${title}" in space "${spaceKey}"`);

		try {
			// First, try v2 API if enabled
			if (this.apiVersion === 'v2') {
				try {
					this.logger.info('Using v2 API for finding folder');

					// Build the CQL query to find folders by title and space
					// Note: v2 API has specific folder search capabilities
					const folderCQL = `type="page" AND title="${title}" AND space.key="${spaceKey}" AND parent IS NOT EMPTY`;

					const response = await this.searchContentByCQL(folderCQL);

					// Check if we found any matching folder
					if (response && response.results && response.results.length > 0) {
						const folder = response.results[0];
						if (folder) {
							return {
								id: String(folder['id']),
								title: String(folder['title']),
								type: String(folder['type'])
							};
						}
					}

					return null;
				} catch (error) {
					this.logger.warn(`Error using v2 API for finding folder, falling back to v1: ${error instanceof Error ? error.message : String(error)}`);
				}
			}

			// Use v1 API as fallback
			this.logger.info('Using v1 API for finding folder');

			// Build CQL query for v1 API
			const folderCQL = `type="page" AND title="${title}" AND space="${spaceKey}" AND parent IS NOT EMPTY`;

			const response = await this.searchContentByCQL(folderCQL);

			// Check if we found any matching folder
			if (response && response.results && response.results.length > 0) {
				const folder = response.results[0];
				if (folder) {
					return {
						id: String(folder['id']),
						title: String(folder['title']),
						type: String(folder['type'])
					};
				}
			}

			return null;
		} catch (error) {
			this.logger.error(`Error finding folder by title: ${error instanceof Error ? error.message : String(error)}`);
			return null;
		}
	}

	/**
	 * Search content by CQL
	 * @param cql CQL query string
	 * @param limit Maximum number of results to return
	 * @returns Search results
	 */
	override async searchContentByCQL(cql: string, limit: number = 10): Promise<{
		results: Array<Record<string, unknown>>;
		size: number;
		start: number;
		limit: number;
		[key: string]: unknown;
	}> {
		this.logger.info(`Searching content by CQL: ${cql} (limit: ${limit})`);

		try {
			// Determine which API version to use
			if (this.apiVersion === 'v2') {
				try {
					this.logger.info('Using v2 API for content search');

					// Build the query parameters for v2 API
					const queryParams = new URLSearchParams({
						cql,
						limit: String(limit),
						expand: 'childTypes.all' // common expansion for search results
					});

					// Make the API request using v2 endpoint
					const response = await this.fetch(`api/v2/content/search?${queryParams.toString()}`);

					return response as {
						results: Array<Record<string, unknown>>;
						size: number;
						start: number;
						limit: number;
						[key: string]: unknown;
					};
				} catch (error) {
					this.logger.warn(`Error using v2 API for content search, falling back to v1: ${error instanceof Error ? error.message : String(error)}`);
				}
			}

			// Use v1 API as fallback
			this.logger.info('Using v1 API for content search');

			// Build the query parameters for v1 API
			const queryParams = new URLSearchParams({
				cql,
				limit: String(limit),
				expand: 'childTypes.all'
			});

			// Make the API request using v1 endpoint
			const response = await this.fetch(`rest/api/content/search?${queryParams.toString()}`);

			return response as {
				results: Array<Record<string, unknown>>;
				size: number;
				start: number;
				limit: number;
				[key: string]: unknown;
			};
		} catch (error) {
			this.logger.error(`Error searching content by CQL: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	/**
	 * Determine content type for a folder object
	 * @param folder Folder object
	 * @returns Content type string
	 */
	async determineContentTypeForFolder(folder: Record<string, any>): Promise<string> {
		if (!folder) {
			throw new Error("Folder is undefined");
		}
		return {
			id: String(folder['id']),
			title: String(folder['title']),
			type: String(folder['type'])
		}.type;
	}

	/**
	 * Determine content type for an ID
	 * @param id Content ID
	 * @returns Content type string
	 */
	override async determineContentTypeForId(id: string): Promise<string> {
		if (!id) {
			throw new Error("ID is undefined");
		}
		const folder = await this.content.get({ id });
		if (!folder) {
			throw new Error(`Could not find content with ID: ${id}`);
		}
		return {
			id: String(folder['id']),
			title: String(folder['title']),
			type: String(folder['type'])
		}.type;
	}
} 
