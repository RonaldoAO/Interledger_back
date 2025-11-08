declare namespace NodeJS {
  interface ProcessEnv {
    OP_PLATFORM_WALLET_ADDRESS: string;   // p.ej. https://coolwallet.example.com/platform
    OP_CLIENT_KEY_ID: string;             // keyId obtenido del wallet (Developer Keys)
    OP_PRIVATE_KEY_PEM: string;           // PEM de tu clave privada
    BASE_URL: string;                     // URL pública de este servidor (para callback)
    PORT?: string;
  }
}
