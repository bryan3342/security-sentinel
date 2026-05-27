const RedisMock = require('ioredis-mock');
const { buildReplayProtection } = require('../src/middleware/replayProtection');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('replayProtection middleware', () => {
  test('first delivery passes through', async () => {
    const redis = new RedisMock();
    const mw = buildReplayProtection({ redis, ttlSeconds: 60 });
    const next = jest.fn();
    await mw(
      { headers: { 'x-github-delivery': 'd-1' }, correlationId: 'c-1' },
      mockRes(),
      next
    );
    expect(next).toHaveBeenCalled();
  });

  test('second delivery with same id is short-circuited 200', async () => {
    const redis = new RedisMock();
    const mw = buildReplayProtection({ redis, ttlSeconds: 60 });
    const next = jest.fn();

    await mw(
      { headers: { 'x-github-delivery': 'd-2' }, correlationId: 'c-1' },
      mockRes(),
      next
    );

    const res = mockRes();
    await mw(
      { headers: { 'x-github-delivery': 'd-2' }, correlationId: 'c-2' },
      res,
      next
    );

    expect(next).toHaveBeenCalledTimes(1); // first call only
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryId: 'd-2' })
    );
  });

  test('missing delivery header passes through', async () => {
    const redis = new RedisMock();
    const mw = buildReplayProtection({ redis, ttlSeconds: 60 });
    const next = jest.fn();
    await mw({ headers: {}, correlationId: 'c' }, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('redis failure fails open (passes through)', async () => {
    const redis = {
      set: jest.fn().mockRejectedValue(new Error('redis down'))
    };
    const mw = buildReplayProtection({ redis, ttlSeconds: 60 });
    const next = jest.fn();
    await mw(
      { headers: { 'x-github-delivery': 'd-3' }, correlationId: 'c' },
      mockRes(),
      next
    );
    expect(next).toHaveBeenCalled();
  });
});
