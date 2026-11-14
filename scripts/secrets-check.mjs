// Round-trips awkward passwords through this OS's real secure store
// (Windows Credential Manager / macOS Keychain / Secret Service). Run in CI on every OS.
import assert from 'node:assert/strict';

process.env.SHIFT_SECRETS_NAMESPACE = `check-${process.pid}`;
const { secureStoreInfo, saveSecret, loadSecret, deleteSecret } = await import('../lib/secrets.js');

const info = await secureStoreInfo();
console.log(`Secure store on ${process.platform}: ${info.name} — ${info.available ? 'available' : `unavailable (${info.reason})`}`);
if (!info.available) {
  assert.equal(process.platform, 'linux', `${info.name} should always be available on ${process.platform}`);
  console.log('Skipping round-trip (the app falls back to asking before saving in plain text).');
  process.exit(0);
}

const account = 'ci-test@example.com';
const samples = ['simple123', 'with spaces and "quotes" \'single\' `back` $(echo nope) %PATH% \\ ; | & <>', 'ünïcødé ✓ パスワード 🔑', 'x'.repeat(300)];
try {
  for (const pw of samples) {
    await saveSecret(account, pw);
    assert.equal(await loadSecret(account), pw, `round-trip failed for ${JSON.stringify(pw.slice(0, 20))}`);
  }
  await saveSecret(account, 'overwritten');
  assert.equal(await loadSecret(account), 'overwritten', 'overwrite failed');
  await deleteSecret(account);
  assert.equal(await loadSecret(account), null, 'delete failed');
  console.log(`✔ ${samples.length} passwords round-tripped through ${info.name}; overwrite and delete work`);
} finally {
  await deleteSecret(account);
}
