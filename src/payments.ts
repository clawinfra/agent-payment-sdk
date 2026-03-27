/**
 * Payment operations for agent-to-agent transfers on ClawChain.
 *
 * Integrates AgentWallet (signing) + SpendingRules (enforcement)
 * + IChainClient (on-chain submission).
 */

import type {
  AgentDID,
  BalanceInfo,
  IChainClient,
  TransactionReceipt,
} from './types';
import { AgentWallet, deriveKeypair } from './wallet';
import { SpendingRules } from './rules';
import type { SpendingRulesConfig } from './types';

/** Options for creating an AgentPaymentClient */
export interface PaymentClientOptions {
  /** Agent DID for this client */
  did: AgentDID;
  /** Chain client for submitting transactions */
  chainClient: IChainClient;
  /** Spending rules configuration (optional) */
  spendingRules?: SpendingRulesConfig;
}

/**
 * AgentPaymentClient — high-level payment interface for AI agents.
 *
 * Combines wallet management, spending rule enforcement, and
 * on-chain transaction submission into a single cohesive API.
 *
 * @example
 * ```typescript
 * const client = new AgentPaymentClient({
 *   did: 'did:claw:my-agent-001',
 *   chainClient: new ClawChainClient({ rpcUrl: 'ws://localhost:9944' }),
 *   spendingRules: {
 *     maxPerTransaction: 1000n,
 *     dailyLimit: 5000n,
 *   },
 * });
 *
 * const receipt = await client.send('did:claw:other-agent', 500n, 'payment for data');
 * ```
 */
export class AgentPaymentClient {
  public readonly wallet: AgentWallet;
  public readonly rules: SpendingRules;
  private readonly chainClient: IChainClient;

  constructor(options: PaymentClientOptions) {
    this.wallet = new AgentWallet(options.did);
    this.chainClient = options.chainClient;
    this.wallet.connectClient(this.chainClient);
    this.rules = new SpendingRules(options.spendingRules);
  }

  /**
   * Send tokens to another agent.
   *
   * Validates against spending rules, then submits the transaction
   * to ClawChain via the connected chain client.
   *
   * @param to - Recipient agent DID
   * @param amount - Amount to send (in smallest token unit)
   * @param memo - Optional transaction memo
   * @returns Transaction receipt
   * @throws Error if spending rules reject the transaction
   * @throws Error if the on-chain submission fails
   */
  async send(
    to: AgentDID,
    amount: bigint,
    memo?: string
  ): Promise<TransactionReceipt> {
    // Validate against spending rules
    const validation = this.rules.validate(to, amount);
    if (!validation.allowed) {
      throw new Error(`Transaction rejected: ${validation.reason}`);
    }

    // Derive recipient address from their DID
    const recipientKeypair = deriveKeypair(to);
    const recipientAddress = recipientKeypair.address;

    // Submit the transfer
    const receipt = await this.chainClient.submitTransfer(
      this.wallet.keypair,
      recipientAddress,
      amount,
      memo
    );

    // Record the transaction for daily limit tracking
    this.rules.recordTransaction(amount);

    return receipt;
  }

  /**
   * Query the balance of this agent's wallet.
   *
   * @returns Balance information
   */
  async queryBalance(): Promise<BalanceInfo> {
    return this.chainClient.queryBalance(this.wallet.address);
  }

  /**
   * Query the balance of another agent by DID.
   *
   * @param did - Agent DID to query
   * @returns Balance information
   */
  async queryBalanceOf(did: AgentDID): Promise<BalanceInfo> {
    const keypair = deriveKeypair(did);
    return this.chainClient.queryBalance(keypair.address);
  }

  /**
   * Update spending rules.
   */
  updateSpendingRules(config: Partial<SpendingRulesConfig>): void {
    this.rules.updateRules(config);
  }

  /**
   * Get this agent's DID.
   */
  get did(): AgentDID {
    return this.wallet.did;
  }

  /**
   * Get this agent's on-chain address.
   */
  get address(): string {
    return this.wallet.address;
  }

  /**
   * Get remaining daily spending budget (null if no limit set).
   */
  get dailyRemaining(): bigint | null {
    return this.rules.getDailyRemaining();
  }

  /**
   * Get total spent today.
   */
  get dailySpent(): bigint {
    return this.rules.getDailySpent();
  }
}
