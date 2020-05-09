import { ExtensionUpdater, ExtensionVersion } from './updater-lib';
import { ExtensionContext, Uri } from 'vscode';
import * as https from 'https';

export class GitHubUpdater extends ExtensionUpdater {
    repo: string;

    constructor(context: ExtensionContext, repo: string) {
        super(context);
        this.repo = repo;
    }

    protected async getVersion(): Promise<ExtensionVersion> {
        let url = `https://api.github.com/repos/${this.repo}/releases/latest`;

        return new Promise<ExtensionVersion>((resolve, reject) => {
            https.get(url,
                {
                    headers: {
                        "Accept": " application/vnd.github.v3+json",
                        "User-Agent": "vscode-extension-update"
                    }, timeout: 30
                },
                (resp) => {
                    let data = '';
                    // A chunk of data has been received.
                    resp.on('data', (chunk) => {
                        data += chunk;
                    });
                    // The whole response has been received. Print out the result.
                    resp.on('end', () => {
                        try {
                            const release = JSON.parse(data);

                            const version = release["tag_name"];
                            const when = Date.parse(release["published_at"]);
                            const asset = release["assets"].find((x:any) => x["name"].endsWith(".vsix"));
                            const downloadUrl = Uri.parse(asset["browser_download_url"]);
                            if (version && when && downloadUrl) {
                                resolve({ version, when, downloadUrl });
                            } else throw "Incomplete data";
                        } catch (err) {
                            console.log(err);
                            console.log(data);
                            reject(new Error(`Unexpected response from GitHub. Full response is in the console/log.`));
                        };
                    });
                }).on("error", (err) => {
                    console.error("Error: " + err.message);
                    reject(err);
                });
        });
    }
}