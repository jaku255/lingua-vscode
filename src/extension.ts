import * as vscode from 'vscode';
import { GitHubUpdater } from './updater';

export function activate(context: vscode.ExtensionContext) {
	console.log('Lingua extension is now active');


	let disposable = vscode.commands.registerCommand('lingua.updatePlugin', async()=>{
		try {
            await new GitHubUpdater(context, "jaku255/lingua-vscode").getNewVersionAndInstall();
        } catch(err) {
            vscode.window.showErrorMessage('Failed to check version of the Lingua extension: ' + err);
        }
    });
    
    setTimeout(()=>vscode.commands.executeCommand('lingua.updatePlugin'), 30000);

	context.subscriptions.push(disposable);
}

export function deactivate() {}