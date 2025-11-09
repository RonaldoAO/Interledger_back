# Interledger Hackathon 2025 CDMX - VibePayments

Backend HTTP en Node.js (Express + TypeScript) para habilitar flujos de pago sobre Open Payments: split checkout (comercio + plataforma), group checkout (varios pagadores) y un comparador de FX (ILP vs mercado).

Este proyecto se desarrolló pensando en empresas que necesitan mejorar su logística de pagos. Identificamos un área de oportunidad en el turismo en México (reservas, tours compartidos, comisiones de plataforma y operaciones multi-divisa); desde ahí nació la idea: facilitar cobros divididos y comparar costos de conversión de forma simple y transparente.

## Funcionalidades

- Split checkout: divide un pago entre el comercio y una comisión de plataforma en una sola experiencia de compra.
- Callback OP: finaliza los pagos luego del consentimiento del usuario (via Open Payments interactivo).
- Group checkout: reparte una cuenta total entre múltiples pagadores y genera redirecciones individuales para completar el pago.
- FX compare: compara la tasa efectiva de ILP frente a tasas de mercado para pagos cross-currency.

## Endpoints principales

- POST `/api/split/checkout`
  - Inicializa un split (cliente → comercio + plataforma). Requiere `customerAddress`, `merchantAddress` y `amountMinor` (enteros en unidades menores). Responde con `redirectUrl` y `nonce`.
- GET `/api/op/callback`
  - Callback tras el consentimiento del usuario. Requiere `interact_ref` y `nonce`. Crea los outgoing payments y devuelve su resultado.
- POST `/api/split/group-checkout`
  - Inicializa un flujo donde varios pagadores cubren un total para un mismo comercio. Requiere `merchantAddress`, `totalAmountMinor` y arreglo de `payers`.
- POST `/api/fx/compare`
  - Compara la tasa ILP vs mercado para enviar un monto fijo (p. ej. 100 unidades mayores) desde `from` hacia `to` (códigos de divisa).

La documentación interactiva está disponible en `http://localhost:3000/docs` y el JSON en `http://localhost:3000/docs-json`.

## Setup rápido

1) Instalar dependencias

   npm install

2) Configurar variables de entorno (ver `.env` de ejemplo)

- `OP_PLATFORM_WALLET_ADDRESS`: wallet address de la plataforma.
- `OP_CLIENT_KEY_ID`: ID de la clave (Developer Keys).
- `OP_PRIVATE_KEY_PEM`: ruta o contenido PEM de la clave privada.
- `BASE_URL`: URL pública donde este backend recibe el callback.
- `PORT`: puerto (por defecto 3000).

3) Ejecutar en desarrollo

   npm run dev

4) Compilar y ejecutar en producción

   npm run build
   npm start

Verás en consola: `Open Payments Split (TS) on :3000`.

## Notas

- Se eliminaron los endpoints y el código de la API de "todos" para enfocar el proyecto en pagos y FX.
- CORS está habilitado para facilitar pruebas; en producción limita el origen a tu dominio.
