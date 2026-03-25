/**
 * Install Command
 *
 * Installs skill files for coding agents (Claude Code, Copilot, etc.).
 */

const fs = require('fs');
const path = require('path');

/**
 * Handle install command.
 *
 * Usage: moltbrowser install --skills
 */
function handleInstall(args) {
  const hasSkills = args.includes('--skills');

  if (!hasSkills) {
    console.log('Usage: moltbrowser install --skills');
    console.log('  Installs skill files for coding agents.');
    return;
  }

  installSkills();
}

function installSkills() {
  const skillsSource = path.join(__dirname, '..', 'skills', 'moltbrowser');
  const targets = findSkillTargets();

  if (targets.length === 0) {
    console.error('Could not detect coding agent. Copying skills to .claude/skills/ by default.');
    const target = path.join(process.cwd(), '.claude', 'skills', 'moltbrowser');
    copySkillDir(skillsSource, target);
    return;
  }

  for (const target of targets) {
    copySkillDir(skillsSource, target);
    console.log(`Skills installed to ${path.relative(process.cwd(), target)}`);
  }
}

function findSkillTargets() {
  const targets = [];
  const cwd = process.cwd();

  // Claude Code: .claude/skills/
  const claudeDir = path.join(cwd, '.claude');
  if (fs.existsSync(claudeDir)) {
    targets.push(path.join(claudeDir, 'skills', 'moltbrowser'));
  }

  // If no agents detected, default to .claude
  if (targets.length === 0) {
    targets.push(path.join(cwd, '.claude', 'skills', 'moltbrowser'));
  }

  return targets;
}

function copySkillDir(source, target) {
  fs.mkdirSync(target, { recursive: true });

  if (!fs.existsSync(source)) {
    console.error(`Skills source not found at ${source}`);
    process.exit(1);
  }

  copyDirRecursive(source, target);
}

function copyDirRecursive(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

module.exports = { handleInstall };
