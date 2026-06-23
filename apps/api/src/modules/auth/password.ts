import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const VERSION = "v=1";
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await derive(password, salt);
  return [
    "scrypt",
    VERSION,
    `N=${COST}`,
    `r=${BLOCK_SIZE}`,
    `p=${PARALLELIZATION}`,
    salt.toString("base64url"),
    derived.toString("base64url")
  ].join("$");
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const parsed = parseEncodedHash(encodedHash);
  if (parsed === null) {
    return false;
  }

  const derived = await derive(password, parsed.salt);
  return derived.byteLength === parsed.hash.byteLength && timingSafeEqual(derived, parsed.hash);
}

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, {
      cost: COST,
      blockSize: BLOCK_SIZE,
      parallelization: PARALLELIZATION
    }, (error, derivedKey) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

interface ParsedHash {
  salt: Buffer;
  hash: Buffer;
}

function parseEncodedHash(encodedHash: string): ParsedHash | null {
  const [algorithm, version, cost, blockSize, parallelization, salt, hash] = encodedHash.split("$");
  if (
    algorithm !== "scrypt"
    || version !== VERSION
    || cost !== `N=${COST}`
    || blockSize !== `r=${BLOCK_SIZE}`
    || parallelization !== `p=${PARALLELIZATION}`
    || salt === undefined
    || hash === undefined
  ) {
    return null;
  }

  const saltBuffer = Buffer.from(salt, "base64url");
  const hashBuffer = Buffer.from(hash, "base64url");
  if (saltBuffer.byteLength !== SALT_LENGTH || hashBuffer.byteLength !== KEY_LENGTH) {
    return null;
  }

  return { salt: saltBuffer, hash: hashBuffer };
}
