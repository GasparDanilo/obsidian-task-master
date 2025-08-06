import fs from 'fs';
import path from 'path';
import glob from 'glob';
import { readJSON, writeJSON, log } from '../utils.js';

/**
 * Synchronizes tasks between tasks.json and Obsidian markdown files
 * @param {string} tasksPath - Path to tasks.json
 * @param {string} vaultPath - Path to Obsidian vault
 * @param {Object} options - Sync options
 */
export async function syncWithObsidian(tasksPath, vaultPath, options = {}) {
    const { tag = 'master', direction = 'bidirectional', projectRoot } = options;
    
    log('info', `Starting Obsidian sync: ${direction} for tag: ${tag}`);
    
    // Read current tasks
    const tasksData = readJSON(tasksPath, projectRoot, tag);
    if (!tasksData || !tasksData.tasks) {
        throw new Error('No tasks data found');
    }
    
    const syncResults = {
        updated: 0,
        created: 0,
        conflicts: 0,
        errors: []
    };
    
    if (direction === 'to-obsidian' || direction === 'bidirectional') {
        log('info', 'Syncing tasks TO Obsidian files...');
        // Sync tasks TO Obsidian files
        for (const task of tasksData.tasks) {
            if (task.sourceFile) {
                try {
                    await updateMarkdownFile(vaultPath, task);
                    syncResults.updated++;
                    log('debug', `Updated markdown file for task ${task.id}: ${task.sourceFile}`);
                } catch (error) {
                    syncResults.errors.push({
                        task: task.id,
                        error: error.message
                    });
                }
            }
        }
    }
    
    if (direction === 'from-obsidian' || direction === 'bidirectional') {
        log('info', 'Syncing tasks FROM Obsidian files...');
        // Sync tasks FROM Obsidian files
        const vaultTasks = await extractTasksFromVault(vaultPath);
        
        for (const vaultTask of vaultTasks) {
            const existingTask = tasksData.tasks.find(t => 
                t.sourceFile === vaultTask.sourceFile && 
                t.title === vaultTask.title
            );
            
            if (existingTask) {
                // Check for conflicts
                if (hasConflict(existingTask, vaultTask)) {
                    existingTask.syncStatus = 'conflict';
                    syncResults.conflicts++;
                    log('warn', `Conflict detected for task ${existingTask.id}: ${existingTask.title}`);
                } else {
                    // Update existing task
                    Object.assign(existingTask, vaultTask, {
                        id: existingTask.id, // Preserve ID
                        syncStatus: 'synced',
                        lastSyncAt: new Date().toISOString()
                    });
                    syncResults.updated++;
                    log('debug', `Updated task ${existingTask.id} from Obsidian`);
                }
            } else {
                // Create new task
                const newId = Math.max(...tasksData.tasks.map(t => t.id), 0) + 1;
                tasksData.tasks.push({
                    ...vaultTask,
                    id: newId,
                    syncStatus: 'synced',
                    lastSyncAt: new Date().toISOString()
                });
                syncResults.created++;
                log('info', `Created new task ${newId} from Obsidian: ${vaultTask.title}`);
            }
        }
        
        // Save updated tasks
        writeJSON(tasksPath, tasksData, projectRoot, tag);
    }
    
    log('success', `Sync completed: ${syncResults.updated} updated, ${syncResults.created} created, ${syncResults.conflicts} conflicts`);
    return syncResults;
}

/**
 * Updates a markdown file with task information
 */
async function updateMarkdownFile(vaultPath, task) {
    const filePath = path.join(vaultPath, task.sourceFile);
    
    if (!fs.existsSync(filePath)) {
        // Create new file
        const content = generateMarkdownForTask(task);
        const fileDir = path.dirname(filePath);
        if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, 'utf8');
        return;
    }
    
    // Update existing file
    let content = fs.readFileSync(filePath, 'utf8');
    content = updateTaskInMarkdown(content, task);
    fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Extracts tasks from all markdown files in vault
 */
