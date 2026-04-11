// pm2 ecosystem config for TuTien Bot
// CRITICAL: exec_mode MUST be 'fork', NOT 'cluster'
// ShardingManager spawns its own shard child processes.
// Using cluster mode would fork the ShardingManager itself N times = N² shards.

module.exports = {
  apps: [
    {
      name: 'tutien-bot',
      script: './dist/bot.js',

      // Fork mode — ShardingManager is 1 process; it spawns shards internally
      instances: 1,
      exec_mode: 'fork',

      // Node flags
      node_args: '--enable-source-maps',

      // Environment
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },

      // Memory guard — restart if ShardingManager process exceeds 1GB
      // (individual shard processes are separate — this only guards the manager)
      max_memory_restart: '1G',

      // Restart policy
      restart_delay: 5_000,     // 5s delay between crash restarts
      max_restarts: 10,         // Stop restarting after 10 crashes in min_uptime window
      min_uptime: '30s',        // Must stay up 30s to be considered a clean start

      // Logging
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      merge_logs: true,
      time: true,               // Prefix all log lines with ISO timestamp

      // Source maps for better stack traces
      source_map_support: true,
    },
  ],
};
