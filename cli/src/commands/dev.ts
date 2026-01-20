export interface DevOptions {
  port: string;
  projectDirectory: string;
}

export async function dev(options: DevOptions): Promise<void> {
  const port = parseInt(options.port, 10);
  const projectDir = options.projectDirectory;

  console.log(`Starting Alara dev server...`);
  console.log(`  Port: ${port}`);
  console.log(`  Project: ${projectDir}`);

  // TODO: Phase 0.3 - Start Bun server with WebSocket support
  // const server = await startServer({ port, projectDir });

  console.log(`\nAlara dev server running at http://localhost:${port}`);
  console.log('Press Ctrl+C to stop\n');

  // Keep process alive until interrupted
  await new Promise(() => { });
}
