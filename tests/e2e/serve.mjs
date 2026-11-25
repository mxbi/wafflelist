// Start the built app with a fresh, temporary data directory.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const build = path.resolve('build/index.js');
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'wafflelist-e2e-')));
await import(pathToFileURL(build).href);
