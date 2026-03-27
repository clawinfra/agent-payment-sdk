/**
 * Core type definitions for the Agent Payment SDK.
 */

/** Agent Decentralized Identifier — unique identity for an agent on ClawChain */
export type AgentDID = string;

/** Hex-encoded public key (64 chars, no 0x prefix) */
export type PublicKeyHex = string;

/** Hex-encoded private key (64 chars, no 0x prefix) */
export type PrivateKeyHex = string;

/** Ed25519 keypair derived from an agent DID */
export interface AgentKeypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  publicKeyHex: PublicKeyHex;
  address: string;
}

/** Configuration for connecting to a ClawChain RPC node */
export interface ChainConfig {
  /** WebSocket or HTTP RPC endpoint */
  rpcUrl: string;
  /** Chain ID / genesis hash prefix (optional) */
  chainId?: string;
}

/** A submitted transaction receipt */
export interface TransactionReceipt {
  /** Transaction hash */
  txHash: string;
  /** Block number the tx was included in */
  blockNumber: number;
  /** Whether the tx succeeded */
  success: boolean;
  /** Sender DID */
  from: AgentDID;
  /** Recipient DID */
  to: AgentDID;
  /** Amount transferred */
  amount: bigint;
  /** Optional memo */
  memo?: string;
  /** Timestamp (ms since epoch) */
  timestamp: number;
}

/** Balance information for an agent */
export interface BalanceInfo {
  /** Agent DID */
  did: AgentDID;
  /** Free (spendable) balance */
  free: bigint;
  /** Reserved balance */
  reserved: bigint;
  /** Total = free + reserved */
  total: bigint;
}

/** Spending rules configuration */
export interface SpendingRulesConfig {
  /** Maximum amount per single transaction */
  maxPerTransaction?: bigint;
  /** Maximum total spend per 24h rolling window */
  dailyLimit?: bigint;
  /** If set, only these DIDs can receive payments */
  allowedRecipients?: AgentDID[];
  /** Minimum seconds between consecutive transactions */
  minTransactionIntervalSec?: number;
}

/** Result of a spending rule validation */
export interface RuleValidationResult {
  allowed: boolean;
  reason?: string;
}

/** Interface for the chain client (enables mocking) */
export interface IChainClient {
  submitTransfer(
    fromKeypair: AgentKeypair,
    toAddress: string,
    amount: bigint,
    memo?: string
  ): Promise<TransactionReceipt>;

  queryBalance(address: string): Promise<BalanceInfo>;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
