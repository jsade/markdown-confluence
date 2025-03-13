import { RequiredConfluenceClient } from "@markdown-confluence/lib";
import {
    Api,
    AuthenticationService,
    Callback,
    Client,
    Config,
    RequestConfig,
} from "confluence.js";
import { requestUrl } from "obsidian";
import { Logger, LogLevel } from "./utils";

const ATLASSIAN_TOKEN_CHECK_FLAG = "X-Atlassian-Token";
const ATLASSIAN_TOKEN_CHECK_NOCHECK_VALUE = "no-check";

// Maps of API endpoint prefixes to their corresponding API versions
// These are based on the Confluence API documentation
const V1_API_ENDPOINTS = [
	'audit',
	'analytics',
	'content',
	'space',
	'user',
	'group',
	'history',
	'search',
	'template',
	'label',
	'relation',
	'longtask',
	'settings'
];

const V2_API_ENDPOINTS = [
	'attachments',
	'blogposts',
	'children',
	'custom-content',
	'databases',
	'embeds',
	'folders',
	'pages',
	'spaces',
	'whiteboards',
	'labels'
];

export class MyBaseClient implements Client {
	// Add the api property required by the Client interface
	api = {};

	protected logger: Logger;

	// URL prefixes for different API versions
	protected v1UrlPrefix = "/wiki/rest/api";
	protected v2UrlPrefix = "/wiki/api/v2";

	// Default to v2 as preferred, but can fall back to v1
	apiVersion: 'v1' | 'v2' = 'v2';

	constructor(protected readonly config: Config) {
		this.logger = Logger.createDefault();
		this.logger.updateOptions({
			prefix: "ConfluenceClient",
			minLevel: LogLevel.INFO, // Set to INFO level to see important messages
		});
	}

	// Method to access the logger from derived classes
	getLogger(): Logger {
		return this.logger;
	}

