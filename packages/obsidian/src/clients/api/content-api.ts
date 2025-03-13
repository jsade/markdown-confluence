/**
 * Content API implementation for Confluence
 */

import { BasicContentResponse } from "../../types/api-interfaces";
import { ObsidianConfluenceClient } from "../obsidian-confluence-client";

export interface ContentApiCallback<T> {
    (error: Error | null, data?: T): void;
}

export class ContentApi {
    protected client: ObsidianConfluenceClient;

    constructor(client: ObsidianConfluenceClient) {
        this.client = client;
    }

    async archivePages<T = any>(): Promise<T> {
        const logger = this.client.getLogger();
        logger.warn("archivePages not implemented");
        throw new Error("Method not implemented");
    }

    async publishLegacyDraft<T = any>(): Promise<T> {
        const logger = this.client.getLogger();
        logger.warn("publishLegacyDraft not implemented");
        throw new Error("Method not implemented");
    }

    async publishSharedDraft<T = any>(): Promise<T> {
        const logger = this.client.getLogger();
        logger.warn("publishSharedDraft not implemented");
        throw new Error("Method not implemented");
    }

    async moveContent<T = any>(): Promise<T> {
        const logger = this.client.getLogger();
        logger.warn("moveContent not implemented");
        throw new Error("Method not implemented");
    }

    async searchContentByCQL<T = any>(params: Record<string, unknown>): Promise<T> {
        try {
            const logger = this.client.getLogger();
            logger.info(`Searching content by CQL: ${JSON.stringify(params)}`);
            
            const endpoint = `rest/api/content/search?cql=${params['cql']}`;
            const response = await this.client.fetch(endpoint);
            
            return response as T;
        } catch (error) {
            throw error;
        }
    }

    async deleteContent<T = any>(
        params: Record<string, unknown>
    ): Promise<T> {
        try {
            const logger = this.client.getLogger();
            logger.info(`Deleting content: ${JSON.stringify(params)}`);
            
            const endpoint = `rest/api/content/${params['id']}`;
            return await this.client.fetch(endpoint, {
                method: 'DELETE'
            }) as T;
        } catch (error) {
            throw error;
        }
    }
    
    async getContentById(params: { id: string; expand?: string[] }): Promise<BasicContentResponse> {
        const logger = this.client.getLogger();
        logger.info(`Getting content by ID: ${params.id}`);

        try {
            let endpoint = `rest/api/content/${params.id}`;
            
            if (params.expand && params.expand.length > 0) {
                endpoint += `?expand=${params.expand.join(',')}`;
            }
            
            const response = await this.client.fetch(endpoint);
            return response as BasicContentResponse;
        } catch (error) {
            logger.error(`Error getting content by ID: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    async getContent<T = any>(
        params?: Record<string, unknown>
    ): Promise<T> {
        try {
            const logger = this.client.getLogger();
            logger.info(`Getting content: ${JSON.stringify(params)}`);
            
            const result = await this.getContentImpl(params);
            
            return result as T;
        } catch (error) {
            throw error;
        }
    }
    
    private async getContentImpl(params?: Record<string, unknown>): Promise<{
        results: BasicContentResponse[];
        [key: string]: unknown;
    }> {
        const logger = this.client.getLogger();
        logger.info(`Getting content with params: ${JSON.stringify(params)}`);
        
        let endpoint = `rest/api/content`;
        
        if (params && Object.keys(params).length > 0) {
            const queryParams = new URLSearchParams();
            
            Object.entries(params).forEach(([key, value]) => {
                if (Array.isArray(value)) {
                    queryParams.append(key, value.join(','));
                } else if (value !== null && value !== undefined) {
                    queryParams.append(key, String(value));
                }
            });
            
            const queryString = queryParams.toString();
            if (queryString) {
                endpoint += `?${queryString}`;
            }
        }
        
        const response = await this.client.fetch(endpoint);
        
        return response as {
            results: BasicContentResponse[];
            [key: string]: unknown;
        };
    }
    
    async createContent<T = any>(
        params: Record<string, unknown>
    ): Promise<T> {
        try {
            const logger = this.client.getLogger();
            logger.info(`Creating content: ${JSON.stringify(params)}`);
            
            const result = await this.createContentImpl(params);
            
            return result as T;
        } catch (error) {
            throw error;
        }
    }
    
    private async createContentImpl(params: Record<string, unknown>): Promise<BasicContentResponse> {
        const endpoint = 'rest/api/content';
        const response = await this.client.fetch(endpoint, {
            method: 'POST',
            body: JSON.stringify(params)
        });
        
        return response as BasicContentResponse;
    }
    
    async updateContent<T = any>(
        params: Record<string, unknown>
    ): Promise<T> {
        try {
            const logger = this.client.getLogger();
            logger.info(`Updating content: ${JSON.stringify(params)}`);
            
            const result = await this.updateContentImpl(params);
            
            return result as T;
        } catch (error) {
            throw error;
        }
    }
    
    private async updateContentImpl(params: Record<string, unknown>): Promise<BasicContentResponse> {
        const endpoint = `rest/api/content/${params['id']}`;
        const response = await this.client.fetch(endpoint, {
            method: 'PUT',
            body: JSON.stringify(params)
        });
        
        return response as BasicContentResponse;
    }

    async create(params: any): Promise<any> {
        return this.createContent(params);
    }

    async update(params: any): Promise<any> {
        return this.updateContent(params);
    }

    async get(params: any): Promise<any> {
        return this.getContent(params);
    }

    async getChildren(params: any): Promise<any> {
        const logger = this.client.getLogger();
        logger.info(`Getting content children: ${JSON.stringify(params)}`);
        
        try {
            const endpoint = `rest/api/content/${params.id}/child`;
            const response = await this.client.fetch(endpoint);
            return response;
        } catch (error) {
            logger.error(`Error getting content children: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    async search(params: any): Promise<any> {
        return this.searchContentByCQL(params);
    }
}
