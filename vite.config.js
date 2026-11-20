import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Runs the /api/* Vercel functions inside the Vite dev & preview servers, so
// `npm run dev` behaves like production. Secrets (no VITE_ prefix) stay server-side.
const ROUTES = ['panorama', 'reve', 'story', 'media', 'shared'];

function apiRoutes(mode) {
  const mount = (server, ssrLoad) => {
    Object.assign(process.env, loadEnv(mode, process.cwd(), ['BLOCKADE_', 'ANTHROPIC_', 'OPENAI_', 'PEXELS_', 'SUPABASE_']));
    for (const name of ROUTES) {
      server.middlewares.use(`/api/${name}`, async (req, res) => {
        req.url = req.originalUrl || req.url; // keep the query string for the handler
        const mod = ssrLoad ? await ssrLoad(`/api/${name}.js`) : await import(`./api/${name}.js`);
        return mod.default(req, res);
      });
    }
  };
  return {
    name: 'vercel-api-routes',
    configureServer(server) {
      mount(server, (p) => server.ssrLoadModule(p));
    },
    configurePreviewServer(server) {
      mount(server);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), apiRoutes(mode)],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
}));
