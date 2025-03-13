import { ConfluencePerPageAllValues } from "../ConniePageConfig";
export type FilesToUpload = Array<MarkdownFile>;

export interface MarkdownFile {
	folderName: string;
	absoluteFilePath: string;
	fileName: string;
	contents: string;
	pageTitle: string;
	frontmatter: {
		[key: string]: unknown;
	};
	tags?: string[];
}

export interface BinaryFile {
	filename: string;
	filePath: string;
	mimeType: string;
	contents: ArrayBuffer;
}

export interface LoaderAdaptor {
	updateMarkdownValues(
		absoluteFilePath: string,
		values: Partial<ConfluencePerPageAllValues>,
	): Promise<void>;
	loadMarkdownFile(absoluteFilePath: string): Promise<MarkdownFile>;
	getMarkdownFilesToUpload(): Promise<FilesToUpload>;
	readBinary(
		path: string,
		referencedFromFilePath: string,
	): Promise<BinaryFile | false>;

	/**
	 * Find PSFs (Publish Source Folders) by frontmatter configuration
	 * This is an optional method that may not be implemented by all adaptors
	 * @returns A map of folder paths to their parent page IDs
	 */
	findPSFsByFrontmatter?(): Promise<Map<string, string>>;
}

export interface RequiredConfluenceClient {
	content: {
		create: (params: any) => Promise<any>;
		update: (params: any) => Promise<any>;
		get: (params: any) => Promise<any>;
		getChildren: (params: any) => Promise<any>;
		search: (params: any) => Promise<any>;
	};
	space: {
		get: (params: any) => Promise<any>;
		getContent: (params: any) => Promise<any>;
	};
	contentAttachments: {
		createOrUpdateAttachment: (params: any) => Promise<any>;
		getAttachments: (params: any) => Promise<any>;
	};
	contentLabels: {
		addLabels: (params: any) => Promise<any>;
		getLabels: (params: any) => Promise<any>;
	};
	users: {
		getCurrentUser: (params: any) => Promise<any>;
		getUser: (params: any) => Promise<any>;
	};
	apiVersion?: 'v1' | 'v2';
	v2?: {
		folders: {
			getFolderById: (id: string) => Promise<{
				id: string;
				title: string;
				[key: string]: unknown;
			}>;
			createFolder: (params: {
				spaceId: string;
				title: string;
				parentId?: string;
			}) => Promise<{
				id: string;
				title: string;
				[key: string]: unknown;
			}>;
			updateFolder?: (id: string, params: {
				title?: string;
				parentId?: string;
			}) => Promise<{
				id: string;
				title: string;
				[key: string]: unknown;
			}>;
		};
	};
	fetch?: (url: string, options?: Record<string, unknown>) => Promise<unknown>;

	/**
	 * Search for content using Confluence Query Language (CQL)
	 * @param cql The CQL query string
	 * @param limit Optional limit for the number of results (default: 10)
	 * @returns Search results
	 */
	searchContentByCQL?: (cql: string, limit?: number) => Promise<{
		results: Array<Record<string, unknown>>;
		size: number;
		start: number;
		limit: number;
		[key: string]: unknown;
	}>;

	/**
	 * Find a folder by title in a specific space
	 * @param title The folder title to search for
	 * @param spaceKey The space key to search in
	 * @returns The folder details if found, or null if not found
	 */
	findFolderByTitle?: (title: string, spaceKey: string) => Promise<{
		id: string;
		title: string;
		type: string;
		[key: string]: unknown;
	} | null>;
}

export * from "./filesystem";
