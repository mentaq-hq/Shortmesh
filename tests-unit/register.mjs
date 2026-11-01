import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./tests-unit/ts-loader.mjs', pathToFileURL('./'));
