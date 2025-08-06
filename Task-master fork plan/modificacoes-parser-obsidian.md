# Modificações Mínimas no Parser - Task Master AI → Obsidian

## 📋 **Resumo das Modificações**

Total de modificações necessárias: **~20 linhas de ~378 linhas (~5% do código)**

Arquivo alvo: `task-master-ai/scripts/modules/task-manager/parse-prd.js`

---

## **1. Mudança na Interface da Função**

### **Antes (Linha 63):**
```javascript
async function parsePRD(prdPath, tasksPath, numTasks, options = {}) {
```

### **Depois:**
```javascript
async function parseObsidianVault(vaultPath, tasksPath, numTasks, options = {}) {
```

---

## **2. Modificação na Leitura de Entrada**

### **Antes (Linhas 167-171):**
```javascript
report(`Reading PRD content from ${prdPath}`, 'info');
const prdContent = fs.readFileSync(prdPath, 'utf8');
if (!prdContent) {
    throw new Error(`Input file ${prdPath} is empty or could not be read.`);
}
```

### **Depois:**
```javascript
report(`Scanning Obsidian vault at ${vaultPath}`, 'info');
const vaultContent = await scanMarkdownFiles(vaultPath);
if (!vaultContent) {
    throw new Error(`Vault ${vaultPath} is empty or could not be scanned.`);
}
```

---

## **3. Nova Função Scanner (Adicionar no início do arquivo)**

```javascript
import glob from 'glob';

/**
 * Scans Obsidian vault for markdown files and extracts tasks
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
                    frontmatter = yaml.parse(frontmatterMatch[1]);
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
            console.warn(`Warning: Could not read ${file}:`, error.message);
        }
    }
    
    consolidatedContent += `\n\n--- VAULT SUMMARY ---\n`;
    consolidatedContent += `Total Files: ${markdownFiles.length}\n`;
    consolidatedContent += `Total Existing Tasks: ${existingTasks.length}\n`;
    consolidatedContent += `Completed Tasks: ${existingTasks.filter(t => t.completed).length}\n`;
    
    return consolidatedContent;
}
```

---

## **4. Modificação no Schema Zod (Linhas 24-45)**

### **Antes:**
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

### **Depois:**
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
    sourceFile: z.string().optional(), // Arquivo de origem
    obsidianTags: z.array(z.string()).optional(), // Tags do Obsidian
    linkedNotes: z.array(z.string()).optional() // Links [[nota]]
});
```

### **Atualizar Schema de Resposta (Linha 37):**
```javascript
const obsidianResponseSchema = z.object({
    tasks: z.array(obsidianTaskSchema),  // Usar novo schema
    metadata: z.object({
        projectName: z.string(),
        totalTasks: z.number(),
        sourceVault: z.string(),  // Em vez de sourceFile
        generatedAt: z.string()
    })
});
```

---

## **5. Modificação no Carregamento de Prompt (Linhas 180-190)**

### **Antes:**
```javascript
const { systemPrompt, userPrompt } = await promptManager.loadPrompt(
    'parse-prd',
    {
        research,
        numTasks,
        nextId,
        prdContent,
        prdPath,
        defaultTaskPriority
    }
);
```

### **Depois:**
```javascript
const { systemPrompt, userPrompt } = await promptManager.loadPrompt(
    'parse-obsidian-vault',  // Novo prompt específico
    {
        research,
        numTasks,
        nextId,
        vaultContent,     // Em vez de prdContent
        vaultPath,        // Em vez de prdPath
        defaultTaskPriority
    }
);
```

---

## **6. Modificação na Chamada do AI Service (Linha 203)**

### **Antes:**
```javascript
aiServiceResponse = await generateObjectService({
    role: research ? 'research' : 'main',
    session: session,
    projectRoot: projectRoot,
    schema: prdResponseSchema,  // Schema antigo
    objectName: 'tasks_data',
    systemPrompt: systemPrompt,
    prompt: userPrompt,
    commandName: 'parse-prd',  // Comando antigo
    outputType: isMCP ? 'mcp' : 'cli'
});
```

### **Depois:**
```javascript
aiServiceResponse = await generateObjectService({
    role: research ? 'research' : 'main',
    session: session,
    projectRoot: projectRoot,
    schema: obsidianResponseSchema,  // Novo schema
    objectName: 'tasks_data',
    systemPrompt: systemPrompt,
    prompt: userPrompt,
    commandName: 'parse-obsidian-vault',  // Novo comando
    outputType: isMCP ? 'mcp' : 'cli'
});
```

---

## **7. Atualização das Mensagens de Log**

### **Substitua todas as ocorrências:**
- Linha 103: `"Parsing PRD file"` → `"Parsing Obsidian vault"`
- Linha 194: `"generate tasks from PRD"` → `"generate tasks from Obsidian vault"`
- Linha 217: `"Successfully parsed PRD"` → `"Successfully parsed Obsidian vault"`
- Linha 315: `"PRD"` → `"Obsidian vault"`
- Linha 327: `"PRD"` → `"vault"`
- Linha 361: `"Error parsing PRD"` → `"Error parsing Obsidian vault"`

---

## **8. Dependências Adicionais Necessárias**

Adicionar no topo do arquivo:
```javascript
import glob from 'glob';
import yaml from 'yaml';  // Para parsing do frontmatter YAML
```

---

## **9. Novo Template de Prompt**

Criar arquivo: `parse-obsidian-vault.js` no diretório de prompts com:

```javascript
export const parseObsidianVaultPrompt = {
    systemPrompt: `You are an expert task management AI specialized in analyzing Obsidian vaults and organizing tasks.
    
Your role is to:
1. Analyze markdown files from an Obsidian vault
2. Identify existing tasks, notes, and their relationships
3. Generate organized, actionable tasks based on the vault content
4. Respect Obsidian's linking system and tag structure
5. Preserve relationships between notes using [[wiki-links]]`,

    userPrompt: `Analyze this Obsidian vault content and generate {{numTasks}} organized tasks.

Vault Content:
{{vaultContent}}

Focus on:
- Existing incomplete tasks (- [ ])
- Notes that need action items
- Project organization opportunities
- Knowledge management improvements
- Cross-note relationships via [[links]]

Generate tasks with appropriate priorities, dependencies, and Obsidian-specific metadata.`
};
```

---

## **✅ O Que NÃO Precisa Modificar**

- ✅ **Estrutura de tags** (linhas 112-165) - Funciona igual
- ✅ **Lógica de dependências** (linhas 268-278) - Funciona igual  
- ✅ **Sistema de append/force** (linhas 136-165) - Funciona igual
- ✅ **Geração do JSON final** (linhas 285-313) - Funciona igual
- ✅ **Telemetria e retorno** (linhas 354-359) - Funciona igual
- ✅ **Validação de tarefas** (linhas 254-278) - Funciona igual
- ✅ **Sistema de IDs sequenciais** - Funciona igual

---

## **🎯 Próximos Passos**

1. **Implementar as modificações** no arquivo `parse-prd.js`
2. **Criar o template de prompt** `parse-obsidian-vault`
3. **Testar com um vault Obsidian** pequeno
4. **Ajustar o scanner** baseado nos resultados dos testes
5. **Documentar comandos específicos** do Obsidian

---

## **📊 Impacto das Modificações**

- **Compatibilidade**: 95% do código original mantido
- **Funcionalidades**: Todas as funcionalidades existentes preservadas
- **Extensibilidade**: Fácil adicionar mais campos específicos do Obsidian
- **Manutenção**: Mudanças isoladas, fáceis de reverter se necessário
