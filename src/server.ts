import express from 'express';
import 'dotenv/config';
import swaggerUi from 'swagger-ui-express';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - resolveJsonModule enabled
import apiSpec from './docs/openapi.json';
import { openPaymentsRouter } from './interfaces/http/routes/openPayments';
import { fxRouter } from './interfaces/http/routes/fx';

const app = express();
app.use(express.json());

/* 🧠 Mueve este bloque aquí (ANTES de cualquier ruta) */
app.use((req, res, next) => {
  // Permisivo para pruebas; en prod pon tus orígenes explícitos
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Refleja el método solicitado en el preflight y también lista todos
  const reqMethod = req.headers['access-control-request-method'];
  const allowMethods = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
  res.setHeader('Access-Control-Allow-Methods', reqMethod ? `${reqMethod},OPTIONS` : allowMethods);

  // Refleja los headers solicitados (o usa una lista conocida)
  const reqHeaders = req.headers['access-control-request-headers'];
  res.setHeader('Access-Control-Allow-Headers', reqHeaders || 'Content-Type, Authorization');

  // (Opcional) cachea el preflight
  res.setHeader('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});


/* Docs */
app.use('/docs', swaggerUi.serve, swaggerUi.setup(apiSpec));
app.get('/docs-json', (_req, res) => res.json(apiSpec));

/* Routes */
app.use(openPaymentsRouter);
app.use(fxRouter);

const { PORT = '3000' } = process.env;
app.listen(Number(PORT), () => {
  console.log(`Open Payments Split (TS) on :${PORT}`);
});
