/**
 * Configuration and authentication interfaces for the Confluence TypeScript client
 */

/**
 * Authentication types supported by the Confluence API
 */
export type AuthType = 'basic' | 'token' | 'personal' | 'oauth' | 'none';

/**
 * Basic authentication credentials
 */
export interface BasicAuth {
	type: 'basic';
	username: string;
	password: string;
}

/**
 * Token-based authentication (API tokens)
 */
export interface TokenAuth {
	type: 'token';
	token: string;
}

/**
 * Personal access token authentication
 */
export interface PersonalAuth {
	type: 'personal';
	token: string;
}

/**
 * OAuth-based authentication
 */
export interface OAuthAuth {
	type: 'oauth';
	token: string;
}

/**
 * No authentication (for public resources)
 */
export interface NoAuth {
	type: 'none';
}

/**
 * Union type of all authentication methods
 */
export type Auth = BasicAuth | TokenAuth | PersonalAuth | OAuthAuth | NoAuth;

/**
 * Configuration options for the Confluence client
 */
export interface ConfluenceClientConfig {
	/**
	 * Base URL of the Confluence instance (e.g., 'https://your-instance.atlassian.net')
	 */
	baseUrl: string;

	/**
	 * Authentication details for the Confluence API
	 */
	auth: Auth;

	/**
	 * API version preferences ('v1', 'v2', or 'auto' to use the most appropriate version)
	 * Default: 'auto'
	 */
	preferredApiVersion?: 'v1' | 'v2' | 'auto';

	/**
	 * Default request timeout in milliseconds
	 * Default: 30000 (30 seconds)
	 */
	timeout?: number;

	/**
	 * Whether to retry failed requests
	 * Default: true
	 */
	retry?: boolean;

	/**
	 * Maximum number of retry attempts
	 * Default: 3
	 */
	maxRetries?: number;

	/**
	 * Headers to include with every request
	 */
	defaultHeaders?: Record<string, string>;

	/**
	 * Whether to log request and response details (for debugging)
	 * Default: false
	 */
	debug?: boolean;
} 
