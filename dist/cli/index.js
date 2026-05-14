#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const analyzer_1 = require("../analyzer");
const generator_1 = require("../generator");
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'));
const program = new commander_1.Command();
program
    .name('zinsight')
    .description('Instant insight into any codebase. Auto-generate architecture docs.')
    .version(pkg.version)
    .argument('[directory]', 'Project root directory (default: current directory)')
    .option('-o, --output <path>', 'Output file path', 'ARCHITECTURE.md')
    .option('-r, --root <path>', 'Project root directory (alias for [directory])')
    .action((directory, options) => {
    const rootDir = path.resolve(directory || options.root || process.cwd());
    const outputPath = path.resolve(options.output);
    // Verify root exists
    if (!fs.existsSync(rootDir)) {
        console.error(chalk_1.default.red(`Directory not found: ${rootDir}`));
        process.exit(1);
    }
    console.log('');
    console.log(chalk_1.default.bold('  zinsight') + chalk_1.default.gray(` v${pkg.version}`));
    console.log(chalk_1.default.gray(`  Analyzing ${rootDir}`));
    console.log('');
    const spinner = (0, ora_1.default)({ text: 'Starting analysis...', color: 'cyan' }).start();
    try {
        const result = (0, analyzer_1.analyze)(rootDir, (msg) => {
            spinner.text = msg;
        });
        spinner.succeed('Analysis complete');
        console.log('');
        // Generate markdown
        const markdown = (0, generator_1.generateMarkdown)(result);
        fs.writeFileSync(outputPath, markdown, 'utf-8');
        // Print summary
        console.log(chalk_1.default.green('  ✓') + ` ${result.stats.totalFiles} files analyzed`);
        console.log(chalk_1.default.green('  ✓') + ` ${result.stats.totalLoc.toLocaleString()} lines of code`);
        console.log(chalk_1.default.green('  ✓') + ` ${result.subsystems.length} subsystems detected`);
        console.log(chalk_1.default.green('  ✓') + ` ${result.contracts.length} implicit contracts found`);
        console.log(chalk_1.default.green('  ✓') + ` ${result.riskAreas.length} risk areas identified`);
        if (result.stats.parseFailures > 0) {
            console.log(chalk_1.default.yellow('  ⚠') + ` ${result.stats.parseFailures} files couldn't be parsed`);
        }
        console.log('');
        console.log(chalk_1.default.bold(`  → ${path.relative(process.cwd(), outputPath)}`));
        console.log('');
    }
    catch (err) {
        spinner.fail('Analysis failed');
        console.error(chalk_1.default.red(err.message));
        process.exit(1);
    }
});
program.parse();
//# sourceMappingURL=index.js.map