import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { api } from '../web/api.js';

describe('Ön Yüz API İstemcisi (web/api.ts)', () => {
  const originalFetch = globalThis.fetch;
  let lastInit: RequestInit | undefined;

  beforeEach(() => {
    lastInit = undefined;
    globalThis.fetch = (async (_url: any, init?: RequestInit) => {
      lastInit = init;
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('Gövdesiz POST isteğine Content-Type eklenmez (Fastify boş JSON gövdesini reddeder)', async () => {
    await api.post('organizations/next');
    const headers = new Headers(lastInit?.headers);
    assert.equal(headers.has('Content-Type'), false);
    assert.equal(lastInit?.body, undefined);
  });

  test('Gövdeli POST isteği JSON olarak gönderilir', async () => {
    await api.post('auth/login', { username: 'a', password: 'b' });
    const headers = new Headers(lastInit?.headers);
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.equal(lastInit?.body, JSON.stringify({ username: 'a', password: 'b' }));
  });
});