	// Method to access the base URL from derived classes
	getBaseUrl(): string {
		return this.config.host;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected paramSerializer(parameters: Record<string, any>): string {
		this.logger.debug("Serializing parameters", parameters);
		const parts: string[] = [];

		Object.entries(parameters).forEach(([key, value]) => {
			if (value === null || typeof value === "undefined") {
				return;
			}

			if (Array.isArray(value)) {
				// eslint-disable-next-line no-param-reassign
				value = value.join(",");
			}

			if (value instanceof Date) {
				// eslint-disable-next-line no-param-reassign
				value = value.toISOString();
			} else if (value !== null && typeof value === "object") {
				// eslint-disable-next-line no-param-reassign
				value = JSON.stringify(value);
			} else if (value instanceof Function) {
				const part = value();

				return part && parts.push(part);
			}

			parts.push(`${this.encode(key)}=${this.encode(value)}`);

			return;
		});

		return parts.join("&");
	}

	protected encode(value: string) {
		return encodeURIComponent(value)
			.replace(/%3A/gi, ":")
			.replace(/%24/g, "$")
			.replace(/%2C/gi, ",")
			.replace(/%20/g, "+")
			.replace(/%5B/gi, "[")
			.replace(/%5D/gi, "]");
	}

	protected removeUndefinedProperties(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		obj: Record<string, any>,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	): Record<string, any> {
		return Object.entries(obj)
			.filter(([, value]) => typeof value !== "undefined")
			.reduce(
				(accumulator, [key, value]) => ({
					...accumulator,
					[key]: value,
				}),
				{},
			);
	}

	async sendRequest<T>(
		requestConfig: RequestConfig,
		callback: never,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		telemetryData?: any,
	): Promise<T>;
	async sendRequest<T>(
		requestConfig: RequestConfig,
		callback: Callback<T>,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		telemetryData?: any,
	): Promise<void>;
	async sendRequest<T>(
		requestConfig: RequestConfig,
		callback: Callback<T> | never,
	): Promise<void | T> {
		this.logger.debug("Sending request", {
			method: requestConfig.method,
			url: requestConfig.url,
			params: requestConfig.params
		});
		try {
			const contentType = (requestConfig.headers ?? {})[
				"content-type"
			]?.toString();
			if (requestConfig.headers && contentType) {
				requestConfig.headers["Content-Type"] = contentType;
				delete requestConfig?.headers["content-type"];
			}

			const params = this.paramSerializer(requestConfig.params);

			const requestContentType =
				(requestConfig.headers ?? {})["Content-Type"]?.toString() ??
				"application/json";

			const requestBody = requestContentType.startsWith(
				"multipart/form-data",
			)
				? [
					requestConfig.data.getHeaders(),
					requestConfig.data.getBuffer().buffer,
				]
				: [{}, JSON.stringify(requestConfig.data)];

			const modifiedRequestConfig = {
				...requestConfig,
				headers: this.removeUndefinedProperties({
					"User-Agent": "Obsidian.md",
					Accept: "application/json",
					[ATLASSIAN_TOKEN_CHECK_FLAG]: this.config
						.noCheckAtlassianToken
						? ATLASSIAN_TOKEN_CHECK_NOCHECK_VALUE
						: undefined,
					...this.config.baseRequestConfig?.headers,
					Authorization:
						await AuthenticationService.getAuthenticationToken(
							this.config.authentication,
							{
								// eslint-disable-next-line @typescript-eslint/naming-convention
								baseURL: this.config.host,
								url: `${this.config.host}${this.apiVersion === 'v2' ? this.v2UrlPrefix : this.v1UrlPrefix}`,
								method: requestConfig.method ?? "GET",
							},
						),
					...requestConfig.headers,
					"Content-Type": requestContentType,
					...requestBody[0],
				}),
				url: this.buildApiUrl(requestConfig.url || '', params),
				body: requestBody[1],
				method: requestConfig.method?.toUpperCase() ?? "GET",
				contentType: requestContentType,
				throw: false,
			};
			delete modifiedRequestConfig.data;

			const response = await requestUrl(modifiedRequestConfig);

			if (response.status >= 400) {
				throw new HTTPError(`Received a ${response.status}`, {
					status: response.status,
					data: response.text,
				});
			}

			const callbackResponseHandler =
				callback && ((data: T): void => callback(null, data));
			const defaultResponseHandler = (data: T): T => data;

			const responseHandler =
				callbackResponseHandler ?? defaultResponseHandler;

			this.config.middlewares?.onResponse?.(response.json);

			return responseHandler(response.json);
		} catch (e: unknown) {
			this.logger.warn("HTTP Error occurred", { httpError: e, requestConfig });

			// Define a type for axios error
			interface AxiosError {
				isAxiosError: boolean;
				response: {
					data: unknown;
				};
			}

			const err =
				this.config.newErrorHandling &&
					typeof e === 'object' && e !== null && 'isAxiosError' in e && (e as AxiosError).isAxiosError
					? (e as AxiosError).response.data
					: e;

			const callbackErrorHandler =
				callback && ((error: Config.Error) => callback(error));
			const defaultErrorHandler = (error: Error) => {
				throw error;
			};

			const errorHandler = callbackErrorHandler ?? defaultErrorHandler;

			// Create a proper Config.Error object
			interface ConfigErrorLike extends Error {
				isAxiosError: boolean;
				toJSON: () => { message: string };
			}

			const createConfigError = (error: unknown): Config.Error => {
				if (error instanceof Error) {
					return error as unknown as Config.Error;
				}

				// Create an AxiosError-like object
				const configError = new Error(String(error)) as ConfigErrorLike;
				configError.isAxiosError = false;
				configError.toJSON = () => ({ message: configError.message });

				return configError as unknown as Config.Error;
			};

			if (this.config.middlewares?.onError) {
				this.config.middlewares.onError(createConfigError(err));
			}

			return errorHandler(createConfigError(err));
		}
	}

	/**
	 * Determine which API version to use for a given endpoint based on the endpoint name
	 * @param endpoint The API endpoint path
	 * @returns 'v1' or 'v2' indicating which API version to use
	 */
	protected determineApiVersion(endpoint: string): 'v1' | 'v2' {
		// Clean up endpoint to make matching easier
		const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;

		// Check for explicit version indicators in the path
		if (cleanEndpoint.startsWith('api/v2/')) {
			return 'v2';
		}

		// Explicit v1 API format
		if (cleanEndpoint.startsWith('rest/api/')) {
			return 'v1';
		}

		// Legacy format - still treated as v1
		if (cleanEndpoint.startsWith('api/')) {
			return 'v1';
		}

		// Extract the first path segment for comparison with known endpoint mappings
		const pathSegments = cleanEndpoint.split('/');
		const firstPathSegment = pathSegments.length > 0 ? pathSegments[0] : '';

		// Check if it's a known v2 endpoint
		if (firstPathSegment && V2_API_ENDPOINTS.includes(firstPathSegment)) {
			return 'v2';
		}

		// Check if it's a known v1 endpoint
		if (firstPathSegment && V1_API_ENDPOINTS.includes(firstPathSegment)) {
			return 'v1';
		}

		// If not explicitly mapped, fall back to the configured API version
		return this.apiVersion;
	}

	/**
	 * Build the appropriate API URL based on the endpoint and API version
	 */
	protected buildApiUrl(endpoint: string, queryParams?: string): string {
		// Clean up endpoint to avoid double slashes
		const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;

		// Explicit v2 API endpoints
		if (cleanEndpoint.startsWith('api/v2/')) {
			const fullUrl = `${this.config.host}/wiki/${cleanEndpoint}${queryParams ? `?${queryParams}` : ''}`;
			this.logger.debug(`Using explicit v2 URL: ${fullUrl}`);
			return fullUrl;
		}

		// Explicit v1 API endpoints (proper rest/api format)
		if (cleanEndpoint.startsWith('rest/api/')) {
			const fullUrl = `${this.config.host}/wiki/${cleanEndpoint}${queryParams ? `?${queryParams}` : ''}`;
			this.logger.debug(`Using explicit v1 rest URL: ${fullUrl}`);
			return fullUrl;
		}

		// Legacy v1 API endpoints (content endpoints using api/ format)
		if (cleanEndpoint.startsWith('api/')) {
			const fullUrl = `${this.config.host}/wiki/${cleanEndpoint}${queryParams ? `?${queryParams}` : ''}`;
			this.logger.debug(`Using legacy v1 content URL: ${fullUrl}`);
			return fullUrl;
		}

		// Determine which API version to use for this endpoint
		const apiVersionToUse = this.determineApiVersion(cleanEndpoint);

		// Use the appropriate prefix based on the determined API version
		if (apiVersionToUse === 'v2') {
			const fullUrl = `${this.config.host}${this.v2UrlPrefix}/${cleanEndpoint}${queryParams ? `?${queryParams}` : ''}`;
			this.logger.debug(`Using v2 API URL for endpoint '${cleanEndpoint}': ${fullUrl}`);
			return fullUrl;
		} else {
			const fullUrl = `${this.config.host}${this.v1UrlPrefix}/${cleanEndpoint}${queryParams ? `?${queryParams}` : ''}`;
			this.logger.debug(`Using v1 API URL for endpoint '${cleanEndpoint}': ${fullUrl}`);
			return fullUrl;
		}
	}

	async fetch(url: string, options: Record<string, unknown> = {}): Promise<unknown> {
		// Build the appropriate URL based on the URL and determined API version
		const fullUrl = this.buildApiUrl(url, '');
		const apiVersionToUse = this.determineApiVersion(url);

		this.logger.debug(`Making request to: ${fullUrl}`, {
			method: options['method'] || 'GET',
			apiVersion: apiVersionToUse
		});

		const headers = {
			'Content-Type': 'application/json',
			'Authorization': this.getAuthorizationHeader(),
			...(options['headers'] as Record<string, string> || {})
		};

		const response = await requestUrl({
			url: fullUrl,
			method: options['method'] as string || 'GET',
			headers: headers as Record<string, string>,
			body: options['body'] as string,
			throw: false
		});

		if (response.status >= 400) {
			this.logger.error(`HTTP Error ${response.status}:`, response.text);
			throw new Error(`HTTP Error ${response.status}: ${response.text}`);
		}

		return response.json;
	}

	// Helper method to get authorization header
	protected getAuthorizationHeader(): string {
		if (!this.config.authentication) {
			return '';
		}

		// Handle basic auth
		if ('basic' in this.config.authentication) {
			const basic = this.config.authentication.basic;
			if ('email' in basic && 'apiToken' in basic) {
				const { email, apiToken } = basic;
				return `Basic ${btoa(`${email}:${apiToken}`)}`;
			} else if ('username' in basic && 'password' in basic) {
				const { username, password } = basic;
				return `Basic ${btoa(`${username}:${password}`)}`;
			}
		}

		// Handle other auth types if needed
		return '';
	}

	async detectApiV2(): Promise<boolean> {
		// Always try to use v2 first, fall back to v1 if needed
		try {
			this.logger.info("Checking for API v2 support");
			const v2TestUrl = `${this.config.host}/wiki/api/v2/spaces`;
			this.logger.info(`Testing API v2 endpoint: ${v2TestUrl}`);

			// Make a direct request to avoid any circular dependency with fetch()
			const response = await requestUrl({
				url: v2TestUrl,
				method: 'HEAD',
				headers: {
					'Accept': 'application/json',
					'Authorization': this.getAuthorizationHeader()
				},
				throw: false
			});

			if (response.status >= 200 && response.status < 300) {
				this.apiVersion = 'v2';
				this.logger.info("SUCCESS: Confluence API v2 is available and will be used");

				// Additional validation - verify folder endpoints
				try {
					const folderTestUrl = `${this.config.host}/wiki/api/v2/folders?limit=1`;
					this.logger.info(`Verifying v2 folder endpoints: ${folderTestUrl}`);

					const folderResponse = await requestUrl({
						url: folderTestUrl,
						method: 'HEAD',
						headers: {
							'Accept': 'application/json',
							'Authorization': this.getAuthorizationHeader()
						},
						throw: false
					});

					if (folderResponse.status >= 200 && folderResponse.status < 300) {
						this.logger.info("SUCCESS: Folder endpoints are available in API v2");
					} else {
						this.logger.warn(`WARNING: Folder endpoints returned status ${folderResponse.status}, but continuing with API v2`);
						this.logger.warn(`This may cause issues with folder operations. Response text: ${folderResponse.text}`);
					}
				} catch (folderError) {
					this.logger.warn("WARNING: Folder endpoints test failed, but continuing with API v2");
					this.logger.warn(`Folder endpoint error: ${folderError instanceof Error ? folderError.message : String(folderError)}`);
				}

				return true;
			} else {
				this.logger.warn(`API v2 endpoint returned status ${response.status}, falling back to v1`);
				this.logger.warn(`Response text: ${response.text}`);
				this.apiVersion = 'v1';
				return false;
			}
		} catch (error) {
			this.logger.warn("Confluence API v2 is not available, falling back to v1");
			this.logger.warn(`API v2 detection error: ${error instanceof Error ? error.message : String(error)}`);

			this.apiVersion = 'v1';
			return false;
		}
	}

	/**
	 * Helper method to determine the content type for a given ID to use the appropriate v2 API endpoint
	 * @param contentId The ID of the content to check
	 * @returns The content type ('page', 'blogpost', 'custom-content') or undefined if not determined
	 */
	public async determineContentTypeForId(contentId: string): Promise<string | undefined> {
		let contentType: string | undefined;

		try {
			// If we're using v2 API, try to determine the content type first
			if (this.apiVersion === 'v2') {
				// We need to know the content type to use the correct endpoint
				// Try to look it up via a head request first
				this.logger.debug(`Determining content type for ID: ${contentId}`);

				// Try page endpoint first
				try {
					const pageResponse = await requestUrl({
						url: `${this.config.host}/wiki/api/v2/pages/${contentId}`,
						method: 'HEAD',
						headers: {
							'Accept': 'application/json',
							'Authorization': this.getAuthorizationHeader()
						},
						throw: false
					});

					if (pageResponse.status >= 200 && pageResponse.status < 300) {
						contentType = 'page';
						this.logger.debug(`Content ID ${contentId} is a page`);
						return contentType;
					}
				} catch (error) {
					this.logger.debug(`ID ${contentId} is not a page: ${error instanceof Error ? error.message : String(error)}`);
				}

				// If not a page, try blogpost
				try {
					const blogpostResponse = await requestUrl({
						url: `${this.config.host}/wiki/api/v2/blogposts/${contentId}`,
						method: 'HEAD',
						headers: {
							'Accept': 'application/json',
							'Authorization': this.getAuthorizationHeader()
						},
						throw: false
					});

					if (blogpostResponse.status >= 200 && blogpostResponse.status < 300) {
						contentType = 'blogpost';
						this.logger.debug(`Content ID ${contentId} is a blogpost`);
						return contentType;
					}
				} catch (error) {
					this.logger.debug(`ID ${contentId} is not a blogpost: ${error instanceof Error ? error.message : String(error)}`);
				}

				// If not a page or blogpost, try custom-content (folders, etc.)
				try {
					const customContentResponse = await requestUrl({
						url: `${this.config.host}/wiki/api/v2/custom-content/${contentId}`,
						method: 'HEAD',
						headers: {
							'Accept': 'application/json',
							'Authorization': this.getAuthorizationHeader()
						},
						throw: false
					});

					if (customContentResponse.status >= 200 && customContentResponse.status < 300) {
						contentType = 'custom-content';
						this.logger.debug(`Content ID ${contentId} is custom-content (possibly a folder)`);
						return contentType;
					}
				} catch (error) {
					this.logger.debug(`ID ${contentId} is not custom-content: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		} catch (error) {
			this.logger.warn(`Error determining content type for ID ${contentId}: ${error instanceof Error ? error.message : String(error)}`);
			this.logger.info('Falling back to v1 API');
		}

		return undefined;
	}

	/**
	 * Search for content using Confluence Query Language (CQL)
	 * @param cql The CQL query string
	 * @param limit Optional limit for the number of results (default: 10)
	 * @returns Search results
	 */
	async searchContentByCQL(cql: string, limit: number = 10): Promise<{
		results: Array<Record<string, unknown>>;
		size: number;
		start: number;
		limit: number;
		[key: string]: unknown;
	}> {
		this.logger.debug(`Searching content with CQL: ${cql}, limit: ${limit}`);

		try {
			// Always use v1 API for CQL search as it's not available in v2
			const endpoint = 'rest/api/content/search';

			// Build query parameters
			const queryParams = {
				cql,
				limit: limit.toString()
			};

			const queryString = this.paramSerializer(queryParams);
			const url = `${endpoint}?${queryString}`;

			this.logger.debug(`Making CQL search request to: ${url}`);
			const response = await this.fetch(url);

			if (!response) {
				throw new Error("No response received from CQL search");
			}

			this.logger.debug(`CQL search returned ${(response as { size?: number })?.size || 0} results`);
			return response as {
				results: Array<Record<string, unknown>>;
				size: number;
				start: number;
				limit: number;
				[key: string]: unknown;
			};
		} catch (error) {
			this.logger.error(`Error performing CQL search: ${error instanceof Error ? error.message : String(error)}`);
			if (error instanceof Error && 'response' in error) {
				this.logger.error(`API response error details: ${JSON.stringify((error as { response: unknown }).response, null, 2)}`);
			}
			throw error;
		}
	}

	/**
	 * Find a folder by title in a specific space
	 * @param title The folder title to search for
	 * @param spaceKey The space key to search in
	 * @returns The folder details if found, or null if not found
	 */
	async findFolderByTitle(title: string, spaceKey: string): Promise<{
		id: string;
		title: string;
		type: string;
		[key: string]: unknown;
	} | null> {
		this.logger.info(`Searching for folder with title "${title}" in space "${spaceKey}"`);

		try {
			// Escape quotes in the title for the CQL query
			const escapedTitle = title.replace(/"/g, '\\"');

			// Build CQL query: space="<spaceKey>" AND title="<title>" AND type="folder"
			const cql = `space="${spaceKey}" AND title="${escapedTitle}" AND type="folder"`;
			this.logger.debug(`Using CQL query: ${cql}`);

			// Search for the folder
			const searchResults = await this.searchContentByCQL(cql, 1);

			if (searchResults.size > 0 && searchResults.results.length > 0) {
				const folder = searchResults.results[0];
				// Check for undefined and use safe property access
				const folderTitle = folder && typeof folder === 'object' ? (folder['title'] as string || 'Unknown') : 'Unknown';
				const folderId = folder && typeof folder === 'object' ? (folder['id'] as string || 'Unknown') : 'Unknown';
				this.logger.info(`Found folder: "${folderTitle}" with ID ${folderId}`);
				return folder as {
					id: string;
					title: string;
					type: string;
					[key: string]: unknown;
				};
			}

			this.logger.info(`No folder found with title "${title}" in space "${spaceKey}"`);
			return null;
		} catch (error) {
			this.logger.error(`Error finding folder by title: ${error instanceof Error ? error.message : String(error)}`);
			if (error instanceof Error && 'response' in error) {
				this.logger.error(`API response error details: ${JSON.stringify((error as { response: unknown }).response, null, 2)}`);
			}
			// Return null instead of throwing to make it easier to handle folder not found cases
			return null;
		}
	}
}

export interface ErrorData {
	data: unknown;
	status: number;
}

export class HTTPError extends Error {
	constructor(
		msg: string,
		public response: ErrorData,
	) {
		super(msg);

		// Set the prototype explicitly.
		Object.setPrototypeOf(this, HTTPError.prototype);
	}
}

// Define basic response interfaces to work with both v1 and v2 API
interface BasicContentResponse {
	id: string;
	type?: string;
	title?: string;
	space?: { key?: string };
	version?: { number?: number; by?: { accountId?: string } };
	body?: {
		['atlas_doc_format']?: { value?: string }
	};
	ancestors?: Array<{ id: string }>;
	[key: string]: unknown;
}

interface BasicSearchResponse {
	results: BasicContentResponse[];
	[key: string]: unknown;
}

interface BasicAttachmentResponse {
	id: string;
	title?: string;
	[key: string]: unknown;
}

interface BasicLabel {
	id?: string;
	name?: string;
	[key: string]: unknown;
}

export class ObsidianConfluenceClient
	extends MyBaseClient
	implements RequiredConfluenceClient {
	content: Api.Content;
	space: Api.Space;
	contentAttachments: Api.ContentAttachments;
	contentLabels: Api.ContentLabels;
	users: Api.Users;
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
			updateFolder: (id: string, params: {
				title?: string;
				parentId?: string;
			}) => Promise<{
				id: string;
				title: string;
				[key: string]: unknown;
			}>;
		};
	};

	// Explicitly implement the fetch method as required by the interface
	override fetch(url: string, options: Record<string, unknown> = {}): Promise<unknown> {
		return super.fetch(url, options);
	}

	// Explicitly implement the searchContentByCQL method as required by the interface
	override searchContentByCQL(cql: string, limit: number = 10): Promise<{
		results: Array<Record<string, unknown>>;
		size: number;
		start: number;
		limit: number;
		[key: string]: unknown;
	}> {
		return super.searchContentByCQL(cql, limit);
	}

	// Explicitly implement the findFolderByTitle method as required by the interface
	override findFolderByTitle(title: string, spaceKey: string): Promise<{
		id: string;
		title: string;
		type: string;
		[key: string]: unknown;
	} | null> {
		return super.findFolderByTitle(title, spaceKey);
	}

	constructor(config: Config) {
		super(config);

		// Initialize API properties with proper implementations
		this.content = {
			// Implement getContentById method that's missing
			getContentById: async (params: { id: string; expand?: string[] }) => {
				this.logger.info(`Fetching content by ID: ${params.id}`);

				// Use explicit v1 API endpoint format
				const endpoint = `rest/api/content/${params.id}`;

				// Add expand parameter if provided
				const queryParams: Record<string, string> = {};
				if (params.expand && params.expand.length > 0) {
					queryParams['expand'] = params.expand.join(',');
				}

				// Convert queryParams to URL query string
				const queryString = Object.keys(queryParams).length > 0
					? '?' + Object.entries(queryParams)
						.map(([key, value]) => `${this.encode(key)}=${this.encode(value)}`)
						.join('&')
					: '';

				const response = await this.fetch(endpoint + queryString);
				return response as BasicContentResponse;
			},

			// Implement getContent method
			getContent: async (params?: Record<string, unknown>) => {
				this.logger.info(`Searching for content with params: ${params ? JSON.stringify(params) : '{}'}`);

				// Use explicit v1 API endpoint format
				const endpoint = 'rest/api/content';

				// Convert params to URL query string
				let queryString = '';
				if (params) {
					queryString = '?' + Object.entries(params)
						.filter(([_, value]) => value !== undefined)
						.map(([key, value]) => {
							if (Array.isArray(value)) {
								return `${this.encode(key)}=${this.encode(value.join(','))}`;
							}
							return `${this.encode(key)}=${this.encode(String(value))}`;
						})
						.join('&');
				}

				const response = await this.fetch(endpoint + queryString);
				return response as BasicSearchResponse;
			},

			// Implement createContent method
			createContent: async (params: Record<string, unknown>) => {
				this.logger.info(`Creating content: ${JSON.stringify(params)}`);

				// Use explicit v1 API endpoint format
				const response = await this.fetch('rest/api/content', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(params)
				});
				return response as BasicContentResponse;
			},

			// Implement updateContent method
			updateContent: async (params: Record<string, unknown>) => {
				this.logger.info(`Updating content: ${JSON.stringify({
					id: params['id'],
					type: params['type'],
					title: params['title'],
					version: params['version']
				})}`);

				const contentId = params['id'] as string;
				const contentType = params['type'] as string;

				// Determine which API version to use based on content type
				if (this.apiVersion === 'v2') {
					// Try to get more specific content type from the API
					const detectedContentType = await this.determineContentTypeForId(contentId);

					if (detectedContentType === 'page') {
						// Use v2 pages endpoint for page content
						this.logger.info(`Using v2 API for page update: ${contentId}`);

						// Prepare the request body for v2 API format
						const v2RequestBody: Record<string, unknown> = {
							id: contentId,
							status: 'current',
							title: params['title'],
							body: params['body'],
							version: {
								number: (params['version'] as { number: number }).number + 1,
							}
						};

						// Handle ancestors/parent for page movement if specified
						if (params['ancestors'] && Array.isArray(params['ancestors']) && params['ancestors'].length > 0) {
							const parentId = (params['ancestors'][0] as { id: string }).id;
							this.logger.info(`Setting parent ID for page: ${parentId}`);
							v2RequestBody['parentId'] = parentId;
						}

						// Make the API request using v2 endpoint
						const response = await this.fetch(`api/v2/pages/${contentId}`, {
							method: 'PUT',
							headers: {
								'Content-Type': 'application/json'
							},
							body: JSON.stringify(v2RequestBody)
						});

						return response as BasicContentResponse;
					}
					else if (detectedContentType === 'blogpost') {
						// Use v2 blogposts endpoint for blog content
						this.logger.info(`Using v2 API for blogpost update: ${contentId}`);

						// Prepare the request body for v2 API format
						const v2RequestBody: Record<string, unknown> = {
							id: contentId,
							status: 'current',
							title: params['title'],
							body: params['body'],
							version: {
								number: (params['version'] as { number: number }).number + 1,
							}
						};

						// Handle blogpost publish date if specified
						if (params['blogpost'] && typeof params['blogpost'] === 'object') {
							const currentVersion = v2RequestBody['version'] as Record<string, unknown>;
							const blogpostVersion = (params['blogpost'] as Record<string, unknown>)['version'] as Record<string, unknown>;

							if (blogpostVersion) {
								v2RequestBody['version'] = {
									...currentVersion,
									...blogpostVersion
								};
							}
						}

						// Make the API request using v2 endpoint 
						const response = await this.fetch(`api/v2/blogposts/${contentId}`, {
							method: 'PUT',
							headers: {
								'Content-Type': 'application/json'
							},
							body: JSON.stringify(v2RequestBody)
						});

						return response as BasicContentResponse;
					}
					else if (detectedContentType === 'custom-content' || contentType === 'folder') {
						// Use v2 custom-content endpoint for folder content or other custom types
						this.logger.info(`Using v2 API for ${contentType} update: ${contentId}`);

						// Prepare the request body for v2 API format
						const v2RequestBody: Record<string, unknown> = {
							id: contentId,
							status: 'current',
							title: params['title'],
							body: params['body'],
							version: {
								number: (params['version'] as { number: number }).number + 1,
							}
						};

						// Handle ancestors/parent for folder movement if specified
						if (params['ancestors'] && Array.isArray(params['ancestors']) && params['ancestors'].length > 0) {
							const parentId = (params['ancestors'][0] as { id: string }).id;
							this.logger.info(`Setting parent ID for folder: ${parentId}`);
							v2RequestBody['parentId'] = parentId;
						}

						// Make the API request using v2 endpoint
						const response = await this.fetch(`api/v2/custom-content/${contentId}`, {
							method: 'PUT',
							headers: {
								'Content-Type': 'application/json'
							},
							body: JSON.stringify(v2RequestBody)
						});

						return response as BasicContentResponse;
					}

					// If content type doesn't match known v2 endpoints or wasn't detected, use type from params as fallback
					if (!detectedContentType) {
						this.logger.info(`Content type not detected from API, using provided type: ${contentType}`);

						// Use content type from params to determine endpoint
						if (contentType === 'page') {
							// Handle page update logic as above
							// [Same code as above for pages]
							this.logger.info(`Using v2 API for page update based on params: ${contentId}`);

							const v2RequestBody: Record<string, unknown> = {
								id: contentId,
								status: 'current',
								title: params['title'],
								body: params['body'],
								version: {
									number: (params['version'] as { number: number }).number + 1,
								}
							};

							if (params['ancestors'] && Array.isArray(params['ancestors']) && params['ancestors'].length > 0) {
								const parentId = (params['ancestors'][0] as { id: string }).id;
								this.logger.info(`Setting parent ID for page: ${parentId}`);
								v2RequestBody['parentId'] = parentId;
							}

							const response = await this.fetch(`api/v2/pages/${contentId}`, {
								method: 'PUT',
								headers: {
									'Content-Type': 'application/json'
								},
								body: JSON.stringify(v2RequestBody)
							});

							return response as BasicContentResponse;
						}
						// Similar logic for other content types
						else if (contentType === 'blogpost') {
							// Blogpost logic similar to above
						}
						else if (contentType === 'custom-content' || contentType === 'folder') {
							// Folder logic similar to above
							this.logger.info(`Using v2 API for ${contentType} update based on params: ${contentId}`);

							const v2RequestBody: Record<string, unknown> = {
								id: contentId,
								status: 'current',
								title: params['title'],
								body: params['body'],
								version: {
									number: (params['version'] as { number: number }).number + 1,
								}
							};

							if (params['ancestors'] && Array.isArray(params['ancestors']) && params['ancestors'].length > 0) {
								const parentId = (params['ancestors'][0] as { id: string }).id;
								this.logger.info(`Setting parent ID for folder: ${parentId}`);
								v2RequestBody['parentId'] = parentId;
							}

							const response = await this.fetch(`api/v2/custom-content/${contentId}`, {
								method: 'PUT',
								headers: {
									'Content-Type': 'application/json'
								},
								body: JSON.stringify(v2RequestBody)
							});

							return response as BasicContentResponse;
						}
						else {
							this.logger.warn(`Unrecognized content type for v2 API: ${contentType}, falling back to v1`);
						}
					}
				}

				// Fallback to v1 API if v2 is not available or content type not supported in v2
				this.logger.info(`Using v1 API for content update: ${contentId}`);
				const response = await this.fetch(`rest/api/content/${contentId}`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(params)
				});
				return response as BasicContentResponse;
			}
		} as unknown as Api.Content;

		this.space = {
			// Basic implementation of space API
			getSpace: async (params: { spaceKey: string }) => {
				this.logger.info(`Getting space: ${JSON.stringify(params)}`);

				// Use explicit v1 API endpoint format
				const response = await this.fetch(`rest/api/space/${params.spaceKey}`);
				return response as unknown;
			}
		} as unknown as Api.Space;

		this.contentAttachments = {
			// Basic implementation of attachments API
			createOrUpdateAttachment: async (params: Record<string, unknown>) => {
				this.logger.info(`Creating/updating attachment: ${JSON.stringify({
					id: params['id'],
					filename: params['filename']
				})}`);

				// Use explicit v1 API endpoint format
				const endpoint = `rest/api/content/${params['id']}/child/attachment`;
				const formData = new FormData();

				// Add file to form data
				const file = params['file'] as Blob;
				const filename = params['filename'] as string | undefined;
				formData.append('file', file, filename);

				// Add comment if provided
				if (params['comment']) {
					const comment = String(params['comment']);
					formData.append('comment', comment);
				}

				const response = await this.fetch(endpoint, {
					method: 'POST',
					headers: {
						[ATLASSIAN_TOKEN_CHECK_FLAG]: ATLASSIAN_TOKEN_CHECK_NOCHECK_VALUE
					},
					body: formData
				});

				return response as BasicAttachmentResponse;
			},

			// Get attachments for a page
			getAttachments: async (params: { id: string }) => {
				this.logger.info(`Getting attachments for page: ${params.id}`);

				// Use explicit v1 API endpoint format
				const response = await this.fetch(`rest/api/content/${params.id}/child/attachment`);
				return response as BasicSearchResponse;
			}
		} as unknown as Api.ContentAttachments;

		this.contentLabels = {
			// Implementation of labels API
			addLabelsToContent: async (params: { id: string; labels: BasicLabel[] }) => {
				this.logger.info(`Adding labels to content: ${JSON.stringify(params)}`);

				// Determine content type to use the correct v2 endpoint
				const contentType = await this.determineContentTypeForId(params.id);

				// Use v2 API if available and content type is known
				if (this.apiVersion === 'v2' && contentType) {
					this.logger.info(`Using v2 API to add labels to ${contentType} with ID: ${params.id}`);

					// Map the label format appropriately for v2 API
					const v2Labels = params.labels.map(label => ({
						name: label.name,
						prefix: label['prefix'] || 'global'
					}));

					// Use the appropriate v2 endpoint based on content type
					let endpoint: string;

					if (contentType === 'page') {
						endpoint = `api/v2/pages/${params.id}/labels`;
					} else if (contentType === 'blogpost') {
						endpoint = `api/v2/blogposts/${params.id}/labels`;
					} else if (contentType === 'custom-content') {
						endpoint = `api/v2/custom-content/${params.id}/labels`;
					} else {
						// Fallback if we somehow got an unknown content type
						this.logger.warn(`Unknown content type "${contentType}" for v2 API, falling back to v1`);
						// Fallback to v1 API
						const response = await this.fetch(`rest/api/content/${params.id}/label`, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json'
							},
							body: JSON.stringify(params.labels)
						});
						return response as BasicLabel[];
					}

					// Make the v2 API request
					const response = await this.fetch(endpoint, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify(v2Labels)
					});

					return response as BasicLabel[];
				} else {
					// Fallback to v1 API
					this.logger.info(`Using v1 API to add labels to content: ${params.id}`);
					const response = await this.fetch(`rest/api/content/${params.id}/label`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify(params.labels)
					});
					return response as BasicLabel[];
				}
			},

			// Add the getLabelsForContent method that was missing
			getLabelsForContent: async (params: { id: string }) => {
				this.logger.info(`Getting labels for content: ${JSON.stringify(params)}`);

				// Determine content type to use the correct v2 endpoint
				const contentType = await this.determineContentTypeForId(params.id);

				// Use v2 API if available and content type is known
				if (this.apiVersion === 'v2' && contentType) {
					this.logger.info(`Using v2 API to get labels for ${contentType} with ID: ${params.id}`);

					// Use the appropriate v2 endpoint based on content type
					let endpoint: string;

					if (contentType === 'page') {
						endpoint = `api/v2/pages/${params.id}/labels`;
					} else if (contentType === 'blogpost') {
						endpoint = `api/v2/blogposts/${params.id}/labels`;
					} else if (contentType === 'custom-content') {
						endpoint = `api/v2/custom-content/${params.id}/labels`;
					} else {
						// Fallback if we somehow got an unknown content type
						this.logger.warn(`Unknown content type "${contentType}" for v2 API, falling back to v1`);
						// Fallback to v1 API
						const response = await this.fetch(`rest/api/content/${params.id}/label`);
						return response as { results: BasicLabel[] };
					}

					// Make the v2 API request
					const response = await this.fetch(endpoint);

					// Transform v2 response if needed to match expected format
					const results = (response as { results?: BasicLabel[] }).results || [];
					return { results } as { results: BasicLabel[] };
				} else {
					// Fallback to v1 API
					this.logger.info(`Using v1 API to get labels for content: ${params.id}`);
					const response = await this.fetch(`rest/api/content/${params.id}/label`);
					return response as { results: BasicLabel[] };
				}
			},

			// Add the removeLabelFromContentUsingQueryParameter method to be complete
			removeLabelFromContentUsingQueryParameter: async (params: { id: string; name: string }) => {
				this.logger.info(`Removing label from content: ${JSON.stringify(params)}`);

				// Determine content type to use the correct v2 endpoint
				const contentType = await this.determineContentTypeForId(params.id);

				// Use v2 API if available and content type is known
				if (this.apiVersion === 'v2' && contentType) {
					this.logger.info(`Using v2 API to remove label for ${contentType} with ID: ${params.id}`);

					// Use the appropriate v2 endpoint based on content type
					let endpoint: string;

					if (contentType === 'page') {
						endpoint = `api/v2/pages/${params.id}/labels?name=${encodeURIComponent(params.name)}`;
					} else if (contentType === 'blogpost') {
						endpoint = `api/v2/blogposts/${params.id}/labels?name=${encodeURIComponent(params.name)}`;
					} else if (contentType === 'custom-content') {
						endpoint = `api/v2/custom-content/${params.id}/labels?name=${encodeURIComponent(params.name)}`;
					} else {
						// Fallback if we somehow got an unknown content type
						this.logger.warn(`Unknown content type "${contentType}" for v2 API, falling back to v1`);
						// Fallback to v1 API
						await this.fetch(`rest/api/content/${params.id}/label?name=${encodeURIComponent(params.name)}`, {
							method: 'DELETE'
						});
						return;
					}

					// Make the v2 API request
					await this.fetch(endpoint, {
						method: 'DELETE'
					});

					return;
				} else {
					// Fallback to v1 API
					this.logger.info(`Using v1 API to remove label from content: ${params.id}`);
					await this.fetch(`rest/api/content/${params.id}/label?name=${encodeURIComponent(params.name)}`, {
						method: 'DELETE'
					});
					return;
				}
			}
		} as unknown as Api.ContentLabels;

		// Initialize users API with getCurrentUser method
		this.users = {
			getCurrentUser: async () => {
				this.logger.info("Fetching current user with API version", this.apiVersion);

				// Use explicit v1 API endpoint format
				const response = await this.fetch('rest/api/user/current');
				return {
					accountId: (response as { accountId: string }).accountId || 'unknown',
					displayName: (response as { displayName: string }).displayName || 'Unknown User'
				};
			}
		} as unknown as Api.Users;

		// Initialize v2 API
		const foldersApi = new V2FoldersApi(this);
		this.v2 = {
			folders: {
				getFolderById: (id: string) => foldersApi.getFolderById(id),
				createFolder: (params) => foldersApi.createFolder(params),
				updateFolder: (id, params) => foldersApi.updateFolder(id, params)
			}
		};
	}

	// Method to get the logger for use by derived classes
	override getLogger(): Logger {
		return this.logger;
	}

	// Method to safely access the base URL
	override getBaseUrl(): string {
		return this.config.host;
	}
}

interface V2FolderResponse {
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

class V2FoldersApi {
	constructor(private client: ObsidianConfluenceClient) { }

	// Method to safely access the base URL from the client
	private getBaseUrl(): string {
		return this.client.getBaseUrl();
	}

	async createFolder(params: {
		spaceId: string;
		title: string;
		parentId?: string;
	}): Promise<V2FolderResponse> {
		const logger = this.client.getLogger();
		logger.info(`Creating folder "${params.title}" in space ${params.spaceId} with parent ID: ${params.parentId || 'none'}`);

		const requestBody: Record<string, unknown> = {
			title: params.title,
			spaceId: params.spaceId
		};

		if (params.parentId) {
			requestBody['parentId'] = params.parentId;
			logger.info(`Setting parent ID for folder: ${params.parentId}`);
		}

		// Check if the folder already exists (to avoid duplicate folders)
		try {
			// We need to get a space key for CQL search
			// The params.spaceId can be either a numeric space ID or an alphanumeric space key
			let spaceKey = '';
			const isNumericSpaceId = /^\d+$/.test(params.spaceId);

			try {
				if (isNumericSpaceId) {
					// If spaceId is numeric, we need to look up the corresponding space key
					logger.info(`Numeric space ID detected: ${params.spaceId}, looking up corresponding space key`);

					// Use the /rest/api/space/{id} endpoint to get space info by ID
					const url = `${this.client.getBaseUrl()}/wiki/rest/api/space/${params.spaceId}`;
					const response = await this.client.fetch(url, {
						method: 'GET',
						headers: {
							'Content-Type': 'application/json'
						}
					});

					// Extract space key from response
					if (response && typeof response === 'object' && 'key' in response) {
						spaceKey = response.key as string;
						logger.info(`Found space key: ${spaceKey} for space ID: ${params.spaceId}`);
					} else {
						throw new Error(`Could not find space key for ID: ${params.spaceId}`);
					}
				} else {
					// If spaceId parameter is actually a space key (alphanumeric), use it directly
					logger.info(`Using provided space key: ${params.spaceId}`);
					spaceKey = params.spaceId;

					// Verify the space key is valid
					const spaceResponse = await this.client.space.getSpace({
						spaceKey: spaceKey
					});

					if (!spaceResponse || !spaceResponse.key) {
						throw new Error(`Invalid space key: ${spaceKey}`);
					}

					logger.info(`Verified space key: ${spaceKey}`);
				}
			} catch (error) {
				logger.error(`Error retrieving space information: ${error instanceof Error ? error.message : String(error)}`);
				if (error instanceof Error && 'response' in error) {
					logger.error(`API response error details: ${JSON.stringify((error as { response: unknown }).response, null, 2)}`);
				}
				throw new Error(`Failed to resolve space key. CQL search requires a valid space key. Original error: ${error instanceof Error ? error.message : String(error)}`);
			}

			// Check if folder exists using the properly resolved space key
			logger.info(`Checking if folder "${params.title}" already exists in space ${spaceKey}`);
			const existingFolder = await this.client.findFolderByTitle(params.title, spaceKey);

			if (existingFolder) {
				logger.info(`Folder "${params.title}" already exists with ID ${existingFolder['id']}, returning existing folder`);

				// If we have a parent ID and it's different from the existing one, update the folder's parent
				if (params.parentId && existingFolder['parentId'] !== params.parentId) {
					logger.info(`Updating parent of existing folder: changing from ${existingFolder['parentId']} to ${params.parentId}`);

					// Update the folder to have the new parent ID
					return await this.updateFolder(existingFolder['id'] as string, {
						parentId: params.parentId
					});
				}

				// Return the existing folder information instead of updating it
				return {
					id: existingFolder.id,
					type: existingFolder.type,
					status: 'current',
					title: existingFolder.title,
					parentId: existingFolder['parentId'] as string | undefined,
					authorId: existingFolder['authorId'] as string || '',
					ownerId: existingFolder['ownerId'] as string || '',
					createdAt: existingFolder['createdAt'] as string || new Date().toISOString(),
					version: {
						createdAt: (existingFolder['version'] as { createdAt?: string })?.createdAt || new Date().toISOString(),
						number: (existingFolder['version'] as { number?: number })?.number || 1,
						minorEdit: false,
						authorId: (existingFolder['version'] as { authorId?: string })?.authorId || ''
					},
					// eslint-disable-next-line @typescript-eslint/naming-convention
					_links: existingFolder['_links'] as { base: string;[key: string]: string } || { base: '' }
				} as V2FolderResponse;
			}

			// If we get here, the folder doesn't exist, so create it
			logger.info(`Folder "${params.title}" not found, proceeding with creation`);
		} catch (error) {
			// If there's an error checking for existing folder, log it but continue with creation
			logger.warn(`Error checking for existing folder: ${error instanceof Error ? error.message : String(error)}`);
			logger.warn("Continuing with folder creation attempt");
		}

		logger.info(`Request body: ${JSON.stringify(requestBody)}`);
		logger.info(`API version: ${this.client.apiVersion}`);
		logger.info(`Base URL: ${this.getBaseUrl()}`);

		try {
			// Use explicit v2 API endpoint format
			const endpoint = 'api/v2/folders';
			logger.info(`Calling endpoint: ${endpoint} with method: POST`);

			const response = await this.client.fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			logger.info(`Folder created successfully: ${JSON.stringify(response)}`);
			return response as V2FolderResponse;
		} catch (error) {
			logger.error(`Error creating folder: ${error instanceof Error ? error.message : String(error)}`);

			// Check for specific API error responses
			if (error instanceof Error && 'response' in error) {
				const errorResponse = (error as unknown as { response: unknown }).response;
				logger.error(`API error response: ${JSON.stringify(errorResponse, null, 2)}`);

				// Try to extract more specific error information
				interface FolderError {
					status: number;
					title?: string;
					code?: string;
					detail?: string | null;
				}

				// Try to extract detailed error messages for better troubleshooting
				if (typeof errorResponse === 'object' && errorResponse !== null) {
					const folderError = errorResponse as FolderError;
					if (folderError.status === 403) {
						throw new Error(`Permission denied when creating folder "${params.title}". Check user permissions.`);
					} else if (folderError.status === 404) {
						throw new Error(`Space with ID ${params.spaceId} or parent with ID ${params.parentId} not found.`);
					} else if (folderError.status === 400 && folderError.detail) {
						throw new Error(`Invalid request when creating folder: ${folderError.detail}`);
					}
				}
			}

			// Re-throw original error if we couldn't extract more specific information
			throw error;
		}
	}

	/**
	 * Update an existing folder with new properties
	 * @param folderId The ID of the folder to update
	 * @param params The properties to update
	 * @returns The updated folder response
	 */
	async updateFolder(id: string, params: {
		title?: string;
		parentId?: string;
	}): Promise<V2FolderResponse> {
		const logger = this.client.getLogger();
		logger.info(`Updating folder ID: ${id} with params: ${JSON.stringify(params)}`);

		try {
			// First, get the current folder
			const existingFolder = await this.getFolderById(id);
			logger.info(`Found existing folder: ${existingFolder.title} (${existingFolder.id})`);

			// Prepare the request body
			const requestBody: Record<string, unknown> = {
				id: id,
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
				logger.info(`Updating folder title to: ${params.title}`);
			} else {
				requestBody['title'] = existingFolder.title;
			}

			// Update parent if specified
			if (params.parentId) {
				requestBody['parentId'] = params.parentId;
				logger.info(`Updating folder parent ID to: ${params.parentId}`);
			}

			// Make the API request
			const endpoint = `api/v2/folders/${id}`;
			logger.info(`Calling endpoint: ${endpoint} with method: PUT`);
			logger.info(`Request body: ${JSON.stringify(requestBody)}`);

			const response = await this.client.fetch(endpoint, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			logger.info(`Folder updated successfully: ${JSON.stringify(response)}`);
			return response as V2FolderResponse;
		} catch (error) {
			logger.error(`Error updating folder: ${error instanceof Error ? error.message : String(error)}`);

			// Check for specific API error responses
			if (error instanceof Error && 'response' in error) {
				const errorResponse = (error as unknown as { response: unknown }).response;
				logger.error(`API error response: ${JSON.stringify(errorResponse, null, 2)}`);

				// Try to extract more specific error information
				if (typeof errorResponse === 'object' && errorResponse !== null) {
					const folderError = errorResponse as {
						status?: number;
						title?: string;
						detail?: string | null;
					};

					if (folderError.status === 403) {
						throw new Error(`Permission denied when updating folder ${id}. Check user permissions.`);
					} else if (folderError.status === 404) {
						throw new Error(`Folder with ID ${id} or parent with ID ${params.parentId} not found.`);
					} else if (folderError.status === 400 && folderError.detail) {
						throw new Error(`Invalid request when updating folder: ${folderError.detail}`);
					}
				}
			}

			throw error;
		}
	}

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

		const logger = this.client.getLogger();
		logger.info(`Getting folder by ID: ${id} using API V2`);
		logger.info(`API version: ${this.client.apiVersion}`);
		logger.info(`Full request URL: ${this.getBaseUrl()}/wiki/api/v2/folders/${id}${queryString ? `?${queryString}` : ''}`);

		try {
			logger.info(`Making API request to get folder with ID: ${id}`);
			const response = await this.client.fetch(url, {
				method: 'GET',
				headers: {
					'Accept': 'application/json'
				}
			});

			logger.info(`Successfully retrieved folder. Response status: ${response ? 'OK' : 'No response'}`);
			logger.info(`Response data: ${JSON.stringify(response, null, 2)}`);

			return response as V2FolderResponse;
		} catch (error) {
			logger.error(`Error getting folder by ID ${id}: ${error instanceof Error ? error.message : String(error)}`);

			// Log detailed error information if available
			if (error instanceof Error && 'response' in error) {
				const errorResponse = (error as { response: unknown }).response;
				logger.error(`API error response: ${JSON.stringify(errorResponse, null, 2)}`);

				// Check if it's a 404 (folder not found)
				if (typeof errorResponse === 'object' && errorResponse &&
					'status' in errorResponse && errorResponse.status === 404) {
					logger.error(`Folder with ID ${id} not found. This is expected if the folder was deleted or never existed.`);
				}
			}

			throw error;
		}
	}

	async deleteFolder(id: string): Promise<void> {
		const logger = this.client.getLogger();
		logger.debug(`Deleting folder with ID: ${id}`);

		try {
			// Use explicit v2 API endpoint format
			await this.client.fetch(`api/v2/folders/${id}`, {
				method: 'DELETE'
			});
			logger.debug(`Successfully deleted folder with ID: ${id}`);
		} catch (error) {
			logger.error(`Error deleting folder with ID ${id}: ${error instanceof Error ? error.message : String(error)}`);

			// Log detailed error information if available
			if (error instanceof Error && 'response' in error) {
				const errorResponse = (error as { response: unknown }).response;
				logger.error(`API error response: ${JSON.stringify(errorResponse, null, 2)}`);
			}

			throw error;
		}
	}
}


