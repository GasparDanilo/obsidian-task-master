import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, ChildProcess } from 'child_process';

export interface Task {
	id: string;
	title: string;
	description?: string;
	status: 'pending' | 'in-progress' | 'completed' | 'cancelled' | 'deferred';
	priority: 'low' | 'medium' | 'high' | 'critical';
	tags?: string[];
	dependencies?: string[];
	subtasks?: Task[];
	created_at?: string;
	updated_at?: string;
}

export interface TaskMasterSettings {
	mcpCommand: string;
	mcpArgs: string[];
	mcpCwd: string;
	enableAutoSync: boolean;
	syncInterval: number;
	defaultTag: string;
}

export class TaskMasterClient {
	private client: Client | null = null;
	private transport: StdioClientTransport | null = null;
	private process: ChildProcess | null = null;
	private settings: TaskMasterSettings;
	private isConnected = false;

	constructor(settings: TaskMasterSettings) {
		this.settings = settings;
	}

	async connect(): Promise<void> {
		if (this.isConnected) {
			return;
		}

		try {
			// Start the MCP server process
			const cwd = this.settings.mcpCwd || process.cwd();
			this.process = spawn(this.settings.mcpCommand, this.settings.mcpArgs, {
				cwd,
				stdio: ['pipe', 'pipe', 'pipe']
			});

			if (!this.process.stdout || !this.process.stdin) {
				throw new Error('Failed to create process with stdio pipes');
			}

			// Create transport and client
			this.transport = new StdioClientTransport({
				readable: this.process.stdout,
				writable: this.process.stdin
			});

			this.client = new Client({
				name: 'obsidian-taskmaster',
				version: '1.0.0'
			}, {
				capabilities: {
					tools: {}
				}
			});

			// Connect to the server
			await this.client.connect(this.transport);
			this.isConnected = true;

			// Handle process errors
			this.process.on('error', (error) => {
				console.error('TaskMaster MCP process error:', error);
				this.isConnected = false;
			});

			this.process.on('exit', (code, signal) => {
				console.log(`TaskMaster MCP process exited with code ${code}, signal ${signal}`);
				this.isConnected = false;
			});

		} catch (error) {
			console.error('Failed to connect to TaskMaster:', error);
			this.disconnect();
			throw error;
		}
	}

	disconnect(): void {
		if (this.client) {
			this.client.close();
			this.client = null;
		}

		if (this.transport) {
			this.transport = null;
		}

		if (this.process) {
			this.process.kill();
			this.process = null;
		}

		this.isConnected = false;
	}

	private async ensureConnected(): Promise<void> {
		if (!this.isConnected) {
			await this.connect();
		}
	}

	async listTasks(tag?: string): Promise<Task[]> {
		await this.ensureConnected();
		
		if (!this.client) {
			throw new Error('Client not connected');
		}

		try {
			const response = await this.client.callTool({
				name: 'get-tasks',
				arguments: {
					tag: tag || this.settings.defaultTag || undefined
				}
			});

			if (response.isError) {
				throw new Error(response.content[0]?.text || 'Failed to get tasks');
			}

			const tasksData = JSON.parse(response.content[0]?.text || '[]');
			return tasksData.tasks || [];
		} catch (error) {
			console.error('Error listing tasks:', error);
			throw error;
		}
	}

	async getTask(taskId: string): Promise<Task | null> {
		await this.ensureConnected();
		
		if (!this.client) {
			throw new Error('Client not connected');
		}

		try {
			const response = await this.client.callTool({
				name: 'get-task',
				arguments: {
					task_id: taskId
				}
			});

			if (response.isError) {
				throw new Error(response.content[0]?.text || 'Failed to get task');
			}

			const taskData = JSON.parse(response.content[0]?.text || '{}');
			return taskData.task || null;
		} catch (error) {
			console.error('Error getting task:', error);
			throw error;
		}
	}

	async addTask(title: string, description?: string, priority: Task['priority'] = 'medium'): Promise<Task> {
		await this.ensureConnected();
		
		if (!this.client) {
			throw new Error('Client not connected');
		}

		try {
			const response = await this.client.callTool({
				name: 'add-task',
				arguments: {
					title,
					description,
					priority,
					tag: this.settings.defaultTag || undefined
				}
			});

			if (response.isError) {
				throw new Error(response.content[0]?.text || 'Failed to add task');
			}

			const result = JSON.parse(response.content[0]?.text || '{}');
			return result.task;
		} catch (error) {
			console.error('Error adding task:', error);
			throw error;
		}
	}

	async updateTask(taskId: string, updates: Partial<Task>): Promise<Task> {
		await this.ensureConnected();
		
		if (!this.client) {
			throw new Error('Client not connected');
		}

		try {
			const response = await this.client.callTool({
				name: 'update-task',
				arguments: {
					task_id: taskId,
					...updates
				}
			});

			if (response.isError) {
				throw new Error(response.content[0]?.text || 'Failed to update task');
			}

			const result = JSON.parse(response.content[0]?.text || '{}');
			return result.task;
		} catch (error) {
			console.error('Error updating task:', error);
			throw error;
		}
	}

	async setTaskStatus(taskId: string, status: Task['status']): Promise<Task> {
		await this.ensureConnected();
		
		if (!this.client) {
			throw new Error('Client not connected');
		}

		try {
			const response = await this.client.callTool({
				name: 'set-task-status',
				arguments: {
					task_id: taskId,
					status
				}
			});

			if (response.isError) {
				throw new Error(response.content[0]?.text || 'Failed to set task status');
			}

			const result = JSON.parse(response.content[0]?.text || '{}');
			return result.task;
		} catch (error) {
			console.error('Error setting task status:', error);
			throw error;
		}
	}

	async getNextTask(): Promise<Task | null> {
		await this.ensureConnected();
		
		if (!this.client) {
			throw new Error('Client not connected');
		}

		try {
			const response = await this.client.callTool({
				name: 'next-task',
				arguments: {
					tag: this.settings.defaultTag || undefined
				}
			});

			if (response.isError) {
				throw new Error(response.content[0]?.text || 'Failed to get next task');
			}

			const result = JSON.parse(response.content[0]?.text || '{}');
			return result.task || null;
		} catch (error) {
			console.error('Error getting next task:', error);
			throw error;
		}
	}

	async removeTask(taskId: string): Promise<boolean> {
		await this.ensureConnected();
		
		if (!this.client) {
			throw new Error('Client not connected');
		}

		try {
			const response = await this.client.callTool({
				name: 'remove-task',
				arguments: {
					task_id: taskId
				}
			});

			if (response.isError) {
				throw new Error(response.content[0]?.text || 'Failed to remove task');
			}

			return true;
		} catch (error) {
			console.error('Error removing task:', error);
			throw error;
		}
	}

	async syncTasks(): Promise<void> {
		// This would trigger a sync with the current vault
		// Implementation depends on how the existing obsidian-sync command works
		console.log('Syncing tasks with TaskMaster...');
		// For now, we'll just refresh the tasks list
		await this.listTasks();
	}

	isClientConnected(): boolean {
		return this.isConnected;
	}
}
