/**
 * tools/parse-obsidian-notes.js
 * Tool to extract tasks from Obsidian vault notes
 */

import { z } from 'zod';
import {
    handleApiResult,
    withNormalizedProjectRoot,
    createErrorResponse
} from './utils.js';
import { parseObsidianNotesDirect } from '../core/direct-functions/parse-obsidian-notes.js';
import {
    TASKMASTER_TASKS_FILE
} from '../../../src/constants/paths.js';
import { resolveTag } from '../../../scripts/modules/utils.js';

/**
 * Register the parse_obsidian_notes tool
 * @param {Object} server - FastMCP server instance
 */
export function registerParseObsidianNotesTool(server) {
    server.addTool({
        name: 'parse_obsidian_notes',
        description: `Extract actionable tasks from Obsidian vault notes using AI analysis. This tool scans markdown files in an Obsidian vault, analyzes their content, and generates structured tasks. It preserves Obsidian-specific elements like [[internal links]] and #tags. Perfect for converting project notes, meeting notes, or brainstorming sessions into actionable task lists.`,

        parameters: z.object({
            vaultPath: z
                .string()
                .describe('Absolute path to the Obsidian vault directory'),
            projectRoot: z
                .string()
                .describe('The directory of the project. Must be an absolute path.'),
            tag: z.string().optional().describe('Tag context to operate on'),
            output: z
                .string()
                .optional()
                .describe(
                    `Output path for tasks.json file (default: ${TASKMASTER_TASKS_FILE})`
                ),
            numTasks: z
                .string()
                .optional()
                .describe(
                    'Approximate number of tasks to extract (default: auto-detect based on content complexity). Setting to 0 will allow TaskMaster to determine the appropriate number. Avoid numbers above 50 due to context window limitations.'
                ),
            force: z
                .boolean()
                .optional()
                .default(false)
                .describe('Overwrite existing output file without prompting.'),
            append: z
                .boolean()
                .optional()
                .describe('Append extracted tasks to existing file.'),
            research: z
                .boolean()
                .optional()
                .describe(
                    'Enable TaskMaster to use the research role for potentially more informed task extraction. Requires appropriate API key.'
                ),
            preserveLinks: z
                .boolean()
                .optional()
                .default(true)
                .describe('Preserve Obsidian [[internal links]] in task content'),
            includeTags: z
                .boolean()
                .optional()
                .default(true)
                .describe('Extract and include Obsidian #tags in tasks'),
            excludePatterns: z
                .array(z.string())
                .optional()
                .describe('Glob patterns for files/folders to exclude from analysis (e.g., ["**/Archive/**", "**/Templates/**"])'),
            syncAfterParse: z
                .boolean()
                .optional()
                .default(true)
                .describe('Automatically sync extracted tasks back to Obsidian vault as markdown files'),
            autoSync: z
                .boolean()
                .optional()
                .default(false)
                .describe('Enable automatic synchronization between TaskMaster and Obsidian')
        }),
        execute: withNormalizedProjectRoot(async (args, { log, session }) => {
            try {
                const resolvedTag = resolveTag({
                    projectRoot: args.projectRoot,
                    tag: args.tag
                });
                const result = await parseObsidianNotesDirect(
                    {
                        ...args,
                        tag: resolvedTag
                    },
                    log,
                    { session }
                );
                return handleApiResult(
                    result,
                    log,
                    'Error parsing Obsidian notes',
                    undefined,
                    args.projectRoot
                );
            } catch (error) {
                log.error(`Error in parse_obsidian_notes: ${error.message}`);
                return createErrorResponse(`Failed to parse Obsidian notes: ${error.message}`);
            }
        })
    });
}
