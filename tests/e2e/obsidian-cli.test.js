/**
 * End-to-end tests for Obsidian CLI commands
 * Tests the complete CLI workflow as described in obsidian-task-master-next-steps.md
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import mockFs from 'mock-fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the CLI script
const CLI_PATH = path.join(__dirname, '..', '..', 'bin', 'task-master.js');

/**
 * Helper function to run CLI commands
 */
function runCLICommand(args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn('node', [CLI_PATH, ...args], {
            cwd: options.cwd || process.cwd(),
            env: { ...process.env, ...options.env },
            stdio: 'pipe'
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            resolve({
                code,
                stdout,
                stderr,
                success: code === 0
            });
        });

        child.on('error', reject);
    });
}

describe('Obsidian CLI End-to-End Tests', () => {

    let testDir;
    let vaultDir;

    beforeEach(() => {
        // Create real temporary directories for E2E tests
        testDir = `/tmp/taskmaster-e2e-${Date.now()}`;
        vaultDir = `/tmp/obsidian-vault-${Date.now()}`;

        // Create test directories
        fs.mkdirSync(testDir, { recursive: true });
        fs.mkdirSync(vaultDir, { recursive: true });
        fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });

        // Create basic Obsidian vault structure
        fs.writeFileSync(
            path.join(vaultDir, '.obsidian', 'workspace.json'),
            JSON.stringify({ main: { id: 'workspace' } })
        );

        // Create sample TaskMaster project
        const tasksDir = path.join(testDir, '.taskmaster', 'tasks');
        fs.mkdirSync(tasksDir, { recursive: true });

        const sampleTasks = {
            master: {
                tasks: [
                    {
                        id: 1,
                        title: 'Test CLI Integration',
                        description: 'Test the CLI commands for Obsidian sync',
                        status: 'pending',
                        priority: 'high',
                        dependencies: [],
                        details: 'Comprehensive testing of CLI functionality',
                        testStrategy: 'Verify all commands work end-to-end'
                    },
                    {
                        id: 2,
                        title: 'Validate Sync Operations',
                        description: 'Ensure sync works correctly',
                        status: 'done',
                        priority: 'medium',
                        dependencies: [1],
                        details: 'Test bidirectional sync',
                        testStrategy: 'Test all sync directions'
                    }
                ],
                metadata: {
                    created: new Date().toISOString(),
                    updated: new Date().toISOString(),
                    description: 'E2E test tasks'
                }
            }
        };

        fs.writeFileSync(
            path.join(tasksDir, 'tasks.json'),
            JSON.stringify(sampleTasks, null, 2)
        );

        // Create TaskMaster config
        fs.writeFileSync(
            path.join(testDir, '.taskmasterconfig'),
            JSON.stringify({
                projectName: 'E2E Test Project',
                version: '1.0.0',
                models: {
                    main: { provider: 'mock', model: 'test' }
                }
            }, null, 2)
        );
    });

    afterEach(() => {
        // Cleanup test directories
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
        if (fs.existsSync(vaultDir)) {
            fs.rmSync(vaultDir, { recursive: true, force: true });
        }
    });

    describe('obsidian-init command', () => {
        test('should initialize Obsidian vault integration', async () => {
            const result = await runCLICommand([
                'obsidian-init',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json')
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });

            expect(result.success).toBe(true);
            expect(result.stdout).toContain('initialized');

            // Check that vault structure was created
            expect(fs.existsSync(path.join(vaultDir, 'Tasks'))).toBe(true);
            expect(fs.existsSync(path.join(vaultDir, 'Tags'))).toBe(true);
            expect(fs.existsSync(path.join(vaultDir, 'TaskMaster-README.md'))).toBe(true);
            expect(fs.existsSync(path.join(vaultDir, '.taskmaster-sync.json'))).toBe(true);

            // Verify sync config content
            const syncConfig = JSON.parse(
                fs.readFileSync(path.join(vaultDir, '.taskmaster-sync.json'), 'utf8')
            );
            expect(syncConfig.vaultPath).toBe(vaultDir);
            expect(syncConfig.version).toBe('1.0.0');
        }, 10000);

        test('should handle missing vault parameter', async () => {
            const result = await runCLICommand([
                'obsidian-init',
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json')
            ], {
                cwd: testDir
            });

            expect(result.success).toBe(false);
            expect(result.stderr).toContain('vault parameter is required');
        });

        test('should handle non-existent vault path', async () => {
            const result = await runCLICommand([
                'obsidian-init',
                '--vault', '/non/existent/path',
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json')
            ], {
                cwd: testDir
            });

            expect(result.success).toBe(false);
            expect(result.stderr).toContain('does not exist');
        });
    });

    describe('obsidian-sync command', () => {
        beforeEach(async () => {
            // Initialize vault for sync tests
            await runCLICommand([
                'obsidian-init',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json')
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });
        });

        test('should sync tasks to Obsidian', async () => {
            const result = await runCLICommand([
                'obsidian-sync',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json'),
                '--to-obsidian'
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });

            expect(result.success).toBe(true);
            expect(result.stdout).toContain('Syncing tasks from TaskMaster to Obsidian');

            // Check that markdown files were created
            const tasksDir = path.join(vaultDir, 'Tasks');
            const files = fs.readdirSync(tasksDir);
            expect(files.length).toBeGreaterThan(0);
            
            const taskFile = files.find(f => f.includes('test-cli-integration'));
            expect(taskFile).toBeDefined();
            
            if (taskFile) {
                const content = fs.readFileSync(path.join(tasksDir, taskFile), 'utf8');
                expect(content).toContain('# Test CLI Integration');
                expect(content).toContain('task_id: 1');
                expect(content).toContain('- [ ] Test CLI Integration');
            }
        }, 10000);

        test('should sync tasks from Obsidian', async () => {
            // First create a task in Obsidian
            const taskContent = `---
task_id: 99
status: pending
priority: low
---

# Obsidian Created Task

- [ ] Obsidian Created Task

## Description
This task was created in Obsidian

## Details
Should be synced to TaskMaster
`;
            
            fs.mkdirSync(path.join(vaultDir, 'Tasks'), { recursive: true });
            fs.writeFileSync(
                path.join(vaultDir, 'Tasks', 'obsidian-task.md'),
                taskContent
            );

            const result = await runCLICommand([
                'obsidian-sync',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json'),
                '--from-obsidian'
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });

            expect(result.success).toBe(true);
            expect(result.stdout).toContain('Syncing tasks from Obsidian to TaskMaster');
        }, 10000);

        test('should perform bidirectional sync', async () => {
            const result = await runCLICommand([
                'obsidian-sync',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json'),
                '--bidirectional'
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });

            expect(result.success).toBe(true);
            expect(result.stdout).toContain('bidirectional sync');
            expect(result.stdout).toContain('Step 1');
            expect(result.stdout).toContain('Step 2');
        }, 15000);

        test('should handle dry run mode', async () => {
            const result = await runCLICommand([
                'obsidian-sync',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json'),
                '--to-obsidian',
                '--dry-run'
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });

            expect(result.success).toBe(true);
            expect(result.stdout).toContain('DRY RUN MODE');

            // Verify no files were actually created
            const tasksDir = path.join(vaultDir, 'Tasks');
            if (fs.existsSync(tasksDir)) {
                const files = fs.readdirSync(tasksDir);
                expect(files.length).toBe(0); // Should be empty
            }
        }, 10000);

        test('should validate sync direction parameters', async () => {
            // Test missing sync direction
            const result1 = await runCLICommand([
                'obsidian-sync',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json')
            ], {
                cwd: testDir
            });

            expect(result1.success).toBe(false);
            expect(result1.stderr).toContain('specify a sync direction');

            // Test multiple sync directions
            const result2 = await runCLICommand([
                'obsidian-sync',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json'),
                '--to-obsidian',
                '--from-obsidian'
            ], {
                cwd: testDir
            });

            expect(result2.success).toBe(false);
            expect(result2.stderr).toContain('only one sync direction');
        });

        test('should handle missing vault parameter', async () => {
            const result = await runCLICommand([
                'obsidian-sync',
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json'),
                '--to-obsidian'
            ], {
                cwd: testDir
            });

            expect(result.success).toBe(false);
            expect(result.stderr).toContain('vault parameter is required');
        });
    });

    describe('obsidian-status command', () => {
        beforeEach(async () => {
            // Initialize vault for status tests
            await runCLICommand([
                'obsidian-init',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json')
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });
        });

        test('should display sync status', async () => {
            const result = await runCLICommand([
                'obsidian-status',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json')
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });

            expect(result.success).toBe(true);
            expect(result.stdout).toContain('Obsidian Sync Status');
            expect(result.stdout).toContain('Vault Path:');
            expect(result.stdout).toContain('Tasks File:');
            expect(result.stdout).toContain('Tasks in TaskMaster:');
            expect(result.stdout).toContain('Tasks in Obsidian:');
        }, 10000);

        test('should show sync recommendations', async () => {
            // Create an out-of-sync scenario by adding a task only in Obsidian
            fs.mkdirSync(path.join(vaultDir, 'Tasks'), { recursive: true });
            fs.writeFileSync(
                path.join(vaultDir, 'Tasks', 'vault-only-task.md'),
                '# Vault Only Task\n\n- [ ] Vault Only Task\n'
            );

            const result = await runCLICommand([
                'obsidian-status',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json')
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });

            expect(result.success).toBe(true);
            expect(result.stdout).toContain('Out of Sync:');
            expect(result.stdout).toContain('obsidian-sync --vault');
        }, 10000);

        test('should handle missing vault parameter', async () => {
            const result = await runCLICommand([
                'obsidian-status',
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json')
            ], {
                cwd: testDir
            });

            expect(result.success).toBe(false);
            expect(result.stderr).toContain('vault parameter is required');
        });

        test('should handle non-existent vault', async () => {
            const result = await runCLICommand([
                'obsidian-status',
                '--vault', '/non/existent/vault',
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json')
            ], {
                cwd: testDir
            });

            expect(result.success).toBe(false);
            expect(result.stderr).toContain('does not exist');
        });
    });

    describe('Tag Context Integration', () => {
        beforeEach(async () => {
            // Create tasks with different tags
            const multiTagTasks = {
                master: {
                    tasks: [
                        { id: 1, title: 'Master Task', status: 'pending' }
                    ]
                },
                'feature-branch': {
                    tasks: [
                        { id: 1, title: 'Feature Task', status: 'pending' }
                    ]
                }
            };

            fs.writeFileSync(
                path.join(testDir, '.taskmaster/tasks/tasks.json'),
                JSON.stringify(multiTagTasks, null, 2)
            );

            await runCLICommand([
                'obsidian-init',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json')
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });
        });

        test('should sync different tags correctly', async () => {
            // Sync master tag
            const masterResult = await runCLICommand([
                'obsidian-sync',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json'),
                '--to-obsidian',
                '--tag', 'master'
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });

            expect(masterResult.success).toBe(true);

            // Sync feature tag
            const featureResult = await runCLICommand([
                'obsidian-sync',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json'),
                '--to-obsidian',
                '--tag', 'feature-branch'
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });

            expect(featureResult.success).toBe(true);

            // Verify both sets of tasks were created
            const tasksDir = path.join(vaultDir, 'Tasks');
            const files = fs.readdirSync(tasksDir);
            expect(files.length).toBeGreaterThan(1);
        }, 15000);
    });

    describe('Error Handling Integration', () => {
        test('should handle invalid task files gracefully', async () => {
            // Create invalid tasks.json
            fs.writeFileSync(
                path.join(testDir, '.taskmaster/tasks/tasks.json'),
                'invalid json content'
            );

            const result = await runCLICommand([
                'obsidian-init',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json')
            ], {
                cwd: testDir
            });

            // Should handle gracefully rather than crashing
            expect(result.code).toBeDefined();
        });

        test('should provide helpful error messages', async () => {
            const result = await runCLICommand([
                'obsidian-sync',
                '--vault', vaultDir,
                '--to-obsidian'
                // Missing required parameters
            ], {
                cwd: testDir
            });

            expect(result.success).toBe(false);
            expect(result.stderr).toBeDefined();
            expect(result.stderr.length).toBeGreaterThan(0);
        });
    });

    describe('Complete Workflow Integration', () => {
        test('should complete full setup and sync workflow', async () => {
            // Step 1: Initialize vault
            const initResult = await runCLICommand([
                'obsidian-init',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json')
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });

            expect(initResult.success).toBe(true);

            // Step 2: Check initial status
            const statusResult1 = await runCLICommand([
                'obsidian-status',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json')
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });

            expect(statusResult1.success).toBe(true);

            // Step 3: Sync to Obsidian
            const syncResult = await runCLICommand([
                'obsidian-sync',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json'),
                '--to-obsidian'
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });

            expect(syncResult.success).toBe(true);

            // Step 4: Check status after sync
            const statusResult2 = await runCLICommand([
                'obsidian-status',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json')
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });

            expect(statusResult2.success).toBe(true);

            // Step 5: Test bidirectional sync
            const bidirectionalResult = await runCLICommand([
                'obsidian-sync',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json'),
                '--bidirectional'
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });

            expect(bidirectionalResult.success).toBe(true);

            // Verify final state
            const finalStatusResult = await runCLICommand([
                'obsidian-status',
                '--vault', vaultDir,
                '--file', path.join(testDir, '.taskmaster/tasks/tasks.json')
            ], {
                cwd: testDir,
                env: { DEBUG: 'false', TASKMASTER_LOG_LEVEL: 'error' }
            });

            expect(finalStatusResult.success).toBe(true);
        }, 30000);
    });
});
