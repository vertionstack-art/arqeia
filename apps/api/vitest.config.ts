import { defineConfig } from 'vitest/config';

// Em desenvolvimento/testes, @traco/core é lido do código-fonte (condição "source").
export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'], externalConditions: ['source'] } },
});
