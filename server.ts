import { config } from './server/config.ts';
import { initDb, log } from './server/db.ts';
import { buildProviders } from './server/integrations/index.ts';
import { createContentGenerator } from './server/ai.ts';
import { Autopilot } from './server/autopilot.ts';
import { createApp, attachFrontend } from './server/app.ts';
import { isDemoMode } from './server/config.ts';

initDb();
const autopilot = new Autopilot(buildProviders(), createContentGenerator());
const app = createApp(autopilot);
await attachFrontend(app);

app.listen(config.port, () => {
  console.log(`AutoDrop AI em http://localhost:${config.port}${isDemoMode() ? ' (MODO DEMONSTRAÇÃO)' : ''}`);
  if (!config.adminToken) console.warn('AVISO: ADMIN_TOKEN não definido; o painel está sem senha.');
  log('info', 'sistema', `Servidor iniciado${isDemoMode() ? ' em modo demonstração' : ''}`);
  autopilot.start();
});
