import fs from 'fs';
import path from 'path';
import glob from 'glob';
import chalk from 'chalk';
import boxen from 'boxen';
import { z } from 'zod';

import {
    log,
    writeJSON,
    enableSilentMode,
    disableSilentMode,
    isSilentMode,
    readJSON,
    ensureTagMetadata,
    getCurrentTag
} from '../utils.js';

import { generateObjectService } from '../ai-services-unified.js';
import { getDebugFlag } from '../config-manager.js';
import { getPromptManager } from '../prompt-manager.js';
import { displayAiUsageSummary } from '../ui.js';
import { syncTasksToObsidian } from './obsidian-sync.js';

// Schema para tasks extraídas de notas Obsidian
const obsidianNotesTaskSchema = z.object({
    id: z.number(),
    title: z.string().min(1),
    description: z.string().min(1),
    details: z.string(),
    testStrategy: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
    dependencies: z.array(z.number()),
    status: z.string(),
    // Campos específicos do Obsidian
    sourceFile: z.string(),
    obsidianTags: z.array(z.string()).optional(),
    linkedNotes: z.array(z.string()).optional(),
    vaultLocation: z.string()
});

// Schema da resposta da AI
const obsidianNotesResponseSchema = z.object({
    tasks: z.array(obsidianNotesTaskSchema)
});

/**
 * Escaneia todas as notas markdown no vault Obsidian
 * @param {string} vaultPath - Caminho para o vault Obsidian
 * @param {Object} options - Opções de escaneamento
 * @returns {Object} Conteúdo consolidado das notas
 */
