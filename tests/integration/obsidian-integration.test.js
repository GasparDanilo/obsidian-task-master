/**
 * Integration tests for Obsidian sync functionality
 * Tests complete workflows and command integration
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import mockFs from 'mock-fs';
import { spawn } from 'child_process';
import { 
    syncTasksToObsidian,
    syncTasksFromObsidian,
    initObsidianSync,
    getObsidianSyncStatus
} from '../../scripts/modules/task-manager/obsidian-sync.js';

// Mock utilities for integration tests
jest.mock('../../scripts/modules/utils.js', () => ({
    readJSON: jest.fn(),
    writeJSON: jest.fn(),
    log: jest.fn()
}));

const mockUtils = await import('../../scripts/modules/utils.js');

describe('Obsidian Integration Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Create comprehensive test environment
        mockFs({
            '/test-project': {
                '.taskmaster': {
                    'tasks': {
                        'tasks.json': JSON.stringify({
                            master: {
                                tasks: [
                                    {
                                        id: 1,
                                        title: 'Initialize Repository',
                                        description: 'Set up the initial project structure',
                                        status: 'done',
                                        priority: 'high',
                                        dependencies: [],
                                        details: 'Create basic folder structure and configuration files',
                                        testStrategy: 'Verify all required files are created'
                                    },
                                    {
                                        id: 2,
                                        title: 'Implement Core Sync Functions',
                                        description: 'Build the main sync functionality',
                                        status: 'in-progress',
                                        priority: 'high',
                                        dependencies: [1],
                                        details: 'Implement bidirectional sync between TaskMaster and Obsidian',
                                        testStrategy: 'Test both sync directions with various scenarios'
                                    },
                                    {
                                        id: 3,
                                        title: 'Create Test Suite',
                                        description: 'Comprehensive testing for all functionality',
                                        status: 'pending',
                                        priority: 'medium',
                                        dependencies: [1, 2],
                                        details: 'Unit tests, integration tests, and edge case handling',
                                        testStrategy: 'Achieve 90% code coverage'
                                    }
                                ],
                                metadata: {
                                    created: '2023-01-01T00:00:00.000Z',
                                    updated: '2023-01-02T00:00:00.000Z',
                                    description: 'Test project tasks'
                                }
                            }
                        })
                    }
                }
            },
            '/obsidian-vault': {
                '.obsidian': {
                    'workspace.json': JSON.stringify({ main: { id: 'workspace' } }),
                    'config.json': JSON.stringify({ theme: 'moonstone' })
                },
                'existing-task.md': `---
task_id: 4
status: pending
priority: medium
---

# External Task

- [ ] External Task

## Description
This task was created in Obsidian

## Details
Should be imported into TaskMaster
`,
                'project-notes.md': `# Project Overview

This is a general project note.

## Tasks to Complete
- [ ] Review codebase
- [x] Setup development environment
- [ ] Write documentation

## Related
Links to other files: [[another-note]]
`,
                'another-note.md': `# Another Note

Some content here.

- [ ] Another task from different file
`
            },
            '/empty-vault': {
                '.obsidian': {
                    'workspace.json': '{}'
                }
            }
        });
    });

    afterEach(() => {
        mockFs.restore();
    });

    describe('Fresh Vault Setup Workflow', () => {
        test('should initialize empty vault and sync tasks', async () => {
            const vaultPath = '/empty-vault';
            const tasksPath = '/test-project/.taskmaster/tasks/tasks.json';
            
            // Mock readJSON to return test data
            mockUtils.readJSON.mockReturnValue({
                tasks: [
                    {
                        id: 1,
                        title: 'Test Task',
                        description: 'A test task',
                        status: 'pending',
                        priority: 'high'
                    }
                ]
            });

            // Step 1: Initialize vault
            const initResult = await initObsidianSync({
                vaultPath,
                tasksPath,
                tag: 'master',
                projectRoot: '/test-project'
            });

            expect(initResult.success).toBe(true);
            expect(fs.existsSync('/empty-vault/Tasks')).toBe(true);
            expect(fs.existsSync('/empty-vault/Tags')).toBe(true);
            expect(fs.existsSync('/empty-vault/TaskMaster-README.md')).toBe(true);

            // Step 2: Sync tasks to vault
            const syncResult = await syncTasksToObsidian({
                vaultPath,
                tasksPath,
                tag: 'master',
                projectRoot: '/test-project'
            });

            expect(syncResult.created).toBe(1);
            expect(syncResult.errors).toHaveLength(0);

            // Step 3: Verify markdown format
            const taskFile = '/empty-vault/Tasks/task-001-test-task.md';
            expect(fs.existsSync(taskFile)).toBe(true);
            
            const content = fs.readFileSync(taskFile, 'utf8');
            expect(content).toContain('---');
            expect(content).toContain('task_id: 1');
            expect(content).toContain('# Test Task');
            expect(content).toContain('- [ ] Test Task');
        });

        test('should handle vault validation during setup', async () => {
            // Try to initialize a non-existent vault
            const invalidVault = '/non-existent-vault';
            
            await expect(
                initObsidianSync({
                    vaultPath: invalidVault,
                    tasksPath: '/test-project/.taskmaster/tasks/tasks.json'
                })
            ).rejects.toThrow('does not exist');
        });
    });

    describe('Bidirectional Sync Workflow', () => {
        test('should sync tasks both directions and maintain consistency', async () => {
            const vaultPath = '/obsidian-vault';
            const tasksPath = '/test-project/.taskmaster/tasks/tasks.json';
            
            // First, mock existing TaskMaster tasks
            mockUtils.readJSON.mockReturnValue({
                tasks: [
                    {
                        id: 1,
                        title: 'TaskMaster Task',
                        description: 'Created in TaskMaster',
                        status: 'pending',
                        priority: 'high'
                    }
                ]
            });

            // Step 1: Sync TO Obsidian
            const toObsidianResult = await syncTasksToObsidian({
                vaultPath,
                tasksPath,
                tag: 'master',
                projectRoot: '/test-project'
            });

            expect(toObsidianResult.created).toBe(1);

            // Step 2: Sync FROM Obsidian (should pick up existing task)
            const fromObsidianResult = await syncTasksFromObsidian({
                vaultPath,
                tasksPath,
                tag: 'master',
                projectRoot: '/test-project'
            });

            // Should find tasks in the vault markdown files
            expect(fromObsidianResult.created).toBeGreaterThan(0);
            expect(mockUtils.writeJSON).toHaveBeenCalled();
        });

        test('should detect and report conflicts', async () => {
            const vaultPath = '/obsidian-vault';
            const tasksPath = '/test-project/.taskmaster/tasks/tasks.json';

            // Mock a task that exists in both places with different states
            mockUtils.readJSON.mockReturnValue({
                tasks: [
                    {
                        id: 1,
                        title: 'External Task',
                        status: 'done', // Different from vault (pending)
                        lastSyncAt: new Date('2023-01-01').toISOString(),
                        sourceFile: 'existing-task.md'
                    }
                ]
            });

            const result = await syncTasksFromObsidian({
                vaultPath,
                tasksPath,
                tag: 'master',
                projectRoot: '/test-project'
            });

            // Should detect conflict or handle it gracefully
            expect(mockUtils.log).toHaveBeenCalled();
        });

        test('should preserve data integrity during bidirectional sync', async () => {
            const vaultPath = '/obsidian-vault';
            const tasksPath = '/test-project/.taskmaster/tasks/tasks.json';

            // Initialize vault first
            await initObsidianSync({
                vaultPath,
                tasksPath,
                tag: 'master',
                projectRoot: '/test-project'
            });

            // Mock initial data
            const originalTasks = [
                {
                    id: 1,
                    title: 'Original Task',
                    description: 'Original description',
                    status: 'pending',
                    priority: 'high',
                    dependencies: [2],
                    details: 'Original details'
                },
                {
                    id: 2,
                    title: 'Dependency Task',
                    status: 'done',
                    priority: 'medium'
                }
            ];

            mockUtils.readJSON.mockReturnValue({ tasks: originalTasks });

            // Sync to Obsidian
            await syncTasksToObsidian({
                vaultPath,
                tasksPath,
                tag: 'master',
                projectRoot: '/test-project'
            });

            // Verify files were created
            expect(fs.existsSync('/obsidian-vault/Tasks/task-001-original-task.md')).toBe(true);
            expect(fs.existsSync('/obsidian-vault/Tasks/task-002-dependency-task.md')).toBe(true);

            // Check content preservation
            const taskContent = fs.readFileSync('/obsidian-vault/Tasks/task-001-original-task.md', 'utf8');
            expect(taskContent).toContain('Original description');
            expect(taskContent).toContain('Original details');
            expect(taskContent).toContain('- Task 2'); // Dependencies preserved
        });
    });

    describe('Status Monitoring Workflow', () => {
        test('should provide comprehensive sync status', async () => {
            const vaultPath = '/obsidian-vault';
            const tasksPath = '/test-project/.taskmaster/tasks/tasks.json';

            mockUtils.readJSON.mockReturnValue({
                tasks: [
                    { id: 1, title: 'TaskMaster Only', status: 'pending' },
                    { id: 2, title: 'External Task', status: 'done' } // Different status from vault
                ]
            });

            const status = await getObsidianSyncStatus({
                vaultPath,
                tasksPath,
                tag: 'master',
                projectRoot: '/test-project'
            });

            expect(status.vaultPath).toBe(vaultPath);
            expect(status.tasksInTaskMaster).toBe(2);
            expect(status.tasksInObsidian).toBeGreaterThan(0);
            expect(Array.isArray(status.outOfSync)).toBe(true);
            expect(Array.isArray(status.conflicts)).toBe(true);
        });

        test('should track sync history', async () => {
            const vaultPath = '/obsidian-vault';
            
            // Initialize with sync config
            await initObsidianSync({
                vaultPath,
                tasksPath: '/test-project/.taskmaster/tasks/tasks.json',
                tag: 'master',
                projectRoot: '/test-project'
            });

            const status = await getObsidianSyncStatus({
                vaultPath,
                tasksPath: '/test-project/.taskmaster/tasks/tasks.json'
            });

            expect(status.lastSync).toBeDefined();
        });
    });

    describe('Error Recovery Workflow', () => {
        test('should handle and recover from sync failures', async () => {
            const vaultPath = '/obsidian-vault';
            const tasksPath = '/test-project/.taskmaster/tasks/tasks.json';

            // Mock a scenario that causes errors
            mockUtils.readJSON.mockReturnValue({
                tasks: [
                    {
                        id: 1,
                        title: 'Valid Task',
                        status: 'pending'
                    },
                    {
                        id: 2,
                        title: 'Invalid/Characters:In<Name>',
                        status: 'pending'
                    }
                ]
            });

            const result = await syncTasksToObsidian({
                vaultPath,
                tasksPath,
                tag: 'master',
                projectRoot: '/test-project'
            });

            // Should have some successes and some errors
            expect(result.created + result.updated).toBeGreaterThan(0);
            expect(result.errors).toBeDefined();
        });

        test('should provide meaningful error messages', async () => {
            const vaultPath = '/non-existent-vault';
            const tasksPath = '/test-project/.taskmaster/tasks/tasks.json';

            mockUtils.readJSON.mockReturnValue({
                tasks: [{ id: 1, title: 'Test', status: 'pending' }]
            });

            // Should handle vault not existing
            const result = await syncTasksToObsidian({
                vaultPath,
                tasksPath
            });

            expect(result.errors.length).toBeGreaterThan(0);
            expect(mockUtils.log).toHaveBeenCalledWith(
                'error', 
                expect.stringContaining('Failed to sync task')
            );
        });
    });

    describe('Tag Context Workflow', () => {
        test('should handle different tag contexts', async () => {
            const vaultPath = '/obsidian-vault';
            const tasksPath = '/test-project/.taskmaster/tasks/tasks.json';

            // Mock different tag data
            mockUtils.readJSON
                .mockReturnValueOnce({
                    tasks: [{ id: 1, title: 'Master Task', status: 'pending' }]
                })
                .mockReturnValueOnce({
                    tasks: [{ id: 1, title: 'Feature Task', status: 'pending' }]
                });

            // Test master tag
            const masterResult = await syncTasksToObsidian({
                vaultPath,
                tasksPath,
                tag: 'master',
                projectRoot: '/test-project'
            });

            // Test feature tag
            const featureResult = await syncTasksToObsidian({
                vaultPath,
                tasksPath,
                tag: 'feature-branch',
                projectRoot: '/test-project'
            });

            expect(masterResult.created + masterResult.updated).toBe(1);
            expect(featureResult.created + featureResult.updated).toBe(1);
        });
    });

    describe('Performance and Scale Testing', () => {
        test('should handle large number of tasks efficiently', async () => {
            const vaultPath = '/obsidian-vault';
            const tasksPath = '/test-project/.taskmaster/tasks/tasks.json';

            // Create large dataset
            const largeTasks = [];
            for (let i = 1; i <= 100; i++) {
                largeTasks.push({
                    id: i,
                    title: `Task ${i}`,
                    description: `Description for task ${i}`,
                    status: i % 3 === 0 ? 'done' : 'pending',
                    priority: i % 2 === 0 ? 'high' : 'medium',
                    dependencies: i > 1 ? [i - 1] : [],
                    details: `Detailed implementation notes for task ${i}`,
                    testStrategy: `Test strategy for task ${i}`
                });
            }

            mockUtils.readJSON.mockReturnValue({ tasks: largeTasks });

            const startTime = Date.now();
            const result = await syncTasksToObsidian({
                vaultPath,
                tasksPath,
                tag: 'master',
                projectRoot: '/test-project'
            });
            const endTime = Date.now();

            expect(result.created).toBe(100);
            expect(result.errors).toHaveLength(0);
            
            // Performance should be reasonable (less than 5 seconds for 100 tasks)
            expect(endTime - startTime).toBeLessThan(5000);
        });

        test('should handle complex task hierarchies', async () => {
            const vaultPath = '/obsidian-vault';
            const tasksPath = '/test-project/.taskmaster/tasks/tasks.json';

            const complexTasks = [
                {
                    id: 1,
                    title: 'Parent Task',
                    status: 'in-progress',
                    subtasks: [
                        { id: '1.1', title: 'Subtask 1.1', status: 'done' },
                        { id: '1.2', title: 'Subtask 1.2', status: 'pending' }
                    ]
                },
                {
                    id: 2,
                    title: 'Dependent Task',
                    dependencies: [1],
                    status: 'pending'
                }
            ];

            mockUtils.readJSON.mockReturnValue({ tasks: complexTasks });

            const result = await syncTasksToObsidian({
                vaultPath,
                tasksPath,
                tag: 'master',
                projectRoot: '/test-project'
            });

            expect(result.created).toBe(2);
            
            // Check that dependencies are properly formatted
            const parentTaskFile = '/obsidian-vault/Tasks/task-001-parent-task.md';
            if (fs.existsSync(parentTaskFile)) {
                const content = fs.readFileSync(parentTaskFile, 'utf8');
                expect(content).toContain('# Parent Task');
                expect(content).toContain('in-progress');
            }
        });
    });

    describe('Dry Run Mode Integration', () => {
        test('should preview changes without making them', async () => {
            const vaultPath = '/obsidian-vault';
            const tasksPath = '/test-project/.taskmaster/tasks/tasks.json';

            mockUtils.readJSON.mockReturnValue({
                tasks: [
                    { id: 1, title: 'Test Task', status: 'pending' }
                ]
            });

            // Count files before
            const filesBefore = fs.readdirSync('/obsidian-vault', { recursive: true }).length;

            const result = await syncTasksToObsidian({
                vaultPath,
                tasksPath,
                dryRun: true
            });

            // Count files after
            const filesAfter = fs.readdirSync('/obsidian-vault', { recursive: true }).length;

            expect(filesBefore).toBe(filesAfter); // No files should be created
            expect(mockUtils.log).toHaveBeenCalledWith(
                'info', 
                expect.stringContaining('[DRY RUN]')
            );
        });

        test('should show accurate dry run preview', async () => {
            const vaultPath = '/obsidian-vault';
            const tasksPath = '/test-project/.taskmaster/tasks/tasks.json';

            // Create existing file for update test
            fs.mkdirSync('/obsidian-vault/Tasks', { recursive: true });
            fs.writeFileSync('/obsidian-vault/Tasks/task-001-existing.md', '# Existing');

            mockUtils.readJSON.mockReturnValue({
                tasks: [
                    { id: 1, title: 'existing', status: 'done' }, // Should be update
                    { id: 2, title: 'New Task', status: 'pending' } // Should be create
                ]
            });

            await syncTasksToObsidian({
                vaultPath,
                tasksPath,
                dryRun: true
            });

            // Should log both update and create operations
            expect(mockUtils.log).toHaveBeenCalledWith(
                'info',
                expect.stringContaining('Would update')
            );
            expect(mockUtils.log).toHaveBeenCalledWith(
                'info',
                expect.stringContaining('Would create')
            );
        });
    });
});
