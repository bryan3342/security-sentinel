const { validatePayload } = require('../src/middleware/validator');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('validatePayload', () => {
  test('passes a valid push event', () => {
    const next = jest.fn();
    const req = {
      headers: { 'x-github-event': 'push' },
      body: { repository: {}, after: 'abc', commits: [] }
    };
    validatePayload(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.githubEvent).toBe('push');
  });

  test('passes a valid pull_request event', () => {
    const next = jest.fn();
    const req = {
      headers: { 'x-github-event': 'pull_request' },
      body: { repository: {}, pull_request: { head: { sha: 'a', ref: 'x' } } }
    };
    validatePayload(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.githubEvent).toBe('pull_request');
  });

  test('200-ignores unsupported events', () => {
    const next = jest.fn();
    const res = mockRes();
    validatePayload({ headers: { 'x-github-event': 'star' }, body: {} }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('rejects invalid push payload', () => {
    const next = jest.fn();
    const res = mockRes();
    validatePayload(
      { headers: { 'x-github-event': 'push' }, body: { repository: {} } },
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
