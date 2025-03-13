/**
 * Content API implementation for v1 of the Confluence API
 */

import { ConfluenceClient } from '../../client/confluence-client.js';

interface ContentBodyRepresentation {
	value: string;
	representation: 'storage' | 'view' | 'export_view' | 'styled_view' | 'anonymous_export_view';
}

// eslint-disable-next-line @typescript-eslint/naming-convention
interface ContentBody {
	storage?: ContentBodyRepresentation;
	view?: ContentBodyRepresentation;
	exportView?: ContentBodyRepresentation;
	styledView?: ContentBodyRepresentation;
	anonymousExportView?: ContentBodyRepresentation;
	[key: string]: unknown;
}

interface ContentVersion {
	number: number;
	by: {
		username?: string;
		displayName?: string;
		[key: string]: unknown;
	};
	when: string;
	message?: string;
	minorEdit: boolean;
	[key: string]: unknown;
}

export interface ContentResponse {
	id: string;
	type: 'page' | 'blogpost' | 'attachment' | 'content' | string;
	status: 'current' | 'trashed' | 'historical' | 'draft' | string;
	title: string;
	body?: ContentBody;
	version?: ContentVersion;
	space?: {
		id: number;
		key: string;
		name: string;
		[key: string]: unknown;
	};
	ancestors?: ContentResponse[];
	children?: {
		page?: {
			results: ContentResponse[];
			size: number;
			[key: string]: unknown;
		};
		attachment?: {
			results: ContentResponse[];
			size: number;
			[key: string]: unknown;
		};
		comment?: {
			results: ContentResponse[];
			size: number;
			[key: string]: unknown;
		};
		[key: string]: unknown;
	};
	descendants?: {
		page?: {
			results: ContentResponse[];
			size: number;
			[key: string]: unknown;
		};
		attachment?: {
			results: ContentResponse[];
			size: number;
			[key: string]: unknown;
		};
		comment?: {
			results: ContentResponse[];
			size: number;
			[key: string]: unknown;
		};
		[key: string]: unknown;
	};
	container?: {
		id: string;
		type: string;
		[key: string]: unknown;
	};
	metadata?: Record<string, unknown>;
	restrictions?: {
		read?: {
			restrictions: {
				user?: { results: Array<Record<string, unknown>> };
				group?: { results: Array<Record<string, unknown>> };
				[key: string]: unknown;
			};
			[key: string]: unknown;
		};
		update?: {
			restrictions: {
				user?: { results: Array<Record<string, unknown>> };
				group?: { results: Array<Record<string, unknown>> };
				[key: string]: unknown;
			};
			[key: string]: unknown;
		};
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export interface ContentListResponse {
	results: ContentResponse[];
	start: number;
	limit: number;
	size: number;
	links?: Record<string, unknown>;
	[key: string]: unknown;
}

/**
 * Content API for Confluence
 * Handles operations for pages, blog posts, and attachments
 */
export class ContentApi {
	/**
	 * Create a new ContentApi instance
	 * @param client The parent Confluence client
	 */
	constructor(private readonly client: ConfluenceClient) { }

	/**
	 * Get content by ID
	 * @param params Request parameters
	 * @returns The content
	 */
	public async getContentById(params: {
		id: string;
		status?: 'current' | 'trashed' | 'historical' | 'draft' | 'any';
		version?: number;
		expand?: string[];
	}): Promise<ContentResponse> {
		const queryParams: Record<string, unknown> = {};

		if (params.status) {
			queryParams['status'] = params.status;
		}

		if (params.version) {
			queryParams['version'] = params.version;
		}

		if (params.expand && params.expand.length > 0) {
			queryParams['expand'] = params.expand.join(',');
		}

		return this.client.get(
			this.client.getV1Url(`/content/${params.id}`),
			queryParams
		);
	}

	/**
	 * Get a list of content
	 * @param params Request parameters
	 * @returns List of content
	 */
	public async getContent(params?: {
		type?: 'page' | 'blogpost' | 'attachment' | 'comment' | string;
		spaceKey?: string;
		title?: string;
		status?: 'current' | 'trashed' | 'historical' | 'draft' | 'any' | string[];
		postingDay?: string;
		expand?: string[];
		start?: number;
		limit?: number;
	}): Promise<ContentListResponse> {
		const queryParams: Record<string, unknown> = {};

		if (params) {
			if (params.type) {
				queryParams['type'] = params.type;
			}

			if (params.spaceKey) {
				queryParams['spaceKey'] = params.spaceKey;
			}

			if (params.title) {
				queryParams['title'] = params.title;
			}

			if (params.status) {
				queryParams['status'] = Array.isArray(params.status)
					? params.status.join(',')
					: params.status;
			}

			if (params.postingDay) {
				queryParams['postingDay'] = params.postingDay;
			}

			if (params.expand && params.expand.length > 0) {
				queryParams['expand'] = params.expand.join(',');
			}

			if (params.start !== undefined) {
				queryParams['start'] = params.start;
			}

			if (params.limit !== undefined) {
				queryParams['limit'] = params.limit;
			}
		}

		return this.client.get(
			this.client.getV1Url('/content'),
			queryParams
		);
	}

	/**
	 * Create new content
	 * @param params Content to create
	 * @returns The created content
	 */
	public async createContent(params: {
		type: 'page' | 'blogpost' | 'comment' | string;
		title: string;
		space?: { key: string };
		ancestors?: Array<{ id: string }>;
		body?: {
			storage: {
				value: string;
				representation?: 'storage';
			}
		};
		status?: 'current' | 'draft';
		expand?: string[];
	}): Promise<ContentResponse> {
		const queryParams: Record<string, unknown> = {};

		if (params.expand && params.expand.length > 0) {
			queryParams['expand'] = params.expand.join(',');
		}

		// Default to storage representation if not specified
		if (params.body?.storage && !params.body.storage.representation) {
			params.body.storage.representation = 'storage';
		}

		return this.client.post(
			this.client.getV1Url('/content'),
			params,
			queryParams
		);
	}

	/**
	 * Update existing content
	 * @param params Content to update
	 * @returns The updated content
	 */
	public async updateContent(params: {
		id: string;
		type: 'page' | 'blogpost' | 'comment' | string;
		title: string;
		version: { number: number };
		body?: {
			storage: {
				value: string;
				representation?: 'storage';
			}
		};
		ancestors?: Array<{ id: string }>;
		status?: 'current' | 'draft';
		expand?: string[];
	}): Promise<ContentResponse> {
		const queryParams: Record<string, unknown> = {};

		if (params.expand && params.expand.length > 0) {
			queryParams['expand'] = params.expand.join(',');
		}

		// Default to storage representation if not specified
		if (params.body?.storage && !params.body.storage.representation) {
			params.body.storage.representation = 'storage';
		}

		return this.client.put(
			this.client.getV1Url(`/content/${params.id}`),
			params,
			queryParams
		);
	}

	/**
	 * Delete content by ID
	 * @param params Request parameters
	 * @returns Empty response on success
	 */
	public async deleteContent(params: {
		id: string;
		status?: 'trashed' | 'draft';
	}): Promise<unknown> {
		const queryParams: Record<string, unknown> = {};

		if (params.status) {
			queryParams['status'] = params.status;
		}

		return this.client.delete(
			this.client.getV1Url(`/content/${params.id}`),
			queryParams
		);
	}

	/**
	 * Get the children of a piece of content
	 * @param params Request parameters
	 * @returns The children of the content
	 */
	public async getContentChildren(params: {
		id: string;
		expand?: string[];
		parentVersion?: number;
	}): Promise<ContentListResponse> {
		const queryParams: Record<string, unknown> = {};

		if (params.expand && params.expand.length > 0) {
			queryParams['expand'] = params.expand.join(',');
		}

		if (params.parentVersion) {
			queryParams['parentVersion'] = params.parentVersion;
		}

		return this.client.get(
			this.client.getV1Url(`/content/${params.id}/child`),
			queryParams
		);
	}

	/**
	 * Get children of a specific type for a piece of content
	 * @param params Request parameters
	 * @returns The children of the specified type
	 */
	public async getContentChildrenByType(params: {
		id: string;
		type: 'page' | 'attachment' | 'comment';
		expand?: string[];
		parentVersion?: number;
		start?: number;
		limit?: number;
	}): Promise<ContentListResponse> {
		const queryParams: Record<string, unknown> = {};

		if (params.expand && params.expand.length > 0) {
			queryParams['expand'] = params.expand.join(',');
		}

		if (params.parentVersion) {
			queryParams['parentVersion'] = params.parentVersion;
		}

		if (params.start !== undefined) {
			queryParams['start'] = params.start;
		}

		if (params.limit !== undefined) {
			queryParams['limit'] = params.limit;
		}

		return this.client.get(
			this.client.getV1Url(`/content/${params.id}/child/${params.type}`),
			queryParams
		);
	}

	/**
	 * Get the descendants of a piece of content
	 * @param params Request parameters
	 * @returns The descendants of the content
	 */
	public async getContentDescendants(params: {
		id: string;
		expand?: string[];
	}): Promise<unknown> {
		const queryParams: Record<string, unknown> = {};

		if (params.expand && params.expand.length > 0) {
			queryParams['expand'] = params.expand.join(',');
		}

		return this.client.get(
			this.client.getV1Url(`/content/${params.id}/descendant`),
			queryParams
		);
	}

	/**
	 * Get content history
	 * @param params Request parameters
	 * @returns The content history
	 */
	public async getContentHistory(params: {
		id: string;
		expand?: string[];
	}): Promise<unknown> {
		const queryParams: Record<string, unknown> = {};

		if (params.expand && params.expand.length > 0) {
			queryParams['expand'] = params.expand.join(',');
		}

		return this.client.get(
			this.client.getV1Url(`/content/${params.id}/history`),
			queryParams
		);
	}
} 
