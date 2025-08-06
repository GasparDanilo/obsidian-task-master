# Modificações Mínimas na Estrutura de Dados - Task Master AI → Obsidian

## 📋 **Resumo das Modificações na Estrutura de Dados**

Total de modificações necessárias: **~15% do código de estrutura de dados**

**Filosofia**: Manter o sistema centralizado de `tasks.json` mas adicionar capacidades distribuídas para integração com arquivos markdown do Obsidian.

---

## **📊 Estrutura Atual vs Nova Estrutura**

### **Estrutura Atual (Centralizada)**
```json
{
  "master": {
    "tasks": [
      {
        "id": 1,
        "title": "Task Title",
        "description": "Task Description",
        "status": "pending",
        "priority": "high",
        "dependencies": [2],
        "details": "Implementation details",
        "testStrategy": "Testing approach",
        "subtasks": []
      }
    ],
    "metadata": {
      "created": "2025-01-06T10:00:00Z",
      "updated": "2025-01-06T11:00:00Z",
      "description": "Tasks for master context"
    }
  }
}
```

### **Nova Estrutura (Híbrida Centralizada + Distribuída)**
```json
{
  "master": {
    "tasks": [
      {
        "id": 1,
        "title": "Task Title",
        "description": "Task Description",
        "status": "pending",
        "priority": "high",
        "dependencies": [2],
        "details": "Implementation details",
        "testStrategy": "Testing approach",
        "subtasks": [],
        // NOVOS CAMPOS OBSIDIAN
        "sourceFile": "Projects/Research.md",
        "obsidianTags": ["#research", "#urgent"],
        "linkedNotes": ["[[Related Note]]", "[[Dependencies]]"],
        "vaultLocation": "/path/to/vault",
        "syncStatus": "synced", // synced|pending|conflict
        "lastSyncAt": "2025-01-06T11:00:00Z"
      }
    ],
    "metadata": {
      "created": "2025-01-06T10:00:00Z",
      "updated": "2025-01-06T11:00:00Z",
      "description": "Tasks for master context",
      // NOVOS METADADOS OBSIDIAN
      "vaultPath": "/path/to/obsidian/vault",
      "distributedMode": true,
      "syncSettings": {
        "autoSync": true,
        "bidirectional": true,
        "conflictResolution": "manual" // manual|auto-overwrite|auto-merge
      }
    }
  }
}
```

---

## **🔧 Modificações Mínimas Necessárias**

### **1. Extensão do Schema de Tarefas**

#### **Arquivo**: `scripts/modules/task-manager/parse-prd.js` (Linha 25-34)

**Antes:**
```javascript
const prdSingleTaskSchema = z.object({
    id: z.number().int().positive(),
    title: z.string().min(1),
    description: z.string().min(1),
    details: z.string().nullable(),
    testStrategy: z.string().nullable(),
    priority: z.enum(['high', 'medium', 'low']).nullable(),
    dependencies: z.array(z.number().int().positive()).nullable(),
    status: z.string().nullable()
});
```

**Depois:**
```javascript
const obsidianTaskSchema = z.object({
    id: z.number().int().positive(),
    title: z.string().min(1),
    description: z.string().min(1),
    details: z.string().nullable(),
    testStrategy: z.string().nullable(),
    priority: z.enum(['high', 'medium', 'low']).nullable(),
    dependencies: z.array(z.number().int().positive()).nullable(),
    status: z.string().nullable(),
    // NOVOS CAMPOS OBSIDIAN
    sourceFile: z.string().optional(),
    obsidianTags: z.array(z.string()).optional(),
    linkedNotes: z.array(z.string()).optional(),
    vaultLocation: z.string().optional(),
    syncStatus: z.enum(['synced', 'pending', 'conflict']).optional(),
    lastSyncAt: z.string().optional()
});
```

### **2. Extensão dos Metadados de Tag**

#### **Arquivo**: `scripts/modules/utils.js` (Função `ensureTagMetadata`)

