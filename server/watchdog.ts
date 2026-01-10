import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let restartCount = 0;
let lastRestart = Date.now();

function startServer() {
  console.log(`\n[${new Date().toLocaleTimeString()}] Starting server...`);
  
  const child = spawn('node', [
    join(__dirname, '../node_modules/tsx/dist/cli.mjs'),
    join(__dirname, 'index.ts')
  ], {
    stdio: 'inherit',
    windowsHide: false,
    env: process.env
  });

  child.on('exit', (code) => {
    const now = Date.now();
    const timeSinceLastRestart = now - lastRestart;
    
    // Reset counter if server ran for more than 10 seconds
    if (timeSinceLastRestart > 10000) {
      restartCount = 0;
    }
    
    if (code !== 0) {
      restartCount++;
      
      // Too many rapid restarts
      if (restartCount > 10 && timeSinceLastRestart < 60000) {
        console.error('\n❌ Too many restarts. Exiting...');
        process.exit(1);
      }
      
      console.log(`\n⚠️  Server exited with code ${code}. Restarting in 2s... (attempt ${restartCount})`);
      lastRestart = now;
      
      setTimeout(startServer, 2000);
    } else {
      console.log('\n✅ Server stopped gracefully.');
      process.exit(0);
    }
  });
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping server...');
  process.exit(0);
});

startServer();
