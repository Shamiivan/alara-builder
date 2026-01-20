#!/usr/bin/env bun
import { Command } from 'commander';
import { dev } from './commands/dev';

const program = new Command()
  .name('alara')
  .description('Visual editor for React + CSS Modules')
  .version('0.1.0');

program
  .command('dev')
  .description('Start Alara dev server')
  .option('-p, --port <port>', 'Server port', '4000')
  .option('-d, --project-directory <directory>', 'Project directory', process.cwd())
  .action(dev);

program.parse();
