const { correlationId } = require('../src/middleware/correlationId');

function mockRes() {
  const headers = {};
  return {
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    _headers: headers
  };
}

describe('correlationId middleware', () => {
  test('uses x-request-id when provided', () => {
    const req = { headers: { 'x-request-id': 'abc-123' } };
    const res = mockRes();
    correlationId(req, res, () => {});
    expect(req.correlationId).toBe('abc-123');
    expect(res._headers['x-request-id']).toBe('abc-123');
  });

  test('falls back to x-github-delivery', () => {
    const req = { headers: { 'x-github-delivery': 'delivery-uuid' } };
    const res = mockRes();
    correlationId(req, res, () => {});
    expect(req.correlationId).toBe('delivery-uuid');
  });

  test('generates a UUID when neither header is present', () => {
    const req = { headers: {} };
    const res = mockRes();
    correlationId(req, res, () => {});
    expect(req.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(res._headers['x-request-id']).toBe(req.correlationId);
  });

  test('calls next', () => {
    const next = jest.fn();
    correlationId({ headers: {} }, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });
});
