import grayMatter from 'gray-matter';
import { ConsoleLogger, ILogger } from './ILogger';

/**
 * Class responsible for parsing markdown content and handling frontmatter
 */
export class MarkdownParser {
	private logger: ILogger;

	constructor(logger: ILogger = new ConsoleLogger()) {
		this.logger = logger;
	}

	/**
	 * Extracts frontmatter from markdown content with validation
	 * @param markdownContent The raw markdown content to parse
	 * @returns Validated frontmatter object
	 */
	public getFrontmatterFromMd(markdownContent: string): Record<string, unknown> {
		const matter = grayMatter(markdownContent);
		const frontmatter = matter.data || {};

		// Validate that the page doesn't have both parent types
		const parentPageId = frontmatter['connie-parent-page-id'];
		const parentFolderId = frontmatter['connie-parent-folder-id'];

		if (parentPageId && parentFolderId) {
			this.logger.warn('A page cannot have both a parent page ID and a parent folder ID. Using parent folder ID.');
			// Remove parent page ID if both are present - favor folder structure
			delete frontmatter['connie-parent-page-id'];
		}

		return frontmatter;
	}

	/**
	 * Extracts content from markdown without frontmatter
	 * @param markdownContent The raw markdown content to parse
	 * @returns Markdown content without frontmatter
	 */
	public getContentWithoutFrontmatter(markdownContent: string): string {
		const matter = grayMatter(markdownContent);
		return matter.content || '';
	}
} 