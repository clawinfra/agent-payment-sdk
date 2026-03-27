# Agent Payment SDK

> Agent-native payment SDK for ClawChain — enables AI agents to make autonomous payments.

Built on top of [clawchain-sdk](https://github.com/clawinfra/claw-chain), this SDK provides a high-level interface for AI agents to:

- **Create deterministic wallets** from Agent DIDs (no seed phrase management)
- **Send payments** to other agents with a single function call
- **Query balances** for self or any agent by DID
- **Enforce spending rules** — per-tx limits, daily caps, recipient allowlists, rate limiting

## Install

```bash
npm install agent-payment-sdk
```

## Quick Start

```typescript
import { AgentPaymentClient } from 'agent-payment-sdk';

// Create a payment client for your agent
const client = new AgentPaymentClient({
  did: 'did:claw:my-agent-001',
  chainClient: yourChainClient, // implements IChainClient
  spendingRules: {
    maxPerTransaction: 1000n,      // max 1000 tokens per tx
    dailyLimit: 5000n,             // max 5000 tokens per 24h
    allowedRecipients: [           // only pay these agents
      'did:claw:data-provider',
      'did:claw:compute-service',
    ],
    minTransactionIntervalSec: 5,  // rate limit: 1 tx per 5 seconds
  },
});

// Send a payment
const receipt = await client.send(
  'did:claw:data-provider',
  500n,
  'payment for dataset v2.3'
);

console.log(`Tx ${receipt.txHash} in block ${receipt.blockNumber}`);

// Check balance
const balance = await client.queryBalance();
console.log(`Free: ${balance.free}, Reserved: ${balance.reserved}`);

// Check spending
console.log(`Spent today: ${client.dailySpent}`);
console.log(`Remaining: ${client.dailyRemaining}`);
```

## Wallet Derivation

Wallets are derived deterministically from Agent DIDs — the same DID always produces the same keypair. No seed phrases, no key files.

```typescript
import { AgentWallet } from 'agent-payment-sdk';

const wallet = new AgentWallet('did:claw:my-agent-001');

console.log(wallet.address);      // 0x... (derived from DID)
console.log(wallet.publicKeyHex); // ed25519 public key

// Sign and verify arbitrary data
const data = new TextEncoder().encode('hello');
const signature = wallet.sign(data);
const valid = wallet.verify(signature, data); // true
```

## Spending Rules

Protect agents from overspending or unauthorized transfers:

```typescript
import { SpendingRules } from 'agent-payment-sdk';

const rules = new SpendingRules({
  maxPerTransaction: 1000n,
  dailyLimit: 5000n,
  allowedRecipients: ['did:claw:trusted-vendor'],
  minTransactionIntervalSec: 10,
});

// Validate before sending
const result = rules.validate('did:claw:trusted-vendor', 500n);
if (result.allowed) {
  // proceed with payment
  rules.recordTransaction(500n);
}

// Dynamic updates
rules.updateRules({ dailyLimit: 10000n });
rules.addAllowedRecipient('did:claw:new-vendor');
```

## API Reference

### `AgentPaymentClient`

| Method | Description |
|--------|-------------|
| `send(to, amount, memo?)` | Send tokens to another agent |
| `queryBalance()` | Query own balance |
| `queryBalanceOf(did)` | Query another agent's balance |
| `updateSpendingRules(config)` | Update spending rules |
| `dailySpent` | Total spent in current 24h window |
| `dailyRemaining` | Remaining daily budget (null if no limit) |

### `AgentWallet`

| Method | Description |
|--------|-------------|
| `sign(data)` | Sign data with agent's private key |
| `verify(signature, data)` | Verify a signature |
| `connectClient(client)` | Attach a chain client |
| `address` | On-chain address |
| `publicKeyHex` | Public key (hex) |

### `SpendingRules`

| Method | Description |
|--------|-------------|
| `validate(recipient, amount)` | Check if a tx is allowed |
| `recordTransaction(amount)` | Record a completed tx |
| `getDailySpent()` | Total spent in 24h window |
| `getDailyRemaining()` | Remaining budget |
| `updateRules(config)` | Update rule config |
| `addAllowedRecipient(did)` | Add to allowlist |
| `removeAllowedRecipient(did)` | Remove from allowlist |
| `reset()` | Clear all history |

### `IChainClient` Interface

Implement this interface to connect to ClawChain:

```typescript
interface IChainClient {
  submitTransfer(fromKeypair, toAddress, amount, memo?): Promise<TransactionReceipt>;
  queryBalance(address): Promise<BalanceInfo>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
```

## Development

```bash
git clone https://github.com/clawinfra/agent-payment-sdk.git
cd agent-payment-sdk
npm install
npm test        # run tests with coverage
npm run build   # compile TypeScript
```

## License

MIT — ClawInfra
