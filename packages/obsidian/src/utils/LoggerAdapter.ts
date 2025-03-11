import { ILogger } from '@markdown-confluence/lib';
import { Logger } from './Logger';

/**
 * Adapter that connects the Obsidian Logger to the library's ILogger interface
 */
export class ObsidianLoggerAdapter implements ILogger {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public debug(message: string, ...args: unknown[]): void {
    this.logger.debug(message, ...args);
  }

  public info(message: string, ...args: unknown[]): void {
    this.logger.info(message, ...args);
  }

  public warn(message: string, ...args: unknown[]): void {
    this.logger.warn(message, ...args);
  }

  public error(message: string, ...args: unknown[]): void {
    this.logger.error(message, ...args);
  }
} 
