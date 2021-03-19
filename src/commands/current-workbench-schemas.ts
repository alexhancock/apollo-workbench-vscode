import { FileProvider, WorkbenchUri, WorkbenchUriType } from "../utils/files/fileProvider";
import { WorkbenchSchemaTreeItem } from "../workbench/current-workbench-schemas/currentWorkbenchSchemasTreeDataProvider";
import { TextDocument, Range, window, workspace } from "vscode";
import { StateManager } from "../workbench/stateManager";

export async function addSchema() {
    await FileProvider.instance.promptToAddSchema();
}

export async function deleteSchema(item: WorkbenchSchemaTreeItem) {
    await FileProvider.instance.delete(WorkbenchUri.parse(item.serviceName), { recursive: true });
}

export function deleteSchemaDocTextRange(document: TextDocument, range: Range) {
    window.visibleTextEditors.forEach(async editor => {
        if (editor.document == document) {
            await editor.edit(edit => edit.delete(range));
            await editor.document.save();
            await window.showTextDocument(editor.document);
        }
    })
}

export function disableMockSchema(service: WorkbenchSchemaTreeItem) {
    FileProvider.instance.disableMockSchema(service.serviceName);
}

export async function editSchema(item: WorkbenchSchemaTreeItem) {
    await FileProvider.instance.openSchema(item.serviceName);
}

export function makeSchemaDocTextRangeArray(document: TextDocument, range: Range) {
    window.visibleTextEditors.forEach(async editor => {
        if (editor.document == document) {
            let lineNumber = range.start.line;
            let line = editor.document.lineAt(lineNumber);
            let lineTextSplit = line.text.split(':')[1].trim();
            let arrayCharacter = lineTextSplit.indexOf('[');
            let type = lineTextSplit.slice(0, arrayCharacter);
            let originalArrayCharacterIndex = line.text.indexOf('[');

            await editor.edit(edit => {
                let replaceRange = new Range(lineNumber, originalArrayCharacterIndex - type.length, lineNumber, originalArrayCharacterIndex + lineTextSplit.length - arrayCharacter);
                edit.replace(replaceRange, `[${type}]`)
            });

            await editor.document.save();
            await window.showTextDocument(editor.document);
        }
    })
}

export function refreshSchemas() {
    StateManager.instance.currentWorkbenchSchemasProvider.refresh()
}

export async function renameSchema(item: WorkbenchSchemaTreeItem) {
    await FileProvider.instance.renameSchema(item.serviceName);
}

export async function setUrlForService(service: WorkbenchSchemaTreeItem) {
    await FileProvider.instance.promptServiceUrl(service.serviceName);
}

export async function shouldMockSchema(service: WorkbenchSchemaTreeItem) {
    await FileProvider.instance.shouldMockSchema(service.serviceName)
}

export async function updateSchemaFromUrl(service: WorkbenchSchemaTreeItem) {
    await FileProvider.instance.updateSchemaFromUrl(service.serviceName);
}

export function viewCsdl() {
    window.showTextDocument(WorkbenchUri.csdl())
}

export async function viewCustomMocks(service: WorkbenchSchemaTreeItem) {
    //TODO: cycle through open editors to see if mocks are already open to switch to tab

    //Get customMocks from workbench file
    const defaultMocks = "const faker = require('faker')\n\nconst mocks = {\n\tString: () => faker.lorem.word(),\n}\nmodule.exports = mocks;";
    let serviceName = service.serviceName;
    let serviceMocksUri = WorkbenchUri.parse(serviceName, WorkbenchUriType.MOCKS);
    let customMocks = FileProvider.instance.currrentWorkbenchSchemas[serviceName].customMocks;
    if (customMocks) {
        //Sync it to local global storage file
        await workspace.fs.writeFile(serviceMocksUri, new Uint8Array(Buffer.from(customMocks)));
    } else {
        FileProvider.instance.currrentWorkbenchSchemas[serviceName].customMocks = defaultMocks;
        FileProvider.instance.saveCurrentWorkbench();
        await workspace.fs.writeFile(serviceMocksUri, new Uint8Array(Buffer.from(defaultMocks)));
    }

    await window.showTextDocument(serviceMocksUri);
}

export async function viewSettings(service: WorkbenchSchemaTreeItem) {
    await window.showTextDocument(WorkbenchUri.parse(service.serviceName, WorkbenchUriType.SCHEMAS_SETTINGS));
}