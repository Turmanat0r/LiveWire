// Asks the database one small question once a week (vercel.json, "crons"), so
// a free Supabase project never counts as idle and goes to sleep between
// tournaments. Vercel runs it on each project's live deployment: the live site
// keeps production awake, the testing site keeps staging awake.
//
// It reads what any visitor can already read with the public key (one event's
// id) and hands nothing back, so it needs no password of its own.
export async function GET(): Promise<Response> {
  const url = process.env['VITE_SUPABASE_URL'];
  const key = process.env['VITE_SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) return new Response('The Supabase settings are missing.', { status: 500 });
  const res = await fetch(`${url}/rest/v1/events?select=id&limit=1`, { headers: { apikey: key } });
  return new Response(null, { status: res.ok ? 204 : 502 });
}
