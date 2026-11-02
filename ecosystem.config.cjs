module.exports = {
  apps: [
    {
      name: 'nexus-server',
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'server.ts',
      cwd: './',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000
    }
  ]
};
