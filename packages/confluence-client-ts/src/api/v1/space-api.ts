/**
 * Space API implementation for v1 of the Confluence API
 */

import { ConfluenceClient } from '../../client/confluence-client.js';

export interface SpaceResponse {
	id: number;
	key: string;
	name: string;
	type: 'global' | 'personal' | string;
	status: 'current' | 'archived' | string;
	homepage?: {
		id: string;
		type: string;
		title: string;
		[key: string]: unknown;
	};
	description?: {
		plain?: {
			value: string;
			representation: 'plain';
		};
		view?: {
			value: string;
			representation: 'view';
		};
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

export interface SpaceListResponse {
	results: SpaceResponse[];
	start: number;
	limit: number;
	size: number;
	[key: string]: unknown;
}

/**
 * Space API for Confluence
 * Handles operations for spaces
 */
export class SpaceApi {
	/**
	 * Create a new SpaceApi instance
	 * @param client The parent Confluence client
	 */
	constructor(private readonly client: ConfluenceClient) { }

	/**
	 * Get a space by key
	 * @param params Request parameters
	 * @returns The space
	 */
	public async getSpace(params: {
		spaceKey: string;
		expand?: string[];
	}): Promise<SpaceResponse> {
		const queryParams: Record<string, unknown> = {};

		if (params.expand && params.expand.length > 0) {
			queryParams['expand'] = params.expand.join(',');
		}

		return this.client.get(
			this.client.getV1Url(`/space/${params.spaceKey}`),
			queryParams
		);
	}

	/**
	 * Get all spaces
	 * @param params Request parameters
	 * @returns List of spaces
	 */
	public async getSpaces(params?: {
		spaceKey?: string[];
		type?: 'global' | 'personal' | string;
		status?: 'current' | 'archived' | string;
		label?: string;
		expand?: string[];
		start?: number;
		limit?: number;
	}): Promise<SpaceListResponse> {
		const queryParams: Record<string, unknown> = {};

		if (params) {
			if (params.spaceKey && params.spaceKey.length > 0) {
				queryParams['spaceKey'] = params.spaceKey.join(',');
			}

			if (params.type) {
				queryParams['type'] = params.type;
			}

			if (params.status) {
				queryParams['status'] = params.status;
			}

			if (params.label) {
				queryParams['label'] = params.label;
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
			this.client.getV1Url('/space'),
			queryParams
		);
	}
} 
