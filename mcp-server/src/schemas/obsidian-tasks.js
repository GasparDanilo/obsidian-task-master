/**
 * Zod schema definitions for Obsidian task parsing and validation
 * Defines the structure and validation rules for tasks extracted from Obsidian vaults
 */

import { z } from 'zod';

/**
 * Priority levels for tasks
 */
export const TaskPrioritySchema = z.enum(['high', 'medium', 'low']);

/**
 * Status options for tasks
 */
export const TaskStatusSchema = z.enum([
    'pending',
    'done', 
    'in-progress',
    'review',
    'deferred',
    'cancelled'
]);

/**
 * Schema for a single task extracted from Obsidian notes
 * Contains both standard TaskMaster fields and Obsidian-specific metadata
 */
export const ObsidianTaskSchema = z.object({
    // Core TaskMaster fields
    id: z.number().int().positive('Task ID must be a positive integer'),
    title: z.string().min(1, 'Task title is required').max(200, 'Task title too long'),
    description: z.string().min(1, 'Task description is required'),
    details: z.string().default(''),
    testStrategy: z.string().default(''),
    priority: TaskPrioritySchema.default('medium'),
    dependencies: z.array(z.number().int().positive()).default([]),
    status: TaskStatusSchema.default('pending'),
    
    // Obsidian-specific fields
    sourceFile: z.string().min(1, 'Source file path is required'),
    obsidianTags: z.array(z.string()).optional().default([]),
    linkedNotes: z.array(z.string()).optional().default([]),
    vaultLocation: z.string().min(1, 'Vault location is required'),
    
    // Optional metadata fields
    frontmatterData: z.record(z.string(), z.any()).optional(),
    lineNumber: z.number().int().positive().optional(),
    section: z.string().optional(),
    originalTaskText: z.string().optional(),
    
    // Sync tracking fields  
    syncStatus: z.enum(['pending', 'synced', 'conflict', 'error']).default('pending'),
    lastSyncAt: z.string().datetime().optional(),
    conflictResolution: z.enum(['manual', 'obsidian_wins', 'taskmaster_wins']).optional()
});

/**
 * Schema for the complete response from AI service when parsing Obsidian notes
 */
export const ObsidianNotesResponseSchema = z.object({
    tasks: z.array(ObsidianTaskSchema).min(0, 'Tasks array cannot be negative length'),
    
    // Optional metadata about the parsing process
    metadata: z.object({
        totalFilesScanned: z.number().int().nonnegative().optional(),
        totalTasksFound: z.number().int().nonnegative().optional(),
        vaultPath: z.string().optional(),
        scanTimestamp: z.string().datetime().optional(),
        extractionMethod: z.enum(['ai', 'regex', 'hybrid']).default('ai'),
        confidenceScore: z.number().min(0).max(1).optional()
    }).optional()
});

/**
 * Schema for vault scanning configuration and options
 */
export const VaultScanOptionsSchema = z.object({
    excludePatterns: z.array(z.string()).default([
        '**/Templates/**',
        '**/Archive/**', 
        '**/.obsidian/**',
        '**/Tasks/**'
    ]),
    includePatterns: z.array(z.string()).default(['**/*.md']),
    maxDepth: z.number().int().positive().default(10),
    maxFileSize: z.number().int().positive().default(1024 * 1024), // 1MB
    preserveLinks: z.boolean().default(true),
    includeTags: z.boolean().default(true),
    extractFrontmatter: z.boolean().default(true)
});

/**
 * Schema for task parsing configuration
 */
export const ParseConfigSchema = z.object({
    numTasks: z.number().int().positive().max(100, 'Cannot generate more than 100 tasks at once'),
    force: z.boolean().default(false),
    append: z.boolean().default(false),
    research: z.boolean().default(false),
    tag: z.string().min(1).default('master'),
    syncAfterParse: z.boolean().default(true),
    autoSync: z.boolean().default(false),
    
    // Vault and file paths
    vaultPath: z.string().min(1, 'Vault path is required'),
    tasksPath: z.string().min(1, 'Tasks file path is required'),
    projectRoot: z.string().optional(),
    
    // Advanced options
    scanOptions: VaultScanOptionsSchema.optional()
});

/**
 * Schema for consolidating scanned vault content
 */
