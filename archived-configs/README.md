# Configurações Arquivadas

Esta pasta contém configurações de ferramentas de IA e desenvolvimento que não estão sendo utilizadas atualmente no projeto.

## Ferramentas Arquivadas

### Ferramentas de IA
- `.claude/` - Configurações e comandos para Claude AI (48 arquivos)
- `.clinerules/` - Regras para Cline (4 arquivos) 
- `.kiro/` - Hooks e configurações Kiro (13 arquivos)
- `.roo/` - Regras para Roo AI (10 arquivos)
- `.windsurf/` - Configurações Windsurf (4 arquivos)
- `.trae/` - Regras Trae (4 arquivos)
- `.gemini/` - Configurações Gemini (1 arquivo)
- `.zed/` - Configurações Zed Editor (1 arquivo)

### Arquivos de Configuração
- `.rules` - Regras gerais
- `.roomodes` - Modos do Roo

## Como Restaurar

Se você precisar usar alguma dessas ferramentas novamente, simplesmente mova a pasta correspondente de volta para a raiz do projeto:

```powershell
Move-Item -Path "archived-configs\.claude" -Destination ".\" -Force
```

## Data do Arquivamento
06/08/2025

## Motivo
Simplificação do diretório raiz mantendo apenas as configurações do Cursor, que é a ferramenta atualmente em uso.
