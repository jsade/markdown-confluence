/**
 * Content Attachments API implementation for v1 of the Confluence API
 */

import FormData from 'form-data';
import { ConfluenceClient } from '../../client/confluence-client.js';
import { ContentListResponse, ContentResponse } from './content-api.js';

/**
 * Content Attachments API for Confluence
 * Handles operations for content attachments
 */
export class ContentAttachmentsApi {
  /**
   * Create a new ContentAttachmentsApi instance
   * @param client The parent Confluence client
   */
  constructor(private readonly client: ConfluenceClient) {}

  /**
   * Get attachments for a piece of content
   * @param params Request parameters
   * @returns List of attachments
   */
  public async getAttachments(params: {
    id: string;
    filename?: string;
    mediaType?: string;
    expand?: string[];
    start?: number;
    limit?: number;
  }): Promise<ContentListResponse> {
    const queryParams: Record<string, unknown> = {};
    
    if (params.filename) {
      queryParams['filename'] = params.filename;
    }
    
    if (params.mediaType) {
      queryParams['mediaType'] = params.mediaType;
    }
    
    if (params.expand && params.expand.length > 0) {
      queryParams['expand'] = params.expand.join(',');
    }
    
    if (params.start !== undefined) {
      queryParams['start'] = params.start;
    }
    
    if (params.limit !== undefined) {
      queryParams['limit'] = params.limit;
    }
    
    return this.client.get(
      this.client.getV1Url(`/content/${params.id}/child/attachment`),
      queryParams
    );
  }
  
  /**
   * Upload an attachment to a piece of content
   * @param params Request parameters
   * @returns The created attachment
   */
  public async createAttachment(params: {
    id: string;
    file: Buffer;
    filename: string;
    contentType: string;
    comment?: string;
    minorEdit?: boolean;
  }): Promise<ContentResponse> {
    const formData = new FormData();
    
    // Add the file to the form data
    formData.append('file', params.file, {
      filename: params.filename,
      contentType: params.contentType,
    });
    
    // Add other parameters
    if (params.comment) {
      formData.append('comment', params.comment);
    }
    
    if (params.minorEdit !== undefined) {
      formData.append('minorEdit', params.minorEdit.toString());
    }
    
    return this.client.uploadFile(
      this.client.getV1Url(`/content/${params.id}/child/attachment`),
      formData
    );
  }
  
  /**
   * Update an attachment
   * @param params Request parameters
   * @returns The updated attachment
   */
  public async updateAttachment(params: {
    id: string;
    attachmentId: string;
    file: Buffer;
    filename: string;
    contentType: string;
    comment?: string;
    minorEdit?: boolean;
  }): Promise<ContentResponse> {
    const formData = new FormData();
    
    // Add the file to the form data
    formData.append('file', params.file, {
      filename: params.filename,
      contentType: params.contentType,
    });
    
    // Add other parameters
    if (params.comment) {
      formData.append('comment', params.comment);
    }
    
    if (params.minorEdit !== undefined) {
      formData.append('minorEdit', params.minorEdit.toString());
    }
    
    return this.client.uploadFile(
      this.client.getV1Url(`/content/${params.id}/child/attachment/${params.attachmentId}/data`),
      formData
    );
  }
} 
