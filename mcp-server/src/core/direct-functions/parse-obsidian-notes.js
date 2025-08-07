/**
 * parse-obsidian-notes.js
 * Direct function implementation for parsing Obsidian notes into tasks
 */

import path from 'path';
import fs from 'fs';
import parseObsidianNotes from '../../../../scripts/modules/task-manager/parse-obsidian-notes.js';
import {
    enableSilentMode,
    disableSilentMode,
    isSilentMode
} from '../../../../scripts/modules/utils.js';
import { createLogWrapper } from '../../tools/utils.js';
import { getDefaultNumTasks } from '../../../../scripts/modules/config-manager.js';
import { resolveProjectPath } from '../utils/path-utils.js';
import { TASKMASTER_TASKS_FILE } from '../../../../src/constants/paths.js';

/**
 * Direct function wrapper for parsing Obsidian notes and extracting tasks.
 *
 * @param {Object} args - Command arguments containing vaultPath, projectRoot, and options.
 * @param {string} args.vaultPath - Path to the Obsidian vault directory.
 * @param {string} args.projectRoot - Project root path.
 * @param {string} args.output - Path to the output directory.
 * @param {string} args.numTasks - Number of tasks to extract.
 * @param {boolean} args.force - Whether to force parsing.
 * @param {boolean} args.append - Whether to append to the output file.
 * @param {boolean} args.research - Whether to use research mode.
 * @param {string} args.tag - Tag context for organizing tasks into separate task lists.
 * @param {boolean} args.preserveLinks - Whether to preserve Obsidian [[links]].
 * @param {boolean} args.includeTags - Whether to include Obsidian #tags.
 * @param {Array} args.excludePatterns - Patterns to exclude from scanning.
 * @param {boolean} args.syncAfterParse - Whether to sync tasks back to vault after parsing.
 * @param {boolean} args.autoSync - Whether to enable auto-sync.
 * @param {Object} log - Logger object.
 * @param {Object} context - Context object containing session data.
 * @returns {Promise<Object>} - Result object with success status and data/error information.
 */
