/**
 * Users API implementation for v1 of the Confluence API
 */

import { ConfluenceClient } from '../../client/confluence-client.js';

export interface UserResponse {
  type: 'known' | 'unknown' | 'anonymous' | string;
  username?: string;
  userKey?: string;
  accountId?: string;
  displayName?: string;
  email?: string;
  profilePicture?: {
    path: string;
    width: number;
    height: number;
    isDefault: boolean;
  };
  [key: string]: unknown;
}

export interface UserListResponse {
  results: UserResponse[];
  start: number;
  limit: number;
  size: number;
  [key: string]: unknown;
}

/**
 * Users API for Confluence
 * Handles operations for users
 */
export class UsersApi {
  /**
   * Create a new UsersApi instance
   * @param client The parent Confluence client
   */
  constructor(private readonly client: ConfluenceClient) {}

  /**
   * Get information about the current user
   * @param params Request parameters
   * @returns The current user
   */
  public async getCurrentUser(params?: {
    expand?: string[];
  }): Promise<UserResponse> {
    const queryParams: Record<string, unknown> = {};
    
    if (params?.expand && params.expand.length > 0) {
      queryParams['expand'] = params.expand.join(',');
    }
    
    return this.client.get(
      this.client.getV1Url('/user/current'),
      queryParams
    );
  }
  
  /**
   * Get a user by username, key, or account ID
   * @param params Request parameters
   * @returns The user
   */
  public async getUser(params: {
    username?: string;
    key?: string;
    accountId?: string;
    expand?: string[];
  }): Promise<UserResponse> {
    const queryParams: Record<string, unknown> = {};
    
    if (params.username) {
      queryParams['username'] = params.username;
    }
    
    if (params.key) {
      queryParams['key'] = params.key;
    }
    
    if (params.accountId) {
      queryParams['accountId'] = params.accountId;
    }
    
    if (params.expand && params.expand.length > 0) {
      queryParams['expand'] = params.expand.join(',');
    }
    
    return this.client.get(
      this.client.getV1Url('/user'),
      queryParams
    );
  }
  
  /**
   * Search for users
   * @param params Request parameters
   * @returns List of users
   */
  public async searchUsers(params: {
    cql?: string;
    query?: string;
    start?: number;
    limit?: number;
    expand?: string[];
  }): Promise<UserListResponse> {
    const queryParams: Record<string, unknown> = {};
    
    if (params.cql) {
      queryParams['cql'] = params.cql;
    }
    
    if (params.query) {
      queryParams['query'] = params.query;
    }
    
    if (params.start !== undefined) {
      queryParams['start'] = params.start;
    }
    
    if (params.limit !== undefined) {
      queryParams['limit'] = params.limit;
    }
    
    if (params.expand && params.expand.length > 0) {
      queryParams['expand'] = params.expand.join(',');
    }
    
    return this.client.get(
      this.client.getV1Url('/search/user'),
      queryParams
    );
  }
  
  /**
   * Get anonymous user
   * @param params Request parameters
   * @returns The anonymous user
   */
  public async getAnonymousUser(params?: {
    expand?: string[];
  }): Promise<UserResponse> {
    const queryParams: Record<string, unknown> = {};
    
    if (params?.expand && params.expand.length > 0) {
      queryParams['expand'] = params.expand.join(',');
    }
    
    return this.client.get(
      this.client.getV1Url('/user/anonymous'),
      queryParams
    );
  }
} 
