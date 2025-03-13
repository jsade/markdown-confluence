/* eslint-disable @typescript-eslint/naming-convention */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { expect, test } from "@jest/globals";
import { ObsidianConfluenceClient } from "@markdown-confluence/obsidian/src/clients/obsidian-confluence-client";
import {
    BinaryFile,
    FilesToUpload,
    LoaderAdaptor,
    MarkdownFile,
} from "./adaptors";
import {
    ChartData,
    MermaidRenderer,
    MermaidRendererPlugin,
} from "./ADFProcessingPlugins/MermaidRendererPlugin";
import { ConfluencePerPageAllValues } from "./ConniePageConfig";
import { NoOpLogger } from "./ILogger";
import { Publisher } from "./Publisher";
import { StaticSettingsLoader } from "./SettingsLoader";

// Define test settings
const testSettings = {
	confluenceBaseUrl: "https://example.atlassian.net/wiki",
	confluenceParentId: "12345",
	contentRoot: "/test/",
	folderToPublish: "/test",
	atlassianUserName: "test@example.com",
	atlassianApiToken: "test-token",
	includeAttachments: true,
	includeAllMdFiles: false,
	labels: ["test"],
	markdownContentReplacementRules: {},
};

const settingsLoader = new StaticSettingsLoader(testSettings);

// Define markdown test cases
const markdownTestCases = [
	{
		folderName: "headers",
		absoluteFilePath: "/path/to/headers.md",
		fileName: "headers.md",
		contents:
			"# Header 1\n\n## Header 2\n\n### Header 3\n\n#### Header 4\n\n##### Header 5\n\n###### Header 6",
		pageTitle: "Headers",
		frontmatter: {
			title: "Headers",
			description:
				"A Markdown file demonstrating different header levels.",
		},
	},
	{
		folderName: "emphasis",
		absoluteFilePath: "/path/to/emphasis.md",
		fileName: "emphasis.md",
		contents:
			"*Italic text*\n\n_Italic text_\n\n**Bold text**\n\n__Bold text__\n\n***Bold and italic text***\n\n___Bold and italic text___",
		pageTitle: "Emphasis",
		frontmatter: {
			title: "Emphasis",
			description:
				"A Markdown file demonstrating different text emphasis styles.",
		},
	},
	{
		folderName: "lists",
		absoluteFilePath: "/path/to/lists.md",
		fileName: "lists.md",
		contents:
			"1. First ordered list item\n2. Second ordered list item\n\n- Unordered list item\n- Another unordered list item",
		pageTitle: "Lists",
		frontmatter: {
			title: "Lists",
			description:
				"A Markdown file demonstrating ordered and unordered lists.",
		},
	},
	{
		folderName: "links",
		absoluteFilePath: "/path/to/links.md",
		fileName: "links.md",
		contents:
			'[Example link](https://example.com)\n\n[Example link with title](https://example.com "Example Title")',
		pageTitle: "Links",
		frontmatter: {
			title: "Links",
			description: "A Markdown file demonstrating different link styles.",
		},
	},
	/*
	{
		folderName: "images",
		absoluteFilePath: "/path/to/images.md",
		fileName: "images.md",
		contents:
			'![Alt text](/path/to/image.jpg)\n\n![Alt text with title](/path/to/image.jpg "Image Title")',
		pageTitle: "Images",
		frontmatter: {
			title: "Images",
			description:
				"A Markdown file demonstrating different image styles.",
		},
	},
	*/
	{
		folderName: "code",
		absoluteFilePath: "/path/to/code.md",
		fileName: "code.md",
		contents: "Inline `code` example\n\n```\nCode block example\n```",
		pageTitle: "Code",
		frontmatter: {
			title: "Code",
			description:
				"A Markdown file demonstrating inline code and code blocks.",
		},
	},
	{
		folderName: "tables",
		absoluteFilePath: "/path/to/tables.md",
		fileName: "tables.md",
		contents:
			"| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |",
		pageTitle: "Tables",
		frontmatter: {
			title: "Tables",
			description: "A Markdown file demonstrating tables.",
		},
	},
	{
		folderName: "blockquotes",
		absoluteFilePath: "/path/to/blockquotes.md",
		fileName: "blockquotes.md",
		contents: "> Blockquote example\n\n> Another blockquote example",
		pageTitle: "Blockquotes",
		frontmatter: {
			title: "Blockquotes",
			description: "A Markdown file demonstrating blockquotes.",
		},
	},
	{
		folderName: "horizontal_rules",
		absoluteFilePath: "/path/to/horizontal_rules.md",
		fileName: "horizontal_rules.md",
		contents: "---\n\n***\n\n___",
		pageTitle: "Horizontal Rules",
		frontmatter: {
			title: "Horizontal Rules",
			description:
				"A Markdown file demonstrating different horizontal rule styles.",
		},
	},
	/*
	{
		folderName: "inline_html",
		absoluteFilePath: "/path/to/inline_html.md",
		fileName: "inline_html.md",
		contents:
			"<p>Paragraph with <strong>bold</strong> and <em>italic</em> text.</p>",
		pageTitle: "Inline HTML",
		frontmatter: {
			title: "Inline HTML",
			description:
				"A Markdown file demonstrating the use of inline HTML.",
		},
	},
	*/
	{
		folderName: "escaping",
		absoluteFilePath: "/path/to/escaping.md",
		fileName: "escaping.md",
		contents: "\\*Escape asterisks\\*\n\n\\[Escape brackets\\]",
		pageTitle: "Escaping",
		frontmatter: {
			title: "Escaping",
			description:
				"A Markdown file demonstrating how to escape special characters.",
		},
	},
	{
		folderName: "folder1",
		absoluteFilePath: "/path/to/folder1/file1.md",
		fileName: "file1.md",
		contents: "# Test Content\nHello, World!",
		pageTitle: "Test Page",
		frontmatter: {
			"connie-title": "Custom Title",
			"connie-frontmatter-to-publish": ["author", "date"],
			author: "John Doe",
			date: "2023-04-14",
			tags: ["test", "example"],
			//			"connie-page-id": "12345",
			//			"connie-dont-change-parent-page": true,
		},
	},
	{
		folderName: "folder2",
		absoluteFilePath: "/path/to/folder2/file2.md",
		fileName: "file2.md",
		contents: "## Another Test\nThis is another test.",
		pageTitle: "Another Test Page",
		frontmatter: {
			"connie-title": "Another Custom Title",
			"connie-frontmatter-to-publish": ["project"],
			project: "Project Name",
			tags: ["demo", 42],
			//			"connie-page-id": 67890,
			//			"connie-dont-change-parent-page": false,
		},
	},
	{
		folderName: "folder3",
		absoluteFilePath: "/path/to/folder3/file3.md",
		fileName: "file3.md",
		contents: "### Third Test\nYet another test content.",
		pageTitle: "Third Test Page",
		frontmatter: {
			"connie-title": 98765,
			"connie-frontmatter-to-publish": [],
			tags: ["sample", "test"],
			//			"connie-page-id": "qwerty",
			//			"connie-dont-change-parent-page": "invalid",
		},
	},
];

