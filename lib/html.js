// Tiny, dependency-free HTML helpers. They only need to understand the handful of
// structures the SHiFT site and code-source pages use, so regexes are enough.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function stripTags(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

export function parseAttrs(str) {
  const attrs = {};
  const rx = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const m of String(str || '').matchAll(rx)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

export function findMeta(html, name) {
  for (const m of String(html || '').matchAll(/<meta\b([^>]*)>/gi)) {
    const a = parseAttrs(m[1]);
    if (a.name === name) return a.content ?? null;
  }
  return null;
}

/** Find the first element (div by default) matching a predicate on its attrs. */
export function findElement(html, predicate, tag = 'div') {
  const rx = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  for (const m of String(html || '').matchAll(rx)) {
    const attrs = parseAttrs(m[1]);
    if (predicate(attrs)) return { attrs, inner: m[2], text: stripTags(m[2]) };
  }
  return null;
}

export const hasClass = (attrs, cls) => (attrs.class || '').split(/\s+/).includes(cls);

/**
 * Parse the HTML fragment returned by /entitlement_offer_codes into one offer per
 * redemption form: { title, service, buttonLabel, formData }.
 * Each form is assigned to the nearest heading that precedes it.
 */
export function parseOffers(html) {
  const src = String(html || '');
  const headings = [...src.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({
    index: m.index,
    text: stripTags(m[2]),
  }));
  const offers = [];
  for (const m of src.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const fa = parseAttrs(m[1]);
    const isRedemption =
      /code_redemptions/.test(fa.action || '') || /archway_code_redemption/.test(`${fa.id || ''} ${fa.class || ''}`);
    if (!isRedemption) continue;
    const formData = {};
    let buttonLabel = '';
    for (const im of m[2].matchAll(/<(input|button)\b([^>]*)>/gi)) {
      const a = parseAttrs(im[2]);
      if (a.name) formData[a.name] = a.value ?? '';
      if ((a.type === 'submit' || im[1].toLowerCase() === 'button') && a.value) buttonLabel = a.value;
    }
    const service = formData['archway_code_redemption[service]'] || '';
    let title = '';
    for (const h of headings) if (h.index < m.index) title = h.text;
    offers.push({ title, service, buttonLabel, formData });
  }
  return offers;
}

/** Return all absolute links in a page whose href matches `pattern`. */
export function findLinks(html, baseUrl, pattern) {
  const rx = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
  const out = new Set();
  for (const m of String(html || '').matchAll(/<a\b([^>]*)>/gi)) {
    const { href } = parseAttrs(m[1]);
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
    try {
      const abs = new URL(href, baseUrl).toString().replace(/#.*$/, '');
      if (rx.test(abs)) out.add(abs);
    } catch {
      /* ignore malformed */
    }
  }
  return [...out];
}
