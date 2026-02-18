# ADR-003: Timing-Safe HMAC Comparison

## Status

Accepted

## Context

The webhook service authenticates incoming requests by verifying GitHub's HMAC-SHA256 signature against a shared secret. A naive string comparison (`===`) leaks information through timing side-channels: an attacker can measure response times to incrementally guess the correct signature byte-by-byte.

## Decision

Use Node.js `crypto.timingSafeEqual()` to compare the computed HMAC digest with the signature provided in the `x-hub-signature-256` header. This function runs in constant time regardless of where the first difference occurs.

```js
const isValid = crypto.timingSafeEqual(
    Buffer.from(signatureHash, 'hex'),
    Buffer.from(computedHash, 'hex')
);
```

## Consequences

- Eliminates timing side-channel attacks on webhook authentication.
- Both buffers must be the same length; the code must parse the `sha256=` prefix before comparison.
- Negligible performance impact — constant-time comparison over 32 bytes is effectively free.
