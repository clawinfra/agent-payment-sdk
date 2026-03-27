/**
 * Agent Payment SDK for ClawChain
 *
 * Enables AI agents to make autonomous payments on the ClawChain network.
 *
 * @packageDocumentation
 */

export { AgentWallet, deriveKeypair } from './wallet';
export { SpendingRules } from './rules';
export { AgentPaymentClient } from './payments';
export type { PaymentClientOptions } from './payments';
export type {
  AgentDID,
  PublicKeyHex,
  PrivateKeyHex,
  AgentKeypair,
  ChainConfig,
  TransactionReceipt,
  BalanceInfo,
  SpendingRulesConfig,
  RuleValidationResult,
  IChainClient,
} from './types';
