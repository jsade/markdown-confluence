/**
 * Logger utility for Obsidian Confluence plugin
 * Provides multiple log levels and configurable output
 */

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
	SILENT = 4
}

export interface LoggerOptions {
	/**
	 * Minimum level to output logs
	 */
	minLevel: LogLevel;

	/**
	 * Prefix to add to all log messages
	 */
	prefix?: string;

	/**
	 * Whether to include timestamps in logs
	 */
	showTimestamps?: boolean;

	/**
	 * Whether to include log level in the output
	 */
	showLogLevel?: boolean;

	/**
	 * Custom log handler function
	 * If provided, this function will be used instead of console methods
	 */
	logHandler?: ((level: LogLevel, message: string, ...args: unknown[]) => void) | undefined;
}

export class Logger {
	private minLevel: LogLevel;
	private prefix: string;
	private showTimestamps: boolean;
	private showLogLevel: boolean;
	private logHandler: ((level: LogLevel, message: string, ...args: unknown[]) => void) | undefined;

	/**
	 * Create a new Logger instance
	 */
	constructor(options: LoggerOptions) {
		this.minLevel = options.minLevel;
		this.prefix = options.prefix || 'Confluence';
		this.showTimestamps = options.showTimestamps !== undefined ? options.showTimestamps : true;
		this.showLogLevel = options.showLogLevel !== undefined ? options.showLogLevel : true;
		this.logHandler = options.logHandler;
	}

	/**
	 * Format a log message with optional timestamp and level
	 */
	private formatMessage(level: LogLevel, message: string): string {
		const parts: string[] = [];

		if (this.prefix) {
			parts.push(`[${this.prefix}]`);
		}

		if (this.showTimestamps) {
			parts.push(`[${new Date().toISOString()}]`);
		}

		if (this.showLogLevel) {
			parts.push(`[${LogLevel[level]}]`);
		}

		parts.push(message);

		return parts.join(' ');
	}

	/**
	 * Log a debug message
	 */
	public debug(message: string, ...args: unknown[]): void {
		if (this.minLevel <= LogLevel.DEBUG) {
			const formattedMessage = this.formatMessage(LogLevel.DEBUG, message);

			if (this.logHandler) {
				this.logHandler(LogLevel.DEBUG, formattedMessage, ...args);
			} else {
				console.debug(formattedMessage, ...args);
			}
		}
	}

	/**
	 * Log an info message
	 */
	public info(message: string, ...args: unknown[]): void {
		if (this.minLevel <= LogLevel.INFO) {
			const formattedMessage = this.formatMessage(LogLevel.INFO, message);

			if (this.logHandler) {
				this.logHandler(LogLevel.INFO, formattedMessage, ...args);
			} else {
				console.info(formattedMessage, ...args);
			}
		}
	}

	/**
	 * Log a warning message
	 */
	public warn(message: string, ...args: unknown[]): void {
		if (this.minLevel <= LogLevel.WARN) {
			const formattedMessage = this.formatMessage(LogLevel.WARN, message);

			if (this.logHandler) {
				this.logHandler(LogLevel.WARN, formattedMessage, ...args);
			} else {
				console.warn(formattedMessage, ...args);
			}
		}
	}

	/**
	 * Log an error message
	 */
	public error(message: string, ...args: unknown[]): void {
		if (this.minLevel <= LogLevel.ERROR) {
			const formattedMessage = this.formatMessage(LogLevel.ERROR, message);

			if (this.logHandler) {
				this.logHandler(LogLevel.ERROR, formattedMessage, ...args);
			} else {
				console.error(formattedMessage, ...args);
			}
		}
	}

	/**
	 * Create a child logger with a different prefix
	 */
	public createChildLogger(childPrefix: string, options: Partial<LoggerOptions> = {}): Logger {
		return new Logger({
			minLevel: options.minLevel !== undefined ? options.minLevel : this.minLevel,
			prefix: `${this.prefix}:${childPrefix}`,
			showTimestamps: options.showTimestamps !== undefined ? options.showTimestamps : this.showTimestamps,
			showLogLevel: options.showLogLevel !== undefined ? options.showLogLevel : this.showLogLevel,
			logHandler: options.logHandler !== undefined ? options.logHandler : this.logHandler,
		});
	}

	/**
	 * Update logger options
	 */
	public updateOptions(options: Partial<LoggerOptions>): void {
		if (options.minLevel !== undefined) {
			this.minLevel = options.minLevel;
		}

		if (options.prefix !== undefined) {
			this.prefix = options.prefix;
		}

		if (options.showTimestamps !== undefined) {
			this.showTimestamps = options.showTimestamps;
		}

		if (options.showLogLevel !== undefined) {
			this.showLogLevel = options.showLogLevel;
		}

		if (options.logHandler !== undefined) {
			this.logHandler = options.logHandler;
		}
	}

	/**
	 * Create a default logger instance
	 */
	public static createDefault(): Logger {
		return new Logger({
			minLevel: LogLevel.INFO,
			prefix: 'Confluence',
			showTimestamps: true,
			showLogLevel: true,
		});
	}
} 
