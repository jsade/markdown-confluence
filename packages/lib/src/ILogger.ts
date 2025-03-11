/**
 * Interface for logging functionality used throughout the library
 */
export interface ILogger {
	debug(message: string, ...args: unknown[]): void;
	info(message: string, ...args: unknown[]): void;
	warn(message: string, ...args: unknown[]): void;
	error(message: string, ...args: unknown[]): void;
}

/**
 * Default console-based implementation of ILogger
 */
export class ConsoleLogger implements ILogger {
	public debug(message: string, ...args: unknown[]): void {
		console.debug(message, ...args);
	}

	public info(message: string, ...args: unknown[]): void {
		console.info(message, ...args);
	}

	public warn(message: string, ...args: unknown[]): void {
		console.warn(message, ...args);
	}

	public error(message: string, ...args: unknown[]): void {
		console.error(message, ...args);
	}
}

/**
 * No-operation logger that doesn't output anything
 */
export class NoOpLogger implements ILogger {
	public debug(_message: string, ..._args: unknown[]): void { }
	public info(_message: string, ..._args: unknown[]): void { }
	public warn(_message: string, ..._args: unknown[]): void { }
	public error(_message: string, ..._args: unknown[]): void { }
} 
