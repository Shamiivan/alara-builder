import { createServer } from '@alara/service';

export interface DevOptions {
  port: string;
  projectDirectory: string;
}

export async function dev(options: DevOptions): Promise<void> {
  const port = parseInt(options.port, 10);
  const projectDir = options.projectDirectory;

  console.log('Starting Alara dev server...');
  console.log(`  Port: ${port}`);
  console.log(`  Project: ${projectDir}`);

  const server = createServer({ port, projectDir });

  console.log(`\nAlara dev server running at http://localhost:${server.port}`);
  console.log(`WebSocket endpoint: ws://localhost:${server.port}/ws`);
  console.log('Press Ctrl+C to stop\n');
}
