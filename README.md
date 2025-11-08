# Backend Node.js — Arquitectura Limpia con Express + TypeScript

Proyecto backend HTTP en Node.js usando Express y TypeScript, con arquitectura limpia y capas separadas. Incluye una API funcional de `todos` (CRUD en memoria) y un endpoint de `health`.

## Requisitos

- Node.js >= 18

## Estructura

```
.
├─ package.json
├─ tsconfig.json
├─ README.md
├─ src/
│  ├─ server.ts                  # Punto de arranque del servidor
│  ├─ app.ts                     # Composición de capas (Express + casos de uso)
│  ├─ config/
│  │  └─ index.ts                # Configuración (puerto, entorno)
│  ├─ core/
│  │  ├─ entities/
│  │  │  └─ todo.ts             # Entidad de dominio (tipo + helper)
│  │  ├─ ports/
│  │  │  └─ TodoRepository.ts   # Contrato del repositorio
│  │  └─ use-cases/             # Casos de uso del dominio
│  │     ├─ createTodo.ts
│  │     ├─ listTodos.ts
│  │     ├─ getTodo.ts
│  │     ├─ updateTodo.ts
│  │     └─ deleteTodo.ts
│  ├─ infrastructure/
│  │  └─ repositories/
│  │     └─ inMemoryTodoRepository.ts  # Implementación del repositorio en memoria
│  └─ interfaces/
│     └─ http/
│        └─ controllers/
│           ├─ healthController.ts
│           └─ todoController.ts
└─ .gitignore
```

## Cómo correrlo

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Desarrollo (TS en vivo):

   ```bash
   npm run dev
   ```

3. Producción:

   ```bash
   npm run build
   npm start
   ```

4. Cambiar puerto (ejemplos):

   - PowerShell (Windows):
     ```powershell
     $env:PORT=4000; npm run dev
     ```
   - Linux/macOS (bash/zsh):
     ```bash
     PORT=4000 npm run dev
     ```

Verás en consola:

```
[server] Listening on http://localhost:3000
```

### Variables de entorno útiles

- `PORT`: puerto del servidor (default `3000`).
- `LOG_FORMAT`: formato de logs de morgan. Valores comunes: `dev` (por defecto), `combined`, `common`, `short`, `tiny`.
  - PowerShell: `$env:LOG_FORMAT='combined'; npm run dev`
  - bash/zsh: `LOG_FORMAT=combined npm run dev`

### Documentación (Swagger UI)

- UI: abrir `http://localhost:3000/docs`
- JSON: `http://localhost:3000/docs-json`

## API

- Salud
  - `GET /health` → `200 { status: "ok", uptime: <number> }`

- Todos (en memoria)
  - `GET /todos` → Lista todos.
  - `GET /todos/:id` → Obtiene uno.
  - `POST /todos` → Crea uno. Body JSON: `{ "title": string, "completed": boolean? }`.
  - `PUT /todos/:id` → Actualiza título y/o estado. Body JSON parcial.
  - `DELETE /todos/:id` → Elimina.

### Ejemplos con curl

```bash
# Crear
curl -s -X POST http://localhost:3000/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"Primera tarea"}'

# Listar
curl -s http://localhost:3000/todos

# Obtener por id
curl -s http://localhost:3000/todos/1

# Actualizar
curl -s -X PUT http://localhost:3000/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'

# Eliminar
curl -i -X DELETE http://localhost:3000/todos/1
```

## Notas de arquitectura

- `core` contiene la lógica de dominio (casos de uso, entidades) y no conoce detalles de infraestructura.
- `infrastructure` implementa contratos (p. ej., repositorios). Aquí es en memoria, pero podrías reemplazar por base de datos.
- `interfaces/http/controllers` contiene los controladores Express que adaptan HTTP al dominio.
- `app.ts` crea la aplicación Express, configura middlewares (CORS, JSON, logs morgan) y registra rutas.

La lógica de dominio se mantiene independiente; puedes cambiar la infraestructura o el framework HTTP sin modificar casos de uso.

## ¿Qué es morgan?

`morgan` es un middleware de logging para Express que registra cada petición HTTP (método, URL, estado, tiempo de respuesta, etc.).
Sirve para depurar en desarrollo y observar el tráfico en producción. El formato se controla con la variable `LOG_FORMAT`.
