// Cloudflare Worker entry point.
//
// Static files (the page, the shared modules, the sample documents) are served
// by the ASSETS binding straight from ./public. Anything under /api/ runs the
// same handlers the local Express server uses.

import { DEFAULT_MODEL, routeApi } from '../src/core/api.js';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const config = {
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
    };

    let body = {};
    if (request.method === 'POST') {
      try {
        body = await request.json();
      } catch {
        return json(400, { error: 'That request could not be read.' });
      }
    }

    const result = await routeApi(url.pathname, request.method, body, config, request.signal);
    if (!result) return json(404, { error: 'Not found.' });
    return json(result.status, result.body);
  },
};