async function extractTasksFromVault(vaultPath) {
    const markdownFiles = glob.sync('**/*.md', { cwd: vaultPath });
    const tasks = [];
    
    for (const file of markdownFiles) {
        try {
            const filePath = path.join(vaultPath, file);
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Extract tasks using regex
            const taskMatches = content.match(/^- \[([ x])\] (.+)$/gm) || [];
            
            for (const match of taskMatches) {
                const isCompleted = match.includes('[x]');
                const taskText = match.replace(/^- \[([ x])\] /, '');
                
                // Extract additional metadata if available
                const task = {
                    title: taskText,
                    status: isCompleted ? 'done' : 'pending',
                    sourceFile: file,
                    description: taskText, // Could be enhanced to extract more details
                    priority: 'medium', // Default, could be extracted from tags
                    dependencies: [],
                    obsidianTags: extractTagsFromContent(content),
                    linkedNotes: extractLinksFromContent(content),
                    details: '',
                    testStrategy: ''
                };
                
                tasks.push(task);
            }
        } catch (error) {
            log('warn', `Warning: Could not read ${file}: ${error.message}`);
        }
    }
    
    return tasks;
}

/**
 * Checks if there's a conflict between task versions
 */
function hasConflict(taskA, taskB) {
    // Simple conflict detection based on modification times and content
    if (!taskA.lastSyncAt) return false;
    
    const syncTime = new Date(taskA.lastSyncAt);
    const taskTime = new Date(taskB.lastModified || taskB.lastSyncAt || 0);
    
    return taskTime > syncTime && (
        taskA.title !== taskB.title ||
        taskA.status !== taskB.status ||
        taskA.description !== taskB.description
    );
}

/**
 * Generate markdown content for a task
 */
function generateMarkdownForTask(task) {
    let content = '';
    
    // Add frontmatter if task has metadata
    if (task.obsidianTags?.length || task.linkedNotes?.length || task.id) {
        content += '---\n';
        if (task.obsidianTags?.length) {
            content += `tags: [${task.obsidianTags.map(tag => `"${tag}"`).join(', ')}]\n`;
        }
        content += `task_id: ${task.id}\n`;
        content += `priority: ${task.priority || 'medium'}\n`;
        content += `status: ${task.status || 'pending'}\n`;
        content += '---\n\n';
    }
    
    content += `# ${task.title}\n\n`;
    
    // Add task checkbox
    const checkbox = task.status === 'done' ? '[x]' : '[ ]';
    content += `- ${checkbox} ${task.title}\n\n`;
    
    if (task.description) {
        content += `## Description\n${task.description}\n\n`;
    }
    
    if (task.details) {
        content += `## Details\n${task.details}\n\n`;
    }
    
    if (task.testStrategy) {
        content += `## Test Strategy\n${task.testStrategy}\n\n`;
    }
    
    if (task.dependencies?.length) {
        content += `## Dependencies\n`;
        task.dependencies.forEach(depId => {
            content += `- Task ${depId}\n`;
        });
        content += '\n';
    }
    
    if (task.linkedNotes?.length) {
        content += `## Related Notes\n`;
        for (const link of task.linkedNotes) {
            content += `- ${link}\n`;
        }
        content += '\n';
    }
    
    return content;
}

/**
 * Update existing task in markdown content
 */
function updateTaskInMarkdown(content, task) {
    // Find and update existing task checkbox
    const taskRegex = new RegExp(`^- \\[([ x])\\] ${escapeRegex(task.title)}$`, 'm');
    const newCheckbox = task.status === 'done' ? '[x]' : '[ ]';
    const replacement = `- ${newCheckbox} ${task.title}`;
    
    if (taskRegex.test(content)) {
        return content.replace(taskRegex, replacement);
    } else {
        // If task checkbox doesn't exist, add it at the end
        return content + `\n- ${newCheckbox} ${task.title}\n`;
    }
}

/**
 * Extract Obsidian tags from content
 */
function extractTagsFromContent(content) {
    const matches = content.match(/#\w+/g) || [];
    return matches.map(tag => tag.substring(1)); // Remove # prefix
}

/**
 * Extract Obsidian links from content
 */
function extractLinksFromContent(content) {
    const matches = content.match(/\[\[([^\]]+)\]\]/g) || [];
    return matches;
}

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sync tasks TO Obsidian vault (create/update markdown files)
 * @param {Object} options - Sync options
 */
