#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { analyze } from '../analyzer';
import { generateMarkdown } from '../generator';

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')
);

const program = new Command();

program
  .name('zinsight')
  .description('Instant insight into any codebase. Auto-generate architecture docs.')
  .version(pkg.version)
  .argument('[directory]', 'Project root directory (default: current directory)')
  .option('-o, --output <path>', 'Output file path', 'ARCHITECTURE.md')
  .option('-r, --root <path>', 'Project root directory (alias for [directory])')
  .option('-n, --name <name>', 'Override project name in the generated document')
  .action((directory, options) => {
    const rootDir = path.resolve(directory || options.root || process.cwd());
    const outputPath = path.resolve(options.output);

    // Verify root exists
    if (!fs.existsSync(rootDir)) {
      console.error(chalk.red(`Directory not found: ${rootDir}`));
      process.exit(1);
    }

    console.log('');
    console.log(chalk.bold('  zinsight') + chalk.gray(` v${pkg.version}`));
    console.log(chalk.gray(`  Analyzing ${rootDir}`));
    console.log('');

    const spinner = ora({ text: 'Starting analysis...', color: 'cyan' }).start();

    try {
      const result = analyze(rootDir, (msg) => {
        spinner.text = msg;
      }, { name: options.name });

      spinner.succeed('Analysis complete');
      console.log('');

      // Honesty check: zinsight is a JS/TS analyser. For PHP/Python/Go/Terraform
      // projects it produces near-empty output. Warn loudly instead of
      // pretending the doc is complete.
      if (result.project.language && result.project.language !== 'js-ts' && result.project.language !== 'unknown') {
        console.log(chalk.yellow('  ⚠') + ` Detected language: ${result.project.language.toUpperCase()}`);
        console.log(chalk.yellow('    zinsight currently parses JavaScript/TypeScript only.'));
        console.log(chalk.yellow('    The generated doc will list deployment / CI / docs only.'));
        console.log('');
      }
      if (result.project.resolvedRoot !== result.project.invokedFrom) {
        const rel = path.relative(result.project.invokedFrom, result.project.resolvedRoot) || result.project.resolvedRoot;
        console.log(chalk.cyan('  ℹ') + ` Descended into project root: ./${rel}`);
      }

      // Generate markdown
      const markdown = generateMarkdown(result);
      fs.writeFileSync(outputPath, markdown, 'utf-8');

      // Print summary
      console.log(chalk.green('  ✓') + ` ${result.stats.totalFiles} files analyzed`);
      console.log(chalk.green('  ✓') + ` ${result.stats.totalLoc.toLocaleString()} lines of code`);
      console.log(chalk.green('  ✓') + ` ${result.subsystems.length} subsystems detected`);
      console.log(chalk.green('  ✓') + ` ${result.contracts.length} implicit contracts found`);
      console.log(chalk.green('  ✓') + ` ${result.riskAreas.length} risk areas identified`);

      if (result.stats.parseFailures > 0) {
        console.log(chalk.yellow('  ⚠') + ` ${result.stats.parseFailures} files couldn't be parsed`);
      }

      console.log('');
      console.log(chalk.bold(`  → ${path.relative(process.cwd(), outputPath)}`));
      console.log('');
    } catch (err: any) {
      spinner.fail('Analysis failed');
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

program.parse();
