// This file is from https://github.com/jan-dolejsi/vscode-extension-updater/
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2020. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */


import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { ExtensionContext, Uri, commands, env, window, ProgressLocation } from 'vscode';

import * as tmp from 'tmp';
import { DEFAULT_MIN_VERSION } from 'tls';

function versionCompare(v1:string, v2:string) {
    let v1s = v1.replace(/\D+$/,'').split('.');
    let v2s = v2.replace(/\D+$/,'').split('.');
    for (var i = 0; i < Math.min(v1s.length, v2s.length); i++) {
        let v1n = Number(v1s[i]);
        let v2n = Number(v2s[i]);
        if (v1n < v2n) return -1;
        if (v1n > v2n) return 1;
    }
    if (v1s.length != v2s.length) return v1s.length - v2s.length;
    let v1m = v1.match(/\D+$/);
    let v2m = v2.match(/\D+$/);
    if (v1m && v2m) {
        if (v1m[0] < v2m[0]) return -1;
        if (v1m[0] > v2m[0]) return 1;
    }
    if (v1m && !v2m) return 1;
    if (!v1m && v2m) return -1;

    return 0;
}

export async function file(mode: number, prefix: string, postfix: string): Promise<TempFile> {
    return new Promise<TempFile>((resolve, reject) => {
        tmp.file({ mode: mode, prefix: prefix, postfix: postfix },
            (err: unknown, path: string, fd: number) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve({ path: path, fd: fd });
                }
            });
    });
}

export interface TempFile {
    path: string; fd: number;
}

export async function dir(mode: number, prefix?: string, postfix?: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        tmp.dir({ mode: mode, prefix: prefix, postfix: postfix },
            (err: unknown, path: string) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(path);
                }
            });
    });
}


/**
 * Info about the new package version.
 */
export interface ExtensionVersion {
    version: string;
    when: number;
    downloadUrl: Uri;
}

/**
 * Extension `package.json` fields
 */
export interface ExtensionManifest {
    displayName: string;
    name: string;
    publisher: string;
    version: string
}

/**
 * Checks for new version, downloads and installs.
 */
export abstract class ExtensionUpdater {

    /** Extension publisher + name. 
     * This is used as a key to store the last installed version 
     * as well as for the name of the temporary downloaded .vsix file. */
    private extensionFullName: string;

    /** Extension's `pacakge.json` */
    extensionManifest: ExtensionManifest;
    installedExtensionVersion: string;

    constructor(private context: ExtensionContext) {
        this.extensionManifest = require(this.context.asAbsolutePath('package.json')) as ExtensionManifest;
        this.extensionFullName = this.extensionManifest.publisher + '.' +  this.extensionManifest.name;
        this.installedExtensionVersion = this.extensionManifest.version;
    }

    protected getExtensionManifest(): ExtensionManifest {
        return this.extensionManifest;
    }

    /**
     * Checks if new version is available, downloads and installs and reloads the window.
     */
    async getNewVersionAndInstall(): Promise<void> {

        // 1. check if new version is available
        const newVersion = await this.showProgress(`Checking for updates for ${this.extensionManifest.displayName}`, () =>
            this.getNewVersion());

        if (newVersion && await this.consentToInstall(newVersion)) {

            // 2. download
            const vsixPath = await this.showProgress(`Downloading ${this.extensionManifest.displayName}`, () =>
                this.download(newVersion.downloadUrl));

            // 3. install
            await this.showProgress(`Installing ${this.extensionManifest.displayName}`, () =>
                this.install(vsixPath));

            // 4. reload
            if (await this.consentToReload()) {
                await commands.executeCommand('workbench.action.reloadWindow');
            }
        }
        else {
            console.log(`No update found for '${this.extensionManifest.displayName}'`);
        }
    }

    /**
     * Installs VSIX package.
     * @param vsixPath path to the downloaded vsix package
     */
    private async install(vsixPath: string): Promise<void> {
        // this command does not take arguments : (
        // await commands.executeCommand('workbench.extensions.action.installVSIX', vsixPath);

        const codePath = path.join(env.appRoot, '..', '..', 'bin');

        await new Promise(resolve => {
            setTimeout(resolve, 1000);
            }); // without this, the downloaded file appears to be corrupted

        new Promise<void>((resolve, reject) => {

            execFile('code', ["--install-extension", vsixPath, "--force"], {
                shell: true,
                cwd: codePath
            }, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }

                if (stderr.includes(`Failed Installing Extensions:`)) {
                    reject(stderr);
                    return;
                }
                console.error(stderr);
                console.log(stdout);
                resolve();
            });
        });
    }

    /**
     * Downloads the .vsix from the url
     * @param downloadUri url for the .vsix package download
     */
    private async download(downloadUri: Uri): Promise<string> {
        const downloadedPath = await file(0o644, this.extensionFullName, '.vsix');
        const localFile = fs.createWriteStream(downloadedPath.path);

        return new Promise<string>((resolve, reject) => {
            https.request(downloadUri.toString(),
                {
                },
                (resp) => {
                    if ((resp.statusCode ?? Number.MAX_VALUE) >= 300) {
                        console.error(`statusCode: ${resp.statusCode}`);
                        reject(new Error(`Download failed with status code: ${resp.statusCode}`));
                    }
                    
                    // direct the downloaded bytes to the file
                    resp.pipe(localFile);
                    
                    // The whole response has been received. Print out the result.
                    resp.on('close', () => {
                        console.log(`Done downloading extension package to ${downloadedPath.path}`);
                        localFile.close();
                        resolve(downloadedPath.path);
                    });
                }).on("error", (err) => {
                    console.error("Error: " + err.message);
                    reject(err);
                });
        });
    }

    /**
     * Determines whether a new version is available.
     * @returns new version, or `undefined`, if no new version is available
     */
    private async getNewVersion(): Promise<ExtensionVersion | undefined> {
        const latestVersion = await this.getVersion();

        if (versionCompare(this.installedExtensionVersion, latestVersion.version) == -1) {
            return latestVersion;
        }
        else {
            return undefined;
        }
    }

    protected abstract async getVersion(): Promise<ExtensionVersion>;

    private showProgress<T>(message: string, payload: () => Thenable<T>): Thenable<T> {
        return window.withProgress({ location: ProgressLocation.Window, title: message }, payload);
    }

    /**
     * Requests user confirmation to download and install new version.
     * @param newVersion new version
     */
    private async consentToInstall(newVersion: ExtensionVersion): Promise<boolean> {
        const downloadAndInstall = 'Download and Install';

        const answer = await window.showWarningMessage(`New version of the '${this.extensionManifest.displayName}' extension is available.\nInstalled: ${this.installedExtensionVersion}, current: ${newVersion.version}.`,
            {}, downloadAndInstall);

        return answer === downloadAndInstall;
    }

    /**
     * Requests user confirmation to reload the installed extension
     */
    private async consentToReload(): Promise<boolean> {
        const reload = 'Reload';

        const answer = await window.showWarningMessage(`New version of the '${this.extensionManifest.displayName}' was installed.`,
            {}, reload, 'Later');

        return answer === reload;
    }
}