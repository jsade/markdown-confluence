import { Logger } from "../../utils";
import { ObsidianConfluenceClient } from "../obsidian-confluence-client";

export interface Label {
	prefix: string;
	name: string;
	id?: string;
	[key: string]: any;
}

export interface LabelArray {
	results: Label[];
	start: number;
	limit: number;
	size: number;
	_links: {
		[key: string]: string;
	};
}

export interface ContentArray {
	results: any[];
	start: number;
	limit: number;
	size: number;
	_links: {
		[key: string]: string;
	};
}

export interface LabelsApiCallback<T> {
	(error: Error | null, data?: T): void;
}

/**
 * Implementation of the Confluence Labels API
 */
export class LabelsApi {
	private logger: Logger;
	protected client: ObsidianConfluenceClient;

	constructor(client: ObsidianConfluenceClient) {
		this.client = client;
		this.logger = client.getLogger();
	}

	/**
	 * Add labels to content - Interface method required by RequiredConfluenceClient
	 * @param params Parameters for the request
	 * @returns Added labels
	 */
	async addLabels(params: Record<string, unknown>): Promise<any> {
		return this.addLabelsToContent(params);
	}

	/**
	 * Get labels for content - Interface method required by RequiredConfluenceClient
	 * @param params Parameters for the request
	 * @returns Labels for the content
	 */
	async getLabels(params: Record<string, unknown>): Promise<any> {
		return this.getLabelsForContent(params);
	}

	/**
	 * Add labels to content
	 * @param params Parameters for the request
	 * @returns Response with added labels
	 */
	async addLabelsToContent<T = LabelArray>(
		params: Record<string, unknown>
	): Promise<T> {
		this.logger.info(`Adding labels to content: ${JSON.stringify(params)}`);
		
		const contentId = params['id'] as string;
		const labels = params['labels'] as any[];
		
		if (!contentId || !labels) {
			throw new Error("Content ID and labels are required");
		}
		
		try {
			const result = await this.addLabelsToContentImpl(contentId, labels);
			return result as unknown as T;
		} catch (error) {
			this.logger.error(`Error adding labels to content: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	/**
	 * Implementation of adding labels to content
	 */
	private async addLabelsToContentImpl(contentId: string, labels: any[]): Promise<LabelArray> {
		const endpoint = `rest/api/content/${contentId}/label`;
		
		const response = await this.client.fetch(endpoint, {
			method: 'POST',
			body: JSON.stringify(labels)
		});
		
		return response as LabelArray;
	}

	/**
	 * Get labels for content
	 * @param params Parameters for the request
	 * @returns Labels for the content
	 */
	async getLabelsForContent<T = LabelArray>(
		params: Record<string, unknown>
	): Promise<T> {
		this.logger.info(`Getting labels for content: ${JSON.stringify(params)}`);
		
		const contentId = params['id'] as string;
		const prefix = params['prefix'] as string | undefined;
		
		if (!contentId) {
			throw new Error("Content ID is required");
		}
		
		try {
			const result = await this.getLabelsForContentImpl(contentId, prefix);
			return result as unknown as T;
		} catch (error) {
			this.logger.error(`Error getting labels for content: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	/**
	 * Implementation of getting labels for content
	 */
	private async getLabelsForContentImpl(contentId: string, prefix?: string): Promise<LabelArray> {
		let endpoint = `rest/api/content/${contentId}/label`;
		
		if (prefix) {
			endpoint += `?prefix=${encodeURIComponent(prefix)}`;
		}
		
		const response = await this.client.fetch(endpoint);
		
		return response as LabelArray;
	}

	/**
	 * Get all content for label
	 * @param params Parameters for the request
	 * @returns List of content with the label
	 */
	async getAllLabelContent<T = ContentArray>(
		params: Record<string, unknown>
	): Promise<T> {
		this.logger.info(`Getting all content for label: ${JSON.stringify(params)}`);
		
		const labelName = params['name'] as string;
		
		if (!labelName) {
			throw new Error("Missing required parameter: name");
		}
		
		return this.getAllLabelContentImpl(labelName, params) as T;
	}

	/**
	 * Implementation of getting all content for label
	 */
	private async getAllLabelContentImpl(
		labelName: string, 
		params: Record<string, unknown>
	): Promise<ContentArray> {
		let endpoint = `rest/api/content/search?cql=label="${encodeURIComponent(labelName)}"`;
		
		const queryParams: Record<string, string> = {};
		
		if (params['start']) {
			queryParams['start'] = String(params['start']);
		}
		
		if (params['limit']) {
			queryParams['limit'] = String(params['limit']);
		}
		
		if (params['expand']) {
			queryParams['expand'] = Array.isArray(params['expand']) 
				? params['expand'].join(',') 
				: String(params['expand']);
		}
		
		if (Object.keys(queryParams).length > 0) {
			const queryString = Object.entries(queryParams)
				.map(([key, value]) => `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
				.join('');
				
			endpoint += queryString;
		}
		
		const response = await this.client.fetch(endpoint);
		
		return response as ContentArray;
	}

	/**
	 * Remove label from content
	 * @param params Parameters for the request
	 * @returns Response from the API
	 */
	async removeLabelFromContent<T = void>(
		params: Record<string, unknown>
	): Promise<T> {
		this.logger.info(`Removing label from content: ${JSON.stringify(params)}`);
		
		const contentId = params['id'] as string;
		const labelName = params['name'] as string;
		
		if (!contentId || !labelName) {
			throw new Error("Missing required parameters: id, name");
		}
		
		await this.removeLabelFromContentImpl(contentId, labelName);
		return null as T;
	}

	/**
	 * Implementation of removing label from content
	 */
	private async removeLabelFromContentImpl(contentId: string, labelName: string): Promise<void> {
		const endpoint = `rest/api/content/${contentId}/label/${encodeURIComponent(labelName)}`;
		
		await this.client.fetch(endpoint, {
			method: 'DELETE'
		});
	}

	/**
	 * Not implemented methods
	 */
	async removeLabelFromContentUsingQueryParameter<T = void>(
		params: Record<string, unknown>
	): Promise<T> {
		this.logger.warn("removeLabelFromContentUsingQueryParameter not implemented");
		throw new Error("Method not implemented");
	}

	async getLabelsForSpace<T = LabelArray>(
		params: Record<string, unknown>
	): Promise<T> {
		this.logger.warn("getLabelsForSpace not implemented");
		throw new Error("Method not implemented");
	}

	async addLabelsToSpace<T = LabelArray>(
		params: Record<string, unknown>
	): Promise<T> {
		this.logger.warn("addLabelsToSpace not implemented");
		throw new Error("Method not implemented");
	}

	async deleteLabelFromSpace<T = void>(
		params: Record<string, unknown>
	): Promise<T> {
		this.logger.warn("deleteLabelFromSpace not implemented");
		throw new Error("Method not implemented");
	}

	async addLabelsByName(): Promise<any> {
		const logger = this.client.getLogger();
		logger.warn("addLabelsByName not implemented");
		throw new Error("Method not implemented");
	}

	async removeLabelByName(): Promise<any> {
		const logger = this.client.getLogger();
		logger.warn("removeLabelByName not implemented");
		throw new Error("Method not implemented");
	}

	async removeLabelById(): Promise<any> {
		const logger = this.client.getLogger();
		logger.warn("removeLabelById not implemented");
		throw new Error("Method not implemented");
	}

	async getAllLabels(): Promise<any> {
		const logger = this.client.getLogger();
		logger.warn("getAllLabels not implemented");
		throw new Error("Method not implemented");
	}
} 
