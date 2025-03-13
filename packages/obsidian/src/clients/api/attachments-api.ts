import { BasicAttachmentResponse } from "../../types/api-interfaces";
import { Logger } from "../../utils";
import { ObsidianConfluenceClient } from "../obsidian-confluence-client";

/**
 * Constants for attachment handling
 */
const ATLASSIAN_TOKEN_CHECK_FLAG = "X-Atlassian-Token";
const ATLASSIAN_TOKEN_CHECK_NOCHECK_VALUE = "no-check";

export interface AttachmentsApiCallback<T> {
    (error: Error | null, data?: T): void;
}

/**
 * Implementation of the Confluence Attachments API
 */
export class AttachmentsApi {
    private logger: Logger;
    protected client: ObsidianConfluenceClient;

    constructor(client: ObsidianConfluenceClient) {
        this.client = client;
        this.logger = client.getLogger();
    }

    /**
     * Create or update an attachment for a content
     * @param params Parameters for the attachment
     * @returns Created/updated attachment response
     */
    async createOrUpdateAttachment(params: Record<string, unknown>): Promise<any> {
        return this.createOrUpdateAttachmentImpl(params);
    }

    /**
     * Implementation of attachment creation/update using v1 API
     * This is an internal method and should not be called directly
     * @param params Parameters for the attachment
     * @returns Created/updated attachment response
     */
    private async createOrUpdateAttachmentV1Impl(params: Record<string, unknown>): Promise<BasicAttachmentResponse> {
        this.logger.info(`Using v1 API for attachment operation`);
        
        const endpoint = `rest/api/content/${params['id']}/child/attachment`;
        const formData = new FormData();

        const file = params['file'] as Blob;
        const filename = params['filename'] as string | undefined;
        formData.append('file', file, filename);

        if (params['comment']) {
            const comment = String(params['comment']);
            formData.append('comment', comment);
        }

        const response = await this.client.fetch(endpoint, {
            method: 'POST',
            headers: {
                [ATLASSIAN_TOKEN_CHECK_FLAG]: ATLASSIAN_TOKEN_CHECK_NOCHECK_VALUE
            },
            body: formData
        });

        return response as BasicAttachmentResponse;
    }

    /**
     * Get attachments for a content
     * @param params Parameters for the request
     * @returns List of attachments
     */
    async getAttachments(params: Record<string, unknown>): Promise<any> {
        return this.getAttachmentsImpl(params);
    }

    /**
     * Implementation of getting attachments for content
     */
    private async getAttachmentsImpl(params: Record<string, unknown>): Promise<any> {
        try {
            this.logger.info(`Getting attachments: ${JSON.stringify(params)}`);

            const contentId = params['contentId'] as string;
            if (!contentId) {
                throw new Error('Missing required parameter: contentId');
            }

            const endpoint = `rest/api/content/${contentId}/child/attachment`;
            const response = await this.client.fetch(endpoint);

            return response;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Create attachments for a content
     * @param params Parameters for the request
     * @returns Created attachments
     * @deprecated Use createOrUpdateAttachment instead
     */
    async createAttachments<T = BasicAttachmentResponse>(
        params: Record<string, unknown>
    ): Promise<T> {
        this.logger.warn('createAttachments is deprecated, use createOrUpdateAttachment instead');
        return this.createOrUpdateAttachment(params) as Promise<T>;
    }

    /**
     * Create or update attachments for a content
     * @param params Parameters for the request
     * @returns Created/updated attachments
     * @deprecated Use createOrUpdateAttachment instead
     */
    async createOrUpdateAttachments<T = BasicAttachmentResponse>(
        params: Record<string, unknown>
    ): Promise<T> {
        this.logger.warn('createOrUpdateAttachments is deprecated, use createOrUpdateAttachment instead');
        return this.createOrUpdateAttachment(params) as Promise<T>;
    }

    /**
     * Update attachment properties (not implemented)
     */
    async updateAttachmentProperties(): Promise<any> {
        this.logger.warn("updateAttachmentProperties not implemented");
        throw new Error("Method not implemented");
    }

    /**
     * Update attachment data (not implemented)
     */
    async updateAttachmentData(): Promise<any> {
        this.logger.warn("updateAttachmentData not implemented");
        throw new Error("Method not implemented");
    }

    /**
     * Download attachment (not implemented)
     */
    async downloadAttachment(): Promise<any> {
        this.logger.warn("downloadAttachment not implemented");
        throw new Error("Method not implemented");
    }

    private async createOrUpdateAttachmentImpl(params: Record<string, unknown>): Promise<any> {
        this.logger.info(`Creating/updating attachment: ${JSON.stringify(params)}`);
        
        try {
            const contentId = params.id as string;
            
            if (!contentId) {
                throw new Error("Content ID is required");
            }
            
            // Determine content type directly from client
            const contentType = await this.client.determineContentTypeForId(contentId);
            
            const file = params['file'] as File;

            if (!contentId || !file) {
                throw new Error('Missing required parameters: contentId or file');
            }

            const endpoint = `rest/api/content/${contentId}/child/attachment`;

            const formData = new FormData();
            formData.append('file', file);

            const response = await this.client.fetch(endpoint, {
                method: 'POST',
                body: formData
            });

            return response;
        } catch (error) {
            throw error;
        }
    }
} 
