/**
 * Canonical prod path: 1 pm2 app → pnpm preview (ADR 0003 v2).
 * This is the only path that has been tested and saved in pm2 (dump). Do not
 * use 2 `start:prod` apps until the future migration is validated; if someone
 * starts this file by mistake, it must boot exactly the same as `pm2 start
 * pnpm --name ai-chatbot -- preview` (chatbot 8085 + worker 3015 via
 * concurrently inside preview).
 *
 * No `env_file`: since ADR 0011 the configuration is typed TS modules
 * (`packages/config`) and the prod Environment travels through `process.argv`
 * (`--env=prod`) in the `package.json` scripts; `pnpm preview` no longer reads
 * `.env.*`. The variables below belong to the supervisor (NODE_ENV/PORT), not
 * to the app configuration.
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
      env: {
        NODE_ENV: "production",
        PATH: process.env.PATH,
        PORT: "8085",
      },
    },
  ],
};
