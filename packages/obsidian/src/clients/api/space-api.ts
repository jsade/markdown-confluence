import { Logger } from "../../utils";
import { ObsidianConfluenceClient } from "../obsidian-confluence-client";

export interface SpaceParameters {
	spaceKey: string;
	name?: string;
	description?: string;
	status?: string;
	type?: string;
	label?: string;
	favourite?: boolean;
	expand?: string[];
	start?: number;
	limit?: number;
}

export interface Space {
	id: number;
	key: string;
	name: string;
	type: string;
	status: string;
	_links: {
		[key: string]: string;
	};
	[key: string]: any;
}

export interface SpaceArray {
	results: Space[];
	start: number;
	limit: number;
	size: number;
	_links: {
		[key: string]: string;
	};
}

export interface SpaceApiCallback<T> {
	(error: Error | null, data?: T): void;
}

/**
 * Implementation of the Confluence Space API
 */
export class SpaceApi {
	private logger: Logger;
	protected client: ObsidianConfluenceClient;

	constructor(client: ObsidianConfluenceClient) {
		this.client = client;
		this.logger = client.getLogger();
	}

	/**
	 * Get space by key - interface method required by RequiredConfluenceClient
	 * @param params Parameters for the request
	 * @returns Space information
	 */
	async get(params: any): Promise<any> {
		return this.getSpace(params);
	}

	/**
	 * Get content for a space - interface method required by RequiredConfluenceClient
	 * @param params Parameters for the request
	 * @returns Content for the space
	 */
	async getContent(params: any): Promise<any> {
		this.logger.info(`Getting content for space: ${JSON.stringify(params)}`);
		
		try {
			const spaceKey = params.key as string;
			if (!spaceKey) {
				throw new Error("Space key is required");
			}
			
			const endpoint = `rest/api/space/${spaceKey}/content`;
			const response = await this.client.fetch(endpoint);
			return response;
		} catch (error) {
			this.logger.error(`Error getting space content: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	/**
	 * Get space by key
	 * @param parameters Parameters for the request
	 * @returns Space response
	 */
	async getSpace<T = Space>(
		parameters: SpaceParameters,
		callback?: SpaceApiCallback<T>
	): Promise<T | void> {
		try {
			this.logger.info(`Getting space with key: ${parameters.spaceKey}`);

			const response = await this.client.fetch(`rest/api/space/${parameters.spaceKey}`);

			if (callback) {
				callback(null, response as T);
				return Promise.resolve();
			}

			return response as T;
		} catch (error) {
			if (callback) {
				callback(error as Error);
				return Promise.resolve();
			}
			throw error;
		}
	}

	/**
	 * Get spaces
	 * @param parameters Parameters for the request
	 * @returns List of spaces
	 */
	async getSpaces<T = SpaceArray>(
		parameters?: SpaceParameters,
		callback?: SpaceApiCallback<T>
	): Promise<T | void> {
		try {
			this.logger.info(`Getting spaces with parameters: ${JSON.stringify(parameters || {})}`);

			let endpoint = 'rest/api/space';

			if (parameters && Object.keys(parameters).length > 0) {
				const queryParams = new URLSearchParams();

				Object.entries(parameters).forEach(([key, value]) => {
					if (value !== null && value !== undefined) {
						if (Array.isArray(value)) {
							queryParams.append(key, value.join(','));
						} else {
							queryParams.append(key, String(value));
						}
					}
				});

				const queryString = queryParams.toString();
				if (queryString) {
					endpoint += `?${queryString}`;
				}
			}

			const response = await this.client.fetch(endpoint);

			if (callback) {
				callback(null, response as T);
				return Promise.resolve();
			}

			return response as T;
		} catch (error) {
			if (callback) {
				callback(error as Error);
				return Promise.resolve();
			}
			throw error;
		}
	}

	/**
	 * Create a new space
	 * @param parameters Parameters for creating the space
	 * @returns Created space
	 */
	async createSpace<T = Space>(
		parameters: SpaceParameters,
		callback?: SpaceApiCallback<T>
	): Promise<T | void> {
		try {
			this.logger.info(`Creating space: ${JSON.stringify(parameters)}`);

			const response = await this.client.fetch('rest/api/space', {
				method: 'POST',
				body: JSON.stringify(parameters)
			});

			if (callback) {
				callback(null, response as T);
				return Promise.resolve();
			}

			return response as T;
		} catch (error) {
			if (callback) {
				callback(error as Error);
				return Promise.resolve();
			}
			throw error;
		}
	}

	/**
	 * Update a space
	 * @param parameters Parameters for updating the space
	 * @returns Updated space
	 */
	async updateSpace<T = Space>(
		parameters: SpaceParameters,
		callback?: SpaceApiCallback<T>
	): Promise<T | void> {
		try {
			this.logger.info(`Updating space: ${JSON.stringify(parameters)}`);

			const response = await this.client.fetch(`rest/api/space/${parameters.spaceKey}`, {
				method: 'PUT',
				body: JSON.stringify({
					name: parameters.name,
					description: parameters.description,
					status: parameters.status
				})
			});

			if (callback) {
				callback(null, response as T);
				return Promise.resolve();
			}

			return response as T;
		} catch (error) {
			if (callback) {
				callback(error as Error);
				return Promise.resolve();
			}
			throw error;
		}
	}

	/**
	 * Delete a space
	 * @param parameters Parameters for deleting the space
	 */
	async deleteSpace<T = void>(
		parameters: SpaceParameters,
		callback?: SpaceApiCallback<T>
	): Promise<T | void> {
		try {
			this.logger.info(`Deleting space: ${JSON.stringify(parameters)}`);

			await this.client.fetch(`rest/api/space/${parameters.spaceKey}`, {
				method: 'DELETE'
			});

			if (callback) {
				callback(null, null as T);
				return Promise.resolve();
			}

			return null as T;
		} catch (error) {
			if (callback) {
				callback(error as Error);
				return Promise.resolve();
			}
			throw error;
		}
	}
} 