**Adicionar novo campo de configuração:**
```javascript
function ensureTagMetadata(tagData, options = {}) {
    if (!tagData.metadata) {
        tagData.metadata = {};
    }
    
    // Campos existentes
    if (!tagData.metadata.created) {
        tagData.metadata.created = new Date().toISOString();
    }
    if (!tagData.metadata.description && options.description) {
        tagData.metadata.description = options.description;
    }
    if (!options.skipUpdate) {
        tagData.metadata.updated = new Date().toISOString();
    }
    
    // NOVOS CAMPOS OBSIDIAN
    if (options.vaultPath && !tagData.metadata.vaultPath) {
        tagData.metadata.vaultPath = options.vaultPath;
    }
    if (options.distributedMode !== undefined) {
        tagData.metadata.distributedMode = options.distributedMode;
    }
    if (options.syncSettings && !tagData.metadata.syncSettings) {
        tagData.metadata.syncSettings = {
            autoSync: true,
            bidirectional: true,
            conflictResolution: 'manual',
            ...options.syncSettings
        };
    }
}
```

### **3. Nova Funcionalidade de Sincronização**

#### **Arquivo**: `scripts/modules/task-manager/obsidian-sync.js` (NOVO ARQUIVO)

```javascript
import fs from 'fs';
import path from 'path';
import { readJSON, writeJSON } from '../utils.js';

/**
 * Synchronizes tasks between tasks.json and Obsidian markdown files
 * @param {string} tasksPath - Path to tasks.json
 * @param {string} vaultPath - Path to Obsidian vault
 * @param {Object} options - Sync options
 */
export async function syncWithObsidian(tasksPath, vaultPath, options = {}) {
    const { tag = 'master', direction = 'bidirectional' } = options;
    
    // Read current tasks
    const tasksData = readJSON(tasksPath, options.projectRoot, tag);
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
        // Sync tasks TO Obsidian files
        for (const task of tasksData.tasks) {
            if (task.sourceFile) {
                try {
                    await updateMarkdownFile(vaultPath, task);
                    syncResults.updated++;
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
                } else {
                    // Update existing task
                    Object.assign(existingTask, vaultTask, {
                        syncStatus: 'synced',
                        lastSyncAt: new Date().toISOString()
                    });
                    syncResults.updated++;
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
            }
        }
        
        // Save updated tasks
        writeJSON(tasksPath, tasksData, options.projectRoot, tag);
    }
    
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
        fs.writeFileSync(filePath, content);
        return;
    }
    
    // Update existing file
    let content = fs.readFileSync(filePath, 'utf8');
    content = updateTaskInMarkdown(content, task);
    fs.writeFileSync(filePath, content);
}

/**
 * Extracts tasks from all markdown files in vault
 */
async function extractTasksFromVault(vaultPath) {
    // Implementation similar to scanMarkdownFiles but focused on task extraction
    const glob = await import('glob');
    const markdownFiles = glob.sync('**/*.md', { cwd: vaultPath });
    const tasks = [];
    
    for (const file of markdownFiles) {
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
                linkedNotes: extractLinksFromContent(content)
            };
            
            tasks.push(task);
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

// Helper functions
function generateMarkdownForTask(task) {
    let content = '';
    
    // Add frontmatter if task has metadata
    if (task.obsidianTags?.length || task.linkedNotes?.length) {
        content += '---\n';
        if (task.obsidianTags?.length) {
            content += `tags: [${task.obsidianTags.join(', ')}]\n`;
        }
        content += `task_id: ${task.id}\n`;
        content += `priority: ${task.priority}\n`;
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
    
    if (task.linkedNotes?.length) {
        content += `## Related Notes\n`;
        for (const link of task.linkedNotes) {
            content += `- ${link}\n`;
        }
        content += '\n';
    }
    
    return content;
}

function updateTaskInMarkdown(content, task) {
    // Find and update existing task checkbox
    const taskRegex = new RegExp(`^- \\[([ x])\\] ${escapeRegex(task.title)}$`, 'm');
    const newCheckbox = task.status === 'done' ? '[x]' : '[ ]';
    const replacement = `- ${newCheckbox} ${task.title}`;
    
    return content.replace(taskRegex, replacement);
}

