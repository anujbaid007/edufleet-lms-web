# Offline APK Sub-project #1 — Pendrive Format & Packaging CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two local Node CLIs (`pendrive:prepare-content` and `pendrive:stamp`) that produce EduFleet's encrypted USB pendrives, plus the cryptographic primitives and binary codec library they consume.

**Architecture:** Bottom-up TDD. First: crypto primitives (HKDF, Ed25519, AES-GCM, chunked CTR+HMAC). Then: file-format codecs (`.edfv`, `.edfq`, `.edft`, `manifest.json.sig`, `credentials.edfc`) that compose the primitives. Then: shared CLI utilities (env, args, Supabase, S3, USB, progress). Finally: the two CLI entry points that wire it all together.

**Tech Stack:** Node 20+, TypeScript, `tsx`, `@supabase/supabase-js`, `@aws-sdk/client-s3`, Node's built-in `crypto` (HKDF, Ed25519, AES-GCM, AES-CTR, HMAC), `argon2` (npm), `cli-progress` (npm), `vitest` (new — for tests).

**Spec:** [docs/superpowers/specs/2026-04-17-offline-apk-01-pendrive-format-and-packaging.md](../specs/2026-04-17-offline-apk-01-pendrive-format-and-packaging.md)

---

## File structure

```
scripts/
├── pendrive-prepare-content.ts             # Stage 1 CLI entry
├── pendrive-stamp.ts                       # Stage 2 CLI entry
└── pendrive/
    ├── cli-args.ts                         # Arg parsers (shared)
    ├── env.ts                              # Load .env.provisioning
    ├── supabase-source.ts                  # Catalogue queries
    ├── s3-source.ts                        # Streaming S3 downloads w/ retry
    ├── usb.ts                              # Mount detect, exFAT check, free space
    ├── progress.ts                         # Progress bars + JSON logs
    ├── crypto/
    │   ├── constants.ts                    # Magic bytes, chunk size, HKDF info labels
    │   ├── keys.ts                         # HKDF chain
    │   ├── sign.ts                         # Ed25519 sign/verify
    │   ├── aead.ts                         # AES-256-GCM wrap/unwrap
    │   └── ctr-hmac.ts                     # Chunked AES-256-CTR + HMAC
    └── format/
        ├── edfv.ts                         # Video file encode+decode
        ├── edfq.ts                         # Quiz file encode+decode
        ├── edft.ts                         # Thumbnail file encode+decode
        ├── manifest.ts                     # manifest.json.sig encode+decode
        └── credentials.ts                  # credentials.edfc encode+decode

tests/pendrive/
├── crypto/*.test.ts
└── format/*.test.ts

vitest.config.ts
tsconfig.tests.json
```

---

## Phase 0 — Test infrastructure

### Task 0.1: Install dev dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
npm install --save-dev vitest @vitest/coverage-v8
npm install argon2 cli-progress
npm install --save-dev @types/cli-progress
```

- [ ] **Step 2: Verify package.json has new deps**

Run: `cat package.json | grep -E "vitest|argon2|cli-progress"`
Expected: 4 matching lines.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vitest, argon2, cli-progress for pendrive CLI"
```

---

### Task 0.2: Create vitest config + npm script

