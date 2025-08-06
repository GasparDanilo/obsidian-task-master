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
