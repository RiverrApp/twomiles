// The browser polls this with the job id it sent to /api/build. Returns the saved result from
// Netlify Blobs; once a finished build has been handed over it is deleted.

import { getStore } from '@netlify/blobs';

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default async (req) => {
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^[a-f0-9]{24,48}$/.test(id)) return json(400, { status: 'error', error: 'Bad request.' });
  const store = getStore('builds');
  let job = null;
  try { job = await store.get(id, { type: 'json' }); } catch (e) { console.error('blob read failed', e && e.message); }
  if (!job) return json(200, { status: 'pending' });
  if (job.status !== 'running' && job.status !== 'pending') store.delete(id).catch(() => {});
  return json(200, job);
};

export const config = { path: '/api/build-status' };