export async function parseObsidianNotesDirect(args, log, context = {}) {
    const { session } = context;
    // Extract args
    const {
        vaultPath,
        output: outputArg,
        numTasks: numTasksArg,
        force,
        append,
        research,
        projectRoot,
        tag,
        preserveLinks,
        includeTags,
        excludePatterns,
        syncAfterParse,
        autoSync
    } = args;

    // Create the standard logger wrapper
    const logWrapper = createLogWrapper(log);

    // --- Input Validation and Path Resolution ---
    if (!projectRoot) {
        logWrapper.error('parseObsidianNotesDirect requires a projectRoot argument.');
        return {
            success: false,
            error: {
                code: 'MISSING_ARGUMENT',
                message: 'projectRoot is required.'
            }
        };
    }

    if (!vaultPath) {
        logWrapper.error('parseObsidianNotesDirect requires a vaultPath argument.');
        return {
            success: false,
            error: {
                code: 'MISSING_ARGUMENT',
                message: 'vaultPath is required.'
            }
        };
    }

    // Validate vault path
    if (!fs.existsSync(vaultPath)) {
        const errorMsg = `Vault path does not exist: ${vaultPath}`;
        logWrapper.error(errorMsg);
        return {
            success: false,
            error: { code: 'VAULT_NOT_FOUND', message: errorMsg }
        };
    }

    const stats = fs.statSync(vaultPath);
    if (!stats.isDirectory()) {
        const errorMsg = `Vault path is not a directory: ${vaultPath}`;
        logWrapper.error(errorMsg);
        return {
            success: false,
            error: { code: 'INVALID_VAULT_PATH', message: errorMsg }
        };
    }

    // Check for .obsidian directory (validation)
    const obsidianDir = path.join(vaultPath, '.obsidian');
    if (!fs.existsSync(obsidianDir)) {
        logWrapper.warn(`No .obsidian directory found in ${vaultPath}. This might not be a valid Obsidian vault.`);
    }

    // Resolve output path
    const outputPath = outputArg
        ? path.isAbsolute(outputArg)
            ? outputArg
            : path.resolve(projectRoot, outputArg)
        : resolveProjectPath(TASKMASTER_TASKS_FILE, args) ||
            path.resolve(projectRoot, TASKMASTER_TASKS_FILE);

    const outputDir = path.dirname(outputPath);
    try {
        if (!fs.existsSync(outputDir)) {
            logWrapper.info(`Creating output directory: ${outputDir}`);
            fs.mkdirSync(outputDir, { recursive: true });
        }
    } catch (error) {
        const errorMsg = `Failed to create output directory ${outputDir}: ${error.message}`;
        logWrapper.error(errorMsg);
        return {
            success: false,
            error: { code: 'DIRECTORY_CREATE_FAILED', message: errorMsg }
        };
    }

    let numTasks = getDefaultNumTasks(projectRoot);
    if (numTasksArg) {
        numTasks =
            typeof numTasksArg === 'string' ? parseInt(numTasksArg, 10) : numTasksArg;
        if (Number.isNaN(numTasks) || numTasks < 0) {
            // Ensure positive number
            numTasks = getDefaultNumTasks(projectRoot); // Fallback to default if parsing fails or invalid
            logWrapper.warn(
                `Invalid numTasks value: ${numTasksArg}. Using default: ${numTasks}`
            );
        }
    }

    if (append) {
        logWrapper.info('Append mode enabled.');
        if (force) {
            logWrapper.warn(
                'Both --force and --append flags were provided. --force takes precedence; append mode will be ignored.'
            );
        }
    }

    if (research) {
        logWrapper.info(
            'Research mode enabled. Using enhanced AI analysis for task extraction.'
        );
    }

    if (preserveLinks) {
        logWrapper.info('Obsidian [[internal links]] will be preserved in tasks.');
    }

    if (includeTags) {
        logWrapper.info('Obsidian #tags will be extracted and included in tasks.');
    }

    if (excludePatterns && excludePatterns.length > 0) {
        logWrapper.info(`Excluding patterns: ${excludePatterns.join(', ')}`);
    }

    logWrapper.info(
        `Parsing Obsidian notes from vault: ${vaultPath} to ${outputPath}, NumTasks: ${numTasks}, Force: ${force}, Append: ${append}, Research: ${research}, ProjectRoot: ${projectRoot}`
    );

    const wasSilent = isSilentMode();
    if (!wasSilent) {
        enableSilentMode();
    }

    try {
        // Call the core parseObsidianNotes function
        const result = await parseObsidianNotes(
            vaultPath,
            outputPath,
            numTasks,
            {
                session,
                mcpLog: logWrapper,
                projectRoot,
                tag,
                force,
                append,
                research,
                preserveLinks,
                includeTags,
                excludePatterns,
                syncAfterParse,
                autoSync,
                commandName: 'parse-obsidian-notes',
                outputType: 'mcp'
            }
        );

        // Adjust check for the new return structure
        if (result && result.success) {
            const successMsg = `Successfully extracted ${result.extractedTasks} tasks from ${result.sourceFiles} Obsidian notes and saved to ${result.tasksPath}`;
            logWrapper.success(successMsg);
            return {
                success: true,
                data: {
                    message: successMsg,
                    outputPath: result.tasksPath,
                    extractedTasks: result.extractedTasks,
                    sourceFiles: result.sourceFiles,
                    vaultPath: result.vaultPath,
                    syncResult: result.syncResult,
                    telemetryData: result.telemetryData
                }
            };
        } else {
            // Handle case where core function didn't return expected success structure
            logWrapper.error(
                'Core parseObsidianNotes function did not return a successful structure.'
            );
            return {
                success: false,
                error: {
                    code: 'CORE_FUNCTION_ERROR',
                    message:
                        result?.message ||
                        'Core function failed to parse Obsidian notes or returned unexpected result.'
                }
            };
        }
    } catch (error) {
        logWrapper.error(`Error executing core parseObsidianNotes: ${error.message}`);
        return {
            success: false,
            error: {
                code: 'PARSE_OBSIDIAN_NOTES_CORE_ERROR',
                message: error.message || 'Unknown error parsing Obsidian notes'
            }
        };
    } finally {
        if (!wasSilent && isSilentMode()) {
            disableSilentMode();
        }
    }
}
