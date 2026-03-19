import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, cpSync, readdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
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

export async function initCommand(): Promise<void> {
  const cwd = process.cwd();
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

    // Step 8: Next steps
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
