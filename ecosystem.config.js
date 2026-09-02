/**
 * Vía canónica de prod: 1 app pm2 → pnpm preview con .env.prod (ADR 0003 v2).
 * Esta es la única vía probada y guardada en pm2 (dump). No usar 2 apps
 * `start:prod` hasta que se valide la migración futura; si alguien arranca
 * este fichero por error, debe levantar exactamente lo mismo que `pm2 start
 * pnpm --name ai-chatbot -- preview` (chatbot 8085 + worker 3015 via
 * concurrently dentro de preview). Antes tenía 2 apps con `start`/`worker:dev`
 * que arrastraban .env.dev — eliminado en ticket 08.
 */
module.exports = {
  apps: [
    {
      name: "ai-chatbot",
      script: "pnpm",
      args: "preview",
      cwd: "/home/javier/projects/ai-chatbot",
      interpreter: "none",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env_file: ".env.prod",
      env: {
        NODE_ENV: "production",
        PATH: process.env.PATH,
        PORT: "8085",
      },
    },
  ],
};
