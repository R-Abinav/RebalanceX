/**
 * RebalanceX Logger
 * Structured logging with Winston
 */

import winston from 'winston';

const { combine, timestamp, printf, colorize } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${ts}] [${level}] ${message}${metaStr}`;
});

// Create logger instance
export const logger = winston.createLogger({
    level: process.env['LOG_LEVEL'] ?? 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true })
    ),
    transports: [
        // Console transport with colors
        new winston.transports.Console({
            format: combine(colorize(), consoleFormat),
        }),
        // File transport for all logs
        new winston.transports.File({
            filename: 'rebalancex.log',
            format: combine(timestamp(), winston.format.json()),
        }),
    ],
});

// Log transaction with hash
export function logTransaction(
    action: string,
    chain: string,
    txHash: string,
    details?: Record<string, unknown>
): void {
    logger.info(`Transaction: ${action}`, {
        chain,
        txHash,
        ...details,
    });
}

// Log balance update
export function logBalance(
    chain: string,
    balance: string,
    percentage: number
): void {
    logger.info(`Balance: ${chain}`, {
        balance,
        percentage: `${percentage.toFixed(2)}%`,
    });
}

// Log rebalancing decision
export function logDecision(
    action: string,
    from: string,
    to: string,
    amount: string
): void {
    logger.info(`Decision: ${action}`, {
        from,
        to,
        amount,
    });
}

// Log error with context
export function logError(
    message: string,
    error: unknown,
    context?: Record<string, unknown>
): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error(message, {
        error: errorMessage,
        stack,
        ...context,
    });
}
