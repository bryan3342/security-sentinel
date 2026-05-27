const crypto = require('crypto');
const { verifyGitHubSignature } = require('../src/middleware/auth');

function signBody(body, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

describe('verifyGitHubSignature', () => {
  const SECRET = 'topsecret';
  const BODY = Buffer.from(JSON.stringify({ hello: 'world' }));

  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
  });

  test('passes a valid signature', () => {
    const next = jest.fn();
    const req = {
      headers: { 'x-hub-signature-256': signBody(BODY, SECRET) },
      rawBody: BODY,
      ip: '1.2.3.4'
    };
    verifyGitHubSignature(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('rejects a tampered body', () => {
    const next = jest.fn();
    const res = mockRes();
    const req = {
      headers: { 'x-hub-signature-256': signBody(BODY, SECRET) },
      rawBody: Buffer.from(JSON.stringify({ hello: 'evil' })),
      ip: '1.2.3.4'
    };
    verifyGitHubSignature(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('rejects when signature header missing', () => {
    const next = jest.fn();
    const res = mockRes();
    verifyGitHubSignature({ headers: {}, rawBody: BODY }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('rejects when rawBody missing (server misconfig)', () => {
    const next = jest.fn();
    const res = mockRes();
    const req = {
      headers: { 'x-hub-signature-256': signBody(BODY, SECRET) }
    };
    verifyGitHubSignature(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('rejects when signature length mismatched', () => {
    const next = jest.fn();
    const res = mockRes();
    const req = {
      headers: { 'x-hub-signature-256': 'sha256=short' },
      rawBody: BODY,
      ip: '1.2.3.4'
    };
    verifyGitHubSignature(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
