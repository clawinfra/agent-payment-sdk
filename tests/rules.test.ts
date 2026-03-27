import { SpendingRules } from '../src/rules';

describe('SpendingRules', () => {
  describe('basic validation', () => {
    it('should allow transactions with no rules set', () => {
      const rules = new SpendingRules();
      const result = rules.validate('did:claw:recipient', 1000n);
      expect(result.allowed).toBe(true);
    });

    it('should reject zero amount', () => {
      const rules = new SpendingRules();
      const result = rules.validate('did:claw:recipient', 0n);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('positive');
    });

    it('should reject negative amount', () => {
      const rules = new SpendingRules();
      const result = rules.validate('did:claw:recipient', -100n);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('positive');
    });
  });

  describe('maxPerTransaction', () => {
    it('should allow transactions under the limit', () => {
      const rules = new SpendingRules({ maxPerTransaction: 1000n });
      expect(rules.validate('did:claw:r', 999n).allowed).toBe(true);
      expect(rules.validate('did:claw:r', 1000n).allowed).toBe(true);
    });

    it('should reject transactions over the limit', () => {
      const rules = new SpendingRules({ maxPerTransaction: 1000n });
      const result = rules.validate('did:claw:r', 1001n);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('per-transaction limit');
    });
  });

  describe('allowedRecipients', () => {
    it('should allow listed recipients', () => {
      const rules = new SpendingRules({
        allowedRecipients: ['did:claw:alice', 'did:claw:bob'],
      });
      expect(rules.validate('did:claw:alice', 100n).allowed).toBe(true);
      expect(rules.validate('did:claw:bob', 100n).allowed).toBe(true);
    });

    it('should reject unlisted recipients', () => {
      const rules = new SpendingRules({
        allowedRecipients: ['did:claw:alice'],
      });
      const result = rules.validate('did:claw:eve', 100n);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not in the allowlist');
    });

    it('should allow any recipient when no allowlist is set', () => {
      const rules = new SpendingRules();
      expect(rules.validate('did:claw:anyone', 100n).allowed).toBe(true);
    });

    it('should support addAllowedRecipient', () => {
      const rules = new SpendingRules({ allowedRecipients: [] });
      expect(rules.validate('did:claw:new', 100n).allowed).toBe(false);

      rules.addAllowedRecipient('did:claw:new');
      expect(rules.validate('did:claw:new', 100n).allowed).toBe(true);
    });

    it('should create allowlist when adding to null list', () => {
      const rules = new SpendingRules();
      // No allowlist = anyone allowed
      expect(rules.isAllowed('did:claw:anyone')).toBe(true);

      // Adding a recipient creates the allowlist
      rules.addAllowedRecipient('did:claw:specific');
      expect(rules.isAllowed('did:claw:specific')).toBe(true);
      expect(rules.isAllowed('did:claw:anyone')).toBe(false);
    });

    it('should support removeAllowedRecipient', () => {
      const rules = new SpendingRules({
        allowedRecipients: ['did:claw:alice', 'did:claw:bob'],
      });
      rules.removeAllowedRecipient('did:claw:alice');
      expect(rules.validate('did:claw:alice', 100n).allowed).toBe(false);
      expect(rules.validate('did:claw:bob', 100n).allowed).toBe(true);
    });

    it('should handle removeAllowedRecipient with no allowlist', () => {
      const rules = new SpendingRules();
      // Should not throw
      rules.removeAllowedRecipient('did:claw:nonexistent');
      expect(rules.isAllowed('did:claw:anyone')).toBe(true);
    });

    it('should check isAllowed correctly', () => {
      const rules = new SpendingRules({
        allowedRecipients: ['did:claw:alice'],
      });
      expect(rules.isAllowed('did:claw:alice')).toBe(true);
      expect(rules.isAllowed('did:claw:bob')).toBe(false);
    });
  });

  describe('dailyLimit', () => {
    it('should track spending and enforce daily limit', () => {
      let now = 1000000;
      const rules = new SpendingRules(
        { dailyLimit: 500n },
        () => now
      );

      // First transaction: 200
      expect(rules.validate('did:claw:r', 200n).allowed).toBe(true);
      rules.recordTransaction(200n);

      // Second transaction: 200 (total 400, under 500)
      now += 1000;
      expect(rules.validate('did:claw:r', 200n).allowed).toBe(true);
      rules.recordTransaction(200n);

      // Third transaction: 200 (total 600, over 500)
      now += 1000;
      const result = rules.validate('did:claw:r', 200n);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily limit exceeded');
    });

    it('should reset daily spending after 24h', () => {
      let now = 1000000;
      const rules = new SpendingRules(
        { dailyLimit: 500n },
        () => now
      );

      // Spend 400
      rules.recordTransaction(400n);
      now += 1000;
      expect(rules.validate('did:claw:r', 200n).allowed).toBe(false);

      // Advance 24h + 1ms
      now += 24 * 60 * 60 * 1000 + 1;
      expect(rules.validate('did:claw:r', 200n).allowed).toBe(true);
    });

    it('should report daily spent and remaining', () => {
      let now = 1000000;
      const rules = new SpendingRules(
        { dailyLimit: 1000n },
        () => now
      );

      expect(rules.getDailySpent()).toBe(0n);
      expect(rules.getDailyRemaining()).toBe(1000n);

      rules.recordTransaction(300n);
      now += 1000;
      expect(rules.getDailySpent()).toBe(300n);
      expect(rules.getDailyRemaining()).toBe(700n);
    });

    it('should return null for remaining when no daily limit', () => {
      const rules = new SpendingRules();
      expect(rules.getDailyRemaining()).toBeNull();
    });

    it('should clamp remaining to 0 when overspent', () => {
      let now = 1000000;
      const rules = new SpendingRules(
        { dailyLimit: 100n },
        () => now
      );

      // Force-record more than limit
      rules.recordTransaction(150n);
      now += 1000;
      expect(rules.getDailyRemaining()).toBe(0n);
    });

    it('should show remaining=0 in rejection when exactly at limit', () => {
      let now = 1000000;
      const rules = new SpendingRules(
        { dailyLimit: 100n },
        () => now
      );

      // Spend exactly the limit
      rules.recordTransaction(100n);
      now += 1000;

      // Try to send 1 more — remaining is 0 (non-negative)
      const result = rules.validate('did:claw:r', 1n);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('remaining 0');
    });

    it('should clamp remaining to 0 in validate rejection when overspent', () => {
      let now = 1000000;
      const rules = new SpendingRules(
        { dailyLimit: 100n },
        () => now
      );

      // Force record more than the limit (bypassing validate)
      rules.recordTransaction(150n);
      now += 1000;

      // Now try to validate — remaining should be clamped to 0
      const result = rules.validate('did:claw:r', 1n);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('remaining 0');
    });
  });

  describe('rate limiting', () => {
    it('should enforce minimum transaction interval', () => {
      let now = 1000000;
      const rules = new SpendingRules(
        { minTransactionIntervalSec: 10 },
        () => now
      );

      // First transaction is always allowed
      expect(rules.validate('did:claw:r', 100n).allowed).toBe(true);
      rules.recordTransaction(100n);

      // Immediately after: should be rate limited
      now += 1000; // 1 second later
      const result = rules.validate('did:claw:r', 100n);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Rate limit');
      expect(result.reason).toContain('wait');

      // After 10 seconds: should be allowed
      now += 10000;
      expect(rules.validate('did:claw:r', 100n).allowed).toBe(true);
    });

    it('should not rate limit when interval is 0', () => {
      let now = 1000000;
      const rules = new SpendingRules(
        { minTransactionIntervalSec: 0 },
        () => now
      );

      expect(rules.validate('did:claw:r', 100n).allowed).toBe(true);
      rules.recordTransaction(100n);
      expect(rules.validate('did:claw:r', 100n).allowed).toBe(true);
    });
  });

  describe('updateRules', () => {
    it('should update maxPerTransaction', () => {
      const rules = new SpendingRules({ maxPerTransaction: 100n });
      expect(rules.validate('did:claw:r', 200n).allowed).toBe(false);

      rules.updateRules({ maxPerTransaction: 300n });
      expect(rules.validate('did:claw:r', 200n).allowed).toBe(true);
    });

    it('should update dailyLimit', () => {
      let now = 1000000;
      const rules = new SpendingRules(
        { dailyLimit: 100n },
        () => now
      );

      rules.recordTransaction(80n);
      now += 1000;
      expect(rules.validate('did:claw:r', 50n).allowed).toBe(false);

      rules.updateRules({ dailyLimit: 200n });
      expect(rules.validate('did:claw:r', 50n).allowed).toBe(true);
    });

    it('should update allowedRecipients', () => {
      const rules = new SpendingRules({
        allowedRecipients: ['did:claw:alice'],
      });
      expect(rules.validate('did:claw:bob', 100n).allowed).toBe(false);

      rules.updateRules({ allowedRecipients: ['did:claw:alice', 'did:claw:bob'] });
      expect(rules.validate('did:claw:bob', 100n).allowed).toBe(true);
    });

    it('should not change rules when passing empty config', () => {
      const rules = new SpendingRules({
        maxPerTransaction: 100n,
        dailyLimit: 500n,
        allowedRecipients: ['did:claw:alice'],
        minTransactionIntervalSec: 10,
      });

      // Empty update should change nothing
      rules.updateRules({});
      expect(rules.validate('did:claw:bob', 100n).allowed).toBe(false);
      expect(rules.validate('did:claw:alice', 200n).allowed).toBe(false);
      expect(rules.getDailyRemaining()).toBe(500n);
    });

    it('should update minTransactionIntervalSec', () => {
      let now = 1000000;
      const rules = new SpendingRules(
        { minTransactionIntervalSec: 60 },
        () => now
      );

      rules.recordTransaction(100n);
      now += 5000;
      expect(rules.validate('did:claw:r', 100n).allowed).toBe(false);

      rules.updateRules({ minTransactionIntervalSec: 3 });
      expect(rules.validate('did:claw:r', 100n).allowed).toBe(true);
    });
  });

  describe('updateRules edge cases', () => {
    it('should clear maxPerTransaction when explicitly set to null', () => {
      const rules = new SpendingRules({ maxPerTransaction: 100n });
      expect(rules.validate('did:claw:r', 200n).allowed).toBe(false);

      // Pass null explicitly — enters the !== undefined branch, then ?? null fires
      rules.updateRules({ maxPerTransaction: null as unknown as bigint });
      expect(rules.validate('did:claw:r', 200n).allowed).toBe(true);
    });

    it('should clear dailyLimit when explicitly set to null', () => {
      const rules = new SpendingRules({ dailyLimit: 100n });
      expect(rules.getDailyRemaining()).toBe(100n);

      rules.updateRules({ dailyLimit: null as unknown as bigint });
      expect(rules.getDailyRemaining()).toBeNull();
    });

    it('should clear allowedRecipients when explicitly set to null', () => {
      const rules = new SpendingRules({
        allowedRecipients: ['did:claw:alice'],
      });
      expect(rules.validate('did:claw:bob', 100n).allowed).toBe(false);

      rules.updateRules({ allowedRecipients: null as unknown as string[] });
      expect(rules.validate('did:claw:bob', 100n).allowed).toBe(true);
    });

    it('should clear allowedRecipients when set to empty array', () => {
      const rules = new SpendingRules({
        allowedRecipients: ['did:claw:alice'],
      });
      // Empty array is truthy, should create an empty set
      rules.updateRules({ allowedRecipients: [] });
      // No one is allowed with an empty allowlist
      expect(rules.validate('did:claw:alice', 100n).allowed).toBe(false);
    });

    it('should clear minTransactionIntervalSec when explicitly set to null', () => {
      let now = 1000000;
      const rules = new SpendingRules(
        { minTransactionIntervalSec: 60 },
        () => now
      );
      rules.recordTransaction(100n);
      now += 5000;
      expect(rules.validate('did:claw:r', 100n).allowed).toBe(false);

      rules.updateRules({ minTransactionIntervalSec: null as unknown as number });
      expect(rules.validate('did:claw:r', 100n).allowed).toBe(true);
    });
  });

  describe('reset', () => {
    it('should clear all history and rate limit state', () => {
      let now = 1000000;
      const rules = new SpendingRules(
        {
          dailyLimit: 100n,
          minTransactionIntervalSec: 60,
        },
        () => now
      );

      rules.recordTransaction(80n);
      now += 1000;
      expect(rules.getDailySpent()).toBe(80n);
      expect(rules.validate('did:claw:r', 50n).allowed).toBe(false); // rate limited

      rules.reset();
      expect(rules.getDailySpent()).toBe(0n);
      expect(rules.validate('did:claw:r', 50n).allowed).toBe(true);
    });
  });

  describe('combined rules', () => {
    it('should enforce all rules together', () => {
      let now = 1000000;
      const rules = new SpendingRules(
        {
          maxPerTransaction: 500n,
          dailyLimit: 1000n,
          allowedRecipients: ['did:claw:alice', 'did:claw:bob'],
          minTransactionIntervalSec: 5,
        },
        () => now
      );

      // Valid: allowed recipient, under max, under daily, no rate limit
      expect(rules.validate('did:claw:alice', 300n).allowed).toBe(true);
      rules.recordTransaction(300n);

      // Fail: rate limited
      now += 2000;
      expect(rules.validate('did:claw:alice', 100n).allowed).toBe(false);

      // Pass rate limit
      now += 5000;

      // Fail: not in allowlist
      expect(rules.validate('did:claw:eve', 100n).allowed).toBe(false);

      // Fail: over per-tx limit
      expect(rules.validate('did:claw:alice', 600n).allowed).toBe(false);

      // Pass: valid transaction
      expect(rules.validate('did:claw:bob', 400n).allowed).toBe(true);
      rules.recordTransaction(400n);

      // Fail: daily limit (300 + 400 + 400 > 1000)
      now += 6000;
      expect(rules.validate('did:claw:alice', 400n).allowed).toBe(false);
    });
  });
});