async function scanObsidianNotes(vaultPath, options = {}) {
    const {
        excludePatterns = [
            '**/Templates/**',
            '**/Archive/**',
            '**/.obsidian/**',
            '**/Tasks/**' // Excluir pasta Tasks para evitar tasks já geradas
        ],
        includePatterns = ['**/*.md'],
        maxDepth = 10,
        maxFileSize = 1024 * 1024 // 1MB por arquivo
    } = options;

    log('info', `Scanning Obsidian vault: ${vaultPath}`);

    if (!fs.existsSync(vaultPath)) {
        throw new Error(`Vault path does not exist: ${vaultPath}`);
    }

    // Validar se é um vault Obsidian válido
    const obsidianDir = path.join(vaultPath, '.obsidian');
    if (!fs.existsSync(obsidianDir)) {
        log('warn', `No .obsidian directory found in ${vaultPath}. This might not be a valid Obsidian vault.`);
    }

    const consolidatedContent = {
        vaultPath,
        scanTimestamp: new Date().toISOString(),
        files: [],
        totalFiles: 0,
        totalSize: 0,
        content: '',
        tags: new Set(),
        links: new Set(),
        existingTasks: []
    };

    // Buscar arquivos markdown
    const searchPattern = includePatterns.length === 1 ? includePatterns[0] : `{${includePatterns.join(',')}}`;
    const markdownFiles = glob.sync(searchPattern, {
        cwd: vaultPath,
        ignore: excludePatterns,
        maxDepth: maxDepth,
        nodir: true
    });

    log('info', `Found ${markdownFiles.length} markdown files to analyze`);

    for (const relativePath of markdownFiles) {
        try {
            const fullPath = path.join(vaultPath, relativePath);
            const stats = fs.statSync(fullPath);

            // Verificar tamanho do arquivo
            if (stats.size > maxFileSize) {
                log('warn', `Skipping large file: ${relativePath} (${Math.round(stats.size / 1024)}KB)`);
                continue;
            }

            const content = fs.readFileSync(fullPath, 'utf8');
            
            // Extrair metadados do frontmatter
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
            let frontmatter = {};
            let bodyContent = content;

            if (frontmatterMatch) {
                try {
                    // Parse simples do YAML frontmatter
                    const yamlLines = frontmatterMatch[1].split('\n');
                    for (const line of yamlLines) {
                        const colonIndex = line.indexOf(':');
                        if (colonIndex > 0) {
                            const key = line.slice(0, colonIndex).trim();
                            const value = line.slice(colonIndex + 1).trim();
                            
                            // Processar arrays simples
                            if (value.startsWith('[') && value.endsWith(']')) {
                                frontmatter[key] = value.slice(1, -1)
                                    .split(',')
                                    .map(item => item.trim().replace(/['"]/g, ''));
                            } else {
                                frontmatter[key] = value.replace(/['"]/g, '');
                            }
                        }
                    }
                    bodyContent = content.replace(frontmatterMatch[0], '').trim();
                } catch (e) {
                    log('debug', `Failed to parse frontmatter in ${relativePath}`);
                }
            }

            // Extrair tags
            const tags = content.match(/#[\w-]+/g) || [];
            tags.forEach(tag => consolidatedContent.tags.add(tag));

            // Extrair links internos
            const links = content.match(/\[\[([^\]]+)\]\]/g) || [];
            links.forEach(link => consolidatedContent.links.add(link));

            // Extrair tasks existentes (checkboxes)
            const existingTasks = content.match(/^- \[([ x])\] (.+)$/gm) || [];
            existingTasks.forEach(taskMatch => {
                const isCompleted = taskMatch.includes('[x]');
                const taskText = taskMatch.replace(/^- \[([ x])\] /, '');
                consolidatedContent.existingTasks.push({
                    text: taskText,
                    completed: isCompleted,
                    file: relativePath
                });
            });

            // Adicionar ao conteúdo consolidado
            const fileSection = `\n\n--- FILE: ${relativePath} ---\n` +
                `Modified: ${stats.mtime.toISOString()}\n` +
                `Size: ${Math.round(stats.size / 1024)}KB\n` +
                (frontmatter.tags ? `Tags: ${Array.isArray(frontmatter.tags) ? frontmatter.tags.join(', ') : frontmatter.tags}\n` : '') +
                `Internal Links: ${links.join(', ')}\n` +
                `Existing Tasks: ${existingTasks.length}\n` +
                `---\n\n${bodyContent}`;

            consolidatedContent.content += fileSection;
            consolidatedContent.files.push({
                path: relativePath,
                fullPath,
                size: stats.size,
                modified: stats.mtime.toISOString(),
                frontmatter,
                tags: tags,
                links: links,
                existingTasks: existingTasks.length
            });

            consolidatedContent.totalFiles++;
            consolidatedContent.totalSize += stats.size;

        } catch (error) {
            log('warn', `Failed to process ${relativePath}: ${error.message}`);
        }
    }

    // Adicionar resumo no final
    consolidatedContent.content += `\n\n--- VAULT SUMMARY ---\n` +
        `Total Files Analyzed: ${consolidatedContent.totalFiles}\n` +
        `Total Size: ${Math.round(consolidatedContent.totalSize / 1024)}KB\n` +
        `Unique Tags: ${Array.from(consolidatedContent.tags).join(', ')}\n` +
        `Unique Links: ${Array.from(consolidatedContent.links).join(', ')}\n` +
        `Existing Tasks Found: ${consolidatedContent.existingTasks.length}\n` +
        `Completed Tasks: ${consolidatedContent.existingTasks.filter(t => t.completed).length}\n` +
        `Pending Tasks: ${consolidatedContent.existingTasks.filter(t => !t.completed).length}`;

    log('success', `Vault scan completed: ${consolidatedContent.totalFiles} files, ${Math.round(consolidatedContent.totalSize / 1024)}KB`);

    return consolidatedContent;
}

/**
 * Extrai tasks de notas do Obsidian usando IA
 * @param {string} vaultPath - Caminho para o vault Obsidian
 * @param {string} tasksPath - Caminho para o arquivo tasks.json
 * @param {number} numTasks - Número de tasks para gerar
 * @param {Object} options - Opções adicionais
 */
async function parseObsidianNotes(vaultPath, tasksPath, numTasks, options = {}) {
    const {
        reportProgress,
        mcpLog,
        session,
        projectRoot,
        force = false,
        append = false,
        research = false,
        tag,
        preserveLinks = true,
        includeTags = true,
        excludePatterns,
        syncAfterParse = true,
        autoSync = false
    } = options;
    
    const isMCP = !!mcpLog;
    const outputFormat = isMCP ? 'json' : 'text';

    // Use the provided tag, or the current active tag, or default to 'master'
    const targetTag = tag || 'master';

    const logFn = mcpLog
        ? mcpLog
        : {
            // Wrapper for CLI
            info: (...args) => log('info', ...args),
            warn: (...args) => log('warn', ...args),
            error: (...args) => log('error', ...args),
            debug: (...args) => log('debug', ...args),
            success: (...args) => log('success', ...args)
        };

    // Create custom reporter using logFn
    const report = (message, level = 'info') => {
        if (logFn && typeof logFn[level] === 'function') {
            logFn[level](message);
        } else if (!isSilentMode() && outputFormat === 'text') {
            log(level, message);
        }
    };

    report(
        `Parsing Obsidian notes from vault: ${vaultPath}, Force: ${force}, Append: ${append}, Research: ${research}`
    );

    let existingTasks = [];
    let nextId = 1;
    let aiServiceResponse = null;

    try {
        // Verificar tasks existentes no tag de destino
        let hasExistingTasksInTag = false;
        if (fs.existsSync(tasksPath)) {
            try {
                const existingFileContent = fs.readFileSync(tasksPath, 'utf8');
                const allData = JSON.parse(existingFileContent);

                if (
                    allData[targetTag] &&
                    Array.isArray(allData[targetTag].tasks) &&
                    allData[targetTag].tasks.length > 0
                ) {
                    hasExistingTasksInTag = true;
                    existingTasks = allData[targetTag].tasks;
                    nextId = Math.max(...existingTasks.map((t) => t.id || 0)) + 1;
                }
            } catch (error) {
                hasExistingTasksInTag = false;
            }
        }

        // Handle file existence and overwrite/append logic
        if (hasExistingTasksInTag) {
            if (append) {
                report(
                    `Append mode enabled. Found ${existingTasks.length} existing tasks in tag '${targetTag}'. Next ID will be ${nextId}.`,
                    'info'
                );
            } else if (!force) {
                const overwriteError = new Error(
                    `Tag '${targetTag}' already contains ${existingTasks.length} tasks. Use --force to overwrite or --append to add to existing tasks.`
                );
                report(overwriteError.message, 'error');
                if (outputFormat === 'text') {
                    console.error(chalk.red(overwriteError.message));
                }
                throw overwriteError;
            } else {
                report(
                    `Force flag enabled. Overwriting existing tasks in tag '${targetTag}'.`,
                    'info'
                );
            }
        } else {
            report(
                `Tag '${targetTag}' is empty or doesn't exist. Creating/updating tag with new tasks.`,
                'info'
            );
        }

        // Escanear notas do vault
        report('Scanning Obsidian vault for notes...', 'info');
        const vaultContent = await scanObsidianNotes(vaultPath, {
            excludePatterns,
            maxDepth: 10
        });

        if (!vaultContent || !vaultContent.content) {
            throw new Error(`No content found in vault ${vaultPath} or vault is empty.`);
        }

        if (vaultContent.totalFiles === 0) {
            throw new Error(`No markdown files found in vault ${vaultPath}.`);
        }

        // Load prompts using PromptManager
        const promptManager = getPromptManager();

        // Get defaultTaskPriority from config
        const { getDefaultPriority } = await import('../config-manager.js');
        const defaultTaskPriority = getDefaultPriority(projectRoot) || 'medium';

        const { systemPrompt, userPrompt } = await promptManager.loadPrompt(
            'parse-obsidian-notes',
            {
                research,
                numTasks,
                nextId,
                notesContent: vaultContent.content,
                vaultPath,
                defaultTaskPriority,
                preserveLinks,
                includeTags
            }
        );

        // Call the unified AI service
        report(
            `Calling AI service to extract tasks from ${vaultContent.totalFiles} notes${research ? ' with research-backed analysis' : ''}...`,
            'info'
        );

        aiServiceResponse = await generateObjectService({
            role: research ? 'research' : 'main',
            session: session,
            projectRoot: projectRoot,
            schema: obsidianNotesResponseSchema,
            objectName: 'obsidian_tasks_data',
            systemPrompt: systemPrompt,
            prompt: userPrompt,
            commandName: 'parse-obsidian-notes',
            outputType: isMCP ? 'mcp' : 'cli'
        });

        // Create the directory if it doesn't exist
        const tasksDir = path.dirname(tasksPath);
        if (!fs.existsSync(tasksDir)) {
            fs.mkdirSync(tasksDir, { recursive: true });
        }
        
        logFn.success(
            `Successfully analyzed ${vaultContent.totalFiles} notes${research ? ' with research-backed analysis' : ''}.`
        );

        // Validate and Process Tasks
        let generatedData = null;
        if (aiServiceResponse?.mainResult) {
            if (
                typeof aiServiceResponse.mainResult === 'object' &&
                aiServiceResponse.mainResult !== null &&
                'tasks' in aiServiceResponse.mainResult
            ) {
                generatedData = aiServiceResponse.mainResult;
            } else if (
                typeof aiServiceResponse.mainResult.object === 'object' &&
                aiServiceResponse.mainResult.object !== null &&
                'tasks' in aiServiceResponse.mainResult.object
            ) {
                generatedData = aiServiceResponse.mainResult.object;
            }
        }

        if (!generatedData || !Array.isArray(generatedData.tasks)) {
            logFn.error(
                `Internal Error: generateObjectService returned unexpected data structure: ${JSON.stringify(generatedData)}`
            );
            throw new Error(
                'AI service returned unexpected data structure after validation.'
            );
        }

        let currentId = nextId;
        const taskMap = new Map();
        const processedNewTasks = generatedData.tasks.map((task) => {
            const newId = currentId++;
            taskMap.set(task.id, newId);
            return {
                ...task,
                id: newId,
                status: task.status || 'pending',
                priority: task.priority || 'medium',
                dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
                subtasks: [],
                // Ensure all required fields have values
                title: task.title || '',
                description: task.description || '',
                details: task.details || '',
                testStrategy: task.testStrategy || '',
                // Obsidian-specific fields
                sourceFile: task.sourceFile || '',
                obsidianTags: Array.isArray(task.obsidianTags) ? task.obsidianTags : [],
                linkedNotes: Array.isArray(task.linkedNotes) ? task.linkedNotes : [],
                vaultLocation: task.vaultLocation || vaultPath,
                syncStatus: 'pending',
                lastSyncAt: new Date().toISOString()
            };
        });

        // Remap dependencies for the NEWLY processed tasks
        processedNewTasks.forEach((task) => {
            task.dependencies = task.dependencies
                .map((depId) => taskMap.get(depId)) // Map old AI ID to new sequential ID
                .filter(
                    (newDepId) =>
                        newDepId != null && // Must exist
                        newDepId < task.id && // Must be a lower ID
                        (existingTasks.some((t) => t.id === newDepId) || // Check if it exists in old tasks OR
                            processedNewTasks.some((t) => t.id === newDepId)) // check if it exists in new tasks
                );
        });

        const finalTasks = append
            ? [...existingTasks, ...processedNewTasks]
            : processedNewTasks;

        // Read the existing file to preserve other tags
        let outputData = {};
        if (fs.existsSync(tasksPath)) {
            try {
                const existingFileContent = fs.readFileSync(tasksPath, 'utf8');
                outputData = JSON.parse(existingFileContent);
            } catch (error) {
                outputData = {};
            }
        }

        // Update only the target tag, preserving other tags
        outputData[targetTag] = {
            tasks: finalTasks,
            metadata: {
                created:
                    outputData[targetTag]?.metadata?.created || new Date().toISOString(),
                updated: new Date().toISOString(),
                description: `Tasks for ${targetTag} context (extracted from Obsidian notes)`,
                // Add Obsidian-specific metadata
                vaultPath: vaultPath,
                distributedMode: true,
                syncSettings: {
                    autoSync: autoSync,
                    bidirectional: true,
                    conflictResolution: 'manual'
                },
                sourceFiles: vaultContent.files.map(f => f.path),
                extractionDate: new Date().toISOString(),
                totalSourceFiles: vaultContent.totalFiles
            }
        };

        // Ensure the target tag has proper metadata
        ensureTagMetadata(outputData[targetTag], {
            description: `Tasks extracted from ${vaultContent.totalFiles} Obsidian notes in ${targetTag} context`
        });

        // Write the complete data structure back to the file
        fs.writeFileSync(tasksPath, JSON.stringify(outputData, null, 2));
        report(
            `Successfully ${append ? 'appended' : 'generated'} ${processedNewTasks.length} tasks from ${vaultContent.totalFiles} notes in ${tasksPath}${research ? ' with research-backed analysis' : ''}`,
            'success'
        );

        // Sync tasks back to Obsidian if requested
        if (syncAfterParse) {
            try {
                report('Syncing newly created tasks back to Obsidian vault...', 'info');
                const syncResult = await syncTasksToObsidian({
                    vaultPath,
                    tasksPath,
                    tag: targetTag,
                    projectRoot,
                    dryRun: false
                });
                
                report(
                    `Sync completed: ${syncResult.created} created, ${syncResult.updated} updated, ${syncResult.errors.length} errors`,
                    'success'
                );
            } catch (syncError) {
                report(`Warning: Failed to sync tasks back to vault: ${syncError.message}`, 'warn');
            }
        }

        // Handle CLI output (e.g., success message)
        if (outputFormat === 'text') {
            console.log(
                boxen(
                    chalk.green(
                        `Successfully extracted ${processedNewTasks.length} tasks from ${vaultContent.totalFiles} Obsidian notes${research ? ' with research-backed analysis' : ''}!\n\n` +
                        `Total tasks in ${tasksPath}: ${finalTasks.length}\n` +
                        `Vault: ${vaultPath}\n` +
                        `Tag: ${targetTag}`
                    ),
                    { padding: 1, borderColor: 'green', borderStyle: 'round' }
                )
            );

            console.log(
                boxen(
                    chalk.white.bold('Next Steps:') +
                        '\n\n' +
                        `${chalk.cyan('1.')} Run ${chalk.yellow('task-master list')} to view all tasks\n` +
                        `${chalk.cyan('2.')} Run ${chalk.yellow('task-master obsidian-status --vault "' + vaultPath + '"')} to check sync status\n` +
                        `${chalk.cyan('3.')} Use Obsidian plugin commands to manage tasks`,
                    {
                        padding: 1,
                        borderColor: 'cyan',
                        borderStyle: 'round',
                        margin: { top: 1 }
                    }
                )
            );

            if (aiServiceResponse && aiServiceResponse.telemetryData) {
                displayAiUsageSummary(aiServiceResponse.telemetryData, 'cli');
            }
        }

        // Return telemetry data
        return {
            success: true,
            tasksPath,
            extractedTasks: processedNewTasks.length,
            sourceFiles: vaultContent.totalFiles,
            vaultPath,
            telemetryData: aiServiceResponse?.telemetryData,
            syncResult: syncAfterParse ? 'completed' : 'skipped'
        };

    } catch (error) {
        report(`Error parsing Obsidian notes: ${error.message}`, 'error');

        // Only show error UI for text output (CLI)
        if (outputFormat === 'text') {
            console.error(chalk.red(`Error: ${error.message}`));

            if (getDebugFlag(projectRoot)) {
                console.error(error);
            }
        }

        throw error;
    }
}

export default parseObsidianNotes;
