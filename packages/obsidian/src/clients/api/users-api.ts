import { Logger } from "../../utils";
import { ObsidianConfluenceClient } from "../obsidian-confluence-client";

export interface User {
	type: string;
	username: string;
	userKey: string;
	accountId: string;
	displayName: string;
	email?: string;
	profilePicture?: {
		path: string;
		width: number;
		height: number;
		isDefault: boolean;
	};
	[key: string]: any;
}

export interface UserAnonymous {
	type: string;
	profilePicture: {
		path: string;
		width: number;
		height: number;
		isDefault: boolean;
	};
	displayName: string;
	[key: string]: any;
}

export interface Group {
	type: string;
	name: string;
	[key: string]: any;
}

export interface GroupArrayWithLinks {
	results: Group[];
	size: number;
	start: number;
	limit: number;
	_links: {
		[key: string]: string;
	};
}

export interface BulkUserLookup {
	accountId: string;
	accountType: string;
	email?: string;
	publicName: string;
	profilePicture: {
		path: string;
		width: number;
		height: number;
		isDefault: boolean;
	};
	displayName: string;
	[key: string]: any;
}

export interface BulkUserLookupArray {
	results: BulkUserLookup[];
	size: number;
	start: number;
	limit: number;
	_links: {
		[key: string]: string;
	};
}

export interface UserArray {
	results: User[];
	size: number;
	start: number;
	limit: number;
	_links: {
		[key: string]: string;
	};
}

export interface AccountIdEmailRecord {
	accountId: string;
	email: string;
}

export interface AccountIdEmailRecordArray {
	results: AccountIdEmailRecord[];
	size: number;
	start: number;
	limit: number;
	_links: {
		[key: string]: string;
	};
}

export interface MigratedUser {
	username: string;
	key: string;
	accountId: string;
}

export interface MigratedUserArray {
	results: MigratedUser[];
	size: number;
	start: number;
	limit: number;
	_links: {
		[key: string]: string;
	};
}

export interface UsersApiCallback<T> {
	(error: Error | null, data?: T): void;
}

/**
 * Implementation of the Confluence Users API
 */
export class UsersApi {
	private logger: Logger;
	protected client: ObsidianConfluenceClient;

	constructor(client: ObsidianConfluenceClient) {
		this.client = client;
		this.logger = client.getLogger();
	}

	/**
	 * Get user information - interface method required by RequiredConfluenceClient
	 * @param params Parameters for the request
	 * @returns User information
	 */
	async getUser(params: any): Promise<any> {
		return this.getUserImpl(params);
	}

	/**
	 * Get current user information - interface method required by RequiredConfluenceClient
	 * @param params Parameters for the request (optional)
	 * @returns Current user information
	 */
	async getCurrentUser(params: any = {}): Promise<any> {
		return this.getCurrentUserImpl(params);
	}

