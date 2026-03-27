/**
 * SpendingRules — enforce transaction limits, daily caps, allowlists,
 * and rate limiting before any payment is signed.
 */

import type { AgentDID, SpendingRulesConfig, RuleValidationResult } from './types';

/** Transaction record for tracking daily spending */
interface TransactionRecord {
  amount: bigint;
  timestamp: number;
}

/** 24 hours in milliseconds */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * SpendingRules enforces configurable limits on agent transactions.
 *
 * Features:
 * - Max amount per single transaction
 * - Rolling 24h daily spending limit
 * - Recipient allowlist (if set, only listed DIDs can receive)
 * - Minimum interval between consecutive transactions (rate limiting)
 */
export class SpendingRules {
  private maxPerTransaction: bigint | null;
  private dailyLimit: bigint | null;
  private allowedRecipients: Set<AgentDID> | null;
  private minTransactionIntervalMs: number;
  private transactionHistory: TransactionRecord[] = [];
  private lastTransactionTime: number = 0;
  private nowFn: () => number;

  /**
   * @param config - Spending rules configuration
   * @param nowFn - Optional function to get current time (for testing)
   */
  constructor(config: SpendingRulesConfig = {}, nowFn?: () => number) {
    this.maxPerTransaction = config.maxPerTransaction ?? null;
    this.dailyLimit = config.dailyLimit ?? null;
    this.allowedRecipients = config.allowedRecipients
      ? new Set(config.allowedRecipients)
      : null;
    this.minTransactionIntervalMs = (config.minTransactionIntervalSec ?? 0) * 1000;
    this.nowFn = nowFn ?? (() => Date.now());
  }

  /**
   * Validate a proposed transaction against all rules.
   *
   * @param recipient - Target agent DID
   * @param amount - Amount to send
   * @returns Validation result with allowed flag and optional reason
   */
  validate(recipient: AgentDID, amount: bigint): RuleValidationResult {
    // Check amount is positive
    if (amount <= 0n) {
      return { allowed: false, reason: 'Amount must be positive' };
    }

    // Check per-transaction limit
    if (this.maxPerTransaction !== null && amount > this.maxPerTransaction) {
      return {
        allowed: false,
        reason: `Amount ${amount} exceeds per-transaction limit of ${this.maxPerTransaction}`,
      };
    }

    // Check recipient allowlist
    if (this.allowedRecipients !== null && !this.allowedRecipients.has(recipient)) {
      return {
        allowed: false,
        reason: `Recipient ${recipient} is not in the allowlist`,
      };
    }

    // Check rate limit
    const now = this.nowFn();
    if (
      this.minTransactionIntervalMs > 0 &&
      this.lastTransactionTime > 0
    ) {
      const elapsed = now - this.lastTransactionTime;
      if (elapsed < this.minTransactionIntervalMs) {
        const waitSec = Math.ceil(
          (this.minTransactionIntervalMs - elapsed) / 1000
        );
        return {
          allowed: false,
          reason: `Rate limit: wait ${waitSec}s before next transaction`,
        };
      }
    }

    // Check daily limit (rolling 24h window)
    if (this.dailyLimit !== null) {
      this.pruneHistory(now);
      const spent = this.transactionHistory.reduce(
        (sum, tx) => sum + tx.amount,
        0n
      );
      if (spent + amount > this.dailyLimit) {
        const remaining = this.dailyLimit - spent;
        return {
          allowed: false,
          reason: `Daily limit exceeded: spent ${spent}, limit ${this.dailyLimit}, remaining ${remaining < 0n ? 0n : remaining}`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Record a successful transaction for daily limit tracking.
   *
   * @param amount - Amount that was sent
   */
  recordTransaction(amount: bigint): void {
    const now = this.nowFn();
    this.transactionHistory.push({ amount, timestamp: now });
    this.lastTransactionTime = now;
  }

  /**
   * Get the total amount spent in the current 24h window.
   */
  getDailySpent(): bigint {
    this.pruneHistory(this.nowFn());
    return this.transactionHistory.reduce(
      (sum, tx) => sum + tx.amount,
      0n
    );
  }

  /**
   * Get the remaining daily budget (null if no daily limit set).
   */
  getDailyRemaining(): bigint | null {
    if (this.dailyLimit === null) return null;
    const spent = this.getDailySpent();
    const remaining = this.dailyLimit - spent;
    return remaining < 0n ? 0n : remaining;
  }

  /**
   * Update the spending rules configuration.
   */
  updateRules(config: Partial<SpendingRulesConfig>): void {
    if (config.maxPerTransaction !== undefined) {
      this.maxPerTransaction = config.maxPerTransaction ?? null;
    }
    if (config.dailyLimit !== undefined) {
      this.dailyLimit = config.dailyLimit ?? null;
    }
    if (config.allowedRecipients !== undefined) {
      this.allowedRecipients = config.allowedRecipients
        ? new Set(config.allowedRecipients)
        : null;
    }
    if (config.minTransactionIntervalSec !== undefined) {
      this.minTransactionIntervalMs =
        (config.minTransactionIntervalSec ?? 0) * 1000;
    }
  }

  /**
   * Add a recipient to the allowlist. Creates the allowlist if it doesn't exist.
   */
  addAllowedRecipient(did: AgentDID): void {
    if (!this.allowedRecipients) {
      this.allowedRecipients = new Set();
    }
    this.allowedRecipients.add(did);
  }

  /**
   * Remove a recipient from the allowlist.
   */
  removeAllowedRecipient(did: AgentDID): void {
    if (this.allowedRecipients) {
      this.allowedRecipients.delete(did);
    }
  }

  /**
   * Check if a recipient is in the allowlist (true if no allowlist is set).
   */
  isAllowed(did: AgentDID): boolean {
    if (!this.allowedRecipients) return true;
    return this.allowedRecipients.has(did);
  }

  /**
   * Reset all transaction history and rate limit state.
   */
  reset(): void {
    this.transactionHistory = [];
    this.lastTransactionTime = 0;
  }

  /**
   * Remove transactions older than 24h from history.
   */
  private pruneHistory(now: number): void {
    const cutoff = now - DAY_MS;
    this.transactionHistory = this.transactionHistory.filter(
      (tx) => tx.timestamp > cutoff
    );
  }
}
