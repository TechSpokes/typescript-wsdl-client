import fs from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {readBoundedFile} from '../../src/util/readBoundedFile.js';

describe('bounded inspection input acquisition', () => {
  let directory: string, file: string;

  beforeEach(() => {
    const parent = path.resolve('tmp/test-generation');
    fs.mkdirSync(parent, {recursive: true});
    directory = fs.mkdtempSync(path.join(parent, 'bounded-file-'));
    file = path.join(directory, 'captured.bin');
    fs.writeFileSync(file, Buffer.from([0, 127, 255]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(directory, {recursive: true, force: true});
  });

  it('accepts an exact byte limit and refuses a file one byte over', () => {
    expect(readBoundedFile(file, 3)).toEqual(Buffer.from([0, 127, 255]));
    expect(() => readBoundedFile(file, 2)).toThrow(RangeError);
    expect(() => readBoundedFile(directory, 3)).toThrow();
  });

  it.each(['growth', 'truncation'])('refuses observed %s and closes its descriptor', change => {
    const originalStat = fs.fstatSync;
    let opened: number | undefined;
    vi.spyOn(fs, 'fstatSync').mockImplementationOnce(fd => {
      opened = fd;
      const stat = originalStat(fd);
      if (change === 'growth') fs.appendFileSync(file, Buffer.alloc(8192));
      else fs.truncateSync(file, 2);
      return stat;
    });
    const read = vi.spyOn(fs, 'readSync');
    expect(() => readBoundedFile(file, 3)).toThrow('File size changed during the read');
    expect(read.mock.calls[0]!.slice(2, 4)).toEqual([0, 4]);
    expect(opened).toBeDefined();
    expect(() => originalStat(opened!)).toThrow(expect.objectContaining({code: 'EBADF'}));
  });
});
