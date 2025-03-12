export type ConfluenceSettings = {
	confluenceBaseUrl: string;
	confluenceParentId: string;
	atlassianUserName: string;
	atlassianApiToken: string;
	folderToPublish: string;
	contentRoot: string;
	firstHeadingPageTitle: boolean;
	publishingMode?: "legacy" | "frontmatter";
};

export const DEFAULT_SETTINGS: ConfluenceSettings = {
	confluenceBaseUrl: "",
	confluenceParentId: "",
	atlassianUserName: "",
	atlassianApiToken: "",
	folderToPublish: "Confluence Pages",
	contentRoot: process.cwd(),
	firstHeadingPageTitle: false,
	publishingMode: "legacy",
};
