# Obsidian Task Master (Fork)

This is a personal fork of the original [Claude Task Master](https://github.com/eyaltoledano/claude-task-master) project.

The purpose of this fork is to integrate Task Master with **Obsidian** for enhanced task organization within my personal workflow.

## 🔗 Obsidian Integration Features

This fork extends Task Master with seamless **Obsidian Vault integration**, enabling you to:

### ✨ Core Sync Capabilities
- **Bidirectional Sync**: Keep your TaskMaster tasks and Obsidian vault in perfect sync
- **Markdown Generation**: Auto-generate Obsidian-compatible markdown files from your tasks
- **Vault Integration**: Import tasks from existing Obsidian notes and maintain consistency
- **Tag Support**: Full compatibility with TaskMaster's tag system for organized workflows

### 🚀 New CLI Commands

#### Initialize Obsidian Integration
```bash
# Set up Obsidian vault integration
task-master obsidian-init --vault /path/to/your/obsidian/vault
```

#### Sync Tasks Between Systems
```bash
# Sync from TaskMaster to Obsidian (create/update markdown files)
task-master obsidian-sync --vault /path/to/vault --to-obsidian

# Sync from Obsidian to TaskMaster (read markdown files)
task-master obsidian-sync --vault /path/to/vault --from-obsidian

# Bidirectional sync (both directions)
task-master obsidian-sync --vault /path/to/vault --bidirectional

# Preview sync changes without making them
task-master obsidian-sync --vault /path/to/vault --to-obsidian --dry-run
```

#### Monitor Sync Status
```bash
# Check synchronization status and detect conflicts
task-master obsidian-status --vault /path/to/vault
```

### 🎯 Use Cases

- **Knowledge Management**: Keep your project tasks integrated with your Obsidian knowledge base
- **Cross-Platform Workflow**: Access and edit tasks from both TaskMaster CLI and Obsidian GUI
- **Documentation Integration**: Link tasks directly to your project documentation in Obsidian
- **Team Collaboration**: Share task progress through Obsidian's powerful linking and sharing features
- **Multi-Context Management**: Use TaskMaster's tags with Obsidian's folder structure

### 📋 Status Tracking

The integration provides comprehensive status tracking:
- **Conflict Detection**: Identify when tasks differ between systems
- **Sync Timestamps**: Track last synchronization times
- **Task Counts**: Monitor tasks in each system
- **Smart Suggestions**: Get recommendations for resolving sync issues

## 🛠 Installation & Setup

This fork maintains full compatibility with the original Task Master while adding Obsidian features:

1. **Install**: Follow the original Task Master installation process
2. **Initialize**: Use `task-master init` to set up your project
3. **Connect Obsidian**: Run `task-master obsidian-init --vault /path/to/vault`
4. **Start Syncing**: Use the sync commands to keep your systems aligned

## 📚 Full Documentation

For complete Task Master functionality, see [README-task-master.md](README-task-master.md) - all original features remain fully supported.

---

**Original Project**: [Claude Task Master](https://github.com/eyaltoledano/claude-task-master) by [@eyaltoledano](https://x.com/eyaltoledano)
