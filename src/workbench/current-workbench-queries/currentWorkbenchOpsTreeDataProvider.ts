import * as fs from 'fs';
import { accessSync } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { FileWatchManager } from '../fileWatchManager';
import { WorkbenchFileManager } from '../workbenchFileManager';

export class CurrentWorkbenchOpsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    context: vscode.ExtensionContext;

    constructor(private workspaceRoot: string, context: vscode.ExtensionContext) {
        this.context = context;
    }
    private _onDidChangeTreeData: vscode.EventEmitter<WorkbenchOperationTreeItem | undefined> = new vscode.EventEmitter<WorkbenchOperationTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<WorkbenchOperationTreeItem | undefined> = this._onDidChangeTreeData.event;

    refresh(): void {
        fs.rmdirSync(WorkbenchFileManager.workbenchQueriesFolderPath(false), { recursive: true });
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: WorkbenchOperationTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: WorkbenchOperationTreeItem): Thenable<vscode.TreeItem[]> {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage('No workbench file found in workspace');
            return Promise.resolve([]);
        }

        if (element) {
            throw new Error('Element?');
        } else {
            let items = this.getOperationsFromWorkbenchFile();
            if (items.length == 0)
                items.push(new vscode.TreeItem("No queries in workbench file yet", vscode.TreeItemCollapsibleState.None));

            return Promise.resolve(items);
        }
    }

    private getOperationsFromWorkbenchFile(): vscode.TreeItem[] {
        const workbenchFile = WorkbenchFileManager.getSelectedWorkbenchFile();
        if (workbenchFile) {
            let workbenchQueriesFolder = WorkbenchFileManager.workbenchQueriesFolderPath();

            const toDep = (operationName: string, operation: string, queryPlan: string): WorkbenchOperationTreeItem => {
                if (!this.pathExists(`${workbenchQueriesFolder}/${operationName}.graphql`))
                    fs.writeFileSync(`${workbenchQueriesFolder}/${operationName}.graphql`, operation);
                if (!this.pathExists(`${workbenchQueriesFolder}/${operationName}.queryplan`))
                    fs.writeFileSync(`${workbenchQueriesFolder}/${operationName}.queryplan`, queryPlan);

                return new WorkbenchOperationTreeItem(
                    operationName,
                    operation
                );
            };

            const deps = workbenchFile.operations
                ? Object.keys(workbenchFile.operations).map(operationName => toDep(operationName, workbenchFile.operations[operationName], workbenchFile.queryPlans[operationName])) : [];

            return deps;
        } else {
            return [new vscode.TreeItem("No workbench file selected", vscode.TreeItemCollapsibleState.None)];
        }
    }

    pathExists(p: string): boolean {
        try {
            accessSync(p);
        } catch (err) {
            return false;
        }
        return true;
    }
}

export class WorkbenchOperationTreeItem extends vscode.TreeItem {
    constructor(
        public readonly operationName: string,
        public readonly operationString: string
    ) {
        super(operationName, vscode.TreeItemCollapsibleState.None);
        this.tooltip = this.operationName;

        if (this.operationString.includes('mutation'))
            this.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'media', 'm.svg'),
                dark: path.join(__filename, '..', '..', '..', '..', 'media', 'm.svg')
            };
        else
            this.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'media', 'q.svg'),
                dark: path.join(__filename, '..', '..', '..', '..', 'media', 'q.svg')
            };

        this.command = {
            command: "current-workbench-operations.editOperation",
            title: "Open Operation File",
            arguments: [this]
        };

        this.contextValue = 'workbenchOperationTreeItem';
    }
}