export async function syncTasksToObsidian(options = {}) {
    const { vaultPath, tasksPath, tag = 'master', projectRoot, dryRun = false } = options;
    
    log('info', `Syncing tasks TO Obsidian: ${vaultPath}`);
    
    // Read current tasks
    const tasksData = readJSON(tasksPath, projectRoot, tag);
    if (!tasksData || !tasksData.tasks) {
        throw new Error('No tasks data found');
    }
    
    const results = {
        updated: 0,
        created: 0,
        errors: []
    };
    
    for (const task of tasksData.tasks) {
        try {
            const markdownPath = path.join(vaultPath, 'Tasks', `task-${String(task.id).padStart(3, '0')}-${task.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.md`);
            
            if (dryRun) {
                log('info', `[DRY RUN] Would ${fs.existsSync(markdownPath) ? 'update' : 'create'}: ${markdownPath}`);
                continue;
            }
            
            const content = generateMarkdownForTask(task);
            const dir = path.dirname(markdownPath);
            
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            const existed = fs.existsSync(markdownPath);
            fs.writeFileSync(markdownPath, content, 'utf8');
            
            if (existed) {
                results.updated++;
                log('debug', `Updated: ${markdownPath}`);
            } else {
                results.created++;
                log('debug', `Created: ${markdownPath}`);
            }
            
        } catch (error) {
            results.errors.push({
                taskId: task.id,
                error: error.message
            });
            log('error', `Failed to sync task ${task.id}: ${error.message}`);
        }
    }
    
    log('success', `Sync to Obsidian completed: ${results.created} created, ${results.updated} updated, ${results.errors.length} errors`);
    return results;
}

/**
 * Sync tasks FROM Obsidian vault (read markdown files)
 * @param {Object} options - Sync options
 */
export async function syncTasksFromObsidian(options = {}) {
    const { vaultPath, tasksPath, tag = 'master', projectRoot, dryRun = false } = options;
    
    log('info', `Syncing tasks FROM Obsidian: ${vaultPath}`);
    
    // Extract tasks from Obsidian vault
    const vaultTasks = await extractTasksFromVault(vaultPath);
    
    if (vaultTasks.length === 0) {
        log('info', 'No tasks found in Obsidian vault');
        return { updated: 0, created: 0, errors: [] };
    }
    
    // Read existing tasks
    let tasksData = { tasks: [] };
    try {
        const existingData = readJSON(tasksPath, projectRoot, tag);
        if (existingData && existingData.tasks) {
            tasksData = existingData;
        }
    } catch (error) {
        log('info', 'No existing tasks found, starting fresh');
    }
    
    const results = {
        updated: 0,
        created: 0,
        conflicts: 0,
        errors: []
    };
    
    for (const vaultTask of vaultTasks) {
        try {
            // Find existing task by title or sourceFile
            const existingTask = tasksData.tasks.find(t => 
                t.title === vaultTask.title ||
                (t.sourceFile && vaultTask.sourceFile && t.sourceFile === vaultTask.sourceFile)
            );
            
            if (existingTask) {
                // Check for conflicts
                if (hasConflict(existingTask, vaultTask)) {
                    if (dryRun) {
                        log('warn', `[DRY RUN] Conflict detected for task: ${existingTask.title}`);
                    } else {
                        existingTask.syncStatus = 'conflict';
                        log('warn', `Conflict detected for task ${existingTask.id}: ${existingTask.title}`);
                    }
                    results.conflicts++;
                } else {
                    if (dryRun) {
                        log('info', `[DRY RUN] Would update task: ${existingTask.title}`);
                    } else {
                        // Update existing task
                        Object.assign(existingTask, vaultTask, {
                            id: existingTask.id, // Preserve ID
                            syncStatus: 'synced',
                            lastSyncAt: new Date().toISOString()
                        });
                        log('debug', `Updated task ${existingTask.id} from Obsidian`);
                    }
                    results.updated++;
                }
            } else {
                if (dryRun) {
                    log('info', `[DRY RUN] Would create new task: ${vaultTask.title}`);
                } else {
                    // Create new task
                    const newId = tasksData.tasks.length > 0 ? Math.max(...tasksData.tasks.map(t => t.id)) + 1 : 1;
                    tasksData.tasks.push({
                        ...vaultTask,
                        id: newId,
                        syncStatus: 'synced',
                        lastSyncAt: new Date().toISOString()
                    });
                    log('info', `Created new task ${newId} from Obsidian: ${vaultTask.title}`);
                }
                results.created++;
            }
            
        } catch (error) {
            results.errors.push({
                task: vaultTask.title,
                error: error.message
            });
            log('error', `Failed to sync task from Obsidian: ${error.message}`);
        }
    }
    
    // Save updated tasks if not dry run
    if (!dryRun && (results.created > 0 || results.updated > 0)) {
        writeJSON(tasksPath, tasksData, projectRoot, tag);
    }
    
    log('success', `Sync from Obsidian completed: ${results.created} created, ${results.updated} updated, ${results.conflicts} conflicts, ${results.errors.length} errors`);
    return results;
}

