import fs from 'node:fs';
import {constants} from 'node:buffer';

/** Acquire a regular file through one descriptor under a caller-specified byte limit.
 * @since 1.4.0
 * @param file Local input path.
 * @param maxBytes Maximum accepted file size, leaving room for a one-byte growth probe.
 * @returns The bytes read from the opened file.
 * @throws RangeError For an invalid limit or an input exceeding it.
 * @throws Error For filesystem errors, a nonregular input, or a size change observed during the read.
 */
export function readBoundedFile(file: string, maxBytes: number): Buffer {
  assertByteLimit(maxBytes);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  try {
    return readRegularFile(fd, maxBytes);
  } finally {
    fs.closeSync(fd);
  }
}

/** Read a complete regular file from offset zero without changing its descriptor position. */
export function readBoundedDescriptor(fd: number, maxBytes: number): Buffer {
  assertByteLimit(maxBytes);
  return readRegularFile(fd, maxBytes);
}

function assertByteLimit(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes >= constants.MAX_LENGTH) throw new RangeError('Invalid file byte limit');
}

function readRegularFile(fd: number, maxBytes: number): Buffer {
  const stat = fs.fstatSync(fd);
  if (!stat.isFile()) throw new TypeError('Expected a regular file');
  if (stat.size > maxBytes) throw new RangeError('File byte limit exceeded');
  const buffer = Buffer.alloc(stat.size + 1);
  let offset = 0;
  while (offset < buffer.length) {
    const count = fs.readSync(fd, buffer, offset, buffer.length - offset, offset);
    if (count === 0) break;
    offset += count;
  }
  if (offset !== stat.size) throw new Error('File size changed during the read');
  return buffer.subarray(0, offset);
}
