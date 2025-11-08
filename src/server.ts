import { app } from "./app";
import { PORT } from "./config";

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] Listening on http://localhost:${PORT}`);
});