function extractTagsFromContent(content) {
    const matches = content.match(/#\w+/g) || [];
    return matches.map(tag => tag.substring(1)); // Remove # prefix
}

function extractLinksFromContent(content) {
    const matches = content.match(/\[\[([^\]]+)\]\]/g) || [];
    return matches;
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

---

### **4. Modificação na Geração de Arquivos**

#### **Arquivo**: `scripts/modules/task-manager/generate-task-files.js`

**Adicionar suporte para geração de arquivos Markdown do Obsidian:**

**Linha 122-145** (Geração de conteúdo):
```javascript
// ANTES - só gera arquivos .txt
let content = `# Task ID: ${task.id}\n`;
content += `# Title: ${task.title}\n`;
content += `# Status: ${task.status || 'pending'}\n`;

// DEPOIS - gera tanto .txt quanto .md para Obsidian
if (options.obsidianMode) {
    // Generate Obsidian-compatible markdown
    content = generateObsidianMarkdown(task, allTasksInTag);
    taskFileName = taskFileName.replace('.txt', '.md');
} else {
    // Original txt format
    let content = `# Task ID: ${task.id}\n`;
    content += `# Title: ${task.title}\n`;
    content += `# Status: ${task.status || 'pending'}\n`;
}
```

**Nova função para geração de markdown Obsidian:**
```javascript
function generateObsidianMarkdown(task, allTasks) {
    let content = '';
    
    // Frontmatter YAML
    content += '---\n';
    content += `task_id: ${task.id}\n`;
    content += `status: ${task.status || 'pending'}\n`;
    content += `priority: ${task.priority || 'medium'}\n`;
    if (task.obsidianTags?.length) {
        content += `tags: [${task.obsidianTags.join(', ')}]\n`;
    }
    if (task.dependencies?.length) {
        const depLinks = task.dependencies.map(id => `[[Task ${id}]]`);
        content += `dependencies: [${depLinks.join(', ')}]\n`;
    }
    content += '---\n\n';
    
    // Title and checkbox
    const checkbox = task.status === 'done' ? '[x]' : '[ ]';
    content += `# ${task.title}\n\n`;
    content += `- ${checkbox} ${task.title}\n\n`;
    
    // Content sections
    if (task.description) {
        content += `## Description\n${task.description}\n\n`;
    }
    
    if (task.details) {
        content += `## Details\n${task.details}\n\n`;
    }
    
    if (task.testStrategy) {
        content += `## Test Strategy\n${task.testStrategy}\n\n`;
    }
    
    // Dependencies with links
    if (task.dependencies?.length) {
        content += `## Dependencies\n`;
        task.dependencies.forEach(depId => {
            const depTask = allTasks.find(t => t.id === depId);
            if (depTask) {
                content += `- [[Task ${depId} - ${depTask.title}]]\n`;
            }
        });
        content += '\n';
    }
    
    // Linked notes
    if (task.linkedNotes?.length) {
        content += `## Related Notes\n`;
        task.linkedNotes.forEach(link => {
            content += `- ${link}\n`;
        });
        content += '\n';
    }
    
    return content;
}
```

---

### **5. Modificação nos Comandos**

#### **Arquivo**: `scripts/modules/commands.js`

**Adicionar novos comandos para sincronização:**

```javascript
// Adicionar após linha 49
import { syncWithObsidian } from './task-manager/obsidian-sync.js';

// Adicionar novo comando (após linha 158)
program
    .command('sync-obsidian')
    .description('Synchronize tasks with Obsidian vault')
    .option('-v, --vault <path>', 'Path to Obsidian vault')
    .option('-d, --direction <dir>', 'Sync direction: to-obsidian, from-obsidian, bidirectional', 'bidirectional')
    .option('--tag <tag>', 'Tag to sync', 'master')
    .action(async (options) => {
        try {
            const tasksPath = path.join(process.cwd(), '.taskmaster/tasks/tasks.json');
            const results = await syncWithObsidian(tasksPath, options.vault, {
                direction: options.direction,
                tag: options.tag,
                projectRoot: process.cwd()
            });
            
            console.log(chalk.green('Sync completed:'));
            console.log(`- Updated: ${results.updated}`);
            console.log(`- Created: ${results.created}`);
            console.log(`- Conflicts: ${results.conflicts}`);
            
            if (results.errors.length > 0) {
                console.log(chalk.yellow('\nErrors:'));
                results.errors.forEach(err => {
                    console.log(`- Task ${err.task}: ${err.error}`);
                });
            }
        } catch (error) {
            console.error(chalk.red(`Sync failed: ${error.message}`));
            process.exit(1);
        }
    });
```

---

## **✅ O Que NÃO Precisa Modificar (Mantém Intacto)**

- ✅ **Sistema de tags existente** - Funciona perfeitamente para contextos
- ✅ **Lógica de dependências** - IDs numéricos mantidos
- ✅ **Estrutura de subtasks** - Compatível com ambos os sistemas
- ✅ **Sistema de prioridades** - Mapeável para tags do Obsidian
- ✅ **Telemetria e logging** - Funciona igual
- ✅ **Comandos básicos** (list, next, show) - Funciona igual
- ✅ **Sistema de configuração** - Apenas extensão de metadados

---

## **🎯 Vantagens da Abordagem Híbrida**

### **Centralizada (tasks.json)**
- ✅ **Performance**: Operações rápidas em estrutura única
- ✅ **Consistência**: Single source of truth para IDs e dependências
- ✅ **Compatibilidade**: Mantém funcionamento com Cursor AI
- ✅ **Backup**: Estrutura completa em um arquivo

### **Distribuída (Markdown Files)**
- ✅ **Obsidian Native**: Funciona com plugins existentes do Obsidian
- ✅ **Human Readable**: Arquivos markdown legíveis nativamente
- ✅ **Flexibilidade**: Pode ser editado diretamente no Obsidian
- ✅ **Graph View**: Visualização de relacionamentos no Obsidian

### **Sincronização**
- ✅ **Bidirectional**: Mudanças em qualquer lugar são propagadas
- ✅ **Conflict Detection**: Detecta e reporta conflitos
- ✅ **Selective Sync**: Pode sincronizar tags específicas
- ✅ **Rollback**: Pode reverter para tasks.json se necessário

---

## **📊 Impacto das Modificações**

- **Compatibilidade**: 85% do código original mantido
- **Performance**: Mínimo impacto (sync é opcional)
- **Funcionalidades**: Todas preservadas + novas capacidades
- **Extensibilidade**: Fácil adicionar mais integrações
- **Manutenção**: Mudanças bem isoladas

---

## **🚀 Próximos Passos**

1. **Implementar schema estendido** nos arquivos de parsing
2. **Criar arquivo obsidian-sync.js** com as funcionalidades de sincronização
3. **Testar sincronização bidirectional** com vault pequeno
4. **Adicionar comandos CLI** para sincronização
5. **Documentar fluxos de trabalho** híbridos

---

## **⚙️ Configuração Recomendada**

### **Em `.taskmaster/config.json`:**
```json
{
  "global": {
    "defaultTag": "master",
    "obsidian": {
      "enabled": true,
      "vaultPath": "/path/to/vault",
      "syncMode": "bidirectional",
      "autoSync": true,
      "conflictResolution": "manual"
    }
  }
}
```

### **Exemplo de Uso:**
```bash
# Sincronizar com vault Obsidian
task-master sync-obsidian --vault /path/to/vault

# Gerar arquivos markdown para Obsidian
task-master generate --obsidian-mode

# Parse vault como entrada (da modificação anterior)
task-master parse-obsidian-vault /path/to/vault
```

Esta abordagem mantém o melhor dos dois mundos: a eficiência e consistência do sistema centralizado com a flexibilidade e recursos nativos do Obsidian.
