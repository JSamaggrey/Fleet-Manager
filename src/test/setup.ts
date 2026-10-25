import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Pages load several local queries; under a full parallel run the 1 s default is too tight.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});
