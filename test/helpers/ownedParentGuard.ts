/** Test-only listener lifetime guard, preloaded into an IPC-connected owned child. */
if (!process.connected) throw new Error('Owned listener requires its parent IPC connection');
process.once('disconnect', () => process.exit(1));
process.channel?.unref();
