import { AgentWallet, deriveKeypair } from '../src/wallet';
import type { IChainClient } from '../src/types';

describe('deriveKeypair', () => {
  it('should derive a deterministic keypair from a DID', () => {
    const did = 'did:claw:agent-test-001';
    const kp1 = deriveKeypair(did);
    const kp2 = deriveKeypair(did);

    // Same DID → same keys
    expect(kp1.publicKeyHex).toBe(kp2.publicKeyHex);
    expect(kp1.address).toBe(kp2.address);
    expect(Buffer.from(kp1.privateKey).toString('hex')).toBe(
      Buffer.from(kp2.privateKey).toString('hex')
    );
  });

  it('should produce different keypairs for different DIDs', () => {
    const kp1 = deriveKeypair('did:claw:agent-alpha');
    const kp2 = deriveKeypair('did:claw:agent-beta');

    expect(kp1.publicKeyHex).not.toBe(kp2.publicKeyHex);
    expect(kp1.address).not.toBe(kp2.address);
  });

  it('should produce a 32-byte public key', () => {
    const kp = deriveKeypair('did:claw:agent-test-pubkey');
    expect(kp.publicKey.length).toBe(32);
    expect(kp.publicKeyHex.length).toBe(64);
  });

  it('should produce a 32-byte private key', () => {
    const kp = deriveKeypair('did:claw:agent-test-privkey');
    expect(kp.privateKey.length).toBe(32);
  });

  it('should produce an address starting with 0x', () => {
    const kp = deriveKeypair('did:claw:agent-test-address');
    expect(kp.address).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it('should throw on empty DID', () => {
    expect(() => deriveKeypair('')).toThrow('Invalid DID');
  });

  it('should throw on null/undefined DID', () => {
    expect(() => deriveKeypair(null as unknown as string)).toThrow('Invalid DID');
    expect(() => deriveKeypair(undefined as unknown as string)).toThrow('Invalid DID');
  });

  it('should throw on too-short DID', () => {
    expect(() => deriveKeypair('short')).toThrow('at least 8 characters');
  });

  it('should throw on non-string DID', () => {
    expect(() => deriveKeypair(123 as unknown as string)).toThrow('Invalid DID');
  });
});

describe('AgentWallet', () => {
  const testDid = 'did:claw:agent-wallet-test';

  it('should create a wallet from a DID', () => {
    const wallet = new AgentWallet(testDid);
    expect(wallet.did).toBe(testDid);
    expect(wallet.address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(wallet.publicKeyHex).toHaveLength(64);
  });

  it('should produce the same wallet for the same DID', () => {
    const w1 = new AgentWallet(testDid);
    const w2 = new AgentWallet(testDid);
    expect(w1.address).toBe(w2.address);
    expect(w1.publicKeyHex).toBe(w2.publicKeyHex);
  });

  it('should sign and verify data', () => {
    const wallet = new AgentWallet(testDid);
    const data = new TextEncoder().encode('hello clawchain');
    const signature = wallet.sign(data);

    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature.length).toBe(64);
    expect(wallet.verify(signature, data)).toBe(true);
  });

  it('should fail verification with wrong data', () => {
    const wallet = new AgentWallet(testDid);
    const data = new TextEncoder().encode('hello');
    const wrongData = new TextEncoder().encode('goodbye');
    const signature = wallet.sign(data);

    expect(wallet.verify(signature, wrongData)).toBe(false);
  });

  it('should fail verification with wrong key', () => {
    const wallet1 = new AgentWallet('did:claw:agent-signer-001');
    const wallet2 = new AgentWallet('did:claw:agent-signer-002');
    const data = new TextEncoder().encode('test data');
    const signature = wallet1.sign(data);

    // Verifying with wallet2's key should fail
    expect(wallet2.verify(signature, data)).toBe(false);
  });

  it('should throw when getClient called without connection', () => {
    const wallet = new AgentWallet(testDid);
    expect(() => wallet.getClient()).toThrow('No chain client connected');
  });

  it('should connect and return a chain client', () => {
    const wallet = new AgentWallet(testDid);
    const mockClient: IChainClient = {
      submitTransfer: jest.fn(),
      queryBalance: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    };

    wallet.connectClient(mockClient);
    expect(wallet.getClient()).toBe(mockClient);
  });
});
