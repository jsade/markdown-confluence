/**
 * Main Confluence client implementation
 */

import { ContentApi } from '../api/v1/content-api.js';
import { ContentAttachmentsApi } from '../api/v1/content-attachments-api.js';
import { ContentLabelsApi } from '../api/v1/content-labels-api.js';
import { SpaceApi } from '../api/v1/space-api.js';
import { UsersApi } from '../api/v1/users-api.js';
import { FoldersApi } from '../api/v2/folders-api.js';
import { ConfluenceClientConfig } from '../interfaces/client.js';
import { BaseClient } from './base-client.js';

/**
 * Main Confluence API client class
 * Implements the RequiredConfluenceClient interface for compatibility with markdown-confluence
 */
export class ConfluenceClient extends BaseClient {
  /**
   * Content API methods (v1)
   */
  public readonly content: ContentApi;
  
  /**
   * Space API methods (v1)
   */
  public readonly space: SpaceApi;
  
  /**
   * Content Attachments API methods (v1)
   */
  public readonly contentAttachments: ContentAttachmentsApi;
  
  /**
   * Content Labels API methods (v1)
   */
  public readonly contentLabels: ContentLabelsApi;
  
  /**
   * Users API methods (v1)
   */
  public readonly users: UsersApi;
  
  /**
   * API version for compatibility with markdown-confluence
   */
  public readonly apiVersion: 'v1' | 'v2';
  
  /**
   * V2 API methods
   */
  public readonly v2: {
    /**
     * Folders API methods (v2)
     */
    folders: FoldersApi;
  };
  
  /**
   * Create a new ConfluenceClient instance
   * @param config Configuration options
   */
  constructor(config: ConfluenceClientConfig) {
    super(config);
    
    // Set API version based on preference
    if (this.preferredApiVersion === 'auto' || this.preferredApiVersion === 'v2') {
      this.apiVersion = 'v2';
    } else {
      this.apiVersion = 'v1';
    }
    
    // Initialize v1 API endpoints
    this.content = new ContentApi(this);
    this.space = new SpaceApi(this);
    this.contentAttachments = new ContentAttachmentsApi(this);
    this.contentLabels = new ContentLabelsApi(this);
    this.users = new UsersApi(this);
    
    // Initialize v2 API endpoints
    this.v2 = {
      folders: new FoldersApi(this),
    };
  }
  
  /**
   * Get the base URL for the Confluence instance
   * @returns The base URL
   */
  public getBaseUrl(): string {
    return this.baseUrl;
  }
  
  /**
   * Search for content using Confluence Query Language (CQL)
   * @param cql The CQL query string
   * @param limit Optional limit for the number of results (default: 10)
   * @returns Search results
   */
  public async searchContentByCQL(
    cql: string,
    limit = 10
  ): Promise<{
    results: Array<Record<string, unknown>>;
    size: number;
    start: number;
    limit: number;
    [key: string]: unknown;
  }> {
    return this.get(this.getV1Url('/search'), {
      cql,
      limit,
    });
  }
  
  /**
   * Get the URL for a specific content ID
   * @param contentId The content ID
   * @returns The URL for the content
   */
  public getContentUrl(contentId: string): string {
    return `${this.getBaseUrl()}/wiki/spaces/view/pages/${contentId}`;
  }
  
  /**
   * Get the URL for a specific space
   * @param spaceKey The space key
   * @returns The URL for the space
   */
  public getSpaceUrl(spaceKey: string): string {
    return `${this.getBaseUrl()}/wiki/spaces/${spaceKey}`;
  }
  
  /**
   * Make a request to the Confluence API using the specified method
   * @param method The HTTP method to use
   * @param url The URL to request
   * @param body Optional request body
   * @param headers Optional additional headers
   * @returns The response data
   */
  public async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    // Log request details if debug is enabled
    if (this.debug) {
      console.log(`[Confluence Client] ${method} ${url}`, {
        body,
        headers,
      });
    }
    
    // Make the request using the appropriate method
    switch (method) {
      case 'GET':
        return this.get(url, undefined, headers);
      case 'POST':
        return this.post(url, body, undefined, headers);
      case 'PUT':
        return this.put(url, body, undefined, headers);
      case 'DELETE':
        return this.delete(url, undefined, headers);
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }
  }
  
  /**
   * Find a folder by title in a specific space
   * @param title The folder title to search for
   * @param spaceKey The space key to search in
   * @returns The folder details if found, or null if not found
   */
  public async findFolderByTitle(
    title: string, 
    spaceKey: string
  ): Promise<{
    id: string;
    title: string;
    type: string;
    [key: string]: unknown;
  } | null> {
    // Use CQL to find the folder by title and space
    const query = `type = "page" AND title = "${title}" AND space = "${spaceKey}" AND type = "folder"`;
    
    try {
      const searchResults = await this.searchContentByCQL(query);
      
      if (searchResults.results.length > 0) {
        const result = searchResults.results[0];
        // Check if result exists before accessing properties
        if (result) {
          return {
            id: result['id'] as string,
            title: result['title'] as string,
            type: result['type'] as string,
            ...result,
          };
        }
      }
      
      return null;
    } catch (error) {
      if (this.debug) {
        console.error('Error finding folder by title:', error);
      }
      return null;
    }
  }
} 
