/**
 * Folders API implementation for v2 of the Confluence API
 */

import { ConfluenceClient } from '../../client/confluence-client.js';

export interface FolderResponse {
  id: string;
  title: string;
  parentId?: string;
  spaceId: string;
  status: string;
  createdAt: string;
  createdBy: {
    id: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Folders API for Confluence v2
 * Handles operations for folders (new feature in Confluence Cloud)
 */
export class FoldersApi {
  /**
   * Create a new FoldersApi instance
   * @param client The parent Confluence client
   */
  constructor(private readonly client: ConfluenceClient) {}

  /**
   * Get a folder by ID
   * @param id The folder ID
   * @returns The folder details
   */
  public async getFolderById(id: string): Promise<FolderResponse> {
    return this.client.get(
      this.client.getV2Url(`/folders/${id}`)
    );
  }
  
  /**
   * Create a new folder
   * @param params Folder creation parameters
   * @returns The created folder
   */
  public async createFolder(params: {
    spaceId: string;
    title: string;
    parentId?: string;
  }): Promise<FolderResponse> {
    return this.client.post(
      this.client.getV2Url('/folders'),
      params
    );
  }
  
  /**
   * Update a folder
   * @param id The folder ID to update
   * @param params Update parameters
   * @returns The updated folder
   */
  public async updateFolder(
    id: string,
    params: {
      title?: string;
      parentId?: string;
    }
  ): Promise<FolderResponse> {
    return this.client.put(
      this.client.getV2Url(`/folders/${id}`),
      params
    );
  }
  
  /**
   * Delete a folder
   * @param id The folder ID to delete
   * @returns Empty response on success
   */
  public async deleteFolder(id: string): Promise<unknown> {
    return this.client.delete(
      this.client.getV2Url(`/folders/${id}`)
    );
  }
  
  /**
   * Get child folders
   * @param id The parent folder ID
   * @returns List of child folders
   */
  public async getChildFolders(id: string): Promise<{
    results: FolderResponse[];
    [key: string]: unknown;
  }> {
    return this.client.get(
      this.client.getV2Url(`/folders/${id}/children`)
    );
  }
  
  /**
   * Get folders in a space
   * @param spaceId The space ID
   * @returns List of folders in the space
   */
  public async getFoldersInSpace(spaceId: string): Promise<{
    results: FolderResponse[];
    [key: string]: unknown;
  }> {
    const queryParams: Record<string, unknown> = {};
    queryParams['spaceId'] = spaceId;
    
    return this.client.get(
      this.client.getV2Url('/folders'),
      queryParams
    );
  }
} 
