// SHiFT website client. Mirrors what the browser does on
// https://shift.gearboxsoftware.com/rewards when you type a code and press CHECK,
// then press "Redeem for <platform>".

import { findMeta, findElement, hasClass, parseOffers, stripTags } from './html.js';
import { resolveTitle, resolvePlatform } from './catalog.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function splitSetCookie(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]*)/g).map((s) => s.trim());
}

export class CookieJar {
  constructor(cookies = {}) {
    this.cookies = { ...cookies };
  }
  absorb(headers) {
    const list = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : splitSetCookie(headers.get('set-cookie'));
    for (const sc of list) {
      const [pair, ...attrs] = sc.split(';');
      const eq = pair.indexOf('=');
      if (eq < 1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      let expired = value === '' || value === 'deleted';
      for (const a of attrs) {
        const i = a.indexOf('=');
        const k = (i < 0 ? a : a.slice(0, i)).trim().toLowerCase();
        const v = i < 0 ? '' : a.slice(i + 1).trim();
        if (k === 'max-age' && Number(v) <= 0) expired = true;
        if (k === 'expires' && v && Date.parse(v) < Date.now()) expired = true;
      }
      if (expired) delete this.cookies[name];
      else this.cookies[name] = value;
    }
  }
  header() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
  get size() {
    return Object.keys(this.cookies).length;
  }
}

/** Parse what a user pasted from their browser into a cookie map. */
export function parseCookieInput(input) {
  let s = String(input || '').trim();
  s = s.replace(/^cookie:\s*/i, '');
  if (!s) return {};
  if (!s.includes('=')) return { si: s }; // bare value of the `si` session cookie
  const out = {};
  for (const part of s.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

/** Turn a SHiFT status message into a normalized status. */
export function classifyMessage(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return 'none';
  if (t.includes('launch a shift-enabled') || t.includes('to continue to redeem')) return 'trylater';
  if (t.includes('too many') || t.includes('slow down') || t.includes('rate limit')) return 'slowdown';
  if (t.includes('expired')) return 'expired';
  if (t.includes('already been redeemed') || t.includes('already redeemed') || t.includes('been redeemed')) return 'redeemed';
  if (t.includes('success')) return 'success';
  if (t.includes('failed')) return 'redeemed';
  if (t.includes('does not exist') || t.includes('not a valid') || t.includes('invalid')) return 'invalid';
  if (t.includes('not available')) return 'unavailable';
  return 'none';
}

export class ShiftClient {
  constructor({ baseUrl = 'https://shift.gearboxsoftware.com', cookies = {}, onCookies = () => {} } = {}) {
    this.base = baseUrl.replace(/\/+$/, '');
    this.jar = new CookieJar(cookies);
    this.onCookies = onCookies;
    this.token = null;
    this.tokenAt = 0;
  }

  setCookies(cookies) {
    this.jar = new CookieJar(cookies);
    this.token = null;
    this.onCookies(this.jar.cookies);
  }

  async request(path, { method = 'GET', headers = {}, form, follow = true } = {}) {
    let url = new URL(path, this.base + '/').toString();
    let body;
    const h = { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', ...headers };
    if (form) {
      body = new URLSearchParams(form).toString();
      h['content-type'] = 'application/x-www-form-urlencoded';
      h.origin = this.base;
    }
    for (let hop = 0; ; hop++) {
      const cookie = this.jar.header();
      const res = await fetch(url, {
        method,
        headers: cookie ? { ...h, cookie } : h,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
      const before = this.jar.header();
      this.jar.absorb(res.headers);
      if (this.jar.header() !== before) this.onCookies(this.jar.cookies);
      const loc = res.headers.get('location');
      const location = loc ? new URL(loc, url).toString() : null;
      if (follow && location && res.status >= 300 && res.status < 400 && hop < 10) {
        await res.arrayBuffer().catch(() => {});
        if (res.status !== 307 && res.status !== 308) {
          method = 'GET';
          body = undefined;
          delete h['content-type'];
          delete h.origin;
        }
        url = location;
        continue;
      }
      const text = await res.text();
      return { status: res.status, url, text, location, headers: res.headers };
    }
  }

  // ---------------------------------------------------------------- account

  /** Returns { loggedIn, token } by loading the rewards page. */
  async checkLogin() {
    if (!this.jar.size) return { loggedIn: false };
    const r = await this.request('/rewards');
    const loggedIn = r.status === 200 && !new URL(r.url).pathname.startsWith('/home') && /sign\s*out/i.test(r.text);
    const token = findMeta(r.text, 'csrf-token');
    if (loggedIn && token) {
      this.token = token;
      this.tokenAt = Date.now();
    }
    return { loggedIn, token };
  }

  async login(email, password) {
    this.setCookies({});
    const home = await this.request('/home');
    const token = findMeta(home.text, 'csrf-token');
    if (!token) throw new Error(`Could not load the SHiFT sign-in page (HTTP ${home.status}).`);
    await this.request('/sessions', {
      method: 'POST',
      headers: { referer: `${this.base}/home` },
      form: { utf8: '✓', authenticity_token: token, 'user[email]': email, 'user[password]': password },
    });
    const { loggedIn } = await this.checkLogin();
    if (!loggedIn) throw new Error('SHiFT did not accept those credentials (or asked for extra verification).');
    return true;
  }

  async getToken(force = false) {
    if (!force && this.token && Date.now() - this.tokenAt < 10 * 60_000) return this.token;
    const r = await this.request('/rewards');
    if (r.status === 429) return { slowdown: true };
    const token = findMeta(r.text, 'csrf-token');
    if (!token || !/sign\s*out/i.test(r.text)) return null;
    this.token = token;
    this.tokenAt = Date.now();
    return token;
  }

  // ---------------------------------------------------------------- codes

  /**
   * Check a code. Returns
   *   { status: 'ok', offers: [{ title, titleId, service, platformId, formData }] }
   * or { status: 'expired'|'invalid'|'redeemed'|'unavailable'|'slowdown'|'auth'|'error', message }
   */
  async checkCode(code) {
    const token = await this.getToken();
    if (token && token.slowdown) return { status: 'slowdown', message: 'SHiFT rate limit (429)' };
    if (!token) return { status: 'auth', message: 'Not signed in to SHiFT' };
    const r = await this.request(`/entitlement_offer_codes?code=${encodeURIComponent(code)}`, {
      headers: { 'x-csrf-token': token, 'x-requested-with': 'XMLHttpRequest', referer: `${this.base}/rewards` },
      follow: false,
    });
    if (r.status === 429) return { status: 'slowdown', message: 'SHiFT rate limit (429)' };
    if (r.status === 401 || r.status === 403 || (r.status >= 300 && r.status < 400)) {
      this.token = null;
      return { status: 'auth', message: `Session rejected (HTTP ${r.status})` };
    }
    if (r.status >= 500) return { status: 'invalid', message: `SHiFT rejected the code (HTTP ${r.status})` };
    if (r.status !== 200) return { status: 'error', message: `Unexpected HTTP ${r.status}` };

    const offers = parseOffers(r.text).map((o) => ({
      ...o,
      titleId: resolveTitle(o.title),
      platformId: resolvePlatform(o.service),
    }));
    if (offers.length) return { status: 'ok', offers, message: `${offers.length} redemption option(s)` };

    const message = stripTags(r.text).slice(0, 300) || 'Empty response';
    const status = classifyMessage(message);
    return { status: status === 'none' || status === 'success' ? 'error' : status, message };
  }

  /** Submit one redemption form. Returns { status, message }. */
  async redeemOffer(formData) {
    let r = await this.request('/code_redemptions', {
      method: 'POST',
      form: formData,
      headers: { referer: `${this.base}/rewards` },
      follow: false,
    });
    if (r.status === 429) return { status: 'slowdown', message: 'SHiFT rate limit (429)' };

    let visitedRedemption = false;
    for (let hop = 0; hop < 12; hop++) {
      if (r.status >= 300 && r.status < 400 && r.location) {
        if (r.location.includes('/code_redemptions/')) {
          visitedRedemption = true;
          const res = await this.pollJson(r.location, r.location);
          if (res) return res;
          r = await this.request(r.location, { follow: false });
          continue;
        }
        if (/\/home(\?|$)/.test(new URL(r.location).pathname)) return { status: 'auth', message: 'Session expired during redemption' };
        r = await this.request(r.location, { follow: false });
        continue;
      }
      if (r.status === 429) return { status: 'slowdown', message: 'SHiFT rate limit (429)' };

      const pending = findElement(r.text, (a) => a.id === 'check_redemption_status');
      const notice = pending || findElement(r.text, (a) => hasClass(a, 'alert') && (hasClass(a, 'notice') || hasClass(a, 'alert-notice')));
      if (pending && pending.attrs['data-url']) {
        const token = findMeta(r.text, 'csrf-token') || this.token || '';
        const res = await this.pollJson(new URL(pending.attrs['data-url'], this.base + '/').toString(), `${this.base}/rewards`, token);
        if (res) return res;
        const fb = pending.attrs['data-fallback-url'];
        if (fb) {
          r = await this.request(new URL(fb, this.base + '/').toString(), { follow: false });
          continue;
        }
      }
      if (notice && notice.text) {
        const st = classifyMessage(notice.text);
        if (st !== 'none') return { status: st, message: notice.text };
      }
      break;
    }
    // SHiFT no longer always explains itself; mirror autoshift's interpretation.
    return visitedRedemption
      ? { status: 'redeemed', message: 'Redemption processed (no confirmation text from SHiFT)' }
      : { status: 'trylater', message: 'SHiFT did not process the redemption — launch a SHiFT-enabled game, then retry' };
  }

  async pollJson(url, referer, token) {
    for (let i = 0; i < 20; i++) {
      const r = await this.request(url, {
        follow: false,
        headers: {
          accept: 'application/json',
          'x-requested-with': 'XMLHttpRequest',
          referer,
          ...(token ? { 'x-csrf-token': token } : {}),
        },
      });
      if (r.status === 429) return { status: 'slowdown', message: 'SHiFT rate limit (429)' };
      let data;
      try {
        data = JSON.parse(r.text);
      } catch {
        return null;
      }
      if (data && data.in_progress) {
        await sleep(700);
        continue;
      }
      if (data && typeof data.text === 'string') {
        const st = classifyMessage(data.text);
        return { status: st === 'none' ? 'error' : st, message: data.text };
      }
      await sleep(700);
    }
    return null;
  }
}
