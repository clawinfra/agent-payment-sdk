/**
 * AgentWallet — deterministic wallet derivation from Agent DIDs.
 *
 * Derives an Ed25519 keypair from an agent's DID using SHA-512 hashing.
 * The same DID always produces the same keypair, enabling stateless
 * wallet recovery.
 */

import { sha512 } from '@noble/hashes/sha2';
import * as ed from '@noble/ed25519';
import type { AgentDID, AgentKeypair, ChainConfig, IChainClient } from './types';

// Configure ed25519 to use sha512
ed.etc.sha512Sync = (...msgs: Uint8Array[]): Uint8Array => {
  const merged = new Uint8Array(msgs.reduce((sum, m) => sum + m.length, 0));
  let offset = 0;
  for (const m of msgs) {
    merged.set(m, offset);
    offset += m.length;
  }
  return sha512(merged);
};

/** Minimum DID length to be considered valid */
const MIN_DID_LENGTH = 8;

/** DID prefix pattern */
const DID_PREFIX = 'did:claw:';

/**
 * Convert a Uint8Array to a hex string.
 */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derive a deterministic Ed25519 keypair from an Agent DID.
 *
 * Uses SHA-512 of the DID string to produce a 32-byte seed,
 * which is then used to generate the Ed25519 keypair.
 *
 * @param did - Agent DID (e.g. "did:claw:agent-abc-123")
 * @returns Ed25519 keypair with hex-encoded keys and derived address
 * @throws Error if DID is invalid
 */
export function deriveKeypair(did: AgentDID): AgentKeypair {
  if (!did || typeof did !== 'string') {
    throw new Error('Invalid DID: must be a non-empty string');
  }

  if (did.length < MIN_DID_LENGTH) {
    throw new Error(`Invalid DID: must be at least ${MIN_DID_LENGTH} characters`);
  }

  // Hash the DID to get a deterministic 64-byte digest
  const encoder = new TextEncoder();
  const didBytes = encoder.encode(did);
  const hash = sha512(didBytes);

  // Use first 32 bytes as the private key seed
  const privateKey = hash.slice(0, 32);
  const publicKey = ed.getPublicKey(privateKey);

  const publicKeyHex = toHex(publicKey);
  // Address is the first 20 bytes of sha512(publicKey), hex-encoded
  const addressHash = sha512(publicKey);
  const address = '0x' + toHex(addressHash.slice(0, 20));

  return {
    publicKey,
    privateKey,
    publicKeyHex,
    address,
  };
}

/**
 * AgentWallet — manages an agent's on-chain identity and signing.
 */
export class AgentWallet {
  public readonly did: AgentDID;
  public readonly keypair: AgentKeypair;
  private chainClient: IChainClient | null = null;

  /**
   * Create a new AgentWallet from a DID.
   *
   * @param did - Agent DID
   */
  constructor(did: AgentDID) {
    this.did = did;
    this.keypair = deriveKeypair(did);
  }

  /**
   * Get the wallet's on-chain address.
   */
  get address(): string {
    return this.keypair.address;
  }

  /**
   * Get the wallet's public key in hex format.
   */
  get publicKeyHex(): string {
    return this.keypair.publicKeyHex;
  }

  /**
   * Connect to a ChainClient for on-chain operations.
   */
  connectClient(client: IChainClient): void {
    this.chainClient = client;
  }

  /**
   * Get the connected chain client.
   * @throws Error if no client is connected
   */
  getClient(): IChainClient {
    if (!this.chainClient) {
      throw new Error('No chain client connected. Call connectClient() first.');
    }
    return this.chainClient;
  }

  /**
   * Sign arbitrary data with the agent's private key.
   *
   * @param data - Data to sign
   * @returns Ed25519 signature
   */
  sign(data: Uint8Array): Uint8Array {
    return ed.sign(data, this.keypair.privateKey);
  }

  /**
   * Verify a signature against data and this wallet's public key.
   *
   * @param signature - Signature to verify
   * @param data - Original data
   * @returns true if signature is valid
   */
  verify(signature: Uint8Array, data: Uint8Array): boolean {
    return ed.verify(signature, data, this.keypair.publicKey);
  }
}
