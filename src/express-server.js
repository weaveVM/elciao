import express from 'express';
import bodyParser from 'body-parser';
import log from './logger.js';
import { VerifyingProvider } from './provider.js';
import { getJSONRPCServer } from './json-rpc-server.js';

export function getExpressApp(provider) {
  const app = express();
  const server = getJSONRPCServer(provider);

  app.use(bodyParser.json({ limit: '100mb' }));

  app.use((_, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept',
    );
    next();
  });

  app.post('/', async (req, res) => {
    const jsonRPCRequest = req.body;
    server.receive(jsonRPCRequest).then(jsonRPCResponse => {
      if (jsonRPCResponse) {
        res.json(jsonRPCResponse);
      } else {
        res.sendStatus(204);
      }
    });
  });

  return app;
}

export async function startServer(provider, port) {
  const app = await getExpressApp(provider);
  app.listen(port);
  log.info(`RPC Server started at http://localhost:${port}`);
}
