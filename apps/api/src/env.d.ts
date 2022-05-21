declare namespace NodeJS {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  export interface ProcessEnv {
    DB_HOSTNAME: string;
    DB_NAME: string;
    DB_PASSWORD: string;
    DB_PORT: string;
    DB_USER: string;
    PORT: string;
  }
}
