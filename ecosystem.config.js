module.exports = {
  apps: [{
    name: 'ai-chatbot',
    script: 'pnpm',
    args: 'preview',
    cwd: '/home/javier/projects/ai-chatbot',
    interpreter: 'none',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_file: '.env.development.local',
    env: {
      NODE_ENV: 'production',
      PATH: process.env.PATH
    }
  }]
};