/**
 * Parse Obsidian vault and generate tasks (alternative to PRD parsing)
 * @param {string} vaultPath - Path to Obsidian vault
 * @param {string} tasksPath - Path to tasks.json file
 * @param {number} numTasks - Number of tasks to generate
 * @param {Object} options - Additional options
 */
export async function parseObsidianVault(vaultPath, tasksPath, numTasks, options = {}) {
    const { tag = 'master', projectRoot, force = false, append = false } = options;
    
    log('info', `Parsing Obsidian vault: ${vaultPath}`);
    
    // Scan vault for existing tasks and notes
    const vaultContent = await scanMarkdownFiles(vaultPath);
    if (!vaultContent) {
        throw new Error(`Vault ${vaultPath} is empty or could not be scanned.`);
    }
    
    // Here we could integrate with AI to generate additional tasks based on vault content
    // For now, we'll extract existing tasks
    const extractedTasks = await extractTasksFromVault(vaultPath);
    
    // Transform to match expected format
    let nextId = 1;
    if (fs.existsSync(tasksPath)) {
        try {
            const existingData = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
            if (existingData[tag]?.tasks?.length) {
                nextId = Math.max(...existingData[tag].tasks.map(t => t.id || 0)) + 1;
            }
        } catch (error) {
            log('warn', 'Could not read existing tasks file');
        }
    }
    
    const processedTasks = extractedTasks.slice(0, numTasks).map((task, index) => ({
        ...task,
        id: nextId + index,
        syncStatus: 'synced',
        lastSyncAt: new Date().toISOString(),
        vaultLocation: vaultPath
    }));
    
    // Save tasks using standard format
    const tasksData = {
        tasks: processedTasks,
        metadata: {
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            description: `Tasks extracted from Obsidian vault: ${vaultPath}`,
            vaultPath: vaultPath,
            distributedMode: true,
            syncSettings: {
                autoSync: true,
                bidirectional: true,
                conflictResolution: 'manual'
            }
        }
    };
    
    writeJSON(tasksPath, { [tag]: tasksData }, projectRoot, tag);
    
    log('success', `Successfully extracted ${processedTasks.length} tasks from Obsidian vault`);
    
    return {
        success: true,
        tasksPath,
        extractedTasks: processedTasks.length,
        vaultPath
    };
}

/**
 * Initialize Obsidian vault integration
 * @param {Object} options - Init options
 */
