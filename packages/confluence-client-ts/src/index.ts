/**
 * TypeScript Confluence Client
 * A modern, typed client for the Confluence REST API
 */

// Export main client
export { ConfluenceClient } from './client/confluence-client.js';

// Export client interfaces
export type {
	Auth,
	AuthType,
	BasicAuth, ConfluenceClientConfig, NoAuth, OAuthAuth, PersonalAuth, TokenAuth
} from './interfaces/client.js';

// Export v1 API interfaces and types
export { ContentApi } from './api/v1/content-api.js';
export type {
	ContentListResponse, ContentResponse
} from './api/v1/content-api.js';

// Export v2 API interfaces and types
export { FoldersApi } from './api/v2/folders-api.js';
export type { FolderResponse } from './api/v2/folders-api.js';

// Re-export base client for extension purposes
export { BaseClient } from './client/base-client.js';

