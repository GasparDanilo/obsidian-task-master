/**
 * Unit tests for Obsidian sync functionality
 * Tests the testing requirements outlined in obsidian-task-master-next-steps.md
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import mockFs from 'mock-fs';
import {
    syncTasksToObsidian,
    syncTasksFromObsidian,
    initObsidianSync,
    validateObsidianVault,
    getObsidianSyncStatus
} from '../../scripts/modules/task-manager/obsidian-sync.js';

// Mock utilities
jest.mock('../../scripts/modules/utils.js', () => ({
    readJSON: jest.fn(),
    writeJSON: jest.fn(),
    log: jest.fn()
}));

const mockUtils = await import('../../scripts/modules/utils.js');

describe('Obsidian Sync - Unit Tests', () => {
    
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Setup mock filesystem for each test
        mockFs({
            '/test-vault': {
                '.obsidian': {
                    'workspace.json': '{}',
                    'config.json': '{}'
                },
                'Tasks': {},
                'Tags': {},
                'existing-task.md': `---
task_id: 1
status: pending
---

# Test Task

- [ ] Test Task

## Description
This is a test task
`,
                'completed-task.md': `---
task_id: 2
status: done
---

# Completed Task

- [x] Completed Task
`
            },
            '/empty-vault': {},
            '/invalid-path': 'not-a-directory',
            '/tasks.json': JSON.stringify({
                master: {
                    tasks: [
                        {
                            id: 1,
                            title: 'Test Task',
                            description: 'This is a test task',
                            status: 'pending',
                            priority: 'medium',
                            dependencies: [],
                            details: '',
                            testStrategy: ''
                        },
                        {
                            id: 2,
                            title: 'Completed Task',
                            description: 'This task is completed',
                            status: 'done',
                            priority: 'high',
                            dependencies: [],
                            details: '',
                            testStrategy: ''
                        }
                    ]
                }
            })
        });
    });

    afterEach(() => {
        mockFs.restore();
    });

    describe('syncTasksToObsidian', () => {
        test('should create markdown files for tasks', async () => {
            // Setup mock data
            mockUtils.readJSON.mockReturnValue({
                tasks: [
                    {
                        id: 1,
                        title: 'Test Task',
                        description: 'This is a test task',
                        status: 'pending',
                        priority: 'medium',
                        dependencies: [],
                        details: 'Some details',
                        testStrategy: 'Test strategy'
                    }
                ]
            });

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json',
                tag: 'master',
                projectRoot: '/',
                dryRun: false
            };

            const result = await syncTasksToObsidian(options);

            expect(result.created).toBe(1);
            expect(result.updated).toBe(0);
            expect(result.errors).toHaveLength(0);
            
            // Check that the file was created
            const expectedPath = '/test-vault/Tasks/task-001-test-task.md';
            expect(fs.existsSync(expectedPath)).toBe(true);
            
            const content = fs.readFileSync(expectedPath, 'utf8');
            expect(content).toContain('# Test Task');
            expect(content).toContain('- [ ] Test Task');
            expect(content).toContain('task_id: 1');
        });

        test('should handle dry run mode', async () => {
            mockUtils.readJSON.mockReturnValue({
                tasks: [
                    { id: 1, title: 'Test Task', status: 'pending' }
                ]
            });

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json',
                dryRun: true
            };

            const result = await syncTasksToObsidian(options);

            expect(result.created).toBe(0);
            expect(result.updated).toBe(0);
            expect(mockUtils.log).toHaveBeenCalledWith('info', expect.stringContaining('[DRY RUN]'));
        });

        test('should update existing markdown files', async () => {
            // Create an existing file first
            const existingPath = '/test-vault/Tasks/task-001-existing.md';
            fs.mkdirSync(path.dirname(existingPath), { recursive: true });
            fs.writeFileSync(existingPath, '# Existing Task');

            mockUtils.readJSON.mockReturnValue({
                tasks: [
                    {
                        id: 1,
                        title: 'existing',
                        status: 'done',
                        priority: 'high'
                    }
                ]
            });

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json'
            };

            const result = await syncTasksToObsidian(options);

            expect(result.updated).toBe(1);
            expect(result.created).toBe(0);
        });

        test('should handle errors gracefully', async () => {
            mockUtils.readJSON.mockReturnValue({
                tasks: [
                    {
                        id: 1,
                        title: 'test/invalid:path',  // Invalid filename
                        status: 'pending'
                    }
                ]
            });

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json'
            };

            const result = await syncTasksToObsidian(options);

            expect(result.errors.length).toBeGreaterThan(0);
            expect(mockUtils.log).toHaveBeenCalledWith('error', expect.stringContaining('Failed to sync task'));
        });

        test('should throw error when no tasks data found', async () => {
            mockUtils.readJSON.mockReturnValue(null);

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json'
            };

            await expect(syncTasksToObsidian(options)).rejects.toThrow('No tasks data found');
        });
    });

    describe('syncTasksFromObsidian', () => {
        test('should extract tasks from markdown files', async () => {
            mockUtils.readJSON.mockReturnValue({ tasks: [] });

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json',
                tag: 'master',
                projectRoot: '/'
            };

            const result = await syncTasksFromObsidian(options);

            expect(result.created).toBe(2); // Two markdown files with tasks
            expect(mockUtils.writeJSON).toHaveBeenCalled();
        });

        test('should update existing tasks', async () => {
            mockUtils.readJSON.mockReturnValue({
                tasks: [
                    {
                        id: 1,
                        title: 'Test Task',
                        status: 'pending',
                        sourceFile: 'existing-task.md'
                    }
                ]
            });

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json'
            };

            const result = await syncTasksFromObsidian(options);

            expect(result.updated).toBeGreaterThan(0);
        });

        test('should handle dry run mode', async () => {
            mockUtils.readJSON.mockReturnValue({ tasks: [] });

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json',
                dryRun: true
            };

            const result = await syncTasksFromObsidian(options);

            expect(mockUtils.log).toHaveBeenCalledWith('info', expect.stringContaining('[DRY RUN]'));
            expect(mockUtils.writeJSON).not.toHaveBeenCalled();
        });

        test('should handle empty vault', async () => {
            mockUtils.readJSON.mockReturnValue({ tasks: [] });

            const options = {
                vaultPath: '/empty-vault',
                tasksPath: '/tasks.json'
            };

            const result = await syncTasksFromObsidian(options);

            expect(result.created).toBe(0);
            expect(result.updated).toBe(0);
            expect(mockUtils.log).toHaveBeenCalledWith('info', 'No tasks found in Obsidian vault');
        });

        test('should detect conflicts', async () => {
            mockUtils.readJSON.mockReturnValue({
                tasks: [
                    {
                        id: 1,
                        title: 'Test Task',
                        status: 'done',
                        lastSyncAt: new Date('2023-01-01').toISOString(),
                        sourceFile: 'existing-task.md'
                    }
                ]
            });

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json'
            };

            const result = await syncTasksFromObsidian(options);

            // Since the task in vault is 'pending' but in TaskMaster it's 'done', 
            // and lastSyncAt is old, this might trigger a conflict
            expect(mockUtils.log).toHaveBeenCalled();
        });
    });

    describe('initObsidianSync', () => {
        test('should initialize vault structure', async () => {
            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json',
                tag: 'master',
                projectRoot: '/'
            };

            const result = await initObsidianSync(options);

            expect(result.success).toBe(true);
            expect(fs.existsSync('/test-vault/Tasks')).toBe(true);
            expect(fs.existsSync('/test-vault/Tags')).toBe(true);
            expect(fs.existsSync('/test-vault/TaskMaster-README.md')).toBe(true);
            expect(fs.existsSync('/test-vault/.taskmaster-sync.json')).toBe(true);
        });

        test('should not overwrite existing README', async () => {
            // Create existing README
            fs.writeFileSync('/test-vault/TaskMaster-README.md', 'Existing content');

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json'
            };

            await initObsidianSync(options);

            const content = fs.readFileSync('/test-vault/TaskMaster-README.md', 'utf8');
            expect(content).toBe('Existing content');
        });

        test('should create sync configuration', async () => {
            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json',
                tag: 'custom-tag',
                projectRoot: '/project'
            };

            await initObsidianSync(options);

            const configPath = '/test-vault/.taskmaster-sync.json';
            expect(fs.existsSync(configPath)).toBe(true);

            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            expect(config.tag).toBe('custom-tag');
            expect(config.projectRoot).toBe('/project');
            expect(config.vaultPath).toBe('/test-vault');
        });
    });

    describe('validateObsidianVault', () => {
        test('should validate existing vault', async () => {
            const result = await validateObsidianVault('/test-vault');
            expect(result).toBe(true);
        });

        test('should throw error for non-existent path', async () => {
            await expect(validateObsidianVault('/non-existent')).rejects.toThrow('does not exist');
        });

        test('should throw error for non-directory', async () => {
            await expect(validateObsidianVault('/invalid-path')).rejects.toThrow('not a directory');
        });

        test('should warn for missing .obsidian directory', async () => {
            await validateObsidianVault('/empty-vault');
            
            expect(mockUtils.log).toHaveBeenCalledWith(
                'warn', 
                expect.stringContaining('No .obsidian directory found')
            );
        });
    });

    describe('getObsidianSyncStatus', () => {
        test('should return sync status', async () => {
            mockUtils.readJSON.mockReturnValue({
                tasks: [
                    { id: 1, title: 'Test Task', status: 'pending' },
                    { id: 2, title: 'Completed Task', status: 'done' }
                ]
            });

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json',
                tag: 'master',
                projectRoot: '/'
            };

            const status = await getObsidianSyncStatus(options);

            expect(status.vaultPath).toBe('/test-vault');
            expect(status.tasksPath).toBe('/tasks.json');
            expect(status.tag).toBe('master');
            expect(status.tasksInTaskMaster).toBe(2);
            expect(status.tasksInObsidian).toBe(2);
            expect(Array.isArray(status.conflicts)).toBe(true);
            expect(Array.isArray(status.outOfSync)).toBe(true);
        });

        test('should detect out of sync tasks', async () => {
            mockUtils.readJSON.mockReturnValue({
                tasks: [
                    { id: 1, title: 'Only in TaskMaster', status: 'pending' }
                ]
            });

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json'
            };

            const status = await getObsidianSyncStatus(options);

            expect(status.outOfSync.length).toBeGreaterThan(0);
            expect(status.inSync).toBe(false);
        });

        test('should read sync configuration', async () => {
            const syncConfig = {
                initialized: '2023-01-01T00:00:00.000Z',
                version: '1.0.0'
            };
            
            fs.writeFileSync('/test-vault/.taskmaster-sync.json', JSON.stringify(syncConfig));

            mockUtils.readJSON.mockReturnValue({ tasks: [] });

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json'
            };

            const status = await getObsidianSyncStatus(options);

            expect(status.lastSync).toBe('2023-01-01T00:00:00.000Z');
        });

        test('should handle errors gracefully', async () => {
            mockUtils.readJSON.mockImplementation(() => {
                throw new Error('Cannot read tasks');
            });

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json'
            };

            const status = await getObsidianSyncStatus(options);

            expect(status.tasksInTaskMaster).toBe(0);
            expect(mockUtils.log).toHaveBeenCalledWith('warn', 'Could not read TaskMaster tasks');
        });
    });

    describe('Edge Cases and Error Handling', () => {
        test('should handle malformed task files', async () => {
            // Create malformed markdown file
            fs.writeFileSync('/test-vault/malformed.md', 'Invalid content without proper task format');

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json'
            };

            // Should not throw error, just skip malformed files
            const result = await getObsidianSyncStatus(options);
            expect(result).toBeDefined();
        });

        test('should handle permission errors', async () => {
            // Mock a permission error
            const originalWriteFileSync = fs.writeFileSync;
            fs.writeFileSync = jest.fn().mockImplementation(() => {
                const error = new Error('Permission denied');
                error.code = 'EACCES';
                throw error;
            });

            mockUtils.readJSON.mockReturnValue({
                tasks: [{ id: 1, title: 'Test', status: 'pending' }]
            });

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json'
            };

            const result = await syncTasksToObsidian(options);

            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0].error).toContain('Permission denied');

            // Restore original function
            fs.writeFileSync = originalWriteFileSync;
        });

        test('should handle network/IO failures gracefully', async () => {
            // Mock file system error
            const originalReadFileSync = fs.readFileSync;
            fs.readFileSync = jest.fn().mockImplementation(() => {
                throw new Error('IO Error');
            });

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json'
            };

            // Should not crash the application
            const result = await syncTasksFromObsidian(options);
            expect(result.created).toBe(0);

            // Restore original function
            fs.readFileSync = originalReadFileSync;
        });
    });

    describe('Content Format Validation', () => {
        test('should generate proper markdown format', async () => {
            mockUtils.readJSON.mockReturnValue({
                tasks: [{
                    id: 1,
                    title: 'Complex Task',
                    description: 'A complex task description',
                    status: 'pending',
                    priority: 'high',
                    dependencies: [2, 3],
                    details: 'Detailed implementation notes',
                    testStrategy: 'Test this thoroughly',
                    obsidianTags: ['urgent', 'backend'],
                    linkedNotes: ['[[Related Note]]', '[[Another Note]]']
                }]
            });

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json'
            };

            await syncTasksToObsidian(options);

            const filePath = '/test-vault/Tasks/task-001-complex-task.md';
            const content = fs.readFileSync(filePath, 'utf8');

            // Check frontmatter
            expect(content).toContain('---');
            expect(content).toContain('task_id: 1');
            expect(content).toContain('priority: high');
            expect(content).toContain('status: pending');
            expect(content).toContain('tags: ["urgent", "backend"]');

            // Check content sections
            expect(content).toContain('# Complex Task');
            expect(content).toContain('- [ ] Complex Task');
            expect(content).toContain('## Description');
            expect(content).toContain('## Details');
            expect(content).toContain('## Test Strategy');
            expect(content).toContain('## Dependencies');
            expect(content).toContain('## Related Notes');
            expect(content).toContain('- Task 2');
            expect(content).toContain('- Task 3');
            expect(content).toContain('- [[Related Note]]');
        });

        test('should handle tasks with minimal information', async () => {
            mockUtils.readJSON.mockReturnValue({
                tasks: [{
                    id: 1,
                    title: 'Minimal Task',
                    status: 'pending'
                }]
            });

            const options = {
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json'
            };

            await syncTasksToObsidian(options);

            const filePath = '/test-vault/Tasks/task-001-minimal-task.md';
            const content = fs.readFileSync(filePath, 'utf8');

            expect(content).toContain('# Minimal Task');
            expect(content).toContain('- [ ] Minimal Task');
            expect(content).toContain('task_id: 1');
        });
    });
});
