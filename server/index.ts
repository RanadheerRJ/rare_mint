import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { initDatabase } from './db';
import { seedDeveloperFromEnv } from './seed';
import { mountApi } from './routes';

async function bootstrap() {
  initDatabase();
  seedDeveloperFromEnv();

  const app = express();
  const httpServer = http.createServer(app);
  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  mountApi(app);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Rare Mint PWA listening on http://0.0.0.0:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start Rare Mint server:', err);
  process.exit(1);
});