export async function initObsidianSync(options = {}) {
    const { vaultPath, tasksPath, tag = 'master', projectRoot } = options;
    
    log('info', `Initializing Obsidian sync for vault: ${vaultPath}`);
    
    // Validate vault path
    await validateObsidianVault(vaultPath);
    
    // Create necessary directories in vault
    const tasksDir = path.join(vaultPath, 'Tasks');
    const tagsDir = path.join(vaultPath, 'Tags');
    
    if (!fs.existsSync(tasksDir)) {
        fs.mkdirSync(tasksDir, { recursive: true });
        log('info', `Created Tasks directory: ${tasksDir}`);
    }
    
    if (!fs.existsSync(tagsDir)) {
        fs.mkdirSync(tagsDir, { recursive: true });
        log('info', `Created Tags directory: ${tagsDir}`);
    }
    
    // Create README file with sync information
    const readmePath = path.join(vaultPath, 'TaskMaster-README.md');
    if (!fs.existsSync(readmePath)) {
        const readmeContent = `# TaskMaster Sync

This vault is integrated with TaskMaster for bidirectional task synchronization.

## Structure

- \`Tasks/\` - Individual task files
- \`Tags/\` - Tag overview files
- \`TaskMaster-README.md\` - This file

## Sync Commands

\`\`\`bash
# Sync tasks TO Obsidian
task-master obsidian-sync --vault "${vaultPath}" --to-obsidian

# Sync tasks FROM Obsidian
task-master obsidian-sync --vault "${vaultPath}" --from-obsidian

# Bidirectional sync
task-master obsidian-sync --vault "${vaultPath}" --bidirectional

# Check sync status
task-master obsidian-status --vault "${vaultPath}"
\`\`\`

## Last Sync

Initialized: ${new Date().toISOString()}
Tag: ${tag}
Tasks File: ${tasksPath}
`;
        
        fs.writeFileSync(readmePath, readmeContent, 'utf8');
        log('info', `Created README: ${readmePath}`);
    }
    
    // Create sync configuration file
    const syncConfigPath = path.join(vaultPath, '.taskmaster-sync.json');
    const syncConfig = {
        initialized: new Date().toISOString(),
        vaultPath,
        tasksPath,
        tag,
        projectRoot,
        version: '1.0.0',
        settings: {
            autoSync: false,
            conflictResolution: 'manual',
            backupBeforeSync: true
        }
    };
    
    fs.writeFileSync(syncConfigPath, JSON.stringify(syncConfig, null, 2), 'utf8');
    log('success', `Obsidian sync initialized successfully`);
    
    return {
        success: true,
        vaultPath,
        tasksPath,
        configPath: syncConfigPath,
        readmePath
    };
}

/**
 * Validate that a directory is a valid Obsidian vault
 * @param {string} vaultPath - Path to validate
 */
export async function validateObsidianVault(vaultPath) {
    if (!fs.existsSync(vaultPath)) {
        throw new Error(`Vault path does not exist: ${vaultPath}`);
    }
    
    const stats = fs.statSync(vaultPath);
    if (!stats.isDirectory()) {
        throw new Error(`Vault path is not a directory: ${vaultPath}`);
    }
    
    // Check for Obsidian vault markers
    const obsidianDir = path.join(vaultPath, '.obsidian');
    if (!fs.existsSync(obsidianDir)) {
        log('warn', `No .obsidian directory found - this may not be a valid Obsidian vault: ${vaultPath}`);
        // Don't throw error, just warn - user might want to initialize a new vault
    }
    
    log('debug', `Validated Obsidian vault: ${vaultPath}`);
    return true;
}

/**
 * Get sync status between TaskMaster and Obsidian vault
 * @param {Object} options - Status options
 */
