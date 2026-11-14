// A stand-in for shift.gearboxsoftware.com used by the tests. It mimics the
// endpoints and HTML shapes the real site uses for sign-in, code checks and
// redemptions (including the async status polling and "launch a game" block).

import http from 'node:http';

export const CODES = {
  'AAAAA-AAAAA-AAAAA-AAAAA-AAAA1': { expired: true },
  'BBBBB-BBBBB-BBBBB-BBBBB-BBBB1': { missing: true },
  // multi-game code
  'CCCCC-CCCCC-CCCCC-CCCCC-CCCC1': { titles: ['Borderlands 3', 'Borderlands 2'], services: ['steam', 'epic'] },
  'DDDDD-DDDDD-DDDDD-DDDDD-DDDD1': { titles: ['Borderlands 4'], services: ['steam', 'psn'] },
  'EEEEE-EEEEE-EEEEE-EEEEE-EEEE1': { titles: ["Tiny Tina's Wonderlands"], services: ['steam'] },
  'FFFFF-FFFFF-FFFFF-FFFFF-FFFF1': { titles: ['Borderlands: Game of the Year Edition', 'Some Future Game'], services: ['steam'] },
};

export function startMock({ port = 0, email = 'vault@hunter.test', password = 'hunter2', launchAfter = Infinity } = {}) {
  const sessions = new Set();
  const redeemed = new Set();
  const jobs = new Map();
  let redemptionsSinceLaunch = 0;
  const stats = { checks: 0, posts: 0 };

  const cookieOf = (req) => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((p) => p.split('=')));
  const authed = (req) => sessions.has(cookieOf(req).si);
  const page = (body, { token = 'csrf-tok', signedIn = false } = {}) =>
    `<!doctype html><html><head><meta name="csrf-param" content="authenticity_token"><meta name="csrf-token" content="${token}"></head><body>${signedIn ? '<a href="/logout">Sign Out</a>' : '<a href="/home">Sign In</a>'}${body}</body></html>`;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    let body = '';
    for await (const c of req) body += c;
    const form = Object.fromEntries(new URLSearchParams(body));

    if (url.pathname === '/home') {
      res.writeHead(200, { 'set-cookie': '_session_id=anon; path=/', 'content-type': 'text/html' });
      return res.end(page('<form action="/sessions"></form>'));
    }
    if (url.pathname === '/sessions' && req.method === 'POST') {
      if (form.authenticity_token !== 'csrf-tok') return res.writeHead(422).end('bad token');
      if (form['user[email]'] === email && form['user[password]'] === password) {
        const sid = `s${Math.random().toString(36).slice(2)}`;
        sessions.add(sid);
        res.writeHead(302, { location: '/account', 'set-cookie': [`si=${sid}; path=/; HttpOnly`, '_session_id=; Max-Age=0; path=/'] });
        return res.end();
      }
      res.writeHead(302, { location: '/home?error=1' });
      return res.end();
    }
    if (url.pathname === '/account' || url.pathname === '/rewards') {
      if (!authed(req)) {
        res.writeHead(302, { location: '/home' });
        return res.end();
      }
      const notice = url.searchParams.get('notice');
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(page(`<h1>My Rewards</h1>${notice ? `<div class="alert notice"><p>${notice}</p></div>` : ''}`, { signedIn: true }));
    }
    if (url.pathname === '/entitlement_offer_codes') {
      stats.checks++;
      if (!authed(req) || req.headers['x-csrf-token'] !== 'csrf-tok') return res.writeHead(401).end();
      const code = url.searchParams.get('code');
      const c = CODES[code];
      res.writeHead(200, { 'content-type': 'text/html' });
      if (!c || c.missing) return res.end('This SHiFT code does not exist');
      if (c.expired) return res.end('This SHiFT code has expired');
      let html = '';
      for (const t of c.titles) {
        html += `<h2>${t.replace("'", '&#39;')}</h2>`;
        for (const s of c.services) {
          html += `<form class="new_archway_code_redemption" id="new_archway_code_redemption" action="/code_redemptions" accept-charset="UTF-8" method="post">
            <input name="utf8" type="hidden" value="&#x2713;"><input type="hidden" name="authenticity_token" value="csrf-tok">
            <input value="${code}" type="hidden" name="archway_code_redemption[code]" id="archway_code_redemption_code">
            <input value="chk-${t.replace(/\W/g, "")}" type="hidden" name="archway_code_redemption[check]" id="archway_code_redemption_check">
            <input value="${s}" type="hidden" name="archway_code_redemption[service]" id="archway_code_redemption_service">
            <input type="submit" name="commit" value="Redeem for ${s}" class="submit_button redeem_button"></form>`;
        }
      }
      return res.end(html);
    }
    if (url.pathname === '/code_redemptions' && req.method === 'POST') {
      stats.posts++;
      if (!authed(req)) return res.writeHead(302, { location: '/home' }).end();
      if (form.authenticity_token !== 'csrf-tok') return res.writeHead(422).end();
      if (redemptionsSinceLaunch >= launchAfter) {
        res.writeHead(302, { location: `/rewards?notice=${encodeURIComponent('To continue to redeem SHiFT codes, please launch a SHiFT-enabled title first!')}` });
        return res.end();
      }
      const key = `${form['archway_code_redemption[code]']}|${form['archway_code_redemption[check]']}|${form['archway_code_redemption[service]']}`;
      const id = Math.random().toString(36).slice(2, 10);
      jobs.set(id, { key, polls: 0 });
      res.writeHead(302, { location: `/code_redemptions/${id}` });
      return res.end();
    }
    const m = url.pathname.match(/^\/code_redemptions\/(\w+)$/);
    if (m) {
      const job = jobs.get(m[1]);
      if (!job) return res.writeHead(404).end();
      res.writeHead(200, { 'content-type': 'application/json' });
      if (job.polls++ < 1) return res.end(JSON.stringify({ in_progress: true }));
      if (redeemed.has(job.key)) return res.end(JSON.stringify({ text: 'Failed to redeem your SHiFT code. This SHiFT code has already been redeemed' }));
      redeemed.add(job.key);
      redemptionsSinceLaunch++;
      return res.end(JSON.stringify({ text: 'Your code was successfully redeemed' }));
    }
    res.writeHead(404).end('nope');
  });

  return new Promise((resolve) =>
    server.listen(port, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        server,
        redeemed,
        stats,
        launchGame: () => (redemptionsSinceLaunch = 0),
        setLaunchAfter: (n) => (launchAfter = n),
        close: () => new Promise((r) => server.close(r)),
      }),
    ),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = await startMock({ port: Number(process.env.MOCK_PORT) || 4999, launchAfter: process.env.MOCK_LAUNCH_AFTER ? Number(process.env.MOCK_LAUNCH_AFTER) : Infinity });
  console.log(`Mock SHiFT running at ${m.url} (login: vault@hunter.test / hunter2)`);
}
