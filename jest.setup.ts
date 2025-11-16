// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// --- ADD THIS SECTION ---

// Polyfill for TextEncoder/TextDecoder (required by 'typesense' and other libs in Jest)
import { TextEncoder, TextDecoder } from 'util';
Object.assign(global, {
  TextEncoder: TextEncoder,
  TextDecoder: TextDecoder,
});

// Polyfill for fetch, Request, Response, etc. (Fixes 'Request is not defined')
import 'whatwg-fetch';

// --- END ADDED SECTION ---