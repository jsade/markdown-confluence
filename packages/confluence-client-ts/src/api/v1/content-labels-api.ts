/**
 * Content Labels API implementation for v1 of the Confluence API
 */

import { ConfluenceClient } from '../../client/confluence-client.js';

export interface LabelResponse {
  prefix: string;
  name: string;
  id: string;
  [key: string]: unknown;
}

export interface LabelListResponse {
  results: LabelResponse[];
  start: number;
  limit: number;
  size: number;
  [key: string]: unknown;
}

/**
 * Content Labels API for Confluence
 * Handles operations for content labels
 */
export class ContentLabelsApi {
  /**
   * Create a new ContentLabelsApi instance
   * @param client The parent Confluence client
   */
  constructor(private readonly client: ConfluenceClient) {}

  /**
   * Get labels for a piece of content
   * @param params Request parameters
   * @returns List of labels
   */
  public async getLabels(params: {
    id: string;
    prefix?: string;
    start?: number;
    limit?: number;
  }): Promise<LabelListResponse> {
    const queryParams: Record<string, unknown> = {};
    
    if (params.prefix) {
      queryParams['prefix'] = params.prefix;
    }
    
    if (params.start !== undefined) {
      queryParams['start'] = params.start;
    }
    
    if (params.limit !== undefined) {
      queryParams['limit'] = params.limit;
    }
    
    return this.client.get(
      this.client.getV1Url(`/content/${params.id}/label`),
      queryParams
    );
  }
  
  /**
   * Add a label to a piece of content
   * @param params Request parameters
   * @returns The added labels
   */
  public async addLabel(params: {
    id: string;
    prefix?: string;
    name: string;
  }): Promise<LabelResponse[]> {
    const label: Record<string, string> = {
      name: params.name,
    };
    
    if (params.prefix) {
      label['prefix'] = params.prefix;
    }
    
    return this.client.post(
      this.client.getV1Url(`/content/${params.id}/label`),
      [label]
    );
  }
  
  /**
   * Add multiple labels to a piece of content
   * @param params Request parameters
   * @returns The added labels
   */
  public async addLabels(params: {
    id: string;
    labels: Array<{
      prefix?: string;
      name: string;
    }>;
  }): Promise<LabelResponse[]> {
    return this.client.post(
      this.client.getV1Url(`/content/${params.id}/label`),
      params.labels
    );
  }
  
  /**
   * Delete a label from a piece of content
   * @param params Request parameters
   * @returns Empty response on success
   */
  public async removeLabel(params: {
    id: string;
    label: string;
  }): Promise<unknown> {
    return this.client.delete(
      this.client.getV1Url(`/content/${params.id}/label/${params.label}`)
    );
  }
} 
