// Import / export code lists (Codes page).

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const KIND = { text: 'Text', csv: 'CSV', list: 'SHiFT Redeemer list file', json: 'JSON code feed' };
const MAX_BYTES = 1_500_000;

export function initLists({ api, toast, onImported, isLoggedIn }) {
  const PANELS = ['#pastePanel', '#importPanel', '#exportPanel'];
  const L = { filename: '', preview: null, ex: { which: 'working', format: 'txt' }, exData: null };

  function openPanel(sel) {
    PANELS.forEach((p) => ($(p).hidden = p !== sel));
    const el = $(sel);
    el.classList.remove('in');
    void el.offsetWidth;
    el.classList.add('in');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (sel === '#exportPanel') loadExport();
    if (sel === '#importPanel') setTimeout(() => $('#importText').focus(), 60);
  }
  const close = (sel) => ($(sel).hidden = true);

  // ---------------------------------------------------------------- import

  let previewTimer;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(preview, 250);
  }

  async function preview() {
    const text = $('#importText').value;
    const box = $('#importPreview');
    const go = $('#btnImportGo');
    if (!text.trim()) {
      box.hidden = true;
      go.disabled = true;
      L.preview = null;
      return;
    }
    try {
      const r = await api('POST', '/api/codes/import', { text, filename: L.filename, dryRun: true });
      L.preview = r;
      box.className = 'callout is-eridian';
      box.innerHTML = `<span class="co-ic" aria-hidden="true">⇩</span><div class="co-body"><b class="co-title">${r.found} code${r.found === 1 ? '' : 's'} found · ${r.fresh} new</b>${KIND[r.kind] || 'List'}${L.filename ? ` from <b>${esc(L.filename)}</b>` : ''}. ${r.known ? `${r.known} already in your library will just be updated.` : 'All of them are new to your library.'}
        <div class="chips import-sample">${r.sample.map((s) => `<span class="chip ${s.isNew ? 'all' : ''}" title="${esc(s.reward)}">${esc(s.code)}${s.isNew ? '' : ' · known'}</span>`).join('')}${r.found > r.sample.length ? `<span class="chip">+${r.found - r.sample.length} more</span>` : ''}</div></div>`;
      box.hidden = false;
      go.disabled = false;
      go.textContent = r.fresh ? `Import ${r.fresh} new code${r.fresh === 1 ? '' : 's'}` : 'Import (nothing new)';
    } catch (e) {
      L.preview = null;
      box.className = 'callout is-warn';
      box.innerHTML = `<span class="co-ic" aria-hidden="true">!</span><div class="co-body"><b class="co-title">Nothing to import</b>${esc(e.message)}</div>`;
      box.hidden = false;
      go.disabled = true;
      go.textContent = 'Import';
    }
  }

  async function readFile(file) {
    if (!file) return;
    if (file.size > MAX_BYTES) return toast('That file is too big for a code list (over 1.5 MB).', 'err');
    L.filename = file.name;
    $('#importText').value = await file.text();
    $('#importFileName').textContent = file.name;
    openPanel('#importPanel');
    preview();
  }

  async function doImport() {
    const text = $('#importText').value;
    const redeem = $('#importRedeem').checked && isLoggedIn();
    const btn = $('#btnImportGo');
    btn.disabled = true;
    try {
      const r = await api('POST', '/api/codes/import', { text, filename: L.filename, redeem });
      toast(`Imported ${r.found} code${r.found === 1 ? '' : 's'} (${r.fresh} new)${redeem ? '. Redeeming now…' : ''}`, 'ok');
      if ($('#importRedeem').checked && !isLoggedIn()) toast('Sign in on the Account page to redeem them.');
      resetImport();
      close('#importPanel');
      onImported();
    } catch (e) {
      toast(e.message, 'err');
      btn.disabled = false;
    }
  }

  function resetImport() {
    $('#importText').value = '';
    $('#importFile').value = '';
    $('#importFileName').textContent = '';
    $('#importPreview').hidden = true;
    $('#btnImportGo').disabled = true;
    $('#btnImportGo').textContent = 'Import';
    L.filename = '';
    L.preview = null;
  }

  // ---------------------------------------------------------------- export

  async function loadExport() {
    try {
      const r = await api('GET', `/api/codes/export?format=${L.ex.format}&which=${L.ex.which}`);
      L.exData = r;
      const lines = r.content.split('\n');
      $('#exPreview').textContent = lines.slice(0, 10).join('\n') + (lines.length > 11 ? '\n…' : '');
      $('#exCount').textContent = `${r.count} code${r.count === 1 ? '' : 's'} · ${r.filename}`;
      $('#btnExDownload').disabled = $('#btnExCopy').disabled = !r.count;
      $('#exHint').textContent = {
        txt: 'One code per line. Works with almost any tool, and is easy to paste into a chat.',
        csv: 'Opens in Excel or Google Sheets, with the reward, games, expiry and whether each code still works.',
        json: 'A SHiFT Redeemer list file. A friend can import it with everything kept, including expiry and which codes are dead.',
      }[L.ex.format];
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  function download() {
    const r = L.exData;
    if (!r) return;
    const url = URL.createObjectURL(new Blob([r.content], { type: r.mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = r.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Saved ${r.count} codes as ${r.filename}`, 'ok');
  }

  async function copy() {
    const r = L.exData;
    if (!r) return;
    try {
      await navigator.clipboard.writeText(r.content);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = r.content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(`Copied ${r.count} codes`, 'ok');
  }

  // ---------------------------------------------------------------- events

  $('#btnImportOpen').addEventListener('click', () => openPanel('#importPanel'));
  $('#btnExportOpen').addEventListener('click', () => openPanel('#exportPanel'));
  $('#btnImportClose').addEventListener('click', () => close('#importPanel'));
  $('#btnImportCancel').addEventListener('click', () => {
    resetImport();
    close('#importPanel');
  });
  $('#btnExportClose').addEventListener('click', () => close('#exportPanel'));
  $('#importText').addEventListener('input', () => {
    if (!$('#importText').value.trim()) L.filename = '';
    schedulePreview();
  });
  $('#importFile').addEventListener('change', (e) => readFile(e.target.files[0]));
  $('#btnImportGo').addEventListener('click', doImport);
  $('#btnExDownload').addEventListener('click', download);
  $('#btnExCopy').addEventListener('click', copy);
  for (const [id, key] of [['#exWhich', 'which'], ['#exFormat', 'format']]) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      L.ex[key] = b.dataset.v;
      $$(`${id} button`).forEach((x) => x.classList.toggle('on', x === b));
      loadExport();
    });
  }

  // Drag a file onto the drop zone, or anywhere on the Codes page.
  const zone = $('#importDrop');
  const isFileDrag = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  document.addEventListener('dragover', (e) => {
    if (!isFileDrag(e) || location.hash !== '#codes') return;
    e.preventDefault();
    zone.classList.add('over');
    if ($('#importPanel').hidden) openPanel('#importPanel');
  });
  document.addEventListener('dragleave', (e) => {
    if (e.target === zone || !e.relatedTarget) zone.classList.remove('over');
  });
  document.addEventListener('drop', (e) => {
    if (!isFileDrag(e) || location.hash !== '#codes') return;
    e.preventDefault();
    zone.classList.remove('over');
    readFile(e.dataTransfer.files[0]);
  });

  return { openImport: () => openPanel('#importPanel'), openExport: () => openPanel('#exportPanel'), openPaste: () => openPanel('#pastePanel') };
}