export const VaultContentSchema = z.object({
    vaultPath: z.string(),
    scanTimestamp: z.string().datetime(),
    files: z.array(z.object({
        path: z.string(),
        fullPath: z.string(),
        size: z.number().int().nonnegative(),
        modified: z.string().datetime(),
        frontmatter: z.record(z.string(), z.any()).default({}),
        tags: z.array(z.string()).default([]),
        links: z.array(z.string()).default([]),
        existingTasks: z.number().int().nonnegative().default(0)
    })),
    totalFiles: z.number().int().nonnegative(),
    totalSize: z.number().int().nonnegative(),
    content: z.string(),
    tags: z.set(z.string()).or(z.array(z.string())), // Support both Set and Array
    links: z.set(z.string()).or(z.array(z.string())), // Support both Set and Array
    existingTasks: z.array(z.object({
        text: z.string(),
        completed: z.boolean(),
        file: z.string()
    }))
});

/**
 * Schema for task synchronization results
 */
export const SyncResultSchema = z.object({
    created: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    errors: z.array(z.object({
        taskId: z.number().int().positive().optional(),
        fileName: z.string().optional(),
        error: z.string(),
        type: z.enum(['creation', 'update', 'validation', 'permission', 'network']).optional()
    })),
    conflicts: z.array(z.object({
        taskId: z.number().int().positive(),
        field: z.string(),
        obsidianValue: z.any(),
        taskmasterValue: z.any(),
        resolution: z.enum(['manual', 'obsidian_wins', 'taskmaster_wins']).optional()
    })).optional(),
    
    // Performance metrics
    duration: z.number().nonnegative().optional(),
    filesProcessed: z.number().int().nonnegative().optional()
});

/**
 * Schema for batch processing multiple vaults
 */
export const BatchParseConfigSchema = z.object({
    vaults: z.array(z.object({
        name: z.string().min(1),
        path: z.string().min(1),
        tag: z.string().min(1).default('master'),
        options: ParseConfigSchema.partial().optional()
    })).min(1, 'At least one vault must be specified'),
    
    globalOptions: ParseConfigSchema.partial().optional(),
    outputPath: z.string().min(1),
    mergeStrategy: z.enum(['separate_tags', 'merge_all', 'by_vault_name']).default('separate_tags')
});

/**
 * Validation function to check if a task object conforms to the Obsidian task schema
 * @param {Object} task - The task object to validate
 * @returns {{success: boolean, error?: string, data?: Object}} Validation result
 */
export function validateObsidianTask(task) {
    try {
        const validatedTask = ObsidianTaskSchema.parse(task);
        return {
            success: true,
            data: validatedTask
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            issues: error.issues || []
        };
    }
}

/**
 * Validation function for the complete AI response
 * @param {Object} response - The AI service response to validate
 * @returns {{success: boolean, error?: string, data?: Object}} Validation result
 */
export function validateObsidianResponse(response) {
    try {
        const validatedResponse = ObsidianNotesResponseSchema.parse(response);
        return {
            success: true,
            data: validatedResponse
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            issues: error.issues || []
        };
    }
}

/**
 * Validation function for parsing configuration
 * @param {Object} config - The configuration object to validate
 * @returns {{success: boolean, error?: string, data?: Object}} Validation result
 */
export function validateParseConfig(config) {
    try {
        const validatedConfig = ParseConfigSchema.parse(config);
        return {
            success: true,
            data: validatedConfig
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            issues: error.issues || []
        };
    }
}

/**
 * Type definitions for TypeScript compatibility
 * (These are JSDoc type definitions for better IDE support)
 */

/**
 * @typedef {z.infer<typeof ObsidianTaskSchema>} ObsidianTask
 */

/**
 * @typedef {z.infer<typeof ObsidianNotesResponseSchema>} ObsidianNotesResponse
 */

/**
 * @typedef {z.infer<typeof ParseConfigSchema>} ParseConfig
 */

/**
 * @typedef {z.infer<typeof VaultContentSchema>} VaultContent
 */

/**
 * @typedef {z.infer<typeof SyncResultSchema>} SyncResult
 */

/**
 * @typedef {z.infer<typeof BatchParseConfigSchema>} BatchParseConfig
 */

// Export all schemas for external use
export {
    ObsidianTaskSchema as default,
    ObsidianNotesResponseSchema,
    ParseConfigSchema,
    VaultScanOptionsSchema,
    VaultContentSchema,
    SyncResultSchema,
    BatchParseConfigSchema,
    TaskPrioritySchema,
    TaskStatusSchema
};
