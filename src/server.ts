import express from 'express';
import 'dotenv/config';
import swaggerUi from 'swagger-ui-express';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - resolveJsonModule enabled
import apiSpec from './docs/openapi.json';
import { openPaymentsRouter } from './interfaces/http/routes/openPayments';

const app = express();
app.use(express.json());

// Docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(apiSpec));
app.get('/docs-json', (_req, res) => res.json(apiSpec));

// Routes
app.use(openPaymentsRouter);

const { PORT = '3000' } = process.env;
app.listen(Number(PORT), () => {
  console.log(`Open Payments Split (TS) on :${PORT}`);
});

