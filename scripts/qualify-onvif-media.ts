const mode = process.argv[5];

if (mode === '--baseline-batch' || mode === '--candidate-batch') {
  await import('./qualify-onvif-media-batch.js');
} else {
  await import('./qualify-onvif-media-single.js');
}
