/**
 * V2 Folders API implementation
 */

import { Logger } from "../../../utils";
import { ObsidianConfluenceClient } from "../../obsidian-confluence-client";

/**
 * Response interface for folder operations in the V2 API
 */
export interface V2FolderResponse {
	id: string;
	type: string;
	status: string;
	title: string;
	parentId?: string;
	parentType?: string;
	position?: number;
	authorId: string;
	ownerId: string;
	createdAt: string;
	version: {
		createdAt: string;
		message?: string;
		number: number;
		minorEdit: boolean;
		authorId: string;
	};
	// eslint-disable-next-line @typescript-eslint/naming-convention
	_links: {
		base: string;
		[key: string]: string;
	};
	[key: string]: unknown;
}

/**
 * Implementation of the Confluence V2 Folders API
 */
export class FoldersApi {
	private logger: Logger;

	constructor(private client: ObsidianConfluenceClient) {
		this.logger = this.client.getLogger();
	}

	/**
	 * Get a folder by its ID
	 * @param id The ID of the folder to retrieve
	 * @param params Optional parameters for the request
	 * @returns The folder details
	 */
	async getFolderById(id: string, params?: {
		includeDirectChildren?: boolean;
		includeCollaborators?: boolean;
		includeOperations?: boolean;
		includeProperties?: boolean;
	}): Promise<V2FolderResponse> {
		const queryParams = new URLSearchParams();
		if (params) {
			if (params.includeDirectChildren) queryParams.append('includeDirectChildren', 'true');
			if (params.includeCollaborators) queryParams.append('includeCollaborators', 'true');
			if (params.includeOperations) queryParams.append('includeOperations', 'true');
			if (params.includeProperties) queryParams.append('includeProperties', 'true');
		}

		const queryString = queryParams.toString();
		// Use explicit v2 API endpoint format
		const url = `api/v2/folders/${id}${queryString ? `?${queryString}` : ''}`;

		this.logger.info(`Getting folder by ID: ${id} using API V2`);
		this.logger.info(`Full request URL: ${this.client.getBaseUrl()}/wiki/api/v2/folders/${id}${queryString ? `?${queryString}` : ''}`);

		try {
			this.logger.info(`Making API request to get folder with ID: ${id}`);
			const response = await this.client.fetch(url, {
				method: 'GET',
				headers: {
					'Accept': 'application/json'
				}
			});

			this.logger.info(`Successfully retrieved folder. Response status: ${response ? 'OK' : 'No response'}`);
			return response as V2FolderResponse;
		} catch (error) {
			this.logger.error(`Error getting folder by ID ${id}: ${error instanceof Error ? error.message : String(error)}`);

			// Log detailed error information if available
			if (error instanceof Error && 'response' in error) {
				const errorResponse = (error as { response: unknown }).response;
				this.logger.error(`API error response: ${JSON.stringify(errorResponse, null, 2)}`);
			}

			throw error;
		}
	}

	/**
	 * Create a new folder in a space
	 * @param params Parameters for the folder creation
	 * @returns Created folder details
	 */
	async createFolder(params: {
		spaceId: string;
		title: string;
		parentId?: string;
	}): Promise<V2FolderResponse> {
		this.logger.info(`Creating folder "${params.title}" in space ${params.spaceId} with parent ID: ${params.parentId || 'none'}`);

		const requestBody: Record<string, unknown> = {
			title: params.title,
			spaceId: params.spaceId
		};

		if (params.parentId) {
			requestBody['parentId'] = params.parentId;
			this.logger.info(`Setting parent ID for folder: ${params.parentId}`);
		}

		try {
			// Use explicit v2 API endpoint format
			const endpoint = 'api/v2/folders';
			this.logger.info(`Calling endpoint: ${endpoint} with method: POST`);

			const response = await this.client.fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			this.logger.info(`Folder created successfully: ${JSON.stringify(response)}`);
			return response as V2FolderResponse;
		} catch (error) {
			this.logger.error(`Error creating folder: ${error instanceof Error ? error.message : String(error)}`);

			// Check for specific API error responses
			if (error instanceof Error && 'response' in error) {
				const errorResponse = (error as unknown as { response: unknown }).response;
				this.logger.error(`API error response: ${JSON.stringify(errorResponse, null, 2)}`);
			}

			throw error;
		}
	}

	/**
	 * Update an existing folder
	 * @param folderId The ID of the folder to update
	 * @param params Update parameters
	 * @returns Updated folder details
	 */
	async updateFolder(folderId: string, params: {
		title?: string;
		parentId?: string;
	}): Promise<V2FolderResponse> {
		this.logger.info(`Updating folder ID: ${folderId} with params: ${JSON.stringify(params)}`);

		try {
			// First, get the current folder
			const existingFolder = await this.getFolderById(folderId);
			this.logger.info(`Found existing folder: ${existingFolder.title} (${existingFolder.id})`);

			// Prepare the request body
			const requestBody: Record<string, unknown> = {
				id: folderId,
				status: 'current',
				version: {
					number: (existingFolder.version && typeof existingFolder.version === 'object'
						? (existingFolder.version as { number?: number }).number || 1
						: 1) + 1
				}
			};

			// Add the fields to update
			if (params.title) {
				requestBody['title'] = params.title;
				this.logger.info(`Updating folder title to: ${params.title}`);
			} else {
				requestBody['title'] = existingFolder.title;
			}

			// Update parent if specified
			if (params.parentId) {
				requestBody['parentId'] = params.parentId;
				this.logger.info(`Updating folder parent ID to: ${params.parentId}`);
			}

			// Make the API request
			const endpoint = `api/v2/folders/${folderId}`;
			this.logger.info(`Calling endpoint: ${endpoint} with method: PUT`);

			const response = await this.client.fetch(endpoint, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			this.logger.info(`Folder updated successfully: ${JSON.stringify(response)}`);
			return response as V2FolderResponse;
		} catch (error) {
			this.logger.error(`Error updating folder: ${error instanceof Error ? error.message : String(error)}`);

			// Check for specific API error responses
			if (error instanceof Error && 'response' in error) {
				const errorResponse = (error as unknown as { response: unknown }).response;
				this.logger.error(`API error response: ${JSON.stringify(errorResponse, null, 2)}`);
			}

			throw error;
		}
	}

	/**
	 * Delete a folder
	 * @param id The ID of the folder to delete
	 */
	async deleteFolder(id: string): Promise<void> {
		this.logger.info(`Deleting folder with ID: ${id}`);

		try {
			// Use explicit v2 API endpoint format
			await this.client.fetch(`api/v2/folders/${id}`, {
				method: 'DELETE'
			});
			this.logger.info(`Successfully deleted folder with ID: ${id}`);
		} catch (error) {
			this.logger.error(`Error deleting folder with ID ${id}: ${error instanceof Error ? error.message : String(error)}`);

			// Log detailed error information if available
			if (error instanceof Error && 'response' in error) {
				const errorResponse = (error as { response: unknown }).response;
				this.logger.error(`API error response: ${JSON.stringify(errorResponse, null, 2)}`);
			}

			throw error;
		}
	}
} 
