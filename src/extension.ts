import * as vscode from 'vscode';
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient';

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
	console.log('Lingua extension is now active');

	let serverExecutable = vscode.workspace.getConfiguration('lingua').get<string>('serverExecutable');
	let logPath = vscode.workspace.getConfiguration('lingua').get<string>('serverLog');
	let serverArgs : string[] = []
	if (logPath) {
		serverArgs = ['--log-file', logPath]
	}
	if (serverExecutable) {
		let serverOptions: ServerOptions = {
			command: serverExecutable, args: serverArgs
		};

		// Options to control the language client
		let clientOptions: LanguageClientOptions = {
			// Register the server for plain text documents
			documentSelector: [{ scheme: 'file', language: 'lingua' }, { scheme: 'file', language: 'lingua-primitive' }],
			synchronize: {
				// We can notify the server about file changes to files in other languages contained in the workspace
				//fileEvents: vscode.workspace.createFileSystemWatcher('**/.lingua')
			}
		};

		// Create the language client and start the client.
		client = new LanguageClient(
			'linguaServer',
			'Lingua Language Server',
			serverOptions,
			clientOptions
		);

		// Start the client. This will also launch the server
		client.start();
	}
}

export function deactivate() { }