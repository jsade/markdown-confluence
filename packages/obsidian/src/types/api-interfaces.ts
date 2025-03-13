/**
 * Interface definitions for Confluence API responses
 */

// Define basic response interfaces to work with both v1 and v2 API
export interface BasicContentResponse {
	id: string;
	type: string;
	status: string;
	title: string;
	space?: { key?: string };
	version?: {
		number?: number;
		by?: { accountId?: string };
		createdAt?: string;
		message?: string;
		minorEdit?: boolean;
		authorId?: string;
	};
	body?: {
		['atlas_doc_format']?: { value?: string }
		[key: string]: unknown;
	};
	ancestors?: Array<{ id: string }>;
	metadata?: {
		mediaType?: string;
		comment?: string;
	};
	[key: string]: unknown;
}

export interface BasicSearchResponse {
	results: Array<{
		id: string;
		type: string;
		[key: string]: unknown;
	}>;
	start: number;
	limit: number;
	size: number;
	[key: string]: unknown;
}

export interface BasicAttachmentResponse {
	id: string;
	type: string;
	status: string;
	title: string;
	metadata?: {
		mediaType?: string;
		comment?: string;
	};
	[key: string]: unknown;
}

export interface BasicLabel {
	id?: string;
	name?: string;
	[key: string]: unknown;
}

export interface V2FolderResponse {
	id: string;
	type: string;
	status: string;
	title: string;
	parentId?: string;
	parentType?: string;
	position?: number;
	authorId: string;
	ownerId: string;
	createdAt: string;
	version: {
		createdAt: string;
		message?: string;
		number: number;
		minorEdit: boolean;
		authorId: string;
	};
	// eslint-disable-next-line @typescript-eslint/naming-convention
	_links: {
		base: string;
		[key: string]: string;
	};
	[key: string]: unknown;
}
