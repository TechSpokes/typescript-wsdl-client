/** Test-only descendants used to verify owned cancellation and deadline cleanup. */
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';

const mode = process.argv[2], marker = process.argv[3];
if (mode === 'success') {
  process.stdout.write('owned stdout'); process.stderr.write('owned stderr');
} else if (mode === 'overflow') {
  process.stdout.write('x'.repeat(4096));
  setInterval(() => undefined, 1000);
} else if ((mode === 'tree' || mode === 'early-exit') && marker) {
  const child = spawn(process.execPath, ['--import', new URL('./ownedParentGuard.ts', import.meta.url).href,
    process.argv[1], 'server', marker], {stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true});
  if (mode === 'early-exit') child.once('message', () => setTimeout(() => process.exit(7), 250));
  else setInterval(() => undefined, 1000);
} else if (mode === 'server' && marker) {
  const server = createServer((_request, response) => {
    response.writeHead(200, {'content-type': 'application/json'});
    response.end(JSON.stringify({kind: 'owned-process-fixture', pid: process.pid, marker}));
    if (process.connected) process.send?.('probed');
  });
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture address');
    writeFileSync(marker, JSON.stringify({pid: process.pid, port: address.port}));
  });
} else throw new Error('Unknown owned-process fixture mode');
