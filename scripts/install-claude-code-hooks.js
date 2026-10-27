#!/usr/bin/env node
// ABOUTME: Adds (or with --uninstall removes) the island hook in Claude Code's user settings.json.
// ABOUTME: Honors CLAUDE_CONFIG_DIR, keeps a backup of the previous file and leaves other hooks alone.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {addIslandHooks, removeIslandHooks} from '../src/integrations/claude-code/settings.js';

const hookPath = fileURLToPath(new URL('../bin/claude-code-hook', import.meta.url));
const command = JSON.stringify(hookPath);
const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const settingsPath = path.join(configDir, 'settings.json');
const uninstall = process.argv.includes('--uninstall');

const current = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
const updated = uninstall ? removeIslandHooks(current, command) : addIslandHooks(current, command);

if (JSON.stringify(updated) === JSON.stringify(current)) {
    console.log(`${settingsPath} already ${uninstall ? 'has no island hooks' : 'has the island hooks'}`);
    process.exit(0);
}

fs.mkdirSync(configDir, {recursive: true});
if (fs.existsSync(settingsPath))
    fs.copyFileSync(settingsPath, `${settingsPath}.linux-island-backup`);
fs.writeFileSync(`${settingsPath}.tmp`, `${JSON.stringify(updated, null, 2)}\n`);
fs.renameSync(`${settingsPath}.tmp`, settingsPath);
console.log(`${uninstall ? 'Removed island hooks from' : 'Added island hooks to'} ${settingsPath}`);
