/**
 * Unit tests for parse-obsidian-notes functionality
 * Tests the core parsing logic for extracting tasks from Obsidian vault notes
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import mockFs from 'mock-fs';
import parseObsidianNotes from '../../scripts/modules/task-manager/parse-obsidian-notes.js';

// Mock dependencies
jest.mock('../../scripts/modules/utils.js', () => ({
    log: jest.fn(),
    writeJSON: jest.fn(),
    readJSON: jest.fn(),
    enableSilentMode: jest.fn(),
    disableSilentMode: jest.fn(),
    isSilentMode: jest.fn(() => false),
    ensureTagMetadata: jest.fn(),
    getCurrentTag: jest.fn(() => 'master')
}));

jest.mock('../../scripts/modules/ai-services-unified.js', () => ({
    generateObjectService: jest.fn()
}));

jest.mock('../../scripts/modules/config-manager.js', () => ({
    getDebugFlag: jest.fn(() => false),
    getDefaultPriority: jest.fn(() => 'medium')
}));

jest.mock('../../scripts/modules/prompt-manager.js', () => ({
    getPromptManager: jest.fn(() => ({
        loadPrompt: jest.fn().mockResolvedValue({
            systemPrompt: 'Extract tasks from Obsidian notes',
            userPrompt: 'Analyze the following notes and extract actionable tasks'
        })
    }))
}));

jest.mock('../../scripts/modules/ui.js', () => ({
    displayAiUsageSummary: jest.fn()
}));

jest.mock('../../scripts/modules/task-manager/obsidian-sync.js', () => ({
    syncTasksToObsidian: jest.fn().mockResolvedValue({
        created: 0,
        updated: 0,
        errors: []
    })
}));

const mockUtils = await import('../../scripts/modules/utils.js');
const mockAiServices = await import('../../scripts/modules/ai-services-unified.js');
const mockConfigManager = await import('../../scripts/modules/config-manager.js');
const mockPromptManager = await import('../../scripts/modules/prompt-manager.js');
const mockObsidianSync = await import('../../scripts/modules/task-manager/obsidian-sync.js');

describe('Parse Obsidian Notes - Unit Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Setup mock filesystem for each test
        mockFs({
            '/test-vault': {
                '.obsidian': {
                    'workspace.json': '{}',
                    'config.json': '{}'
                },
                'project-overview.md': `---
tags: [project, planning]
priority: high
---

# Project Overview

This is the main project documentation.

## Key Tasks
- [ ] Setup development environment
- [x] Create project structure  
- [ ] Implement core features

## Dependencies
Need to coordinate with [[team-notes]] and [[technical-requirements]].

#development #planning`,
                'team-notes.md': `# Team Notes

Meeting notes from project planning.

## Action Items
- [ ] Schedule code review sessions
- [ ] Define testing strategy
- [ ] Setup CI/CD pipeline

Links: [[project-overview]], [[deployment-guide]]

#team #meetings`,
                'technical-requirements.md': `---
difficulty: complex
estimated_hours: 40
---

# Technical Requirements

Detailed technical specifications.

- [ ] Database schema design
- [ ] API endpoint specifications  
- [ ] Security implementation
- [x] Requirements gathering

## Research Notes
Need to investigate latest frameworks and best practices.

#technical #architecture`,
                'Templates': {
                    'task-template.md': '# Template\n- [ ] Template task'
                },
                'Archive': {
                    'old-notes.md': '# Old Notes\n- [ ] Archived task'
                }
            },
            '/empty-vault': {
                '.obsidian': {
                    'workspace.json': '{}'
                }
            },
            '/invalid-vault': {
                'not-obsidian.txt': 'Not an obsidian vault'
            },
            '/tasks.json': JSON.stringify({
                master: {
                    tasks: [
                        {
                            id: 1,
                            title: 'Existing Task',
                            description: 'Already exists',
                            status: 'pending',
                            priority: 'medium',
                            dependencies: [],
                            details: '',
                            testStrategy: ''
                        }
                    ],
                    metadata: {
                        created: '2024-01-01T00:00:00Z',
                        updated: '2024-01-01T00:00:00Z',
                        description: 'Existing tasks'
                    }
                }
            }),
            '/project': {}
        });
    });

    afterEach(() => {
        mockFs.restore();
    });

    describe('Basic Parsing Functionality', () => {
        test('should successfully parse tasks from Obsidian vault', async () => {
            // Mock AI service response
            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: {
                    tasks: [
                        {
                            id: 1,
                            title: 'Setup Development Environment',
                            description: 'Initialize project development setup',
                            details: 'Create necessary configuration files and folder structure',
                            testStrategy: 'Verify all tools are properly installed',
                            priority: 'high',
                            dependencies: [],
                            status: 'pending',
                            sourceFile: 'project-overview.md',
                            obsidianTags: ['development', 'planning'],
                            linkedNotes: ['[[team-notes]]', '[[technical-requirements]]'],
                            vaultLocation: '/test-vault'
                        },
                        {
                            id: 2,
                            title: 'Implement Core Features',
                            description: 'Build the main application functionality',
                            details: 'Focus on core business logic implementation',
                            testStrategy: 'Unit tests and integration testing',
                            priority: 'medium',
                            dependencies: [1],
                            status: 'pending',
                            sourceFile: 'project-overview.md',
                            obsidianTags: ['development'],
                            linkedNotes: [],
                            vaultLocation: '/test-vault'
                        }
                    ]
                }
            });

            const result = await parseObsidianNotes(
                '/test-vault',
                '/tasks.json',
                5,
                {
                    force: true,
                    tag: 'master',
                    projectRoot: '/project',
                    syncAfterParse: false
                }
            );

            expect(mockAiServices.generateObjectService).toHaveBeenCalledWith({
                role: 'main',
                session: undefined,
                projectRoot: '/project',
                schema: expect.any(Object),
                objectName: 'obsidian_tasks_data',
                systemPrompt: expect.any(String),
                prompt: expect.any(String),
                commandName: 'parse-obsidian-notes',
                outputType: 'cli'
            });

            // Verify tasks were written to file
            expect(fs.existsSync('/tasks.json')).toBe(true);
            const tasksData = JSON.parse(fs.readFileSync('/tasks.json', 'utf8'));
            expect(tasksData.master.tasks).toHaveLength(2);
            expect(tasksData.master.tasks[0].title).toBe('Setup Development Environment');
            expect(tasksData.master.tasks[1].title).toBe('Implement Core Features');
        });

        test('should handle append mode correctly', async () => {
            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: {
                    tasks: [
                        {
                            id: 1,
                            title: 'New Task from Notes',
                            description: 'Additional task from vault parsing',
                            details: '',
                            testStrategy: '',
                            priority: 'medium',
                            dependencies: [],
                            status: 'pending',
                            sourceFile: 'team-notes.md',
                            obsidianTags: ['team'],
                            linkedNotes: [],
                            vaultLocation: '/test-vault'
                        }
                    ]
                }
            });

            await parseObsidianNotes(
                '/test-vault',
                '/tasks.json',
                3,
                {
                    append: true,
                    tag: 'master',
                    projectRoot: '/project',
                    syncAfterParse: false
                }
            );

            const tasksData = JSON.parse(fs.readFileSync('/tasks.json', 'utf8'));
            expect(tasksData.master.tasks).toHaveLength(2); // 1 existing + 1 new
            expect(tasksData.master.tasks[1].title).toBe('New Task from Notes');
            expect(tasksData.master.tasks[1].id).toBe(2); // Should continue from existing ID
        });

        test('should throw error when vault does not exist', async () => {
            await expect(
                parseObsidianNotes(
                    '/non-existent-vault',
                    '/tasks.json',
                    5,
                    { force: true }
                )
            ).rejects.toThrow('Vault path does not exist');
        });

        test('should warn for invalid Obsidian vault', async () => {
            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: { tasks: [] }
            });

            await parseObsidianNotes(
                '/invalid-vault',
                '/tasks.json',
                5,
                {
                    force: true,
                    syncAfterParse: false
                }
            );

            expect(mockUtils.log).toHaveBeenCalledWith(
                'warn',
                expect.stringContaining('No .obsidian directory found')
            );
        });
    });

    describe('Content Extraction and Processing', () => {
        test('should extract frontmatter, tags, and links correctly', async () => {
            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: { tasks: [] }
            });

            await parseObsidianNotes(
                '/test-vault',
                '/tasks.json',
                5,
                {
                    force: true,
                    preserveLinks: true,
                    includeTags: true,
                    syncAfterParse: false
                }
            );

            const aiCall = mockAiServices.generateObjectService.mock.calls[0][0];
            expect(aiCall.prompt).toContain('project-overview.md');
            expect(aiCall.prompt).toContain('team-notes.md');
            expect(aiCall.prompt).toContain('technical-requirements.md');
            
            // Should contain extracted content
            expect(aiCall.prompt).toContain('Setup development environment');
            expect(aiCall.prompt).toContain('[[team-notes]]');
            expect(aiCall.prompt).toContain('#development');
        });

        test('should exclude specified patterns', async () => {
            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: { tasks: [] }
            });

            await parseObsidianNotes(
                '/test-vault',
                '/tasks.json',
                5,
                {
                    force: true,
                    excludePatterns: ['**/Templates/**', '**/Archive/**'],
                    syncAfterParse: false
                }
            );

            const aiCall = mockAiServices.generateObjectService.mock.calls[0][0];
            expect(aiCall.prompt).not.toContain('task-template.md');
            expect(aiCall.prompt).not.toContain('old-notes.md');
        });

        test('should handle empty vault gracefully', async () => {
            await expect(
                parseObsidianNotes(
                    '/empty-vault',
                    '/tasks.json',
                    5,
                    { force: true }
                )
            ).rejects.toThrow('No markdown files found in vault');
        });

        test('should extract existing tasks from markdown', async () => {
            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: { tasks: [] }
            });

            await parseObsidianNotes(
                '/test-vault',
                '/tasks.json',
                5,
                {
                    force: true,
                    syncAfterParse: false
                }
            );

            const aiCall = mockAiServices.generateObjectService.mock.calls[0][0];
            expect(aiCall.prompt).toContain('Existing Tasks Found:');
            expect(aiCall.prompt).toContain('Setup development environment');
            expect(aiCall.prompt).toContain('Create project structure');
        });
    });

    describe('Research Mode', () => {
        test('should use research role when enabled', async () => {
            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: { tasks: [] }
            });

            await parseObsidianNotes(
                '/test-vault',
                '/tasks.json',
                5,
                {
                    force: true,
                    research: true,
                    syncAfterParse: false
                }
            );

            expect(mockAiServices.generateObjectService).toHaveBeenCalledWith(
                expect.objectContaining({
                    role: 'research'
                })
            );
        });

        test('should include research context in prompts', async () => {
            const mockPromptManager = {
                loadPrompt: jest.fn().mockResolvedValue({
                    systemPrompt: 'Research-enabled system prompt',
                    userPrompt: 'Research-enabled user prompt'
                })
            };

            jest.mocked(mockPromptManager.getPromptManager).mockReturnValue(mockPromptManager);

            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: { tasks: [] }
            });

            await parseObsidianNotes(
                '/test-vault',
                '/tasks.json',
                5,
                {
                    force: true,
                    research: true,
                    syncAfterParse: false
                }
            );

            expect(mockPromptManager.loadPrompt).toHaveBeenCalledWith(
                'parse-obsidian-notes',
                expect.objectContaining({
                    research: true
                })
            );
        });
    });

    describe('Task Processing and Dependencies', () => {
        test('should properly remap dependencies', async () => {
            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: {
                    tasks: [
                        {
                            id: 100, // AI-generated ID
                            title: 'Base Task',
                            description: 'Foundation task',
                            details: '',
                            testStrategy: '',
                            priority: 'high',
                            dependencies: [],
                            status: 'pending',
                            sourceFile: 'project-overview.md',
                            obsidianTags: [],
                            linkedNotes: [],
                            vaultLocation: '/test-vault'
                        },
                        {
                            id: 200, // AI-generated ID
                            title: 'Dependent Task',
                            description: 'Depends on base task',
                            details: '',
                            testStrategy: '',
                            priority: 'medium',
                            dependencies: [100], // References AI ID
                            status: 'pending',
                            sourceFile: 'project-overview.md',
                            obsidianTags: [],
                            linkedNotes: [],
                            vaultLocation: '/test-vault'
                        }
                    ]
                }
            });

            await parseObsidianNotes(
                '/test-vault',
                '/tasks.json',
                5,
                {
                    force: true,
                    tag: 'master',
                    syncAfterParse: false
                }
            );

            const tasksData = JSON.parse(fs.readFileSync('/tasks.json', 'utf8'));
            const tasks = tasksData.master.tasks;
            
            expect(tasks).toHaveLength(2);
            expect(tasks[0].id).toBe(1); // Sequential ID
            expect(tasks[1].id).toBe(2); // Sequential ID
            expect(tasks[1].dependencies).toEqual([1]); // Remapped dependency
        });

        test('should filter invalid dependencies', async () => {
            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: {
                    tasks: [
                        {
                            id: 100,
                            title: 'Task with Invalid Dependencies',
                            description: 'Has references to non-existent tasks',
                            details: '',
                            testStrategy: '',
                            priority: 'medium',
                            dependencies: [999, 100, 200], // Invalid references
                            status: 'pending',
                            sourceFile: 'project-overview.md',
                            obsidianTags: [],
                            linkedNotes: [],
                            vaultLocation: '/test-vault'
                        }
                    ]
                }
            });

            await parseObsidianNotes(
                '/test-vault',
                '/tasks.json',
                5,
                {
                    force: true,
                    tag: 'master',
                    syncAfterParse: false
                }
            );

            const tasksData = JSON.parse(fs.readFileSync('/tasks.json', 'utf8'));
            const tasks = tasksData.master.tasks;
            
            expect(tasks[0].dependencies).toEqual([]); // Invalid deps filtered out
        });
    });

    describe('MCP Integration', () => {
        test('should handle MCP logging correctly', async () => {
            const mcpLog = {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
                success: jest.fn()
            };

            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: { tasks: [] }
            });

            await parseObsidianNotes(
                '/test-vault',
                '/tasks.json',
                5,
                {
                    force: true,
                    mcpLog,
                    syncAfterParse: false
                }
            );

            expect(mcpLog.info).toHaveBeenCalled();
            expect(mcpLog.success).toHaveBeenCalled();
        });

        test('should use JSON output format for MCP', async () => {
            const mcpLog = {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
                success: jest.fn()
            };

            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: { tasks: [] }
            });

            await parseObsidianNotes(
                '/test-vault',
                '/tasks.json',
                5,
                {
                    force: true,
                    mcpLog,
                    syncAfterParse: false
                }
            );

            expect(mockAiServices.generateObjectService).toHaveBeenCalledWith(
                expect.objectContaining({
                    outputType: 'mcp'
                })
            );
        });
    });

    describe('Error Handling', () => {
        test('should handle AI service errors gracefully', async () => {
            mockAiServices.generateObjectService.mockRejectedValue(
                new Error('AI service unavailable')
            );

            await expect(
                parseObsidianNotes(
                    '/test-vault',
                    '/tasks.json',
                    5,
                    { force: true }
                )
            ).rejects.toThrow('AI service unavailable');
        });

        test('should handle invalid AI response format', async () => {
            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: 'invalid format'
            });

            await expect(
                parseObsidianNotes(
                    '/test-vault',
                    '/tasks.json',
                    5,
                    { force: true }
                )
            ).rejects.toThrow('AI service returned unexpected data structure');
        });

        test('should handle file system errors', async () => {
            const originalWriteFileSync = fs.writeFileSync;
            fs.writeFileSync = jest.fn().mockImplementation(() => {
                throw new Error('Permission denied');
            });

            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: { tasks: [] }
            });

            await expect(
                parseObsidianNotes(
                    '/test-vault',
                    '/tasks.json',
                    5,
                    { force: true }
                )
            ).rejects.toThrow('Permission denied');

            // Restore
            fs.writeFileSync = originalWriteFileSync;
        });

        test('should prevent overwrite without force flag', async () => {
            await expect(
                parseObsidianNotes(
                    '/test-vault',
                    '/tasks.json',
                    5,
                    {
                        tag: 'master', // Has existing tasks
                        force: false,
                        append: false
                    }
                )
            ).rejects.toThrow('already contains');
        });
    });

    describe('Post-Processing and Sync', () => {
        test('should sync tasks to Obsidian when requested', async () => {
            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: {
                    tasks: [{
                        id: 1,
                        title: 'Test Task',
                        description: 'Test',
                        details: '',
                        testStrategy: '',
                        priority: 'medium',
                        dependencies: [],
                        status: 'pending',
                        sourceFile: 'test.md',
                        obsidianTags: [],
                        linkedNotes: [],
                        vaultLocation: '/test-vault'
                    }]
                }
            });

            await parseObsidianNotes(
                '/test-vault',
                '/tasks.json',
                5,
                {
                    force: true,
                    syncAfterParse: true,
                    tag: 'master',
                    projectRoot: '/project'
                }
            );

            expect(mockObsidianSync.syncTasksToObsidian).toHaveBeenCalledWith({
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json',
                tag: 'master',
                projectRoot: '/project',
                dryRun: false
            });
        });

        test('should handle sync errors gracefully', async () => {
            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: { tasks: [] }
            });

            mockObsidianSync.syncTasksToObsidian.mockRejectedValue(
                new Error('Sync failed')
            );

            // Should not throw, just warn
            await parseObsidianNotes(
                '/test-vault',
                '/tasks.json',
                5,
                {
                    force: true,
                    syncAfterParse: true
                }
            );

            expect(mockUtils.log).toHaveBeenCalledWith(
                'warn',
                expect.stringContaining('Failed to sync tasks back to vault')
            );
        });
    });

    describe('Metadata and Tag Management', () => {
        test('should preserve other tags when updating specific tag', async () => {
            // Setup existing data with multiple tags
            const existingData = {
                master: {
                    tasks: [{ id: 1, title: 'Master task' }],
                    metadata: { created: '2024-01-01T00:00:00Z' }
                },
                feature: {
                    tasks: [{ id: 1, title: 'Feature task' }],
                    metadata: { created: '2024-01-01T00:00:00Z' }
                }
            };
            
            fs.writeFileSync('/tasks.json', JSON.stringify(existingData));

            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: { tasks: [] }
            });

            await parseObsidianNotes(
                '/test-vault',
                '/tasks.json',
                5,
                {
                    force: true,
                    tag: 'master',
                    syncAfterParse: false
                }
            );

            const updatedData = JSON.parse(fs.readFileSync('/tasks.json', 'utf8'));
            expect(updatedData.feature).toBeDefined(); // Should preserve other tags
            expect(updatedData.master.metadata.vaultPath).toBe('/test-vault');
        });

        test('should create proper metadata for new tasks', async () => {
            mockAiServices.generateObjectService.mockResolvedValue({
                mainResult: { tasks: [] }
            });

            await parseObsidianNotes(
                '/test-vault',
                '/tasks.json',
                5,
                {
                    force: true,
                    tag: 'new-tag',
                    syncAfterParse: false
                }
            );

            const tasksData = JSON.parse(fs.readFileSync('/tasks.json', 'utf8'));
            const metadata = tasksData['new-tag'].metadata;
            
            expect(metadata.vaultPath).toBe('/test-vault');
            expect(metadata.distributedMode).toBe(true);
            expect(metadata.syncSettings).toBeDefined();
            expect(metadata.extractionDate).toBeDefined();
        });
    });
});
