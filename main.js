// Entry point of the packaged app. Started with "--apply-update <job>", this copy of the app acts as
// the small Windows update helper (see lib/apply-update.js); otherwise it is the app itself.

const i = process.argv.indexOf('--apply-update');
if (i !== -1) {
  import('./lib/apply-update.js')
    .then((m) => m.run(process.argv[i + 1]))
    .then(
      () => process.exit(0),
      () => process.exit(1),
    );
} else {
  import('./server.js');
}
