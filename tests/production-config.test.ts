import { describe, expect, it } from 'vitest';
import { ENV } from '../src/infrastructure/config/env.js';
import { assertProductionConfiguration } from '../src/infrastructure/config/productionGuard.js';

describe('production configuration guard', () => {
  it('does not block local test configuration', () => {
    expect(() => assertProductionConfiguration()).not.toThrow();
  });

  it('documents the fail-fast contract without mutating process env', () => {
    expect(ENV.OPENAI_TIMEOUT_MS).toBeGreaterThan(0);
    expect(ENV.OPENAI_MAX_ITERATIONS).toBeGreaterThan(0);
  });
});
