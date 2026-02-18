# ADR-002: Return 200 on Processing Failure

## Status

Accepted

## Context

GitHub retries webhook deliveries when it receives a non-2xx response. If our service returns a 500 when job enqueue fails, GitHub will retry the same payload — potentially causing duplicate processing attempts and masking the root cause under a flood of retries.

The webhook service's job is to **acknowledge receipt**, not to guarantee analysis completion. Analysis is handled asynchronously by downstream workers.

## Decision

Always return HTTP 200 to GitHub, even when internal processing fails. Log the error for investigation and include a failure indicator in the response body.

```js
// Error path in webhook route handler
res.status(200).json({
    message: 'Webhook received but failed to process',
    error: error.message
});
```

## Consequences

- GitHub will never retry a delivery due to our processing errors, preventing retry storms.
- Monitoring must rely on application logs and queue metrics rather than GitHub's delivery status dashboard.
- Operators need alerting on error logs to detect silent failures.
