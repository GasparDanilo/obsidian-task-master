/**
 * Simplified unit tests for parse-obsidian-notes functionality
 * Works around Windows Jest issues with mock-fs
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import parseObsidianNotes from '../../scripts/modules/task-manager/parse-obsidian-notes.js';

// Setup mocks
const mockGenerateObjectService = jest.fn();
const mockLog = jest.fn();
const mockEnsureTagMetadata = jest.fn();
const mockReadJSON = jest.fn();
const mockWriteJSON = jest.fn();
const mockSyncTasksToObsidian = jest.fn().mockResolvedValue({
    created: 0,
    updated: 0,
    errors: []
});

// Mock all dependencies explicitly
jest.mock('../../scripts/modules/utils.js', () => ({
    log: mockLog,
    writeJSON: mockWriteJSON,
    readJSON: mockReadJSON,
    enableSilentMode: jest.fn(),
    disableSilentMode: jest.fn(),
    isSilentMode: jest.fn(() => false),
    ensureTagMetadata: mockEnsureTagMetadata,
    getCurrentTag: jest.fn(() => 'master')
}));

jest.mock('../../scripts/modules/ai-services-unified.js', () => ({
    generateObjectService: mockGenerateObjectService
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
    syncTasksToObsidian: mockSyncTasksToObsidian
}));

// Mock filesystem operations
const mockExistsSync = jest.fn();
const mockStatSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const originalFsModule = { ...fs };

// Manually override file system functions
fs.existsSync = mockExistsSync;
fs.statSync = mockStatSync;
fs.mkdirSync = mockMkdirSync;
fs.readFileSync = mockReadFileSync;
fs.writeFileSync = mockWriteFileSync;

// Mock glob
jest.mock('glob', () => ({
    sync: jest.fn()
}));

// Helper function to create a mock stat object
const createMockStat = (isDirectory = false, size = 1024, mtime = new Date()) => ({
    isDirectory: () => isDirectory,
    size,
    mtime
});

describe('Parse Obsidian Notes - Simplified Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Setup default mocks for file operations
        mockExistsSync.mockImplementation(path => {
            // Default behavior: most paths exist except specific ones
            if (path.includes('non-existent')) return false;
            return true;
        });
        
        mockStatSync.mockImplementation(path => {
            // Default behavior: return appropriate stat object
            if (path.includes('.obsidian')) {
                return createMockStat(true);
            }
            if (path.endsWith('.md')) {
                return createMockStat(false, 2048);
            }
            return createMockStat(path.endsWith('/') || !path.includes('.'));
        });
        
        // Mock glob to return some markdown files
        jest.requireMock('glob').sync.mockReturnValue([
            'project-notes.md',
            'tasks/todo.md',
            'research/findings.md'
        ]);
        
        // Mock readFileSync to return reasonable markdown content
        mockReadFileSync.mockImplementation((path, encoding) => {
            if (path.endsWith('todo.md')) {
                return `---
status: pending
priority: high
---

# Task List

- [ ] Complete implementation
- [ ] Write tests
- [ ] Document API

## Dependencies
Links to [[project-notes]]

#tasks #todo`;
            }
            
            if (path.endsWith('project-notes.md')) {
                return `# Project Notes

This is a sample project note.

## Action Items
- [ ] Setup development environment
- [x] Create project structure

#project #planning`;
            }
            
            if (path.endsWith('tasks.json')) {
                return JSON.stringify({
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
                });
            }
            
            return '';
        });
    });
    
    afterEach(() => {
        // Restore original fs methods if needed for other tests
        jest.restoreAllMocks();
    });
    
    describe('Basic Functionality', () => {
        test('should process tasks successfully when AI returns valid response', async () => {
            // Setup the mock vault path to exist
            mockExistsSync.mockImplementation(path => {
                if (path === '/test-vault' || path === '/test-vault/.obsidian') {
                    return true;
                }
                if (path === '/tasks.json') {
                    return false;
                }
                return false;
            });
            
            // Mock directory structure
            mockStatSync.mockImplementation(path => {
                if (path === '/test-vault' || path === '/test-vault/.obsidian') {
                    return createMockStat(true);
                }
                return createMockStat(false);
            });
            
            // Mock AI response
            mockGenerateObjectService.mockResolvedValue({
                mainResult: {
                    tasks: [
                        {
                            id: 1,
                            title: 'Setup Development Environment',
                            description: 'Initialize project development setup',
                            details: 'Create necessary configuration files',
                            testStrategy: 'Verify all tools are properly installed',
                            priority: 'high',
                            dependencies: [],
                            status: 'pending',
                            sourceFile: 'project-notes.md',
                            obsidianTags: ['project', 'planning'],
                            linkedNotes: [],
                            vaultLocation: '/test-vault'
                        }
                    ]
                }
            });
            
            // Execute function
            const result = await parseObsidianNotes('/test-vault', '/tasks.json', 5, {
                force: true,
                syncAfterParse: false
            });
            
            // Verify result
            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            expect(result.extractedTasks).toBe(1);
            
            // Verify AI service was called
            expect(mockGenerateObjectService).toHaveBeenCalledWith(
                expect.objectContaining({
                    role: 'main',
                    schema: expect.any(Object),
                    objectName: 'obsidian_tasks_data'
                })
            );
            
            // Verify file was written
            expect(mockWriteFileSync).toHaveBeenCalledWith(
                '/tasks.json',
                expect.any(String)
            );
        });
        
        test('should handle empty vault error', async () => {
            // Setup the mock vault path to exist but be empty
            mockExistsSync.mockImplementation(path => {
                if (path === '/empty-vault' || path === '/empty-vault/.obsidian') {
                    return true;
                }
                return false;
            });
            
            // Return empty file list from glob
            jest.requireMock('glob').sync.mockReturnValue([]);
            
            await expect(
                parseObsidianNotes('/empty-vault', '/tasks.json', 5, { force: true })
            ).rejects.toThrow('No markdown files found in vault');
            
            expect(mockLog).toHaveBeenCalledWith(
                'error',
                expect.stringContaining('Error parsing Obsidian notes')
            );
        });
        
        test('should handle non-existent vault error', async () => {
            // Setup the mock vault path to not exist
            mockExistsSync.mockReturnValue(false);
            
            await expect(
                parseObsidianNotes('/non-existent-vault', '/tasks.json', 5, { force: true })
            ).rejects.toThrow('Vault path does not exist');
        });
    });
    
    describe('Task Processing', () => {
        test('should append tasks when in append mode', async () => {
            // Setup existing tasks
            mockExistsSync.mockImplementation(path => {
                if (path === '/test-vault' || path === '/test-vault/.obsidian') {
                    return true;
                }
                if (path === '/tasks.json') {
                    return true;
                }
                return false;
            });
            
            mockReadFileSync.mockImplementation((path, encoding) => {
                if (path === '/tasks.json') {
                    return JSON.stringify({
                        master: {
                            tasks: [
                                {
                                    id: 1,
                                    title: 'Existing Task',
                                    description: 'Pre-existing task',
                                    status: 'pending',
                                    priority: 'medium',
                                    dependencies: [],
                                    details: '',
                                    testStrategy: ''
                                }
                            ],
                            metadata: {
                                created: '2024-01-01T00:00:00Z',
                                updated: '2024-01-01T00:00:00Z'
                            }
                        }
                    });
                }
                return '';
            });
            
            // Mock AI response
            mockGenerateObjectService.mockResolvedValue({
                mainResult: {
                    tasks: [
                        {
                            id: 1,
                            title: 'New Task',
                            description: 'Added task',
                            details: '',
                            testStrategy: '',
                            priority: 'medium',
                            dependencies: [],
                            status: 'pending',
                            sourceFile: 'project-notes.md',
                            obsidianTags: [],
                            linkedNotes: [],
                            vaultLocation: '/test-vault'
                        }
                    ]
                }
            });
            
            // Execute function with append mode
            await parseObsidianNotes('/test-vault', '/tasks.json', 5, {
                append: true,
                syncAfterParse: false
            });
            
            // Verify file was written with both tasks
            expect(mockWriteFileSync).toHaveBeenCalledWith(
                '/tasks.json',
                expect.stringContaining('New Task')
            );
            
            // Check that the written content has both tasks
            const writeCall = mockWriteFileSync.mock.calls[0];
            const writtenContent = writeCall[1];
            const parsedContent = JSON.parse(writtenContent);
            
            expect(parsedContent.master.tasks.length).toBe(2);
            expect(parsedContent.master.tasks[0].title).toBe('Existing Task');
            expect(parsedContent.master.tasks[1].title).toBe('New Task');
            expect(parsedContent.master.tasks[1].id).toBe(2); // Should be incremented
        });
        
        test('should remap AI-generated IDs to sequential IDs', async () => {
            // Setup the mock vault path to exist
            mockExistsSync.mockImplementation(path => {
                if (path === '/test-vault' || path === '/test-vault/.obsidian') {
                    return true;
                }
                return false;
            });
            
            // Mock AI response with non-sequential IDs
            mockGenerateObjectService.mockResolvedValue({
                mainResult: {
                    tasks: [
                        {
                            id: 100, // AI-generated ID
                            title: 'Task One',
                            description: 'First task',
                            details: '',
                            testStrategy: '',
                            priority: 'high',
                            dependencies: [],
                            status: 'pending',
                            sourceFile: 'project-notes.md',
                            obsidianTags: [],
                            linkedNotes: [],
                            vaultLocation: '/test-vault'
                        },
                        {
                            id: 200, // AI-generated ID
                            title: 'Task Two',
                            description: 'Second task with dependency',
                            details: '',
                            testStrategy: '',
                            priority: 'medium',
                            dependencies: [100], // References the first task
                            status: 'pending',
                            sourceFile: 'project-notes.md',
                            obsidianTags: [],
                            linkedNotes: [],
                            vaultLocation: '/test-vault'
                        }
                    ]
                }
            });
            
            // Execute function
            await parseObsidianNotes('/test-vault', '/tasks.json', 5, {
                force: true,
                syncAfterParse: false
            });
            
            // Verify dependencies were properly remapped
            const writeCall = mockWriteFileSync.mock.calls[0];
            const writtenContent = writeCall[1];
            const parsedContent = JSON.parse(writtenContent);
            
            expect(parsedContent.master.tasks[0].id).toBe(1); // Sequential ID
            expect(parsedContent.master.tasks[1].id).toBe(2); // Sequential ID
            expect(parsedContent.master.tasks[1].dependencies).toEqual([1]); // Remapped dependency
        });
    });
    
    describe('Advanced Options', () => {
        test('should use research mode when specified', async () => {
            // Setup the mock vault path to exist
            mockExistsSync.mockImplementation(path => {
                if (path === '/test-vault' || path === '/test-vault/.obsidian') {
                    return true;
                }
                return false;
            });
            
            // Mock AI response
            mockGenerateObjectService.mockResolvedValue({
                mainResult: { tasks: [] }
            });
            
            // Execute function with research flag
            await parseObsidianNotes('/test-vault', '/tasks.json', 5, {
                force: true,
                research: true,
                syncAfterParse: false
            });
            
            // Verify research role was used
            expect(mockGenerateObjectService).toHaveBeenCalledWith(
                expect.objectContaining({
                    role: 'research'
                })
            );
        });
        
        test('should sync tasks to Obsidian when requested', async () => {
            // Setup the mock vault path to exist
            mockExistsSync.mockImplementation(path => {
                if (path === '/test-vault' || path === '/test-vault/.obsidian') {
                    return true;
                }
                return false;
            });
            
            // Mock AI response
            mockGenerateObjectService.mockResolvedValue({
                mainResult: { tasks: [] }
            });
            
            // Execute function with sync flag
            await parseObsidianNotes('/test-vault', '/tasks.json', 5, {
                force: true,
                tag: 'custom-tag',
                syncAfterParse: true,
                projectRoot: '/project'
            });
            
            // Verify sync was called
            expect(mockSyncTasksToObsidian).toHaveBeenCalledWith({
                vaultPath: '/test-vault',
                tasksPath: '/tasks.json',
                tag: 'custom-tag',
                projectRoot: '/project',
                dryRun: false
            });
        });
        
        test('should prevent overwrite of existing tasks without force flag', async () => {
            // Setup existing tasks
            mockExistsSync.mockImplementation(path => {
                if (path === '/test-vault' || path === '/test-vault/.obsidian') {
                    return true;
                }
                if (path === '/tasks.json') {
                    return true;
                }
                return false;
            });
            
            mockReadFileSync.mockImplementation((path, encoding) => {
                if (path === '/tasks.json') {
                    return JSON.stringify({
                        master: {
                            tasks: [
                                {
                                    id: 1,
                                    title: 'Existing Task',
                                    description: 'Pre-existing task',
                                    status: 'pending'
                                }
                            ]
                        }
                    });
                }
                return '';
            });
            
            // Execute function without force or append flags
            await expect(
                parseObsidianNotes('/test-vault', '/tasks.json', 5, {
                    force: false,
                    append: false
                })
            ).rejects.toThrow('already contains');
        });
    });
    
    describe('Error Handling', () => {
        test('should handle AI service errors gracefully', async () => {
            // Setup the mock vault path to exist
            mockExistsSync.mockImplementation(path => {
                if (path === '/test-vault' || path === '/test-vault/.obsidian') {
                    return true;
                }
                return false;
            });
            
            // Mock AI service error
            mockGenerateObjectService.mockRejectedValue(
                new Error('AI service unavailable')
            );
            
            // Execute function
            await expect(
                parseObsidianNotes('/test-vault', '/tasks.json', 5, { force: true })
            ).rejects.toThrow('AI service unavailable');
            
            expect(mockLog).toHaveBeenCalledWith(
                'error',
                expect.stringContaining('Error parsing Obsidian notes')
            );
        });
        
        test('should handle invalid AI response format', async () => {
            // Setup the mock vault path to exist
            mockExistsSync.mockImplementation(path => {
                if (path === '/test-vault' || path === '/test-vault/.obsidian') {
                    return true;
                }
                return false;
            });
            
            // Mock invalid AI response
            mockGenerateObjectService.mockResolvedValue({
                mainResult: 'invalid format' // Not an object with tasks
            });
            
            // Execute function
            await expect(
                parseObsidianNotes('/test-vault', '/tasks.json', 5, { force: true })
            ).rejects.toThrow('AI service returned unexpected data structure');
        });
    });
});
