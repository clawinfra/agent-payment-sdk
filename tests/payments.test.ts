import { AgentPaymentClient } from '../src/payments';
import { deriveKeypair } from '../src/wallet';
import type {
  IChainClient,
  AgentKeypair,
  TransactionReceipt,
  BalanceInfo,
} from '../src/types';

/** Create a mock chain client */
function createMockClient(overrides: Partial<IChainClient> = {}): IChainClient {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    submitTransfer: jest.fn().mockImplementation(
      async (
        fromKeypair: AgentKeypair,
        toAddress: string,
        amount: bigint,
        memo?: string
      ): Promise<TransactionReceipt> => ({
        txHash: '0x' + 'ab'.repeat(32),
        blockNumber: 42,
        success: true,
        from: 'did:claw:sender',
        to: 'did:claw:receiver',
        amount,
        memo,
        timestamp: Date.now(),
      })
    ),
    queryBalance: jest.fn().mockImplementation(
      async (address: string): Promise<BalanceInfo> => ({
        did: 'did:claw:queried',
        free: 10000n,
        reserved: 500n,
        total: 10500n,
      })
    ),
    ...overrides,
  };
}

describe('AgentPaymentClient', () => {
  const senderDid = 'did:claw:agent-sender-001';
  const receiverDid = 'did:claw:agent-receiver-001';

  describe('construction', () => {
    it('should create a client with wallet and rules', () => {
      const client = new AgentPaymentClient({
        did: senderDid,
        chainClient: createMockClient(),
      });

      expect(client.did).toBe(senderDid);
      expect(client.address).toMatch(/^0x[0-9a-f]{40}$/);
      expect(client.wallet).toBeDefined();
      expect(client.rules).toBeDefined();
    });

    it('should accept spending rules config', () => {
      const client = new AgentPaymentClient({
        did: senderDid,
        chainClient: createMockClient(),
        spendingRules: {
          maxPerTransaction: 1000n,
          dailyLimit: 5000n,
        },
      });

      expect(client.dailyRemaining).toBe(5000n);
    });
  });

  describe('send', () => {
    it('should send a payment and return receipt', async () => {
      const mockClient = createMockClient();
      const client = new AgentPaymentClient({
        did: senderDid,
        chainClient: mockClient,
      });

      const receipt = await client.send(receiverDid, 500n, 'test payment');

      expect(receipt.success).toBe(true);
      expect(receipt.amount).toBe(500n);
      expect(receipt.memo).toBe('test payment');
      expect(mockClient.submitTransfer).toHaveBeenCalledTimes(1);

      // Verify the recipient address was derived from their DID
      const expectedAddress = deriveKeypair(receiverDid).address;
      expect(mockClient.submitTransfer).toHaveBeenCalledWith(
        client.wallet.keypair,
        expectedAddress,
        500n,
        'test payment'
      );
    });

    it('should send without memo', async () => {
      const mockClient = createMockClient();
      const client = new AgentPaymentClient({
        did: senderDid,
        chainClient: mockClient,
      });

      const receipt = await client.send(receiverDid, 100n);
      expect(receipt.success).toBe(true);
      expect(mockClient.submitTransfer).toHaveBeenCalledWith(
        client.wallet.keypair,
        expect.any(String),
        100n,
        undefined
      );
    });

    it('should reject when spending rules fail', async () => {
      const client = new AgentPaymentClient({
        did: senderDid,
        chainClient: createMockClient(),
        spendingRules: { maxPerTransaction: 100n },
      });

      await expect(client.send(receiverDid, 200n)).rejects.toThrow(
        'Transaction rejected'
      );
    });

    it('should track spending after successful send', async () => {
      const client = new AgentPaymentClient({
        did: senderDid,
        chainClient: createMockClient(),
        spendingRules: { dailyLimit: 1000n },
      });

      await client.send(receiverDid, 600n);
      expect(client.dailySpent).toBe(600n);
      expect(client.dailyRemaining).toBe(400n);
    });

    it('should propagate chain client errors', async () => {
      const failClient = createMockClient({
        submitTransfer: jest.fn().mockRejectedValue(new Error('RPC unavailable')),
      });

      const client = new AgentPaymentClient({
        did: senderDid,
        chainClient: failClient,
      });

      await expect(client.send(receiverDid, 100n)).rejects.toThrow(
        'RPC unavailable'
      );
    });

    it('should enforce daily limit across multiple sends', async () => {
      const client = new AgentPaymentClient({
        did: senderDid,
        chainClient: createMockClient(),
        spendingRules: { dailyLimit: 500n },
      });

      await client.send(receiverDid, 300n);
      await client.send(receiverDid, 150n);

      // This should fail: 300 + 150 + 100 = 550 > 500
      await expect(client.send(receiverDid, 100n)).rejects.toThrow(
        'Transaction rejected'
      );
    });

    it('should enforce allowlist', async () => {
      const client = new AgentPaymentClient({
        did: senderDid,
        chainClient: createMockClient(),
        spendingRules: {
          allowedRecipients: ['did:claw:trusted-agent'],
        },
      });

      await expect(client.send(receiverDid, 100n)).rejects.toThrow(
        'not in the allowlist'
      );

      const receipt = await client.send('did:claw:trusted-agent', 100n);
      expect(receipt.success).toBe(true);
    });
  });

  describe('queryBalance', () => {
    it('should query own balance', async () => {
      const mockClient = createMockClient();
      const client = new AgentPaymentClient({
        did: senderDid,
        chainClient: mockClient,
      });

      const balance = await client.queryBalance();
      expect(balance.free).toBe(10000n);
      expect(balance.total).toBe(10500n);
      expect(mockClient.queryBalance).toHaveBeenCalledWith(client.address);
    });

    it('should query another agent balance by DID', async () => {
      const mockClient = createMockClient();
      const client = new AgentPaymentClient({
        did: senderDid,
        chainClient: mockClient,
      });

      const balance = await client.queryBalanceOf(receiverDid);
      expect(balance).toBeDefined();

      const expectedAddress = deriveKeypair(receiverDid).address;
      expect(mockClient.queryBalance).toHaveBeenCalledWith(expectedAddress);
    });
  });

  describe('updateSpendingRules', () => {
    it('should update rules dynamically', async () => {
      const client = new AgentPaymentClient({
        did: senderDid,
        chainClient: createMockClient(),
        spendingRules: { maxPerTransaction: 50n },
      });

      // Initially blocked
      await expect(client.send(receiverDid, 100n)).rejects.toThrow(
        'Transaction rejected'
      );

      // Update limit
      client.updateSpendingRules({ maxPerTransaction: 200n });

      // Now allowed
      const receipt = await client.send(receiverDid, 100n);
      expect(receipt.success).toBe(true);
    });
  });

  describe('daily tracking', () => {
    it('should report zero spent and null remaining with no rules', () => {
      const client = new AgentPaymentClient({
        did: senderDid,
        chainClient: createMockClient(),
      });

      expect(client.dailySpent).toBe(0n);
      expect(client.dailyRemaining).toBeNull();
    });

    it('should track cumulative spending', async () => {
      const client = new AgentPaymentClient({
        did: senderDid,
        chainClient: createMockClient(),
        spendingRules: { dailyLimit: 10000n },
      });

      await client.send(receiverDid, 100n);
      await client.send(receiverDid, 200n);
      await client.send(receiverDid, 300n);

      expect(client.dailySpent).toBe(600n);
      expect(client.dailyRemaining).toBe(9400n);
    });
  });
});
