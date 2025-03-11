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

export class MyBaseClient implements Client {
	protected urlSuffix = "/wiki/rest";
	protected logger: Logger;

	constructor(protected readonly config: Config) {
		this.logger = Logger.createDefault();
		this.logger.updateOptions({
			prefix: "ConfluenceClient",
			minLevel: LogLevel.SILENT, // Default to silent, will be updated by plugin if available
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
								url: `${this.config.host}${this.urlSuffix}`,
								method: requestConfig.method ?? "GET",
							},
						),
					...requestConfig.headers,
					"Content-Type": requestContentType,
					...requestBody[0],
				}),
				url: `${this.config.host}${this.urlSuffix}${requestConfig.url}?${params}`,
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
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (e: any) {
			this.logger.warn("HTTP Error occurred", { httpError: e, requestConfig });
			const err =
				this.config.newErrorHandling && e.isAxiosError
					? e.response.data
					: e;

			const callbackErrorHandler =
				callback && ((error: Config.Error) => callback(error));
			const defaultErrorHandler = (error: Error) => {
				throw error;
			};

			const errorHandler = callbackErrorHandler ?? defaultErrorHandler;

			this.config.middlewares?.onError?.(err);

			return errorHandler(err);
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

export class ObsidianConfluenceClient
	extends MyBaseClient
	implements RequiredConfluenceClient {
	content: Api.Content;
	space: Api.Space;
	contentAttachments: Api.ContentAttachments;
	contentLabels: Api.ContentLabels;
	users: Api.Users;

	constructor(config: Config) {
		super(config);
		this.logger.updateOptions({
			prefix: "ObsidianConfluenceClient",
		});
		this.logger.debug("Initializing ObsidianConfluenceClient");
		this.content = new Api.Content(this);
		this.space = new Api.Space(this);
		this.contentAttachments = new Api.ContentAttachments(this);
		this.contentLabels = new Api.ContentLabels(this);
		this.users = new Api.Users(this);
	}
}
