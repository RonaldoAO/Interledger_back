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
  res.header('Access-Control-Allow-Origin', '*'); // o 'http://localhost:8080'
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204); // <- esto resuelve el preflight
  }
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