	/**
	 * Get current user information implementation
	 * @param params Parameters for the request (optional)
	 * @returns Current user information
	 */
	private async getCurrentUserImpl(params: Record<string, unknown> = {}): Promise<User> {
		this.logger.info(`Getting current user information`);
		
		try {
			const endpoint = `rest/api/user/current`;
			const response = await this.client.fetch(endpoint);
			return response as User;
		} catch (error) {
			this.logger.error(`Error getting current user: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	/**
	 * Get user information implementation
	 * @param params Parameters for the request
	 * @returns User information
	 */
	private async getUserImpl(params: {
		accountId?: string;
		username?: string;
		key?: string;
	}): Promise<User> {
		this.logger.info(`Getting user information: ${JSON.stringify(params)}`);
		
		try {
			let endpoint = `rest/api/user`;
			const queryParams = [];

			if (params.accountId) {
				queryParams.push(`accountId=${encodeURIComponent(params.accountId)}`);
			} else if (params.username) {
				queryParams.push(`username=${encodeURIComponent(params.username)}`);
			} else if (params.key) {
				queryParams.push(`key=${encodeURIComponent(params.key)}`);
			} else {
				throw new Error("At least one of accountId, username, or key is required");
			}

			if (queryParams.length > 0) {
				endpoint += `?${queryParams.join('&')}`;
			}

			const response = await this.client.fetch(endpoint);
			return response as User;
		} catch (error) {
			this.logger.error(`Error getting user: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	/**
	 * Search for users
	 * @param params Search parameters
	 * @returns Search results
	 */
	async search(params: any): Promise<any> {
		return this.searchUser(params);
	}

	/**
	 * Get anonymous user
	 * @param params Parameters for the request
	 * @returns Anonymous user details
	 */
	async getAnonymousUser<T = UserAnonymous>(
		params: Record<string, unknown>
	): Promise<T> {
		this.logger.info(`Getting anonymous user`);
		const response = await this.client.fetch('rest/api/user/anonymous');
		return response as T;
	}

	/**
	 * Get group memberships for a user
	 * @param parameters Parameters for the request
	 * @returns Group memberships
	 */
	async getGroupMembershipsForUser<T = GroupArrayWithLinks>(
		parameters: {
			accountId?: string;
			username?: string;
			key?: string;
			start?: number;
			limit?: number;
		},
		callback?: UsersApiCallback<T>
	): Promise<T | void> {
		try {
			this.logger.info(`Getting group memberships for user: ${JSON.stringify(parameters)}`);

			const queryParams = new URLSearchParams();
			if (parameters.accountId) {
				queryParams.append('accountId', parameters.accountId);
			} else if (parameters.username) {
				queryParams.append('username', parameters.username);
			} else if (parameters.key) {
				queryParams.append('key', parameters.key);
			}

			if (parameters.start) {
				queryParams.append('start', String(parameters.start));
			}

			if (parameters.limit) {
				queryParams.append('limit', String(parameters.limit));
			}

			const queryString = queryParams.toString();
			const endpoint = `rest/api/user/memberof?${queryString}`;

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
	 * Get bulk user lookup
	 * @param parameters Parameters for the request
	 * @returns Bulk user lookup results
	 */
	async getBulkUserLookup<T = BulkUserLookupArray>(
		parameters: {
			accountId?: string | string[];
			username?: string | string[];
			key?: string | string[];
			expand?: string | string[];
		},
		callback?: UsersApiCallback<T>
	): Promise<T | void> {
		try {
			this.logger.info(`Getting bulk user lookup`);

			const queryParams = new URLSearchParams();

			if (parameters.accountId) {
				queryParams.append('accountId', Array.isArray(parameters.accountId)
					? parameters.accountId.join(',')
					: String(parameters.accountId));
			}

			if (parameters.username) {
				queryParams.append('username', Array.isArray(parameters.username)
					? parameters.username.join(',')
					: String(parameters.username));
			}

			if (parameters.key) {
				queryParams.append('key', Array.isArray(parameters.key)
					? parameters.key.join(',')
					: String(parameters.key));
			}

			if (parameters.expand) {
				queryParams.append('expand', Array.isArray(parameters.expand)
					? parameters.expand.join(',')
					: String(parameters.expand));
			}

			const queryString = queryParams.toString();
			const endpoint = `rest/api/user/bulk?${queryString}`;

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
	 * Search users
	 * @param parameters Parameters for the request
	 * @returns Search results
	 */
	async userSearch<T = UserArray>(
		parameters: {
			cql?: string;
			start?: number;
			limit?: number;
			expand?: string | string[];
		},
		callback?: UsersApiCallback<T>
	): Promise<T | void> {
		try {
			this.logger.info(`Searching users with parameters: ${JSON.stringify(parameters)}`);

			const queryParams = new URLSearchParams();

			if (parameters.cql) {
				queryParams.append('cql', parameters.cql);
			}

			if (parameters.start) {
				queryParams.append('start', String(parameters.start));
			}

			if (parameters.limit) {
				queryParams.append('limit', String(parameters.limit));
			}

			if (parameters.expand) {
				queryParams.append('expand', Array.isArray(parameters.expand)
					? parameters.expand.join(',')
					: String(parameters.expand));
			}

			const queryString = queryParams.toString();
			const endpoint = `rest/api/search/user?${queryString}`;

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
	 * Search user (alternative endpoint)
	 * @param parameters Parameters for the request
	 * @returns Search results
	 */
	async searchUser<T = UserArray>(
		parameters: {
			query?: string;
			start?: number;
			limit?: number;
			expand?: string | string[];
		},
		callback?: UsersApiCallback<T>
	): Promise<T | void> {
		try {
			this.logger.info(`Searching users with parameters: ${JSON.stringify(parameters)}`);

			const queryParams = new URLSearchParams();

			if (parameters.query) {
				queryParams.append('query', parameters.query);
			}

			if (parameters.start) {
				queryParams.append('start', String(parameters.start));
			}

			if (parameters.limit) {
				queryParams.append('limit', String(parameters.limit));
			}

			if (parameters.expand) {
				queryParams.append('expand', Array.isArray(parameters.expand)
					? parameters.expand.join(',')
					: String(parameters.expand));
			}

			const queryString = queryParams.toString();
			const endpoint = `rest/api/user/search?${queryString}`;

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
	 * Get privacy unsafe user email
	 * @param parameters Parameters for the request
	 * @returns User email record
	 */
	async getPrivacyUnsafeUserEmail<T = AccountIdEmailRecord>(
		parameters: {
			accountId: string;
		},
		callback?: UsersApiCallback<T>
	): Promise<T | void> {
		try {
			this.logger.info(`Getting privacy unsafe user email for account ID: ${parameters.accountId}`);

			const endpoint = `rest/api/user/email?accountId=${encodeURIComponent(parameters.accountId)}`;

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
	 * Get privacy unsafe user email bulk
	 * @param parameters Parameters for the request
	 * @returns User email records
	 */
	async getPrivacyUnsafeUserEmailBulk<T = AccountIdEmailRecordArray>(
		parameters: {
			accountIds: string[];
		},
		callback?: UsersApiCallback<T>
	): Promise<T | void> {
		try {
			this.logger.info(`Getting privacy unsafe user emails for account IDs: ${parameters.accountIds.join(',')}`);

			const endpoint = `rest/api/user/email/bulk?accountId=${parameters.accountIds.join(',')}`;

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
	 * Get bulk user migration
	 * @param parameters Parameters for the request
	 * @returns Migrated user records
	 */
	async getBulkUserMigration<T = MigratedUserArray>(
		parameters: {
			key?: string | string[];
			username?: string | string[];
			start?: number;
			limit?: number;
		},
		callback?: UsersApiCallback<T>
	): Promise<T | void> {
		try {
			this.logger.info(`Getting bulk user migration with parameters: ${JSON.stringify(parameters)}`);

			const queryParams = new URLSearchParams();

			if (parameters.key) {
				queryParams.append('key', Array.isArray(parameters.key)
					? parameters.key.join(',')
					: String(parameters.key));
			}

			if (parameters.username) {
				queryParams.append('username', Array.isArray(parameters.username)
					? parameters.username.join(',')
					: String(parameters.username));
			}

			if (parameters.start) {
				queryParams.append('start', String(parameters.start));
			}

			if (parameters.limit) {
				queryParams.append('limit', String(parameters.limit));
			}

			const queryString = queryParams.toString();
			const endpoint = `rest/api/user/bulk/migration?${queryString}`;

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
} 
