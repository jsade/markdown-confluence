/**
 * Base client implementation for making HTTP requests to the Confluence API
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import FormData from 'form-data';
import { Auth, ConfluenceClientConfig } from '../interfaces/client.js';

/**
 * Base client for Confluence API requests
 * Handles authentication, request building, and error handling
 */
export class BaseClient {
  /**
   * The axios instance used for HTTP requests
   */
  protected readonly http: AxiosInstance;
  
  /**
   * The base URL for the Confluence instance
   */
  protected readonly baseUrl: string;
  
  /**
   * Authentication configuration
   */
  protected readonly auth: Auth;
  
  /**
   * API version preference
   */
  protected readonly preferredApiVersion: 'v1' | 'v2' | 'auto';
  
  /**
   * URL prefix for v1 API endpoints
   */
  protected readonly v1UrlPrefix = '/wiki/rest/api';
  
  /**
   * URL prefix for v2 API endpoints
   */
  protected readonly v2UrlPrefix = '/wiki/api/v2';
  
  /**
   * Default request timeout in milliseconds
   */
  protected readonly timeout: number;
  
  /**
   * Whether to retry failed requests
   */
  protected readonly retry: boolean;
  
  /**
   * Maximum number of retry attempts
   */
  protected readonly maxRetries: number;
  
  /**
   * Whether debug logging is enabled
   */
  protected readonly debug: boolean;

  /**
   * Create a new BaseClient instance
   * @param config Configuration options
   */
  constructor(config: ConfluenceClientConfig) {
    this.baseUrl = config.baseUrl.endsWith('/') 
      ? config.baseUrl.slice(0, -1) 
      : config.baseUrl;
    this.auth = config.auth;
    this.preferredApiVersion = config.preferredApiVersion || 'auto';
    this.timeout = config.timeout || 30000;
    this.retry = config.retry !== undefined ? config.retry : true;
    this.maxRetries = config.maxRetries || 3;
    this.debug = config.debug || false;
    
    // Create Axios instance with base URL and auth
    this.http = axios.create({
      // Use bracket notation for baseURL to avoid linter issues
      ['baseURL']: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...config.defaultHeaders,
      },
    });
    
    // Configure authentication
    this.configureAuth();
  }
  
  /**
   * Configure authentication for the HTTP client
   */
  private configureAuth(): void {
    let credentials: string;
    
    switch (this.auth.type) {
      case 'basic':
        // Basic authentication uses the Authorization header with Base64 encoded credentials
        credentials = Buffer.from(`${this.auth.username}:${this.auth.password}`).toString('base64');
        this.http.defaults.headers.common['Authorization'] = `Basic ${credentials}`;
        break;
        
      case 'token':
        // API token authentication
        this.http.defaults.headers.common['Authorization'] = `Bearer ${this.auth.token}`;
        break;
        
      case 'personal':
        // Personal access token authentication
        this.http.defaults.headers.common['Authorization'] = `Bearer ${this.auth.token}`;
        break;
        
      case 'oauth':
        // OAuth token authentication
        this.http.defaults.headers.common['Authorization'] = `Bearer ${this.auth.token}`;
        break;
        
      case 'none':
        // No authentication needed
        break;
    }
  }
  
  /**
   * Make a GET request to the Confluence API
   * @param url The URL to request
   * @param params Optional query parameters
   * @param headers Optional additional headers
   * @returns The response data
   */
  public async get<T>(
    url: string,
    params?: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<T> {
    try {
      const response = await this.http.get<T>(url, {
        params,
        headers,
      });
      
      if (this.debug) {
        this.logResponse(response);
      }
      
      return response.data;
    } catch (error) {
      return this.handleRequestError(error);
    }
  }
  
  /**
   * Make a POST request to the Confluence API
   * @param url The URL to request
   * @param data The request body
   * @param params Optional query parameters
   * @param headers Optional additional headers
   * @returns The response data
   */
  public async post<T>(
    url: string,
    data?: unknown,
    params?: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<T> {
    try {
      const response = await this.http.post<T>(url, data, {
        params,
        headers,
      });
      
      if (this.debug) {
        this.logResponse(response);
      }
      
      return response.data;
    } catch (error) {
      return this.handleRequestError(error);
    }
  }
  
  /**
   * Make a PUT request to the Confluence API
   * @param url The URL to request
   * @param data The request body
   * @param params Optional query parameters
   * @param headers Optional additional headers
   * @returns The response data
   */
  public async put<T>(
    url: string,
    data?: unknown,
    params?: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<T> {
    try {
      const response = await this.http.put<T>(url, data, {
        params,
        headers,
      });
      
      if (this.debug) {
        this.logResponse(response);
      }
      
      return response.data;
    } catch (error) {
      return this.handleRequestError(error);
    }
  }
  
  /**
   * Make a DELETE request to the Confluence API
   * @param url The URL to request
   * @param params Optional query parameters
   * @param headers Optional additional headers
   * @returns The response data
   */
  public async delete<T>(
    url: string,
    params?: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<T> {
    try {
      const response = await this.http.delete<T>(url, {
        params,
        headers,
      });
      
      if (this.debug) {
        this.logResponse(response);
      }
      
      return response.data;
    } catch (error) {
      return this.handleRequestError(error);
    }
  }
  
  /**
   * Upload a file to the Confluence API
   * @param url The URL to upload to
   * @param formData The form data containing the file
   * @returns The response data
   */
  public async uploadFile<T>(
    url: string,
    formData: FormData
  ): Promise<T> {
    try {
      const response = await this.http.post<T>(url, formData, {
        headers: {
          ...formData.getHeaders(),
          ['X-Atlassian-Token']: 'no-check',
        },
      });
      
      if (this.debug) {
        this.logResponse(response);
      }
      
      return response.data;
    } catch (error) {
      return this.handleRequestError(error);
    }
  }
  
  /**
   * Handle request errors
   * @param error The error object
   * @throws Error with details about the request failure
   */
  private handleRequestError(error: unknown): never {
    if (this.debug) {
      this.logError(error);
    }
    
    if (axios.isAxiosError(error) && error.response) {
      const { status, data } = error.response;
      throw new Error(`Confluence API error (${status}): ${JSON.stringify(data)}`);
    }
    
    throw new Error(`Confluence API request failed: ${String(error)}`);
  }
  
  /**
   * Log response for debugging
   * @param response The Axios response object
   */
  private logResponse(response: AxiosResponse): void {
    console.log('Response:', {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
    });
  }
  
  /**
   * Log error for debugging
   * @param error The error object
   */
  private logError(error: unknown): void {
    if (axios.isAxiosError(error)) {
      console.error('Axios Error:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
    } else {
      console.error('Request Error:', error);
    }
  }
  
  /**
   * Get a URL for the v1 API
   * @param path The path to append to the base URL
   * @returns The full URL
   */
  public getV1Url(path: string): string {
    return `${this.v1UrlPrefix}${path.startsWith('/') ? path : `/${path}`}`;
  }
  
  /**
   * Get a URL for the v2 API
   * @param path The path to append to the base URL
   * @returns The full URL
   */
  public getV2Url(path: string): string {
    return `${this.v2UrlPrefix}${path.startsWith('/') ? path : `/${path}`}`;
  }
} 
