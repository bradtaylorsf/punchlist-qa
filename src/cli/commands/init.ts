import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, cpSync, readdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync, spawn } from 'node:child_process';
import { writeConfig } from '../../shared/config.js';
import { writeEnvFile } from '../../shared/env.js';
import { validateRepoFormat } from '../../shared/validation.js';
import {
  DEFAULT_PORT,
  DEFAULT_LABELS,
  DEFAULT_CONFIG,
  CONFIG_FILENAME,
} from '../../shared/constants.js';
import { GitHubIssueAdapter } from '../../adapters/issues/github.js';
import type { PunchlistConfig, AIToolChoice } from '../../shared/types.js';

export interface InitOptions {
  hosted?: boolean;
  local?: boolean;
  generate?: boolean;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function detectGitRepo(cwd: string): string | null {
  try {
    const remote = execSync('git remote get-url origin', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    // Handle SSH: git@github.com:owner/repo.git
    const sshMatch = remote.match(/github\.com[:/](.+?\/.+?)(?:\.git)?$/);
    if (sshMatch) return sshMatch[1];
    // Handle HTTPS: https://github.com/owner/repo.git
    const httpsMatch = remote.match(/github\.com\/(.+?\/.+?)(?:\.git)?$/);
    if (httpsMatch) return httpsMatch[1];
    return null;
  } catch {
    return null;
  }
}

function detectProjectName(cwd: string): string {
  return basename(cwd) || 'my-project';
}

function ask(
  rl: ReturnType<typeof createInterface>,
  question: string,
  defaultValue?: string,
): Promise<string> {
  const prompt = defaultValue ? `${question} (${defaultValue}): ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

export function copySkills(platform: 'claude-code' | 'codex', cwd: string): void {
  const skillsSource = join(__dirname, '../../../skills', platform);
  const targetDir =
    platform === 'claude-code' ? join(cwd, '.claude', 'skills') : join(cwd, '.codex', 'skills');
  if (existsSync(skillsSource) && readdirSync(skillsSource).length > 0) {
    mkdirSync(targetDir, { recursive: true });
    cpSync(skillsSource, targetDir, { recursive: true });
    console.log(`  ✅ Copied AI skills to ${targetDir.replace(cwd, '.')}`);
  } else {
    console.log(`  ⏭ No AI skills found for ${platform}`);
  }
}

function detectCliAvailability(tool: 'claude-code' | 'codex'): boolean {
  const cmd = tool === 'claude-code' ? 'claude' : 'codex';
  try {
    execFileSync('which', [cmd], { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

interface SkillDef {
  name: string;
  file: string;
  label: string;
  prompt: string;
  question: string;
}

const SKILLS: Record<string, SkillDef> = {
  'generate-tests': {
    name: 'generate-tests',
    file: 'generate-test-cases.md',
    label: 'generate test cases',
    prompt: [
      'Analyze this codebase to identify all user-facing features, then generate',
      'structured QA test cases. Write the categories and testCases arrays directly',
      'to punchlist.config.json following the schema defined in the skill.',
      'Do not ask for confirmation — just analyze and write the test cases.',
    ].join(' '),
    question: '  Generate test cases now? (Y/n)',
  },
  'integrate-widget': {
    name: 'integrate-widget',
    file: 'integrate-widget.md',
    label: 'integrate widget',
    prompt: [
      'Analyze this project to determine the best way to add the Punchlist QA',
      'support widget. Find the main HTML file or layout component, choose the',
      'right variant (fab, inline, or menu-item), and add the script tag and',
      'init call with appropriate configuration. Follow the skill instructions exactly.',
    ].join(' '),
    question: '  Add widget to your app now? (Y/n)',
  },
};

function getSkillPath(tool: 'claude-code' | 'codex', skillFile: string, cwd: string): string {
  const dir = tool === 'claude-code' ? '.claude' : '.codex';
  return join(cwd, dir, 'skills', skillFile);
}

function buildSkillPrompt(skillPath: string, skillPrompt: string): string {
  return `Read the skill file at ${skillPath} and follow its instructions exactly. ${skillPrompt}`;
}

function runSkillCommand(
  tool: 'claude-code' | 'codex',
  skill: SkillDef,
  cwd: string,
): Promise<void> {
  const skillPath = getSkillPath(tool, skill.file, cwd);
  if (!existsSync(skillPath)) {
    console.log(`  ⚠ Skill file not found at ${skillPath.replace(cwd, '.')}`);
    console.log('  Run "npx punchlist-qa update-skills" first, then try again.');
    return Promise.resolve();
  }

  const prompt = buildSkillPrompt(skillPath, skill.prompt);
  const cmd = tool === 'claude-code' ? 'claude' : 'codex';
  const args = tool === 'claude-code' ? ['-p', prompt] : ['exec', prompt];

  console.log(`\n  ⏳ Running: ${cmd} ${args[0]} "...${skill.label}..."\n`);
  return new Promise<void>((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`\n  ✅ Done: ${skill.label}.`);
      } else {
        console.log(`\n  ⚠ ${cmd} exited with code ${code}. You can run it manually:`);
        printManualSkillCommand(tool, skill, cwd);
      }
      resolve();
    });
    child.on('error', () => {
      console.log(`\n  ⚠ Failed to start ${cmd}. You can run it manually:`);
      printManualSkillCommand(tool, skill, cwd);
      resolve();
    });
  });
}

function pickCliTool(aiTool: AIToolChoice): 'claude-code' | 'codex' | null {
  if (aiTool === 'none') return null;
  if (aiTool === 'both') {
    if (detectCliAvailability('claude-code')) return 'claude-code';
    if (detectCliAvailability('codex')) return 'codex';
    return null;
  }
  return detectCliAvailability(aiTool) ? aiTool : null;
}

function printManualSkillCommand(
  tool: 'claude-code' | 'codex',
  skill: SkillDef,
  cwd: string,
): void {
  const skillPath = getSkillPath(tool, skill.file, cwd);
  const prompt = buildSkillPrompt(skillPath, skill.prompt);
  if (tool === 'claude-code') {
    console.log(`  claude -p "${prompt}"`);
  } else {
    console.log(`  codex exec "${prompt}"`);
  }
}

function printManualCommands(aiTool: AIToolChoice, skill: SkillDef, cwd: string): void {
  const tools: Array<'claude-code' | 'codex'> =
    aiTool === 'both' ? ['claude-code', 'codex'] : aiTool !== 'none' ? [aiTool as 'claude-code' | 'codex'] : [];
  for (const tool of tools) {
    printManualSkillCommand(tool, skill, cwd);
  }
}

async function maybeRunSkill(
  aiTool: AIToolChoice,
  skill: SkillDef,
  cwd: string,
  autoRun?: boolean,
): Promise<void> {
  const tool = pickCliTool(aiTool);

  if (autoRun) {
    if (!tool) {
      console.log(`\n  ⚠ Cannot auto-run "${skill.label}": AI CLI tool not found in PATH.`);
      console.log('  Install the CLI and run manually:');
      printManualCommands(aiTool, skill, cwd);
      return;
    }
    await runSkillCommand(tool, skill, cwd);
    return;
  }

  // Interactive: ask the user
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`\n  🤖 Auto-${skill.label}?`);
    if (tool) {
      console.log(`  Detected: ${tool === 'claude-code' ? 'claude' : 'codex'} CLI`);
      const answer = await ask(rl, skill.question, 'Y');
      rl.close();
      if (answer.toLowerCase() !== 'n') {
        await runSkillCommand(tool, skill, cwd);
      } else {
        console.log('\n  You can run it later with:');
        printManualCommands(aiTool, skill, cwd);
      }
    } else {
      rl.close();
      console.log(`  No AI CLI detected. To ${skill.label}, install the CLI and run:`);
      printManualCommands(aiTool, skill, cwd);
    }
  } catch (err) {
    rl.close();
    throw err;
  }
}

async function hostedInit(cwd: string, options: InitOptions): Promise<void> {
  console.log('\n  🎯 Punchlist QA — Hosted Mode Setup\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const serverUrl = await ask(rl, '  Hosted server URL (e.g. https://qa.mycompany.com)');
    if (!serverUrl) {
      console.error('  Server URL is required.');
      process.exit(1);
    }

    // Auto-detect AI tool from project structure
    const hasClaudeDir = existsSync(join(cwd, '.claude'));
    const hasCodexDir = existsSync(join(cwd, '.codex')) || existsSync(join(cwd, '.agents'));
    let detectedAiDefault = '1';
    if (hasClaudeDir && hasCodexDir) detectedAiDefault = '3';
    else if (hasCodexDir) detectedAiDefault = '2';

    console.log('\n  AI tool integration:');
    console.log('  1) Claude Code');
    console.log('  2) Codex');
    console.log('  3) Both');
    console.log('  4) None\n');
    const aiChoice = await ask(rl, '  Choose (1/2/3/4)', detectedAiDefault);
    const aiToolMap: Record<string, AIToolChoice> = {
      '1': 'claude-code',
      '2': 'codex',
      '3': 'both',
      '4': 'none',
    };
    const aiTool = aiToolMap[aiChoice] || 'claude-code';

    rl.close();

    // Write minimal hosted config
    const hostedConfig = { serverUrl, aiTool };
    const hostedDir = join(cwd, '.punchlist');
    mkdirSync(hostedDir, { recursive: true });
    writeFileSync(
      join(hostedDir, 'hosted.json'),
      JSON.stringify(hostedConfig, null, 2) + '\n',
    );
    console.log('\n  ✅ Created .punchlist/hosted.json');

    // Copy AI skills
    if (aiTool !== 'none') {
      const platforms: Array<'claude-code' | 'codex'> =
        aiTool === 'both' ? ['claude-code', 'codex'] : [aiTool as 'claude-code' | 'codex'];
      for (const platform of platforms) {
        copySkills(platform, cwd);
      }
    }

    // Output widget snippet
    const cleanUrl = serverUrl.replace(/\/+$/, '');
    console.log('\n  📋 Add this script tag to your app:\n');
    console.log(`  <script src="${cleanUrl}/widget.js"></script>\n`);

    // Run AI skills
    if (aiTool !== 'none') {
      await maybeRunSkill(aiTool, SKILLS['generate-tests'], cwd, options.generate);
      await maybeRunSkill(aiTool, SKILLS['integrate-widget'], cwd, options.generate);
    }

    // Next steps
    console.log('  📝 Next steps:');
    console.log('  1. Add the widget script tag to your HTML');
    console.log('  2. Use AI skills to generate test cases');
    console.log('  3. Start testing at your hosted dashboard\n');
  } catch (err) {
    rl.close();
    throw err;
  }
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  const cwd = process.cwd();

  // Hosted mode (default when --local is not specified)
  if (options.hosted && !options.local) {
    await hostedInit(cwd, options);
    return;
  }

  // Local mode (original behavior)
  const configPath = join(cwd, CONFIG_FILENAME);

  if (existsSync(configPath)) {
    console.error(`\n  ${CONFIG_FILENAME} already exists in this directory.`);
    console.error('  Remove it first if you want to reinitialize.\n');
    process.exit(1);
  }

  console.log('\n  🎯 Punchlist QA — Project Setup\n');

  // Auto-detect from git
  const detectedRepo = detectGitRepo(cwd);
  const detectedName = detectProjectName(cwd);

  if (detectedRepo) {
    console.log(`  Detected GitHub repo: ${detectedRepo}`);
  }
  console.log('');

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    // Step 1: Interactive prompts
    const projectName = await ask(rl, '  Project name', detectedName);

    let repo = '';
    while (!repo) {
      repo = await ask(rl, '  GitHub repo (owner/repo)', detectedRepo || undefined);
      if (!validateRepoFormat(repo)) {
        console.log('  ⚠ Invalid format. Use: owner/repo');
        repo = '';
      }
    }

    const token = await ask(rl, '  GitHub personal access token (stored in .env, not config)');

    const corsInput = await ask(rl, '  CORS domains (comma-separated)', 'http://localhost:3000');
    const corsDomains = corsInput
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    // Auto-detect AI tool from project structure
    const hasClaudeDir = existsSync(join(cwd, '.claude'));
    const hasCodexDir = existsSync(join(cwd, '.codex')) || existsSync(join(cwd, '.agents'));
    let detectedAiDefault = '1'; // default: Claude Code
    if (hasClaudeDir && hasCodexDir) detectedAiDefault = '3';
    else if (hasCodexDir) detectedAiDefault = '2';

    console.log('\n  AI tool integration:');
    console.log('  1) Claude Code');
    console.log('  2) Codex');
    console.log('  3) Both');
    console.log('  4) None\n');
    const aiChoice = await ask(rl, '  Choose (1/2/3/4)', detectedAiDefault);
    const aiToolMap: Record<string, AIToolChoice> = {
      '1': 'claude-code',
      '2': 'codex',
      '3': 'both',
      '4': 'none',
    };
    const aiTool = aiToolMap[aiChoice] || 'claude-code';

    rl.close();

    // Step 2: Generate config (no secrets in here)
    const config: PunchlistConfig = {
      projectName,
      issueTracker: { type: 'github', repo },
      storage: { ...DEFAULT_CONFIG.storage },
      auth: { type: 'token' },
      widget: { ...DEFAULT_CONFIG.widget, corsDomains, categories: [] },
      aiTool,
      categories: [],
      testCases: [],
      testers: [],
    };

    writeConfig(config, cwd);
    console.log(`\n  ✅ Created ${CONFIG_FILENAME}`);

    // Step 3: Write secrets to .env
    const secret = randomBytes(32).toString('hex');
    const envVars: Record<string, string> = {
      PUNCHLIST_AUTH_SECRET: secret,
    };
    if (token) {
      envVars.PUNCHLIST_GITHUB_TOKEN = token;
    }
    writeEnvFile(envVars, cwd);
    console.log('  ✅ Created .env with secrets');

    // Step 4: Add GitHub labels
    if (token) {
      console.log('  ⏳ Adding GitHub labels...');
      try {
        const github = new GitHubIssueAdapter(repo, token);
        await github.addLabels(DEFAULT_LABELS);
        console.log(`  ✅ Added ${DEFAULT_LABELS.length} labels to ${repo}`);
      } catch (err) {
        console.warn(`  ⚠ Could not add labels: ${err instanceof Error ? err.message : err}`);
        console.warn('  You can add them manually or re-run init with a valid token.');
      }
    } else {
      console.log('  ⏭ Skipped GitHub labels (no token provided)');
    }

    // Step 5: Copy AI skills
    if (aiTool !== 'none') {
      const platforms: Array<'claude-code' | 'codex'> =
        aiTool === 'both' ? ['claude-code', 'codex'] : [aiTool as 'claude-code' | 'codex'];
      for (const platform of platforms) {
        copySkills(platform, cwd);
      }
    }

    // Step 6: Ensure .env is gitignored
    const gitignorePath = join(cwd, '.gitignore');
    if (existsSync(gitignorePath)) {
      const gitignore = readFileSync(gitignorePath, 'utf-8');
      if (!gitignore.includes('.env')) {
        appendFileSync(gitignorePath, '\n# Punchlist QA secrets\n.env\n.env.local\n');
        console.log('  ✅ Added .env to .gitignore');
      }
    }

    // Step 7: Output widget snippet
    console.log('\n  📋 Add this script tag to your app:\n');
    console.log(
      `  <script src="http://localhost:${DEFAULT_PORT}/widget.js" data-project="${projectName}"></script>\n`,
    );

    // Step 8: Run AI skills
    if (aiTool !== 'none') {
      await maybeRunSkill(aiTool, SKILLS['generate-tests'], cwd, options.generate);
      await maybeRunSkill(aiTool, SKILLS['integrate-widget'], cwd, options.generate);
    }

    // Step 9: Next steps
    console.log('  📝 Next steps:');
    console.log('  1. Add test cases to punchlist.config.json (or use AI skills to generate them)');
    console.log('  2. Run: npx punchlist-qa serve');
    console.log('  3. Invite testers: npx punchlist-qa invite tester@example.com');
    console.log('  4. Deploy to qa.yourapp.com when ready');
    console.log('');
    console.log('  ⚠ Secrets are in .env — never commit that file.');
    console.log('  ✅ punchlist.config.json is safe to commit.\n');
  } catch (err) {
    rl.close();
    throw err;
  }
}
