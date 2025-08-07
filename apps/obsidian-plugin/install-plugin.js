#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ObsidianPluginInstaller {
    constructor() {
        this.pluginDir = __dirname;
        this.pluginId = 'task-master-obsidian';
    }

    async findObsidianVaults() {
        const vaults = [];
        const possiblePaths = [];

        // Common Obsidian vault locations
        if (process.platform === 'win32') {
            const userProfile = process.env.USERPROFILE;
            possiblePaths.push(
                path.join(userProfile, 'Documents'),
                path.join(userProfile, 'Desktop'),
                path.join(userProfile, 'OneDrive', 'Documents'),
                path.join(userProfile, 'Dropbox'),
                'C:\\Users\\Public\\Documents'
            );
        } else if (process.platform === 'darwin') {
            const userHome = process.env.HOME;
            possiblePaths.push(
                path.join(userHome, 'Documents'),
                path.join(userHome, 'Desktop'),
                path.join(userHome, 'Dropbox'),
                path.join(userHome, 'iCloud Drive'),
                path.join(userHome, 'Library', 'Mobile Documents', 'iCloud~md~obsidian', 'Documents')
            );
        } else {
            const userHome = process.env.HOME;
            possiblePaths.push(
                path.join(userHome, 'Documents'),
                path.join(userHome, 'Desktop'),
                path.join(userHome, 'Dropbox')
            );
        }

        // Search for .obsidian folders
        for (const searchPath of possiblePaths) {
            try {
                await this.findVaultsInDirectory(searchPath, vaults);
            } catch (error) {
                // Directory might not exist or be accessible, continue searching
                continue;
            }
        }

        return vaults;
    }

    async findVaultsInDirectory(dirPath, vaults, depth = 0, maxDepth = 3) {
        if (depth > maxDepth) return;

        try {
            const items = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const item of items) {
                if (item.isDirectory()) {
                    const itemPath = path.join(dirPath, item.name);
                    
                    // Check if this directory is a vault (contains .obsidian folder)
                    if (item.name === '.obsidian') {
                        const vaultPath = path.dirname(itemPath);
                        const vaultName = path.basename(vaultPath);
                        vaults.push({
                            name: vaultName,
                            path: vaultPath,
                            obsidianPath: itemPath
                        });
                    } else if (depth < maxDepth && !item.name.startsWith('.') && !item.name.includes('node_modules')) {
                        // Recursively search subdirectories
                        await this.findVaultsInDirectory(itemPath, vaults, depth + 1, maxDepth);
                    }
                }
            }
        } catch (error) {
            // Skip directories we can't read
            return;
        }
    }

    async buildPlugin() {
        console.log('🔨 Building Obsidian plugin...');
        
        return new Promise((resolve, reject) => {
            const buildProcess = spawn('npm', ['run', 'build'], {
                cwd: this.pluginDir,
                stdio: 'inherit',
                shell: true
            });

            buildProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Plugin build completed successfully');
                    resolve();
                } else {
                    reject(new Error(`Build failed with exit code ${code}`));
                }
            });

            buildProcess.on('error', (error) => {
                reject(new Error(`Failed to start build process: ${error.message}`));
            });
        });
    }

    async installToVault(vault) {
        const pluginTargetDir = path.join(vault.obsidianPath, 'plugins', this.pluginId);
        
        console.log(`📦 Installing plugin to ${vault.name}...`);
        console.log(`   Target: ${pluginTargetDir}`);

        // Create plugin directory
        await fs.mkdir(pluginTargetDir, { recursive: true });

        // Copy required files
        const filesToCopy = ['main.js', 'manifest.json'];
        
        for (const file of filesToCopy) {
            const sourcePath = path.join(this.pluginDir, file);
            const targetPath = path.join(pluginTargetDir, file);
            
            try {
                await fs.access(sourcePath);
                await fs.copyFile(sourcePath, targetPath);
                console.log(`   ✅ Copied ${file}`);
            } catch (error) {
                throw new Error(`Failed to copy ${file}: ${error.message}`);
            }
        }

        // Copy styles.css if it exists
        try {
            const stylesPath = path.join(this.pluginDir, 'styles.css');
            await fs.access(stylesPath);
            await fs.copyFile(stylesPath, path.join(pluginTargetDir, 'styles.css'));
            console.log('   ✅ Copied styles.css');
        } catch (error) {
            // styles.css is optional
            console.log('   ℹ️  No styles.css found (optional)');
        }

        return pluginTargetDir;
    }

    async enablePluginInVault(vault) {
        const communityPluginsPath = path.join(vault.obsidianPath, 'community-plugins.json');
        
        try {
            // Read existing community plugins
            let communityPlugins = [];
            try {
                const content = await fs.readFile(communityPluginsPath, 'utf8');
                communityPlugins = JSON.parse(content);
            } catch (error) {
                // File doesn't exist, start with empty array
                communityPlugins = [];
            }

            // Add our plugin if not already enabled
            if (!communityPlugins.includes(this.pluginId)) {
                communityPlugins.push(this.pluginId);
                await fs.writeFile(communityPluginsPath, JSON.stringify(communityPlugins, null, 2));
                console.log('   ✅ Plugin enabled in community-plugins.json');
            } else {
                console.log('   ℹ️  Plugin already enabled');
            }
        } catch (error) {
            console.log('   ⚠️  Could not auto-enable plugin, you\'ll need to enable it manually in Obsidian');
        }
    }

    async promptVaultSelection(vaults) {
        console.log('\n📁 Found Obsidian vaults:');
        vaults.forEach((vault, index) => {
            console.log(`   ${index + 1}. ${vault.name} (${vault.path})`);
        });
        console.log(`   ${vaults.length + 1}. All vaults`);
        console.log('   0. Cancel');

        const readline = await import('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question('\nSelect vault(s) to install to (number): ', (answer) => {
                rl.close();
                const choice = parseInt(answer);
                
                if (choice === 0) {
                    resolve([]);
                } else if (choice === vaults.length + 1) {
                    resolve(vaults);
                } else if (choice >= 1 && choice <= vaults.length) {
                    resolve([vaults[choice - 1]]);
                } else {
                    console.log('Invalid selection, cancelling...');
                    resolve([]);
                }
            });
        });
    }

    async checkDependencies() {
        console.log('🔍 Checking dependencies...');
        
        // Check if we're in the right directory
        try {
            await fs.access(path.join(this.pluginDir, 'package.json'));
            await fs.access(path.join(this.pluginDir, 'src', 'main.ts'));
        } catch (error) {
            throw new Error('Plugin source files not found. Make sure you\'re running this from the plugin directory.');
        }

        // Check if node_modules exists
        try {
            await fs.access(path.join(this.pluginDir, 'node_modules'));
        } catch (error) {
            console.log('📦 Installing dependencies...');
            await this.runCommand('npm', ['install']);
        }

        console.log('✅ Dependencies check completed');
    }

    async runCommand(command, args) {
        return new Promise((resolve, reject) => {
            const process = spawn(command, args, {
                cwd: this.pluginDir,
                stdio: 'inherit',
                shell: true
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Command failed with exit code ${code}`));
                }
            });

            process.on('error', (error) => {
                reject(new Error(`Failed to run command: ${error.message}`));
            });
        });
    }

    async install(vaultPaths = null) {
        try {
            console.log('🚀 TaskMaster Obsidian Plugin Installer');
            console.log('=====================================\n');

            // Check dependencies and build
            await this.checkDependencies();
            await this.buildPlugin();

            let targetVaults = [];

            if (vaultPaths && vaultPaths.length > 0) {
                // Install to specified vaults
                for (const vaultPath of vaultPaths) {
                    const obsidianPath = path.join(vaultPath, '.obsidian');
                    try {
                        await fs.access(obsidianPath);
                        targetVaults.push({
                            name: path.basename(vaultPath),
                            path: vaultPath,
                            obsidianPath: obsidianPath
                        });
                    } catch (error) {
                        console.log(`⚠️  Warning: ${vaultPath} doesn't appear to be a valid Obsidian vault`);
                    }
                }
            } else {
                // Auto-discover vaults
                console.log('🔍 Searching for Obsidian vaults...');
                const vaults = await this.findObsidianVaults();

                if (vaults.length === 0) {
                    console.log('❌ No Obsidian vaults found.');
                    console.log('   Make sure Obsidian is installed and you have at least one vault.');
                    return false;
                }

                targetVaults = await this.promptVaultSelection(vaults);
            }

            if (targetVaults.length === 0) {
                console.log('❌ Installation cancelled or no vaults selected.');
                return false;
            }

            // Install to selected vaults
            const installedVaults = [];
            for (const vault of targetVaults) {
                try {
                    const pluginPath = await this.installToVault(vault);
                    await this.enablePluginInVault(vault);
                    installedVaults.push({ vault, pluginPath });
                    console.log(`✅ Successfully installed to ${vault.name}`);
                } catch (error) {
                    console.log(`❌ Failed to install to ${vault.name}: ${error.message}`);
                }
            }

            if (installedVaults.length > 0) {
                console.log('\n🎉 Installation completed!');
                console.log('\nNext steps:');
                console.log('1. Restart Obsidian');
                console.log('2. Go to Settings > Community Plugins');
                console.log('3. Enable "TaskMaster" plugin');
                console.log('4. Configure TaskMaster settings in the plugin settings');
                console.log('5. Use Ctrl/Cmd+P and type "TaskMaster" to see available commands');

                return true;
            } else {
                console.log('\n❌ Installation failed for all vaults.');
                return false;
            }

        } catch (error) {
            console.error(`\n❌ Installation failed: ${error.message}`);
            return false;
        }
    }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
    const installer = new ObsidianPluginInstaller();
    const vaultPaths = process.argv.slice(2);
    
    installer.install(vaultPaths.length > 0 ? vaultPaths : null)
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Unexpected error:', error);
            process.exit(1);
        });
}

export { ObsidianPluginInstaller };
