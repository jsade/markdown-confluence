#!/usr/bin/env node

process.setMaxListeners(Infinity);

import {
    AutoSettingsLoader,
    ConsoleLogger,
    FileSystemAdaptor,
    MermaidRendererPlugin,
    Publisher
} from "@markdown-confluence/lib";
import { PuppeteerMermaidRenderer } from "@markdown-confluence/mermaid-puppeteer-renderer";
import { ObsidianConfluenceClient } from "@markdown-confluence/obsidian/src/clients/obsidian-confluence-client";
import boxen from "boxen";
import chalk from "chalk";

// Define the main function
async function main() {
	const settingLoader = new AutoSettingsLoader();
	const settings = settingLoader.load();

	// Create a console logger with appropriate configuration
	const logger = new ConsoleLogger();

	const adaptor = new FileSystemAdaptor(settings, logger); // Pass the logger to the adaptor
	const confluenceClient = new ObsidianConfluenceClient({
		host: settings.confluenceBaseUrl,
		authentication: {
			basic: {
				email: settings.atlassianUserName,
				apiToken: settings.atlassianApiToken,
			},
		},
		logger,
	});

	const publisher = new Publisher(
		adaptor,
		settingLoader,
		confluenceClient,
		[new MermaidRendererPlugin(new PuppeteerMermaidRenderer())],
		logger
	);

	const publishFilter = "";
	const results = await publisher.publish(publishFilter);
	results.forEach((file) => {
		if (file.successfulUploadResult) {
			console.log(
				chalk.green(
					`SUCCESS: ${file.node.file.absoluteFilePath} Content: ${file.successfulUploadResult.contentResult}, Images: ${file.successfulUploadResult.imageResult}, Labels: ${file.successfulUploadResult.labelResult}, Page URL: ${file.node.file.pageUrl}`,
				),
			);
			return;
		}
		console.error(
			chalk.red(
				`FAILED:  ${file.node.file.absoluteFilePath} publish failed. Error is: ${file.reason}`,
			),
		);
	});
}

// Call the main function
main().catch((error) => {
	console.error(chalk.red(boxen(`Error: ${error.message}`, { padding: 1 })));
	process.exit(1);
});