class TestMermaidRenderer implements MermaidRenderer {
	async captureMermaidCharts(
		_charts: ChartData[],
	): Promise<Map<string, Buffer>> {
		const capturedCharts = new Map<string, Buffer>();
		return capturedCharts;
	}
}

class InMemoryAdaptor implements LoaderAdaptor {
	private inMemoryFiles: MarkdownFile[];

	constructor(inMemoryFiles: MarkdownFile[]) {
		this.inMemoryFiles = inMemoryFiles;
	}

	async loadMarkdownFile(absoluteFilePath: string): Promise<MarkdownFile> {
		const file = this.inMemoryFiles.find(
			(t) => t.absoluteFilePath === absoluteFilePath,
		);
		if (!file) {
			throw new Error(`File not found: ${absoluteFilePath}`);
		}
		return file;
	}

	async getMarkdownFilesToUpload(): Promise<FilesToUpload> {
		return this.inMemoryFiles;
	}

	async readBinary(
		_path: string,
		_referencedFromFilePath: string,
	): Promise<false | BinaryFile> {
		return false;
	}

	async updateMarkdownValues(
		_absoluteFilePath: string,
		_values: Partial<ConfluencePerPageAllValues>,
	): Promise<void> {
		// Do nothing
	}
}

test("publisher initialization", () => {
	const filesystemAdaptor = new InMemoryAdaptor(markdownTestCases);
	const mermaidRenderer = new TestMermaidRenderer();
	const confluenceClient = new ObsidianConfluenceClient({
		host: settingsLoader.load().confluenceBaseUrl,
		authentication: {
			basic: {
				email: settingsLoader.load().atlassianUserName,
				apiToken: settingsLoader.load().atlassianApiToken,
			},
		},
		logger: new NoOpLogger(),
	});

	const publisher = new Publisher(
		filesystemAdaptor,
		settingsLoader,
		confluenceClient,
		[new MermaidRendererPlugin(mermaidRenderer)],
		new NoOpLogger(),
	);

	expect(publisher).toBeDefined();
});

test("markdown to ADF conversion", async () => {
	const mermaidRenderer = new TestMermaidRenderer();
	const confluenceClient = new ObsidianConfluenceClient({
		host: testSettings.confluenceBaseUrl,
		authentication: {
			basic: {
				email: testSettings.atlassianUserName,
				apiToken: testSettings.atlassianApiToken,
			},
		},
		logger: new NoOpLogger(),
	});

	const publisher = new Publisher(
		new InMemoryAdaptor(markdownTestCases),
		settingsLoader,
		confluenceClient,
		[new MermaidRendererPlugin(mermaidRenderer)],
		new NoOpLogger(),
	);

	const results = await publisher.publish("");
	expect(results).toBeDefined();
});
