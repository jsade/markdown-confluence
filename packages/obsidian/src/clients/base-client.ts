/**
 * Base client for Confluence API
 */

import {
    AuthenticationService,
    Callback,
    Client,
    Config,
    RequestConfig,
} from "confluence.js";
import { requestUrl } from "obsidian";
import { V1_API_ENDPOINTS, V2_API_ENDPOINTS } from "../constants/api-endpoints";
import { ATLASSIAN_TOKEN_CHECK_FLAG, ATLASSIAN_TOKEN_CHECK_NOCHECK_VALUE } from "../constants/headers";
import { HTTPError } from "../types/error-types";
import { Logger, LogLevel } from "../utils";

export class MyBaseClient implements Client {
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
} 