export async function getObsidianSyncStatus(options = {}) {
    const { vaultPath, tasksPath, tag = 'master', projectRoot } = options;
    
    log('info', `Checking sync status for vault: ${vaultPath}`);
    
    // Read TaskMaster tasks
    let taskMasterTasks = [];
    try {
        const tasksData = readJSON(tasksPath, projectRoot, tag);
        if (tasksData && tasksData.tasks) {
            taskMasterTasks = tasksData.tasks;
        }
    } catch (error) {
        log('warn', 'Could not read TaskMaster tasks');
    }
    
    // Read Obsidian tasks
    let obsidianTasks = [];
    try {
        obsidianTasks = await extractTasksFromVault(vaultPath);
    } catch (error) {
        log('warn', 'Could not read Obsidian vault tasks');
    }
    
    // Check for sync config
    let lastSync = null;
    const syncConfigPath = path.join(vaultPath, '.taskmaster-sync.json');
    if (fs.existsSync(syncConfigPath)) {
        try {
            const syncConfig = JSON.parse(fs.readFileSync(syncConfigPath, 'utf8'));
            lastSync = syncConfig.initialized;
        } catch (error) {
            log('warn', 'Could not read sync config');
        }
    }
    
    // Identify conflicts and out-of-sync items
    const conflicts = [];
    const outOfSync = [];
    
    // Check TaskMaster tasks against Obsidian
    for (const tmTask of taskMasterTasks) {
        const obsTask = obsidianTasks.find(ot => ot.title === tmTask.title);
        if (obsTask) {
            if (hasConflict(tmTask, obsTask)) {
                conflicts.push(`Task "${tmTask.title}" has conflicting changes`);
            }
        } else {
            outOfSync.push(`TaskMaster task "${tmTask.title}" not found in Obsidian`);
        }
    }
    
    // Check Obsidian tasks against TaskMaster
    for (const obsTask of obsidianTasks) {
        const tmTask = taskMasterTasks.find(tm => tm.title === obsTask.title);
        if (!tmTask) {
            outOfSync.push(`Obsidian task "${obsTask.title}" not found in TaskMaster`);
        }
    }
    
    const status = {
        vaultPath,
        tasksPath,
        tag,
        lastSync,
        tasksInTaskMaster: taskMasterTasks.length,
        tasksInObsidian: obsidianTasks.length,
        conflicts,
        outOfSync,
        inSync: conflicts.length === 0 && outOfSync.length === 0
    };
    
    log('debug', `Sync status: ${status.conflicts.length} conflicts, ${status.outOfSync.length} out of sync`);
    return status;
}

/**
 * Scans Obsidian vault for markdown files and extracts consolidated content
 * @param {string} vaultPath - Path to Obsidian vault
 * @returns {string} Consolidated content from all markdown files
 */
async function scanMarkdownFiles(vaultPath) {
    const markdownFiles = glob.sync('**/*.md', { cwd: vaultPath });
    let consolidatedContent = '';
    let existingTasks = [];
    
    for (const file of markdownFiles) {
        try {
            const filePath = path.join(vaultPath, file);
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Extract frontmatter
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
            let frontmatter = {};
            if (frontmatterMatch) {
                try {
                    // Simple YAML parsing for basic frontmatter
                    const yamlLines = frontmatterMatch[1].split('\n');
                    for (const line of yamlLines) {
                        const [key, ...valueParts] = line.split(':');
                        if (key && valueParts.length > 0) {
                            frontmatter[key.trim()] = valueParts.join(':').trim();
                        }
                    }
                } catch (e) {
                    // Ignore invalid YAML
                }
            }
            
            // Extract existing tasks
            const taskMatches = content.match(/^- \[([ x])\] (.+)$/gm) || [];
            const fileTasks = taskMatches.map(match => {
                const isCompleted = match.includes('[x]');
                const taskText = match.replace(/^- \[([ x])\] /, '');
                return { text: taskText, completed: isCompleted, file };
            });
            existingTasks.push(...fileTasks);
            
            // Extract tags
            const tags = content.match(/#\w+/g) || [];
            
            // Extract internal links
            const links = content.match(/\[\[([^\]]+)\]\]/g) || [];
            
            consolidatedContent += `\n\n--- File: ${file} ---\n`;
            consolidatedContent += `Tags: ${tags.join(', ')}\n`;
            consolidatedContent += `Links: ${links.join(', ')}\n`;
            consolidatedContent += `Existing Tasks: ${fileTasks.length}\n`;
            consolidatedContent += content;
            
        } catch (error) {
            log('warn', `Warning: Could not read ${file}: ${error.message}`);
        }
    }
    
    consolidatedContent += `\n\n--- VAULT SUMMARY ---\n`;
    consolidatedContent += `Total Files: ${markdownFiles.length}\n`;
    consolidatedContent += `Total Existing Tasks: ${existingTasks.length}\n`;
    consolidatedContent += `Completed Tasks: ${existingTasks.filter(t => t.completed).length}\n`;
    
    return consolidatedContent;
}