**Files:**
- Create: `vitest.config.ts`
- Create: `tsconfig.tests.json`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@scripts": resolve(__dirname, "./scripts"),
    },
  },
});
```

- [ ] **Step 2: Create `tsconfig.tests.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["tests/**/*.ts", "scripts/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Add test script to package.json**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts tsconfig.tests.json package.json
git commit -m "chore: configure vitest for scripts tests"
```

---

### Task 0.3: Smoke test

**Files:**
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, expect, it } from "vitest";

describe("smoke", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: `1 passed`

- [ ] **Step 3: Commit**

```bash
git add tests/smoke.test.ts
git commit -m "test: add smoke test to confirm vitest runs"
```

---

## Phase 1 — Crypto primitives

### Task 1.1: Constants module

**Files:**
- Create: `scripts/pendrive/crypto/constants.ts`

- [ ] **Step 1: Write constants**

```typescript
export const MAGIC = {
  EDFV: Buffer.from("EDFV", "ascii"),
  EDFQ: Buffer.from("EDFQ", "ascii"),
  EDFT: Buffer.from("EDFT", "ascii"),
  EDFM: Buffer.from("EDFM", "ascii"),
  EDFC: Buffer.from("EDFC", "ascii"),
} as const;

export const FORMAT_VERSION = 1;
export const EDFV_HEADER_SIZE = 128;
export const EDFV_CHUNK_SIZE = 256 * 1024; // 256 KiB plaintext per chunk
export const HMAC_TAG_SIZE = 32;
export const GCM_IV_SIZE = 12;
export const GCM_TAG_SIZE = 16;
export const ED25519_SIG_SIZE = 64;
export const ARGON2_SALT_SIZE = 16;

export const HKDF_INFO = {
  CONTENT: "edufleet/content/v1",
  VIDEO_ENC: "edufleet/video/enc/v1",
  VIDEO_MAC: "edufleet/video/mac/v1",
  QUIZ: "edufleet/quiz/v1",
  THUMB: "edufleet/thumb/v1",
} as const;

export const ARGON2_PARAMS = {
  m_cost_kib: 65536,
  t_cost: 3,
  p_cost: 1,
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add scripts/pendrive/crypto/constants.ts
git commit -m "feat(pendrive): crypto constants"
```

---

### Task 1.2: HKDF key derivation

**Files:**
- Create: `scripts/pendrive/crypto/keys.ts`
- Create: `tests/pendrive/crypto/keys.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from "vitest";
import {
  deriveContentKey,
  deriveVideoEncKey,
  deriveVideoMacKey,
  deriveQuizKey,
  deriveThumbKey,
} from "@scripts/pendrive/crypto/keys";

const M = Buffer.alloc(32, 0xaa);
const CB = Buffer.alloc(16, 0x01);
const V = Buffer.alloc(16, 0x02);

describe("keys", () => {
  it("deriveContentKey is 32 bytes and deterministic", () => {
    const a = deriveContentKey(M, CB);
    const b = deriveContentKey(M, CB);
    expect(a).toHaveLength(32);
    expect(a.equals(b)).toBe(true);
  });

  it("different content_bundle_id yields different content_key", () => {
    const a = deriveContentKey(M, CB);
    const b = deriveContentKey(M, Buffer.alloc(16, 0x99));
    expect(a.equals(b)).toBe(false);
  });

  it("video enc and mac keys differ for same video", () => {
    const ck = deriveContentKey(M, CB);
    expect(deriveVideoEncKey(ck, V).equals(deriveVideoMacKey(ck, V))).toBe(false);
  });

  it("quiz and thumb keys differ", () => {
    const ck = deriveContentKey(M, CB);
    const id = Buffer.alloc(16, 0x03);
    expect(deriveQuizKey(ck, id).equals(deriveThumbKey(ck, id))).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- tests/pendrive/crypto/keys.test.ts`
Expected: module-not-found error.

- [ ] **Step 3: Implement**

```typescript
// scripts/pendrive/crypto/keys.ts
import { hkdfSync } from "node:crypto";
import { HKDF_INFO } from "./constants";

function hkdf(ikm: Buffer, salt: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from(info, "utf8"), 32));
}

export function deriveContentKey(master: Buffer, contentBundleId: Buffer): Buffer {
  return hkdf(master, contentBundleId, HKDF_INFO.CONTENT);
}

export function deriveVideoEncKey(contentKey: Buffer, videoId: Buffer): Buffer {
  return hkdf(contentKey, videoId, HKDF_INFO.VIDEO_ENC);
}

export function deriveVideoMacKey(contentKey: Buffer, videoId: Buffer): Buffer {
  return hkdf(contentKey, videoId, HKDF_INFO.VIDEO_MAC);
}

export function deriveQuizKey(contentKey: Buffer, chapterId: Buffer): Buffer {
  return hkdf(contentKey, chapterId, HKDF_INFO.QUIZ);
}

export function deriveThumbKey(contentKey: Buffer, videoId: Buffer): Buffer {
  return hkdf(contentKey, videoId, HKDF_INFO.THUMB);
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- tests/pendrive/crypto/keys.test.ts`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/pendrive/crypto/keys.ts tests/pendrive/crypto/keys.test.ts
git commit -m "feat(pendrive): HKDF key derivation chain"
```

---

### Task 1.3: Ed25519 sign/verify

**Files:**
- Create: `scripts/pendrive/crypto/sign.ts`
- Create: `tests/pendrive/crypto/sign.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { sign, verify, loadPrivateKey, loadPublicKey } from "@scripts/pendrive/crypto/sign";

describe("sign", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const pubPem = publicKey.export({ format: "pem", type: "spki" }).toString();

  it("signs and verifies a payload", () => {
    const priv = loadPrivateKey(privPem);
    const pub = loadPublicKey(pubPem);
    const msg = Buffer.from("hello");
    const sig = sign(priv, msg);
    expect(sig).toHaveLength(64);
    expect(verify(pub, msg, sig)).toBe(true);
  });

  it("rejects tampered payload", () => {
    const priv = loadPrivateKey(privPem);
    const pub = loadPublicKey(pubPem);
    const sig = sign(priv, Buffer.from("hello"));
    expect(verify(pub, Buffer.from("h3llo"), sig)).toBe(false);
  });

  it("rejects wrong signature", () => {
    const priv = loadPrivateKey(privPem);
    const pub = loadPublicKey(pubPem);
    const sig = sign(priv, Buffer.from("hello"));
    sig[0] ^= 0xff;
    expect(verify(pub, Buffer.from("hello"), sig)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- tests/pendrive/crypto/sign.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement**

```typescript
// scripts/pendrive/crypto/sign.ts
import { createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify, type KeyObject } from "node:crypto";

export function loadPrivateKey(pem: string): KeyObject {
  return createPrivateKey({ key: pem, format: "pem" });
}

export function loadPublicKey(pem: string): KeyObject {
  return createPublicKey({ key: pem, format: "pem" });
}

export function sign(privateKey: KeyObject, payload: Buffer): Buffer {
  return nodeSign(null, payload, privateKey);
}

export function verify(publicKey: KeyObject, payload: Buffer, signature: Buffer): boolean {
  return nodeVerify(null, payload, publicKey, signature);
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- tests/pendrive/crypto/sign.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/pendrive/crypto/sign.ts tests/pendrive/crypto/sign.test.ts
git commit -m "feat(pendrive): Ed25519 sign/verify helpers"
```

---

### Task 1.4: AES-256-GCM wrap/unwrap

**Files:**
- Create: `scripts/pendrive/crypto/aead.ts`
- Create: `tests/pendrive/crypto/aead.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, expect, it } from "vitest";
import { gcmSeal, gcmOpen } from "@scripts/pendrive/crypto/aead";

const key = Buffer.alloc(32, 0xab);

describe("aead", () => {
  it("round-trips plaintext", () => {
    const pt = Buffer.from("the quick brown fox");
    const sealed = gcmSeal(key, pt);
    const opened = gcmOpen(key, sealed.iv, sealed.ciphertext, sealed.tag);
    expect(opened.equals(pt)).toBe(true);
  });

  it("rejects tampered ciphertext", () => {
    const sealed = gcmSeal(key, Buffer.from("secret"));
    sealed.ciphertext[0] ^= 0xff;
    expect(() => gcmOpen(key, sealed.iv, sealed.ciphertext, sealed.tag)).toThrow();
  });

  it("rejects wrong key", () => {
    const sealed = gcmSeal(key, Buffer.from("secret"));
    const wrong = Buffer.alloc(32, 0xcc);
    expect(() => gcmOpen(wrong, sealed.iv, sealed.ciphertext, sealed.tag)).toThrow();
  });

  it("uses a fresh 12-byte IV per seal", () => {
    const a = gcmSeal(key, Buffer.from("x"));
    const b = gcmSeal(key, Buffer.from("x"));
    expect(a.iv).toHaveLength(12);
    expect(a.iv.equals(b.iv)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```typescript
// scripts/pendrive/crypto/aead.ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { GCM_IV_SIZE, GCM_TAG_SIZE } from "./constants";

export type Sealed = { iv: Buffer; ciphertext: Buffer; tag: Buffer };

export function gcmSeal(key: Buffer, plaintext: Buffer): Sealed {
  const iv = randomBytes(GCM_IV_SIZE);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  if (tag.length !== GCM_TAG_SIZE) throw new Error("unexpected GCM tag size");
  return { iv, ciphertext, tag };
}

export function gcmOpen(key: Buffer, iv: Buffer, ciphertext: Buffer, tag: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
```

- [ ] **Step 4: Run — expect pass**

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/pendrive/crypto/aead.ts tests/pendrive/crypto/aead.test.ts
git commit -m "feat(pendrive): AES-256-GCM seal/open"
```

---

### Task 1.5: Chunked CTR+HMAC streaming codec

**Files:**
- Create: `scripts/pendrive/crypto/ctr-hmac.ts`
- Create: `tests/pendrive/crypto/ctr-hmac.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { randomBytes } from "node:crypto";
import { deriveIv, encryptChunk, decryptChunk, verifyChunk } from "@scripts/pendrive/crypto/ctr-hmac";
import { EDFV_CHUNK_SIZE } from "@scripts/pendrive/crypto/constants";

const encKey = Buffer.alloc(32, 0x11);
const macKey = Buffer.alloc(32, 0x22);

describe("ctr-hmac", () => {
  it("deriveIv is deterministic and 16 bytes", () => {
    const a = deriveIv(encKey, 0);
    const b = deriveIv(encKey, 0);
    expect(a).toHaveLength(16);
    expect(a.equals(b)).toBe(true);
  });

  it("different chunk index -> different IV", () => {
    expect(deriveIv(encKey, 0).equals(deriveIv(encKey, 1))).toBe(false);
  });

  it("round-trips a chunk with correct tag", () => {
    const pt = randomBytes(1024);
    const { ciphertext, tag } = encryptChunk(encKey, macKey, 7, pt);
    expect(verifyChunk(macKey, 7, ciphertext, tag)).toBe(true);
    const recovered = decryptChunk(encKey, 7, ciphertext);
    expect(recovered.equals(pt)).toBe(true);
  });

  it("verifyChunk rejects tampered ciphertext", () => {
    const pt = randomBytes(128);
    const { ciphertext, tag } = encryptChunk(encKey, macKey, 0, pt);
    ciphertext[0] ^= 0xff;
    expect(verifyChunk(macKey, 0, ciphertext, tag)).toBe(false);
  });

  it("verifyChunk rejects wrong chunk index", () => {
    const pt = randomBytes(128);
    const { ciphertext, tag } = encryptChunk(encKey, macKey, 0, pt);
    expect(verifyChunk(macKey, 1, ciphertext, tag)).toBe(false);
  });

  it("last chunk can be shorter than EDFV_CHUNK_SIZE", () => {
    const pt = randomBytes(Math.floor(EDFV_CHUNK_SIZE / 3));
    const { ciphertext } = encryptChunk(encKey, macKey, 42, pt);
    expect(ciphertext.length).toBe(pt.length);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```typescript
// scripts/pendrive/crypto/ctr-hmac.ts
import { createCipheriv, createDecipheriv, createHash, createHmac } from "node:crypto";
import { HMAC_TAG_SIZE } from "./constants";

function u32be(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

export function deriveIv(encKey: Buffer, chunkIndex: number): Buffer {
  return createHash("sha256")
    .update(encKey)
    .update(Buffer.from("iv", "utf8"))
    .update(u32be(chunkIndex))
    .digest()
    .subarray(0, 16);
}

export function encryptChunk(
  encKey: Buffer,
  macKey: Buffer,
  chunkIndex: number,
  plaintext: Buffer
): { ciphertext: Buffer; tag: Buffer } {
  const iv = deriveIv(encKey, chunkIndex);
  const cipher = createCipheriv("aes-256-ctr", encKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = createHmac("sha256", macKey).update(u32be(chunkIndex)).update(ciphertext).digest();
  if (tag.length !== HMAC_TAG_SIZE) throw new Error("unexpected HMAC size");
  return { ciphertext, tag };
}

export function verifyChunk(macKey: Buffer, chunkIndex: number, ciphertext: Buffer, tag: Buffer): boolean {
  const expected = createHmac("sha256", macKey).update(u32be(chunkIndex)).update(ciphertext).digest();
  if (expected.length !== tag.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ tag[i];
  return diff === 0;
}

export function decryptChunk(encKey: Buffer, chunkIndex: number, ciphertext: Buffer): Buffer {
  const iv = deriveIv(encKey, chunkIndex);
  const decipher = createDecipheriv("aes-256-ctr", encKey, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
```

- [ ] **Step 4: Run — expect pass**

Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/pendrive/crypto/ctr-hmac.ts tests/pendrive/crypto/ctr-hmac.test.ts
git commit -m "feat(pendrive): chunked CTR+HMAC streaming codec"
```

---

## Phase 2 — File format codecs

### Task 2.1: `.edfv` encode/decode

**Files:**
- Create: `scripts/pendrive/format/edfv.ts`
- Create: `tests/pendrive/format/edfv.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeEdfv, readEdfvHeader, readEdfvChunk } from "@scripts/pendrive/format/edfv";
import { deriveContentKey, deriveVideoEncKey, deriveVideoMacKey } from "@scripts/pendrive/crypto/keys";

describe("edfv", () => {
  const M = Buffer.alloc(32, 0x33);
  const CB = Buffer.alloc(16, 0x01);
  const V = Buffer.alloc(16, 0x02);
  const ck = deriveContentKey(M, CB);
  const enc = deriveVideoEncKey(ck, V);
  const mac = deriveVideoMacKey(ck, V);

  it("round-trips a multi-chunk payload", async () => {
    const dir = mkdtempSync(join(tmpdir(), "edfv-"));
    const srcPath = join(dir, "src.bin");
    const dstPath = join(dir, "out.edfv");
    const plaintext = randomBytes(256 * 1024 * 2 + 1234); // 2+ chunks
    writeFileSync(srcPath, plaintext);

    await encodeEdfv({
      sourcePath: srcPath,
      destPath: dstPath,
      contentBundleId: CB,
      videoId: V,
      encKey: enc,
      macKey: mac,
    });

    const fd = readFileSync(dstPath);
    const header = readEdfvHeader(fd, mac);
    expect(header.chunkCount).toBe(Math.ceil(plaintext.length / header.chunkSize));
    expect(header.plaintextSize).toBe(BigInt(plaintext.length));

    const reassembled: Buffer[] = [];
    for (let i = 0; i < header.chunkCount; i++) {
      reassembled.push(readEdfvChunk(fd, header, i, enc, mac));
    }
    expect(Buffer.concat(reassembled).equals(plaintext)).toBe(true);
  });

  it("rejects header tampering via header_hmac", () => {
    const dir = mkdtempSync(join(tmpdir(), "edfv-"));
    const srcPath = join(dir, "src.bin");
    const dstPath = join(dir, "out.edfv");
    writeFileSync(srcPath, randomBytes(1024));
    encodeEdfv({ sourcePath: srcPath, destPath: dstPath, contentBundleId: CB, videoId: V, encKey: enc, macKey: mac });
    const bytes = readFileSync(dstPath);
    bytes[8] ^= 0xff; // flip a header byte
    expect(() => readEdfvHeader(bytes, mac)).toThrow(/header hmac/i);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```typescript
// scripts/pendrive/format/edfv.ts
import { createReadStream, createWriteStream, promises as fsp, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import {
  EDFV_CHUNK_SIZE,
  EDFV_HEADER_SIZE,
  FORMAT_VERSION,
  HMAC_TAG_SIZE,
  MAGIC,
} from "../crypto/constants";
import { encryptChunk, verifyChunk, decryptChunk } from "../crypto/ctr-hmac";

export type EdfvHeader = {
  formatVersion: number;
  contentBundleId: Buffer;
  videoId: Buffer;
  chunkSize: number;
  plaintextSize: bigint;
  chunkCount: number;
};

function buildHeader(
  contentBundleId: Buffer,
  videoId: Buffer,
  plaintextSize: bigint,
  chunkCount: number
): Buffer {
  const h = Buffer.alloc(EDFV_HEADER_SIZE);
  MAGIC.EDFV.copy(h, 0);
  h.writeUInt16BE(FORMAT_VERSION, 4);
  h.writeUInt16BE(0, 6);
  contentBundleId.copy(h, 8);
  videoId.copy(h, 24);
  h.writeUInt32BE(EDFV_CHUNK_SIZE, 40);
  h.writeBigUInt64BE(plaintextSize, 44);
  h.writeUInt32BE(chunkCount, 52);
  // bytes 56..96 are reserved (zeros)
  // bytes 96..128 will hold header_hmac
  return h;
}

export async function encodeEdfv(opts: {
  sourcePath: string;
  destPath: string;
  contentBundleId: Buffer;
  videoId: Buffer;
  encKey: Buffer;
  macKey: Buffer;
}): Promise<void> {
  const srcStat = await fsp.stat(opts.sourcePath);
  const plaintextSize = BigInt(srcStat.size);
  const chunkCount = Math.ceil(srcStat.size / EDFV_CHUNK_SIZE);
  const header = buildHeader(opts.contentBundleId, opts.videoId, plaintextSize, chunkCount);

  const headerHmac = createHmac("sha256", opts.macKey).update(header.subarray(0, 96)).digest();
  headerHmac.copy(header, 96);
  if (header.length !== EDFV_HEADER_SIZE) throw new Error("header size mismatch");

  const dst = createWriteStream(opts.destPath);
  dst.write(header);

  const src = createReadStream(opts.sourcePath, { highWaterMark: EDFV_CHUNK_SIZE });
  let buf = Buffer.alloc(0);
  let index = 0;

  for await (const piece of src as AsyncIterable<Buffer>) {
    buf = buf.length === 0 ? piece : Buffer.concat([buf, piece]);
    while (buf.length >= EDFV_CHUNK_SIZE) {
      const chunk = buf.subarray(0, EDFV_CHUNK_SIZE);
      buf = buf.subarray(EDFV_CHUNK_SIZE);
      const { ciphertext, tag } = encryptChunk(opts.encKey, opts.macKey, index++, chunk);
      dst.write(ciphertext);
      dst.write(tag);
    }
  }
  if (buf.length > 0) {
    const { ciphertext, tag } = encryptChunk(opts.encKey, opts.macKey, index++, buf);
    dst.write(ciphertext);
    dst.write(tag);
  }
  await new Promise<void>((resolve, reject) => dst.end((err?: Error) => (err ? reject(err) : resolve())));
}

export function readEdfvHeader(file: Buffer, macKey: Buffer): EdfvHeader {
  if (file.length < EDFV_HEADER_SIZE) throw new Error("file too small for edfv header");
  if (!file.subarray(0, 4).equals(MAGIC.EDFV)) throw new Error("bad edfv magic");
  const expected = createHmac("sha256", macKey).update(file.subarray(0, 96)).digest();
  const actual = file.subarray(96, 128);
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= expected[i] ^ actual[i];
  if (diff !== 0) throw new Error("edfv header hmac mismatch");
  return {
    formatVersion: file.readUInt16BE(4),
    contentBundleId: Buffer.from(file.subarray(8, 24)),
    videoId: Buffer.from(file.subarray(24, 40)),
    chunkSize: file.readUInt32BE(40),
    plaintextSize: file.readBigUInt64BE(44),
    chunkCount: file.readUInt32BE(52),
  };
}

export function chunkOffset(header: EdfvHeader, index: number): number {
  return EDFV_HEADER_SIZE + index * (header.chunkSize + HMAC_TAG_SIZE);
}

export function readEdfvChunk(
  file: Buffer,
  header: EdfvHeader,
  index: number,
  encKey: Buffer,
  macKey: Buffer
): Buffer {
  if (index < 0 || index >= header.chunkCount) throw new Error("chunk index out of range");
  const start = chunkOffset(header, index);
  const isLast = index === header.chunkCount - 1;
  const fullChunkBytes = header.chunkSize;
  const lastChunkPlaintext =
    Number(header.plaintextSize) - (header.chunkCount - 1) * header.chunkSize;
  const ctSize = isLast ? lastChunkPlaintext : fullChunkBytes;
  const ciphertext = file.subarray(start, start + ctSize);
  const tag = file.subarray(start + ctSize, start + ctSize + HMAC_TAG_SIZE);
  if (!verifyChunk(macKey, index, ciphertext, tag)) throw new Error(`edfv chunk ${index} hmac mismatch`);
  return decryptChunk(encKey, index, ciphertext);
}
```

- [ ] **Step 4: Run — expect pass**

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/pendrive/format/edfv.ts tests/pendrive/format/edfv.test.ts
git commit -m "feat(pendrive): .edfv encode/decode with random-access chunk reads"
```

---

### Task 2.2: `.edfq` + `.edft` (single-blob GCM envelope)

**Files:**
- Create: `scripts/pendrive/format/edfq.ts`
- Create: `scripts/pendrive/format/edft.ts`
- Create: `tests/pendrive/format/edfq.test.ts`
- Create: `tests/pendrive/format/edft.test.ts`

Both files use an identical envelope shape — encode once, parameterised by magic bytes.

- [ ] **Step 1: Write tests for edfq**

```typescript
// tests/pendrive/format/edfq.test.ts
import { describe, expect, it } from "vitest";
import { encodeEdfq, decodeEdfq } from "@scripts/pendrive/format/edfq";

const key = Buffer.alloc(32, 0x44);
const chapterId = Buffer.alloc(16, 0x05);

describe("edfq", () => {
  it("round-trips a JSON payload", () => {
    const plaintext = Buffer.from(JSON.stringify({ questions: [{ id: "q1" }] }));
    const bytes = encodeEdfq({ key, chapterId, plaintext });
    const opened = decodeEdfq({ key, file: bytes });
    expect(opened.chapterId.equals(chapterId)).toBe(true);
    expect(opened.plaintext.equals(plaintext)).toBe(true);
  });

  it("rejects tampered ciphertext", () => {
    const plaintext = Buffer.from("x");
    const bytes = encodeEdfq({ key, chapterId, plaintext });
    bytes[bytes.length - 20] ^= 0xff; // flip a ciphertext byte
    expect(() => decodeEdfq({ key, file: bytes })).toThrow();
  });

  it("rejects wrong magic", () => {
    const plaintext = Buffer.from("x");
    const bytes = encodeEdfq({ key, chapterId, plaintext });
    bytes[0] = 0x00;
    expect(() => decodeEdfq({ key, file: bytes })).toThrow(/magic/i);
  });
});
```

- [ ] **Step 2: Write tests for edft**

```typescript
// tests/pendrive/format/edft.test.ts
import { describe, expect, it } from "vitest";
import { encodeEdft, decodeEdft } from "@scripts/pendrive/format/edft";

const key = Buffer.alloc(32, 0x55);
const videoId = Buffer.alloc(16, 0x06);

describe("edft", () => {
  it("round-trips thumbnail bytes", () => {
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const bytes = encodeEdft({ key, videoId, plaintext: jpg });
    const opened = decodeEdft({ key, file: bytes });
    expect(opened.videoId.equals(videoId)).toBe(true);
    expect(opened.plaintext.equals(jpg)).toBe(true);
  });
});
```

- [ ] **Step 3: Run — expect fail**

- [ ] **Step 4: Implement shared envelope and per-format modules**

```typescript
// scripts/pendrive/format/envelope.ts
import { FORMAT_VERSION, GCM_IV_SIZE, GCM_TAG_SIZE } from "../crypto/constants";
import { gcmSeal, gcmOpen } from "../crypto/aead";

export function encodeGcmEnvelope(opts: {
  magic: Buffer;
  idBytes: Buffer;   // 16 bytes (chapter_id or video_id)
  key: Buffer;
  plaintext: Buffer;
}): Buffer {
  if (opts.idBytes.length !== 16) throw new Error("idBytes must be 16 bytes");
  const { iv, ciphertext, tag } = gcmSeal(opts.key, opts.plaintext);
  const header = Buffer.alloc(4 + 2 + 2 + 16 + GCM_IV_SIZE + 4);
  opts.magic.copy(header, 0);
  header.writeUInt16BE(FORMAT_VERSION, 4);
  header.writeUInt16BE(0, 6);
  opts.idBytes.copy(header, 8);
  iv.copy(header, 24);
  header.writeUInt32BE(ciphertext.length, 24 + GCM_IV_SIZE);
  return Buffer.concat([header, ciphertext, tag]);
}

export function decodeGcmEnvelope(opts: { magic: Buffer; key: Buffer; file: Buffer }): {
  idBytes: Buffer;
  plaintext: Buffer;
} {
  const { magic, key, file } = opts;
  if (file.length < 40 + GCM_TAG_SIZE) throw new Error("envelope too small");
  if (!file.subarray(0, 4).equals(magic)) throw new Error("magic mismatch");
  const idBytes = Buffer.from(file.subarray(8, 24));
  const iv = Buffer.from(file.subarray(24, 24 + GCM_IV_SIZE));
  const ctLen = file.readUInt32BE(24 + GCM_IV_SIZE);
  const ctStart = 4 + 2 + 2 + 16 + GCM_IV_SIZE + 4;
  const ciphertext = Buffer.from(file.subarray(ctStart, ctStart + ctLen));
  const tag = Buffer.from(file.subarray(ctStart + ctLen, ctStart + ctLen + GCM_TAG_SIZE));
  const plaintext = gcmOpen(key, iv, ciphertext, tag);
  return { idBytes, plaintext };
}
```

```typescript
// scripts/pendrive/format/edfq.ts
import { MAGIC } from "../crypto/constants";
import { encodeGcmEnvelope, decodeGcmEnvelope } from "./envelope";

export function encodeEdfq(opts: { key: Buffer; chapterId: Buffer; plaintext: Buffer }): Buffer {
  return encodeGcmEnvelope({ magic: MAGIC.EDFQ, idBytes: opts.chapterId, key: opts.key, plaintext: opts.plaintext });
}

export function decodeEdfq(opts: { key: Buffer; file: Buffer }): { chapterId: Buffer; plaintext: Buffer } {
  const { idBytes, plaintext } = decodeGcmEnvelope({ magic: MAGIC.EDFQ, key: opts.key, file: opts.file });
  return { chapterId: idBytes, plaintext };
}
```

```typescript
// scripts/pendrive/format/edft.ts
import { MAGIC } from "../crypto/constants";
import { encodeGcmEnvelope, decodeGcmEnvelope } from "./envelope";

export function encodeEdft(opts: { key: Buffer; videoId: Buffer; plaintext: Buffer }): Buffer {
  return encodeGcmEnvelope({ magic: MAGIC.EDFT, idBytes: opts.videoId, key: opts.key, plaintext: opts.plaintext });
}

export function decodeEdft(opts: { key: Buffer; file: Buffer }): { videoId: Buffer; plaintext: Buffer } {
  const { idBytes, plaintext } = decodeGcmEnvelope({ magic: MAGIC.EDFT, key: opts.key, file: opts.file });
  return { videoId: idBytes, plaintext };
}
```

- [ ] **Step 5: Run — expect pass**

Expected: `4 passed`.

- [ ] **Step 6: Commit**

```bash
git add scripts/pendrive/format/edfq.ts scripts/pendrive/format/edft.ts scripts/pendrive/format/envelope.ts tests/pendrive/format/edfq.test.ts tests/pendrive/format/edft.test.ts
git commit -m "feat(pendrive): .edfq and .edft single-blob GCM envelope codecs"
```

---

### Task 2.3: `manifest.json.sig` encode/decode

**Files:**
- Create: `scripts/pendrive/format/manifest.ts`
- Create: `tests/pendrive/format/manifest.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { encodeManifest, decodeManifest } from "@scripts/pendrive/format/manifest";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const pubPem = publicKey.export({ format: "pem", type: "spki" }).toString();

const manifest = {
  format_version: 1,
  pendrive_id: "11111111-1111-1111-1111-111111111111",
  content_bundle_id: "22222222-2222-2222-2222-222222222222",
  centre_id: "33333333-3333-3333-3333-333333333333",
  centre_name: "Test Centre",
  org_id: "44444444-4444-4444-4444-444444444444",
  org_name: "Test NGO",
  issued_at: "2026-04-17T10:00:00Z",
  issued_by: "platform-admin",
  catalogue: { subjects: [] },
  crypto: { cipher: "aes-256-ctr+hmac-sha256", chunk_size: 262144, kdf: "hkdf-sha256", info_version: "v1" },
};

describe("manifest", () => {
  it("round-trips and verifies", () => {
    const bytes = encodeManifest({ privateKeyPem: privPem, manifest });
    const decoded = decodeManifest({ publicKeyPem: pubPem, file: bytes });
    expect(decoded.pendrive_id).toBe(manifest.pendrive_id);
  });

  it("rejects tampered json", () => {
    const bytes = encodeManifest({ privateKeyPem: privPem, manifest });
    bytes[bytes.length - 100] ^= 0xff;
    expect(() => decodeManifest({ publicKeyPem: pubPem, file: bytes })).toThrow();
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```typescript
// scripts/pendrive/format/manifest.ts
import { ED25519_SIG_SIZE, FORMAT_VERSION, MAGIC } from "../crypto/constants";
import { loadPrivateKey, loadPublicKey, sign, verify } from "../crypto/sign";

export type Manifest = Record<string, unknown> & { format_version: number; pendrive_id: string };

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return "{" + entries.map(([k, v]) => JSON.stringify(k) + ":" + canonicalJson(v)).join(",") + "}";
}

export function encodeManifest(opts: { privateKeyPem: string; manifest: Manifest }): Buffer {
  const json = Buffer.from(canonicalJson(opts.manifest), "utf8");
  const header = Buffer.alloc(12);
  MAGIC.EDFM.copy(header, 0);
  header.writeUInt16BE(FORMAT_VERSION, 4);
  header.writeUInt16BE(0, 6);
  header.writeUInt32BE(json.length, 8);
  const body = Buffer.concat([header, json]);
  const sig = sign(loadPrivateKey(opts.privateKeyPem), body);
  if (sig.length !== ED25519_SIG_SIZE) throw new Error("unexpected sig size");
  return Buffer.concat([body, sig]);
}

export function decodeManifest(opts: { publicKeyPem: string; file: Buffer }): Manifest {
  const { publicKeyPem, file } = opts;
  if (!file.subarray(0, 4).equals(MAGIC.EDFM)) throw new Error("bad manifest magic");
  const jsonSize = file.readUInt32BE(8);
  const body = file.subarray(0, 12 + jsonSize);
  const sig = file.subarray(12 + jsonSize, 12 + jsonSize + ED25519_SIG_SIZE);
  if (!verify(loadPublicKey(publicKeyPem), body, sig)) throw new Error("manifest signature invalid");
  const json = JSON.parse(body.subarray(12).toString("utf8")) as Manifest;
  return json;
}
```

- [ ] **Step 4: Run — expect pass**

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/pendrive/format/manifest.ts tests/pendrive/format/manifest.test.ts
git commit -m "feat(pendrive): manifest.json.sig encode/decode with Ed25519"
```

---

### Task 2.4: `credentials.edfc` encode/decode

**Files:**
- Create: `scripts/pendrive/format/credentials.ts`
- Create: `tests/pendrive/format/credentials.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, expect, it } from "vitest";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { encodeCredentials, decodeCredentials, unwrapCredential } from "@scripts/pendrive/format/credentials";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const pubPem = publicKey.export({ format: "pem", type: "spki" }).toString();

const pendriveId = "11111111-1111-1111-1111-111111111111";
const centreId = "22222222-2222-2222-2222-222222222222";

const teachers = [
  { teacherId: "33333333-3333-3333-3333-333333333333", name: "Aarti Sharma", password: "alpha-password" },
  { teacherId: "44444444-4444-4444-4444-444444444444", name: "Bhavesh Kumar", password: "bravo-password" },
];

describe("credentials", () => {
  it("round-trips entries and unwraps with correct password", async () => {
    const bytes = await encodeCredentials({
      privateKeyPem: privPem,
      pendriveId,
      centreId,
      issuedAt: "2026-04-17T10:00:00Z",
      teachers: teachers.map((t) => ({
        teacherId: t.teacherId,
        displayName: t.name,
        password: t.password,
        credentialPlaintext: {
          credential_id: "cred-" + t.teacherId,
          teacher_id: t.teacherId,
          teacher_name: t.name,
          centre_id: centreId,
          role: "teacher",
          issued_at: "2026-04-17T10:00:00Z",
          expires_at: "2027-04-17T10:00:00Z",
        },
      })),
    });

    const decoded = decodeCredentials({ publicKeyPem: pubPem, file: bytes });
    expect(decoded.entries).toHaveLength(2);
    expect(decoded.entries[0].teacher_display_name).toBe("Aarti Sharma");

    const cred = await unwrapCredential(decoded.entries[0], "alpha-password");
    expect(cred.teacher_id).toBe(teachers[0].teacherId);
  }, 20_000);

  it("rejects wrong password", async () => {
    const bytes = await encodeCredentials({
      privateKeyPem: privPem,
      pendriveId,
      centreId,
      issuedAt: "2026-04-17T10:00:00Z",
      teachers: [
        {
          teacherId: teachers[0].teacherId,
          displayName: teachers[0].name,
          password: teachers[0].password,
          credentialPlaintext: { role: "teacher" },
        },
      ],
    });
    const decoded = decodeCredentials({ publicKeyPem: pubPem, file: bytes });
    await expect(unwrapCredential(decoded.entries[0], "wrong-password")).rejects.toThrow();
  }, 20_000);
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```typescript
// scripts/pendrive/format/credentials.ts
import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import {
  ARGON2_PARAMS,
  ARGON2_SALT_SIZE,
  ED25519_SIG_SIZE,
  FORMAT_VERSION,
  MAGIC,
} from "../crypto/constants";
import { gcmSeal, gcmOpen } from "../crypto/aead";
import { loadPrivateKey, loadPublicKey, sign, verify } from "../crypto/sign";

export type CredentialEntry = {
  teacher_display_name: string;
  teacher_id_hint: string;
  argon2_salt: string;
  argon2_params: typeof ARGON2_PARAMS;
  wrapped_iv: string;
  wrapped_ciphertext: string;
  wrapped_tag: string;
};

export type CredentialsFileJson = {
  format_version: number;
  pendrive_id: string;
  centre_id: string;
  issued_at: string;
  entries: CredentialEntry[];
};

function teacherIdHint(teacherId: string): string {
  return createHash("sha256").update(teacherId, "utf8").digest("hex").slice(0, 16);
}

async function deriveKek(password: string, salt: Buffer): Promise<Buffer> {
  const raw = await argon2.hash(password, {
    type: argon2.argon2id,
    salt,
    memoryCost: ARGON2_PARAMS.m_cost_kib,
    timeCost: ARGON2_PARAMS.t_cost,
    parallelism: ARGON2_PARAMS.p_cost,
    hashLength: 32,
    raw: true,
  });
  return Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
}

export async function encodeCredentials(opts: {
  privateKeyPem: string;
  pendriveId: string;
  centreId: string;
  issuedAt: string;
  teachers: Array<{
    teacherId: string;
    displayName: string;
    password: string;
    credentialPlaintext: Record<string, unknown>;
  }>;
}): Promise<Buffer> {
  const entries: CredentialEntry[] = [];
  for (const t of opts.teachers) {
    const salt = randomBytes(ARGON2_SALT_SIZE);
    const kek = await deriveKek(t.password, salt);
    const pt = Buffer.from(JSON.stringify(t.credentialPlaintext), "utf8");
    const sealed = gcmSeal(kek, pt);
    entries.push({
      teacher_display_name: t.displayName,
      teacher_id_hint: teacherIdHint(t.teacherId),
      argon2_salt: salt.toString("base64"),
      argon2_params: ARGON2_PARAMS,
      wrapped_iv: sealed.iv.toString("base64"),
      wrapped_ciphertext: sealed.ciphertext.toString("base64"),
      wrapped_tag: sealed.tag.toString("base64"),
    });
  }

  const body: CredentialsFileJson = {
    format_version: FORMAT_VERSION,
    pendrive_id: opts.pendriveId,
    centre_id: opts.centreId,
    issued_at: opts.issuedAt,
    entries,
  };
  const json = Buffer.from(JSON.stringify(body), "utf8");
  const header = Buffer.alloc(12);
  MAGIC.EDFC.copy(header, 0);
  header.writeUInt16BE(FORMAT_VERSION, 4);
  header.writeUInt16BE(0, 6);
  header.writeUInt32BE(json.length, 8);
  const signed = Buffer.concat([header, json]);
  const sig = sign(loadPrivateKey(opts.privateKeyPem), signed);
  if (sig.length !== ED25519_SIG_SIZE) throw new Error("unexpected sig size");
  return Buffer.concat([signed, sig]);
}

export function decodeCredentials(opts: { publicKeyPem: string; file: Buffer }): CredentialsFileJson {
  if (!opts.file.subarray(0, 4).equals(MAGIC.EDFC)) throw new Error("bad credentials magic");
  const jsonSize = opts.file.readUInt32BE(8);
  const body = opts.file.subarray(0, 12 + jsonSize);
  const sig = opts.file.subarray(12 + jsonSize, 12 + jsonSize + ED25519_SIG_SIZE);
  if (!verify(loadPublicKey(opts.publicKeyPem), body, sig)) throw new Error("credentials signature invalid");
  return JSON.parse(body.subarray(12).toString("utf8")) as CredentialsFileJson;
}

export async function unwrapCredential(entry: CredentialEntry, password: string): Promise<Record<string, unknown>> {
  const salt = Buffer.from(entry.argon2_salt, "base64");
  const iv = Buffer.from(entry.wrapped_iv, "base64");
  const ct = Buffer.from(entry.wrapped_ciphertext, "base64");
  const tag = Buffer.from(entry.wrapped_tag, "base64");
  const kek = await deriveKek(password, salt);
  const pt = gcmOpen(kek, iv, ct, tag);
  return JSON.parse(pt.toString("utf8")) as Record<string, unknown>;
}
```

- [ ] **Step 4: Run — expect pass**

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/pendrive/format/credentials.ts tests/pendrive/format/credentials.test.ts
git commit -m "feat(pendrive): credentials.edfc with argon2id wrap + Ed25519 sign"
```

---

## Phase 3 — Shared CLI utilities

### Task 3.1: Environment loader

**Files:**
- Create: `scripts/pendrive/env.ts`
- Create: `tests/pendrive/env.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, expect, it } from "vitest";
import { loadProvisioningEnv } from "@scripts/pendrive/env";

describe("env", () => {
  it("throws when a required var is missing", () => {
    expect(() => loadProvisioningEnv({})).toThrow(/SUPABASE_URL/);
  });

  it("returns a typed object when all vars present", () => {
    const env = loadProvisioningEnv({
      SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "svc",
      AWS_ACCESS_KEY_ID: "aki",
      AWS_SECRET_ACCESS_KEY: "sk",
      AWS_REGION: "us-east-1",
      S3_BUCKET: "bkt",
      EDUFLEET_MASTER_KEY: "a".repeat(64),
      EDUFLEET_SIGNING_PRIVATE_KEY_PATH: "/tmp/k.pem",
      EDUFLEET_SIGNING_PUBLIC_KEY_PATH: "/tmp/k.pub.pem",
    });
    expect(env.s3Bucket).toBe("bkt");
    expect(env.masterKey).toHaveLength(32);
  });

  it("rejects a non-32-byte master key", () => {
    expect(() =>
      loadProvisioningEnv({
        SUPABASE_URL: "x",
        SUPABASE_SERVICE_ROLE_KEY: "x",
        AWS_ACCESS_KEY_ID: "x",
        AWS_SECRET_ACCESS_KEY: "x",
        AWS_REGION: "x",
        S3_BUCKET: "x",
        EDUFLEET_MASTER_KEY: "aabbcc",
        EDUFLEET_SIGNING_PRIVATE_KEY_PATH: "/tmp/k.pem",
        EDUFLEET_SIGNING_PUBLIC_KEY_PATH: "/tmp/k.pub.pem",
      })
    ).toThrow(/32 bytes/);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```typescript
// scripts/pendrive/env.ts
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export type ProvisioningEnv = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;
  s3Bucket: string;
  masterKey: Buffer;
  signingPrivateKeyPem: string;
  signingPublicKeyPem: string;
};

function required(env: Record<string, string | undefined>, name: string): string {
  const v = env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export function loadProvisioningEnv(env: Record<string, string | undefined>): ProvisioningEnv {
  const masterHex = required(env, "EDUFLEET_MASTER_KEY");
  if (masterHex.length !== 64) throw new Error("EDUFLEET_MASTER_KEY must be 32 bytes hex (64 chars)");
  const privPath = required(env, "EDUFLEET_SIGNING_PRIVATE_KEY_PATH");
  const pubPath = required(env, "EDUFLEET_SIGNING_PUBLIC_KEY_PATH");
  const privPem = existsSync(privPath) ? readFileSync(resolve(privPath), "utf8") : "";
  const pubPem = existsSync(pubPath) ? readFileSync(resolve(pubPath), "utf8") : "";
  return {
    supabaseUrl: required(env, "SUPABASE_URL"),
    supabaseServiceRoleKey: required(env, "SUPABASE_SERVICE_ROLE_KEY"),
    awsAccessKeyId: required(env, "AWS_ACCESS_KEY_ID"),
    awsSecretAccessKey: required(env, "AWS_SECRET_ACCESS_KEY"),
    awsRegion: required(env, "AWS_REGION"),
    s3Bucket: required(env, "S3_BUCKET"),
    masterKey: Buffer.from(masterHex, "hex"),
    signingPrivateKeyPem: privPem,
    signingPublicKeyPem: pubPem,
  };
}

export function loadDotEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const contents = readFileSync(path, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  }
}
```

- [ ] **Step 4: Run — expect pass**

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/pendrive/env.ts tests/pendrive/env.test.ts
git commit -m "feat(pendrive): provisioning env loader"
```

---

### Task 3.2: CLI arg parsers

**Files:**
- Create: `scripts/pendrive/cli-args.ts`
- Create: `tests/pendrive/cli-args.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, expect, it } from "vitest";
import { parsePrepareContentArgs, parseStampArgs } from "@scripts/pendrive/cli-args";

describe("cli-args", () => {
  it("parses prepare-content args", () => {
    const args = parsePrepareContentArgs([
      "--class", "6,7,8",
      "--medium", "english",
      "--board", "CBSE",
      "--output", "/tmp/out",
    ]);
    expect(args.classes).toEqual([6, 7, 8]);
    expect(args.medium).toBe("english");
    expect(args.output).toBe("/tmp/out");
    expect(args.resume).toBe(false);
  });

  it("rejects class out of range", () => {
    expect(() => parsePrepareContentArgs(["--class", "13", "--medium", "english", "--output", "/tmp"]))
      .toThrow(/class/);
  });

  it("parses stamp args with teachers", () => {
    const args = parseStampArgs([
      "--content-folder", "/tmp/c",
      "--centre", "33333333-3333-3333-3333-333333333333",
      "--teachers", "uuid-a:pass-a,uuid-b:pass-b",
      "--usb", "/Volumes/PD",
    ]);
    expect(args.teachers).toHaveLength(2);
    expect(args.teachers[0]).toEqual({ teacherId: "uuid-a", password: "pass-a" });
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```typescript
// scripts/pendrive/cli-args.ts
export type PrepareContentArgs = {
  classes: number[];
  medium: "english" | "hindi" | "both";
  board: string;
  subjects: string[] | null;
  output: string;
  resume: boolean;
};

export type StampArgs = {
  contentFolder: string;
  centreId: string;
  teachers: Array<{ teacherId: string; password: string }>;
  usbMount: string;
  wipe: boolean;
};

function getOpt(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

export function parsePrepareContentArgs(args: string[]): PrepareContentArgs {
  const classesRaw = getOpt(args, "--class");
  const medium = getOpt(args, "--medium");
  const output = getOpt(args, "--output");
  if (!classesRaw || !medium || !output) throw new Error("--class, --medium, --output required");
  const classes = classesRaw.split(",").map((s) => {
    const n = Number.parseInt(s.trim(), 10);
    if (!Number.isFinite(n) || n < 0 || n > 12) throw new Error(`invalid class: ${s}`);
    return n;
  });
  if (!["english", "hindi", "both"].includes(medium)) throw new Error("--medium must be english|hindi|both");
  const subjectsRaw = getOpt(args, "--subjects");
  return {
    classes,
    medium: medium as PrepareContentArgs["medium"],
    board: getOpt(args, "--board") ?? "CBSE",
    subjects: subjectsRaw ? subjectsRaw.split(",").map((s) => s.trim()) : null,
    output,
    resume: hasFlag(args, "--resume"),
  };
}

export function parseStampArgs(args: string[]): StampArgs {
  const contentFolder = getOpt(args, "--content-folder");
  const centreId = getOpt(args, "--centre");
  const teachersRaw = getOpt(args, "--teachers");
  const usbMount = getOpt(args, "--usb");
  if (!contentFolder || !centreId || !usbMount) throw new Error("--content-folder, --centre, --usb required");
  const teachers = (teachersRaw ?? "").split(",").filter(Boolean).map((pair) => {
    const [teacherId, password] = pair.split(":");
    if (!teacherId || !password) throw new Error(`bad teacher pair: ${pair}`);
    return { teacherId, password };
  });
  return {
    contentFolder,
    centreId,
    teachers,
    usbMount,
    wipe: hasFlag(args, "--wipe"),
  };
}
```

- [ ] **Step 4: Run — expect pass**

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/pendrive/cli-args.ts tests/pendrive/cli-args.test.ts
git commit -m "feat(pendrive): CLI arg parsers for both stages"
```

---

### Task 3.3: Supabase catalogue source

**Files:**
- Create: `scripts/pendrive/supabase-source.ts`

No unit test — pure wrapper around Supabase client. Integration tested in Phase 4.

- [ ] **Step 1: Implement**

```typescript
// scripts/pendrive/supabase-source.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type CatalogueChapter = {
  id: string;
  subject_id: string;
  subject_name: string;
  subject_name_hindi: string | null;
  subject_icon_key: string | null;
  class: number;
  board: string;
  medium: string;
  chapter_no: number;
  title: string;
  title_hindi: string | null;
  videos: CatalogueVideo[];
  quiz: { id: string; question_count: number; questions: QuizQuestion[] } | null;
};

export type CatalogueVideo = {
  id: string;
  title: string;
  title_hindi: string | null;
  duration_seconds: number;
  sort_order: number;
  s3_key: string;
  s3_key_hindi: string | null;
};

export type QuizQuestion = {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: number;
  difficulty: string | null;
  cognitive_level: string | null;
  sort_order: number;
};

export type Teacher = { id: string; name: string; centre_id: string; org_id: string | null };

export type Centre = { id: string; name: string; org_id: string | null; org_name: string | null };

export function createSupabaseClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

export async function fetchCatalogue(
  supabase: SupabaseClient,
  filters: { classes: number[]; board: string; mediums: string[]; subjects: string[] | null }
): Promise<CatalogueChapter[]> {
  let query = supabase
    .from("chapters")
    .select(
      "id, subject_id, class, board, medium, chapter_no, title, title_hindi, subjects:subjects(id, name, name_hindi, icon_key), videos:videos(id, title, title_hindi, duration_seconds, sort_order, s3_key, s3_key_hindi), chapter_quizzes:chapter_quizzes(id, question_count, is_published, quiz_questions:quiz_questions(id, question_text, option_a, option_b, option_c, option_d, correct_option, difficulty, cognitive_level, sort_order))"
    )
    .in("class", filters.classes)
    .eq("board", filters.board)
    .in("medium", filters.mediums);

  if (filters.subjects) {
    query = query.in("subjects.name", filters.subjects);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? [])
    .filter((row: any) => row.subjects !== null)
    .map((row: any) => {
      const quiz = (row.chapter_quizzes ?? []).find((q: any) => q.is_published);
      return {
        id: row.id,
        subject_id: row.subject_id,
        subject_name: row.subjects.name,
        subject_name_hindi: row.subjects.name_hindi,
        subject_icon_key: row.subjects.icon_key,
        class: row.class,
        board: row.board,
        medium: row.medium,
        chapter_no: row.chapter_no,
        title: row.title,
        title_hindi: row.title_hindi,
        videos: (row.videos ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
        quiz: quiz
          ? {
              id: quiz.id,
              question_count: quiz.question_count,
              questions: (quiz.quiz_questions ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
            }
          : null,
      };
    });
}

export async function fetchCentre(supabase: SupabaseClient, centreId: string): Promise<Centre | null> {
  const { data, error } = await supabase
    .from("centres")
    .select("id, name, organizations:organizations(id, name)")
    .eq("id", centreId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const org = (data as any).organizations;
  return { id: data.id, name: (data as any).name, org_id: org?.id ?? null, org_name: org?.name ?? null };
}

export async function fetchTeachersForCentre(supabase: SupabaseClient, centreId: string): Promise<Teacher[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, centre_id, org_id")
    .eq("centre_id", centreId)
    .eq("role", "teacher");
  if (error) throw error;
  return (data ?? []) as Teacher[];
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/pendrive/supabase-source.ts
git commit -m "feat(pendrive): Supabase catalogue + centre + teacher queries"
```

---

### Task 3.4: S3 streaming download with retry

**Files:**
- Create: `scripts/pendrive/s3-source.ts`

No unit test yet — tested via E2E in Task 6.1 with a mocked S3.

- [ ] **Step 1: Implement**

```typescript
// scripts/pendrive/s3-source.ts
import { promises as fsp, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

export function createS3Client(opts: {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}): S3Client {
  return new S3Client({
    region: opts.region,
    credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
  });
}

export async function headObject(client: S3Client, bucket: string, key: string): Promise<{ size: number } | null> {
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: res.ContentLength ?? 0 };
  } catch (err: unknown) {
    if (err && typeof err === "object" && (err as any).$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

export async function downloadObjectWithRetry(opts: {
  client: S3Client;
  bucket: string;
  key: string;
  destPath: string;
  maxAttempts?: number;
}): Promise<void> {
  const maxAttempts = opts.maxAttempts ?? 5;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await opts.client.send(new GetObjectCommand({ Bucket: opts.bucket, Key: opts.key }));
      if (!res.Body) throw new Error(`empty body for ${opts.key}`);
      const body = res.Body as Readable;
      await pipeline(body, createWriteStream(opts.destPath));
      return;
    } catch (err) {
      lastError = err;
      await fsp.rm(opts.destPath, { force: true });
      const delayMs = Math.min(30_000, 500 * 2 ** (attempt - 1));
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`download failed after ${maxAttempts} attempts: ${String(lastError)}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/pendrive/s3-source.ts
git commit -m "feat(pendrive): S3 streaming download with exponential-backoff retry"
```

---

### Task 3.5: USB validation

**Files:**
- Create: `scripts/pendrive/usb.ts`
- Create: `tests/pendrive/usb.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertUsbWritable, assertFreeSpace } from "@scripts/pendrive/usb";

describe("usb", () => {
  it("accepts a writable directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "usb-"));
    await expect(assertUsbWritable(dir)).resolves.toBeUndefined();
  });

  it("rejects a missing mount", async () => {
    await expect(assertUsbWritable("/definitely/not/a/path")).rejects.toThrow(/not found/);
  });

  it("rejects when required free space is not met", async () => {
    const dir = mkdtempSync(join(tmpdir(), "usb-"));
    await expect(assertFreeSpace(dir, 1e18)).rejects.toThrow(/free/i);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```typescript
// scripts/pendrive/usb.ts
import { promises as fsp, statSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";

const execFileAsync = promisify(execFile);

export async function assertUsbWritable(mountPath: string): Promise<void> {
  try {
    const stat = statSync(mountPath);
    if (!stat.isDirectory()) throw new Error(`${mountPath} is not a directory`);
  } catch (err: unknown) {
    if (err && typeof err === "object" && (err as any).code === "ENOENT") {
      throw new Error(`mount not found: ${mountPath}`);
    }
    throw err;
  }
  const probe = `${mountPath}/.edufleet-write-probe`;
  await fsp.writeFile(probe, "ok");
  await fsp.rm(probe);
}

export async function assertFreeSpace(mountPath: string, requiredBytes: number): Promise<void> {
  const freeBytes = await getFreeBytes(mountPath);
  if (freeBytes < requiredBytes) {
    throw new Error(`insufficient free space: need ${requiredBytes}, have ${freeBytes}`);
  }
}

async function getFreeBytes(mountPath: string): Promise<number> {
  if (platform() === "darwin" || platform() === "linux") {
    const { stdout } = await execFileAsync("df", ["-k", mountPath]);
    const lines = stdout.trim().split("\n");
    const dataLine = lines[lines.length - 1];
    const parts = dataLine.split(/\s+/);
    const availableKb = Number.parseInt(parts[3], 10);
    if (!Number.isFinite(availableKb)) throw new Error("could not parse df output");
    return availableKb * 1024;
  }
  throw new Error(`unsupported platform for free-space check: ${platform()}`);
}

export async function assertExfat(mountPath: string): Promise<void> {
  if (platform() === "darwin") {
    const { stdout } = await execFileAsync("diskutil", ["info", mountPath]);
    if (!/File System Personality:\s*ExFAT/i.test(stdout)) {
      throw new Error(`USB at ${mountPath} is not exFAT. Reformat as exFAT before running.`);
    }
    return;
  }
  if (platform() === "linux") {
    const { stdout } = await execFileAsync("lsblk", ["-no", "FSTYPE", mountPath]);
    if (!/^exfat/i.test(stdout.trim())) {
      throw new Error(`USB at ${mountPath} is not exFAT. Reformat as exFAT before running.`);
    }
    return;
  }
  throw new Error(`exFAT check unsupported on ${platform()}`);
}
```

- [ ] **Step 4: Run — expect pass**

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/pendrive/usb.ts tests/pendrive/usb.test.ts
git commit -m "feat(pendrive): USB validation (writable, free space, exFAT)"
```

---

### Task 3.6: Progress + logging

**Files:**
- Create: `scripts/pendrive/progress.ts`

- [ ] **Step 1: Implement**

```typescript
// scripts/pendrive/progress.ts
import cliProgress from "cli-progress";
import { mkdirSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function makeProgressBar(total: number, label: string): cliProgress.SingleBar {
  const bar = new cliProgress.SingleBar(
    { format: `${label} {bar} {percentage}% | {value}/{total} {unit}` },
    cliProgress.Presets.shades_classic
  );
  bar.start(total, 0, { unit: "items" });
  return bar;
}

export function getLogPath(stage: string): string {
  const dir = join(homedir(), ".edufleet", "logs");
  mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return join(dir, `${stage}-${ts}.log`);
}

export function jsonLog(logPath: string, entry: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
  appendFileSync(logPath, line);
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/pendrive/progress.ts
git commit -m "feat(pendrive): progress bars + structured JSON logger"
```

---

## Phase 4 — Stage 1 CLI: `pendrive:prepare-content`

### Task 4.1: CLI entry + orchestration skeleton

**Files:**
- Create: `scripts/pendrive-prepare-content.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Add npm script**

In `package.json` scripts:
```json
"pendrive:prepare-content": "tsx scripts/pendrive-prepare-content.ts"
```

- [ ] **Step 2: Create entry file**

```typescript
#!/usr/bin/env tsx
// scripts/pendrive-prepare-content.ts
import { mkdirSync, writeFileSync, existsSync, readFileSync, promises as fsp } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parsePrepareContentArgs } from "./pendrive/cli-args";
import { loadDotEnvFile, loadProvisioningEnv } from "./pendrive/env";
import { createSupabaseClient, fetchCatalogue, type CatalogueChapter } from "./pendrive/supabase-source";
import { createS3Client, downloadObjectWithRetry, headObject } from "./pendrive/s3-source";
import {
  deriveContentKey,
  deriveVideoEncKey,
  deriveVideoMacKey,
  deriveQuizKey,
  deriveThumbKey,
} from "./pendrive/crypto/keys";
import { encodeEdfv } from "./pendrive/format/edfv";
import { encodeEdfq } from "./pendrive/format/edfq";
import { encodeEdft } from "./pendrive/format/edft";
import { buildThumbnailKey } from "../src/lib/media";
import { getLogPath, jsonLog, makeProgressBar } from "./pendrive/progress";

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function mediumList(medium: "english" | "hindi" | "both"): string[] {
  if (medium === "english") return ["English"];
  if (medium === "hindi") return ["Hindi"];
  return ["English", "Hindi"];
}

type PackManifest = {
  format_version: 1;
  content_bundle_id: string;
  created_at: string;
  filters: { classes: number[]; medium: string; board: string; subjects: string[] | null };
  catalogue: CatalogueChapter[];
};

async function main(): Promise<void> {
  loadDotEnvFile(resolve(process.cwd(), ".env.provisioning"));
  const env = loadProvisioningEnv(process.env);
  const args = parsePrepareContentArgs(process.argv.slice(2));
  const outputDir = resolve(args.output);
  mkdirSync(outputDir, { recursive: true });

  const logPath = getLogPath("prepare-content");
  const manifestPath = join(outputDir, "content-pack-manifest.json");

  let manifest: PackManifest;
  if (args.resume && existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackManifest;
    jsonLog(logPath, { event: "resume", content_bundle_id: manifest.content_bundle_id });
  } else {
    const supabase = createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey);
    const catalogue = await fetchCatalogue(supabase, {
      classes: args.classes,
      board: args.board,
      mediums: mediumList(args.medium),
      subjects: args.subjects,
    });
    manifest = {
      format_version: 1,
      content_bundle_id: randomBytes(16).toString("hex"),
      created_at: new Date().toISOString(),
      filters: { classes: args.classes, medium: args.medium, board: args.board, subjects: args.subjects },
      catalogue,
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    jsonLog(logPath, {
      event: "start",
      content_bundle_id: manifest.content_bundle_id,
      chapter_count: catalogue.length,
    });
  }

  mkdirSync(join(outputDir, "content", "videos"), { recursive: true });
  mkdirSync(join(outputDir, "content", "quizzes"), { recursive: true });
  mkdirSync(join(outputDir, "content", "thumbnails"), { recursive: true });

  await runPipeline(env, manifest, outputDir, logPath);

  jsonLog(logPath, { event: "complete" });
  console.log(`\nContent pack ready: ${outputDir}`);
  console.log(`Log: ${logPath}`);
}

// runPipeline stub — implemented in Task 4.3
async function runPipeline(
  _env: ReturnType<typeof loadProvisioningEnv>,
  _manifest: PackManifest,
  _outputDir: string,
  _logPath: string
): Promise<void> {
  // populated incrementally
}

void main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Verify entry compiles**

Run: `npx tsc -p tsconfig.tests.json --noEmit`
Expected: no errors in `scripts/pendrive-prepare-content.ts`.

- [ ] **Step 4: Commit**

```bash
git add scripts/pendrive-prepare-content.ts package.json
git commit -m "feat(pendrive): prepare-content CLI skeleton"
```

---

### Task 4.2: Video encryption loop

**Files:**
- Modify: `scripts/pendrive-prepare-content.ts` (replace `runPipeline` stub)

- [ ] **Step 1: Replace `runPipeline` stub with full implementation**

Replace the `async function runPipeline(...) { }` stub with:

```typescript
async function runPipeline(
  env: ReturnType<typeof loadProvisioningEnv>,
  manifest: PackManifest,
  outputDir: string,
  logPath: string
): Promise<void> {
  const contentBundleIdBytes = Buffer.from(manifest.content_bundle_id, "hex");
  const contentKey = deriveContentKey(env.masterKey, contentBundleIdBytes);
  const s3 = createS3Client({
    accessKeyId: env.awsAccessKeyId,
    secretAccessKey: env.awsSecretAccessKey,
    region: env.awsRegion,
  });

  const videoTargets: Array<{ id: string; s3Key: string }> = [];
  for (const chapter of manifest.catalogue) {
    for (const v of chapter.videos) {
      if (v.s3_key) videoTargets.push({ id: v.id, s3Key: v.s3_key });
      if (v.s3_key_hindi) videoTargets.push({ id: `${v.id}-hi`, s3Key: v.s3_key_hindi });
    }
  }

  const videoBar = makeProgressBar(videoTargets.length, "videos");
  for (const target of videoTargets) {
    const destPath = join(outputDir, "content", "videos", `${target.id}.edfv`);
    if (existsSync(destPath)) {
      videoBar.increment();
      continue;
    }
    try {
      const head = await headObject(s3, env.s3Bucket, target.s3Key);
      if (!head) {
        jsonLog(logPath, { event: "s3_missing", video_id: target.id, s3_key: target.s3Key });
        videoBar.increment();
        continue;
      }
      const tmpPath = join(tmpdir(), `edufleet-${target.id}-${Date.now()}`);
      await downloadObjectWithRetry({ client: s3, bucket: env.s3Bucket, key: target.s3Key, destPath: tmpPath });
      const partialPath = `${destPath}.partial`;
      const videoIdBytes = uuidToBytes(target.id.replace(/-hi$/, ""));
      await encodeEdfv({
        sourcePath: tmpPath,
        destPath: partialPath,
        contentBundleId: contentBundleIdBytes,
        videoId: videoIdBytes,
        encKey: deriveVideoEncKey(contentKey, videoIdBytes),
        macKey: deriveVideoMacKey(contentKey, videoIdBytes),
      });
      await fsp.rename(partialPath, destPath);
      await fsp.rm(tmpPath, { force: true });
      jsonLog(logPath, { event: "video_encrypted", video_id: target.id, bytes: head.size });
    } catch (err) {
      jsonLog(logPath, { event: "video_failed", video_id: target.id, error: String(err) });
    }
    videoBar.increment();
  }
  videoBar.stop();
}
```

- [ ] **Step 2: Run the CLI against a seed DB (manual smoke)**

Create `.env.provisioning.sample` with placeholder values and document how to obtain real ones. Manual verification is deferred to the E2E task.

- [ ] **Step 3: Commit**

```bash
git add scripts/pendrive-prepare-content.ts
git commit -m "feat(pendrive): stage 1 video encrypt loop with resume + logging"
```

---

### Task 4.3: Quiz + thumbnail encryption

**Files:**
- Modify: `scripts/pendrive-prepare-content.ts` (extend `runPipeline`)

- [ ] **Step 1: Append quiz + thumbnail passes to `runPipeline`**

Add at the end of `runPipeline`, after the video loop:

```typescript
  // Quizzes
  const quizChapters = manifest.catalogue.filter((c) => c.quiz !== null);
  const quizBar = makeProgressBar(quizChapters.length, "quizzes");
  for (const chapter of quizChapters) {
    const destPath = join(outputDir, "content", "quizzes", `${chapter.id}.edfq`);
    if (existsSync(destPath)) { quizBar.increment(); continue; }
    const chapterIdBytes = uuidToBytes(chapter.id);
    const key = deriveQuizKey(contentKey, chapterIdBytes);
    const plaintext = Buffer.from(
      JSON.stringify({ chapter_id: chapter.id, questions: chapter.quiz!.questions }),
      "utf8"
    );
    const bytes = encodeEdfq({ key, chapterId: chapterIdBytes, plaintext });
    writeFileSync(`${destPath}.partial`, bytes);
    await fsp.rename(`${destPath}.partial`, destPath);
    jsonLog(logPath, { event: "quiz_encrypted", chapter_id: chapter.id });
    quizBar.increment();
  }
  quizBar.stop();

  // Thumbnails
  const allVideos = manifest.catalogue.flatMap((c) => c.videos);
  const thumbBar = makeProgressBar(allVideos.length, "thumbs");
  for (const v of allVideos) {
    const destPath = join(outputDir, "content", "thumbnails", `${v.id}.edft`);
    if (existsSync(destPath)) { thumbBar.increment(); continue; }
    const thumbKey = buildThumbnailKey(v.s3_key);
    if (!thumbKey) { thumbBar.increment(); continue; }
    try {
      const tmpPath = join(tmpdir(), `edufleet-thumb-${v.id}-${Date.now()}`);
      await downloadObjectWithRetry({ client: s3, bucket: env.s3Bucket, key: thumbKey, destPath: tmpPath });
      const plaintext = await fsp.readFile(tmpPath);
      const videoIdBytes = uuidToBytes(v.id);
      const key = deriveThumbKey(contentKey, videoIdBytes);
      const bytes = encodeEdft({ key, videoId: videoIdBytes, plaintext });
      writeFileSync(`${destPath}.partial`, bytes);
      await fsp.rename(`${destPath}.partial`, destPath);
      await fsp.rm(tmpPath, { force: true });
      jsonLog(logPath, { event: "thumb_encrypted", video_id: v.id });
    } catch (err) {
      jsonLog(logPath, { event: "thumb_skipped", video_id: v.id, error: String(err) });
    }
    thumbBar.increment();
  }
  thumbBar.stop();
```

- [ ] **Step 2: Commit**

```bash
git add scripts/pendrive-prepare-content.ts
git commit -m "feat(pendrive): stage 1 quiz + thumbnail encryption"
```

---

## Phase 5 — Stage 2 CLI: `pendrive:stamp`

### Task 5.1: Entry + USB validation

**Files:**
- Create: `scripts/pendrive-stamp.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Add npm script**

In `package.json` scripts:
```json
"pendrive:stamp": "tsx scripts/pendrive-stamp.ts"
```

- [ ] **Step 2: Create entry file**

```typescript
#!/usr/bin/env tsx
// scripts/pendrive-stamp.ts
import { mkdirSync, writeFileSync, readFileSync, promises as fsp, existsSync, statSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { parseStampArgs } from "./pendrive/cli-args";
import { loadDotEnvFile, loadProvisioningEnv } from "./pendrive/env";
import { assertUsbWritable, assertFreeSpace, assertExfat } from "./pendrive/usb";
import { createSupabaseClient, fetchCentre, fetchTeachersForCentre } from "./pendrive/supabase-source";
import { encodeManifest } from "./pendrive/format/manifest";
import { encodeCredentials } from "./pendrive/format/credentials";
import { decodeManifest } from "./pendrive/format/manifest";
import { getLogPath, jsonLog, makeProgressBar } from "./pendrive/progress";

type PackManifest = {
  format_version: 1;
  content_bundle_id: string;
  created_at: string;
  filters: { classes: number[]; medium: string; board: string; subjects: string[] | null };
  catalogue: Array<Record<string, unknown>>;
};

async function totalBytes(dir: string): Promise<number> {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) total += await totalBytes(p);
    else total += statSync(p).size;
  }
  return total;
}

async function main(): Promise<void> {
  loadDotEnvFile(resolve(process.cwd(), ".env.provisioning"));
  const env = loadProvisioningEnv(process.env);
  const args = parseStampArgs(process.argv.slice(2));
  const contentFolder = resolve(args.contentFolder);
  const usb = resolve(args.usbMount);

  const packManifestPath = join(contentFolder, "content-pack-manifest.json");
  if (!existsSync(packManifestPath)) throw new Error(`content pack manifest missing: ${packManifestPath}`);
  const packManifest = JSON.parse(readFileSync(packManifestPath, "utf8")) as PackManifest;

  await assertUsbWritable(usb);
  await assertExfat(usb);
  const sizeBytes = await totalBytes(join(contentFolder, "content"));
  await assertFreeSpace(usb, Math.floor(sizeBytes * 1.1));

  const existingMarker = join(usb, ".edufleet", "version.txt");
  if (existsSync(existingMarker) && !args.wipe) {
    throw new Error(`USB already has an EduFleet pendrive. Re-run with --wipe to overwrite.`);
  }

  const logPath = getLogPath("stamp");
  const pendriveId = randomBytes(16).toString("hex");
  jsonLog(logPath, { event: "start", pendrive_id: pendriveId, usb, centre_id: args.centreId });

  // continues in next tasks…
  await writePendrive({ env, packManifest, contentFolder, usb, pendriveId, args, logPath });

  console.log(`\nPendrive stamped. pendrive_id=${pendriveId}`);
  console.log(`Log: ${logPath}`);
}

async function writePendrive(opts: {
  env: ReturnType<typeof loadProvisioningEnv>;
  packManifest: PackManifest;
  contentFolder: string;
  usb: string;
  pendriveId: string;
  args: ReturnType<typeof parseStampArgs>;
  logPath: string;
}): Promise<void> {
  // populated in subsequent tasks
}

void main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Commit**

```bash
git add scripts/pendrive-stamp.ts package.json
git commit -m "feat(pendrive): stamp CLI skeleton + USB validation"
```

---

### Task 5.2: Content copy with progress

**Files:**
- Modify: `scripts/pendrive-stamp.ts` (fill `writePendrive`)

- [ ] **Step 1: Implement content copy section**

Replace the `writePendrive` stub body with the copy pass (further sections added in later tasks):

```typescript
async function writePendrive(opts: {
  env: ReturnType<typeof loadProvisioningEnv>;
  packManifest: PackManifest;
  contentFolder: string;
  usb: string;
  pendriveId: string;
  args: ReturnType<typeof parseStampArgs>;
  logPath: string;
}): Promise<void> {
  const srcContent = join(opts.contentFolder, "content");
  const dstContent = join(opts.usb, "content");
  if (opts.args.wipe && existsSync(dstContent)) {
    await fsp.rm(dstContent, { recursive: true, force: true });
  }
  mkdirSync(dstContent, { recursive: true });

  const files: string[] = [];
  function walk(dir: string, prefix: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const srcP = join(dir, entry.name);
      const relP = join(prefix, entry.name);
      if (entry.isDirectory()) walk(srcP, relP);
      else files.push(relP);
    }
  }
  walk(srcContent, "");

  const bar = makeProgressBar(files.length, "copy");
  for (const rel of files) {
    const src = join(srcContent, rel);
    const dst = join(dstContent, rel);
    mkdirSync(join(dst, ".."), { recursive: true });
    await fsp.copyFile(src, dst);
    bar.increment();
  }
  bar.stop();
  jsonLog(opts.logPath, { event: "content_copied", file_count: files.length });
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/pendrive-stamp.ts
git commit -m "feat(pendrive): stage 2 content copy with progress"
```

---

### Task 5.3: Write signed manifest + credentials + verify-after-write

**Files:**
- Modify: `scripts/pendrive-stamp.ts` (extend `writePendrive`)

- [ ] **Step 1: Append manifest + credentials + verification passes to `writePendrive`**

Add at the end of the `writePendrive` function, after the content copy:

```typescript
  // Build signed manifest
  const supabase = createSupabaseClient(opts.env.supabaseUrl, opts.env.supabaseServiceRoleKey);
  const centre = await fetchCentre(supabase, opts.args.centreId);
  if (!centre) throw new Error(`centre not found: ${opts.args.centreId}`);

  const teachers = await fetchTeachersForCentre(supabase, opts.args.centreId);
  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  for (const { teacherId } of opts.args.teachers) {
    if (!teacherMap.has(teacherId)) {
      throw new Error(`teacher ${teacherId} is not a teacher of centre ${opts.args.centreId}`);
    }
  }

  const dotEdufleet = join(opts.usb, ".edufleet");
  mkdirSync(dotEdufleet, { recursive: true });

  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const manifest = {
    format_version: 1,
    pendrive_id: opts.pendriveId,
    content_bundle_id: opts.packManifest.content_bundle_id,
    centre_id: centre.id,
    centre_name: centre.name,
    org_id: centre.org_id,
    org_name: centre.org_name,
    issued_at: issuedAt,
    issued_by: "platform_admin",
    catalogue: { chapters: opts.packManifest.catalogue },
    crypto: {
      cipher: "aes-256-ctr+hmac-sha256",
      chunk_size: 262144,
      kdf: "hkdf-sha256",
      info_version: "v1",
    },
  };
  const manifestBytes = encodeManifest({ privateKeyPem: opts.env.signingPrivateKeyPem, manifest });
  writeFileSync(join(dotEdufleet, "manifest.json.sig"), manifestBytes);
  jsonLog(opts.logPath, { event: "manifest_written", bytes: manifestBytes.length });

  // Build credentials
  const credentialsBytes = await encodeCredentials({
    privateKeyPem: opts.env.signingPrivateKeyPem,
    pendriveId: opts.pendriveId,
    centreId: centre.id,
    issuedAt,
    teachers: opts.args.teachers.map(({ teacherId, password }) => {
      const t = teacherMap.get(teacherId)!;
      return {
        teacherId,
        displayName: t.name,
        password,
        credentialPlaintext: {
          format_version: 1,
          credential_id: randomBytes(16).toString("hex"),
          teacher_id: teacherId,
          teacher_name: t.name,
          centre_id: centre.id,
          org_id: t.org_id,
          role: "teacher",
          issued_at: issuedAt,
          expires_at: expiresAt,
        },
      };
    }),
  });
  writeFileSync(join(dotEdufleet, "credentials.edfc"), credentialsBytes);
  writeFileSync(join(dotEdufleet, "version.txt"), "1\n");
  jsonLog(opts.logPath, { event: "credentials_written", teacher_count: opts.args.teachers.length });

  // Verify by reading back
  const manifestReadBack = readFileSync(join(dotEdufleet, "manifest.json.sig"));
  const decoded = decodeManifest({ publicKeyPem: opts.env.signingPublicKeyPem, file: manifestReadBack });
  if (decoded.pendrive_id !== opts.pendriveId) throw new Error("verify-after-write: pendrive_id mismatch");
  jsonLog(opts.logPath, { event: "verified" });
```

- [ ] **Step 2: Commit**

```bash
git add scripts/pendrive-stamp.ts
git commit -m "feat(pendrive): stage 2 manifest + credentials + verify-after-write"
```

---

## Phase 6 — End-to-end integration test

### Task 6.1: E2E round-trip

**Files:**
- Create: `tests/pendrive/e2e.test.ts`

This test exercises the full format stack in-memory (no S3, no Supabase, no USB). It proves the formats compose cleanly.

- [ ] **Step 1: Write test**

```typescript
import { describe, expect, it } from "vitest";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveContentKey, deriveVideoEncKey, deriveVideoMacKey, deriveQuizKey } from "@scripts/pendrive/crypto/keys";
import { encodeEdfv, readEdfvHeader, readEdfvChunk } from "@scripts/pendrive/format/edfv";
import { encodeEdfq, decodeEdfq } from "@scripts/pendrive/format/edfq";
import { encodeManifest, decodeManifest } from "@scripts/pendrive/format/manifest";
import { encodeCredentials, decodeCredentials, unwrapCredential } from "@scripts/pendrive/format/credentials";

describe("e2e pendrive round-trip", () => {
  it("produces a pendrive tree that round-trips through all decoders", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const pubPem = publicKey.export({ format: "pem", type: "spki" }).toString();

    const M = randomBytes(32);
    const CB = randomBytes(16);
    const V = randomBytes(16);
    const C = randomBytes(16);

    const ck = deriveContentKey(M, CB);
    const dir = mkdtempSync(join(tmpdir(), "pendrive-e2e-"));
    const srcVideo = join(dir, "plain.bin");
    const encVideo = join(dir, "video.edfv");
    const videoBytes = randomBytes(256 * 1024 * 3 - 17);
    writeFileSync(srcVideo, videoBytes);

    await encodeEdfv({
      sourcePath: srcVideo,
      destPath: encVideo,
      contentBundleId: CB,
      videoId: V,
      encKey: deriveVideoEncKey(ck, V),
      macKey: deriveVideoMacKey(ck, V),
    });
    const fileBytes = readFileSync(encVideo);
    const header = readEdfvHeader(fileBytes, deriveVideoMacKey(ck, V));
    const reassembled: Buffer[] = [];
    for (let i = 0; i < header.chunkCount; i++) {
      reassembled.push(readEdfvChunk(fileBytes, header, i, deriveVideoEncKey(ck, V), deriveVideoMacKey(ck, V)));
    }
    expect(Buffer.concat(reassembled).equals(videoBytes)).toBe(true);

    const quizBytes = encodeEdfq({
      key: deriveQuizKey(ck, C),
      chapterId: C,
      plaintext: Buffer.from('{"questions":[]}'),
    });
    expect(decodeEdfq({ key: deriveQuizKey(ck, C), file: quizBytes }).plaintext.toString()).toBe('{"questions":[]}');

    const manifestBytes = encodeManifest({
      privateKeyPem: privPem,
      manifest: {
        format_version: 1,
        pendrive_id: "aa".repeat(16),
        content_bundle_id: CB.toString("hex"),
        centre_id: "cc".repeat(16),
        centre_name: "Test",
        org_id: "oo".repeat(16),
        org_name: "Test NGO",
        issued_at: "2026-04-17T00:00:00Z",
        issued_by: "t",
        catalogue: { chapters: [] },
        crypto: { cipher: "aes-256-ctr+hmac-sha256", chunk_size: 262144, kdf: "hkdf-sha256", info_version: "v1" },
      },
    });
    expect(decodeManifest({ publicKeyPem: pubPem, file: manifestBytes }).pendrive_id).toBe("aa".repeat(16));

    const credentialsBytes = await encodeCredentials({
      privateKeyPem: privPem,
      pendriveId: "aa".repeat(16),
      centreId: "cc".repeat(16),
      issuedAt: "2026-04-17T00:00:00Z",
      teachers: [
        {
          teacherId: "tt".repeat(16),
          displayName: "Teacher One",
          password: "test-password",
          credentialPlaintext: { teacher_id: "tt".repeat(16), role: "teacher" },
        },
      ],
    });
    const creds = decodeCredentials({ publicKeyPem: pubPem, file: credentialsBytes });
    const unwrapped = await unwrapCredential(creds.entries[0], "test-password");
    expect(unwrapped.teacher_id).toBe("tt".repeat(16));
  }, 30_000);
});
```

- [ ] **Step 2: Run — expect pass**

Run: `npm test -- tests/pendrive/e2e.test.ts`
Expected: `1 passed`.

- [ ] **Step 3: Commit**

```bash
git add tests/pendrive/e2e.test.ts
git commit -m "test(pendrive): e2e round-trip across all formats"
```

---

### Task 6.2: Final pass — run the whole suite

**Files:** none

- [ ] **Step 1: Run everything**

Run: `npm test`
Expected: all tests pass, no open handles.

- [ ] **Step 2: Count tests and assert coverage is reasonable**

Run: `npm test -- --coverage`
Expected: every file under `scripts/pendrive/crypto/` and `scripts/pendrive/format/` shows > 80% line coverage.

- [ ] **Step 3: No commit — reporting only.**

---

## Notes & deferred items

- **Interactive password prompt** for teachers in stage 2 (when `--teachers` omits passwords): deferred. Current design requires passwords in the CLI arg. A follow-up task can add `prompts` or `readline` if needed.
- **Auto-generated passwords**: deferred — admin can generate via `openssl rand -base64 18` and pass in.
- **Clock skew check** against NTP before stage 1 / stage 2 runs: deferred. Issue a log warning if `Date.now()` is > 24h off `Date.parse("…")` of an NTP fetch; for now the admin is trusted to have a correct clock.
- **Play Integrity / APK-side checks**: belong to sub-project #4, not here.
- **Key material generation helper** (`openssl rand -hex 32` for master, `openssl genpkey` for Ed25519): document in a follow-up `docs/ops/pendrive-key-setup.md` when ops onboarding begins.
