import { composeAndValidate, ServiceDefinition } from "@apollo/federation";
import { GraphQLError, parse, extendSchema, GraphQLSchema } from "graphql";
import { Diagnostic, DiagnosticSeverity, Range, } from "vscode";
import { compositionDiagnostics } from "../extension";
import { StateManager } from "../workbench/stateManager";
import { extractDefinedEntitiesByService } from "./parsers/csdlParser";
import { FileProvider } from "../workbench/file-system/fileProvider";
import { WorkbenchUri, WorkbenchUriType } from "../workbench/file-system/WorkbenchUri";
import { ApolloWorkbenchFile } from "../workbench/file-system/fileTypes";
import { CompositionResult, CompositionFailure } from "@apollo/federation/dist/composition/utils";

export function superSchemaToSchema(supergraphSchema: string) {
    const schema = new GraphQLSchema({
        query: undefined,
    });
    const parsed = parse(supergraphSchema);
    const finalSchema = extendSchema(schema, parsed, { assumeValidSDL: true });

    return finalSchema;
}

export async function getComposedSchemaLogCompositionErrorsForWbFile(wbFilePath: string) {
    let workbenchFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);
    if (workbenchFile) {
        compositionDiagnostics.clear();
        try {
            const { errors, supergraphSdl, schema } = await getComposedSchema(workbenchFile);
            if (errors && errors.length > 0) {
                console.log('Composition Errors Found:');

                console.log(compositionDiagnostics.name);
                let diagnosticsGroups = handleErrors(workbenchFile, errors);
                for (var sn in diagnosticsGroups) {
                    compositionDiagnostics.set(WorkbenchUri.supergraph(wbFilePath, sn, WorkbenchUriType.SCHEMAS), diagnosticsGroups[sn]);
                }
            }

            if (supergraphSdl) {
                workbenchFile.supergraphSdl = supergraphSdl ?? "";
                await extractDefinedEntitiesByService(wbFilePath);
            } else {
                workbenchFile.supergraphSdl = "";
                StateManager.instance.workspaceState_selectedWorkbenchAvailableEntities = {};
            }

            FileProvider.instance.saveWorkbenchFile(workbenchFile, wbFilePath);

            if (schema)
                StateManager.instance.workspaceState_schema = schema;
            else
                StateManager.instance.clearWorkspaceSchema();
        }
        catch (err) {
            console.log(`${err}`);
        }
    }
}

export function getComposedSchema(workbenchFile: ApolloWorkbenchFile): CompositionResult {
    let sdls: ServiceDefinition[] = [];
    let errors: GraphQLError[] = [];
    for (var key in workbenchFile.schemas) {
        let localSchemaString = workbenchFile.schemas[key].sdl;
        if (localSchemaString) {
            try {
                let doc = parse(localSchemaString);
                //TODO: use onlineParser to find validation 
                sdls.push({ name: key, typeDefs: doc, url: workbenchFile.schemas[key].url });
            } catch (err) {
                //Need to include any errors for invalid schema
                //TODO: consider using online parser when there is a gql error to get a better placement of the error
                let errorMessage = `Not valid GraphQL Schema: ${err.message}`;
                let extensions: any = { invalidSchema: true, serviceName: key };

                if (err.message.includes('Syntax Error: Unexpected Name ')) {
                    let quotedUnexpected = err.message.split('Syntax Error: Unexpected Name "')[1];
                    let unexpectedName = quotedUnexpected.slice(0, quotedUnexpected.length - 1);
                    extensions.locations = err.locations;
                    extensions.unexpectedName = unexpectedName;
                } else if (err.message.includes('Syntax Error: Expected Name, found }')) {
                    errorMessage = `You must define some fields: ${err.message}`;
                    extensions.noFieldsDefined = true;
                    extensions.locations = err.locations;
                } else if (err.message.includes('Syntax Error: Expected Name, found ')) {
                    errorMessage = `You must define some fields: ${err.message}`;
                    let quotedUnexpected = err.message.split('Syntax Error: Expected Name, found ')[1];
                    let offset = quotedUnexpected.length == 1 ? 0 : 1;
                    let unexpectedName = quotedUnexpected.slice(0, quotedUnexpected.length - offset);
                    extensions.noFieldsDefined = true;
                    extensions.locations = err.locations;
                    extensions.unexpectedName = unexpectedName;
                }

                errors.push(new GraphQLError(errorMessage, undefined, undefined, undefined, undefined, undefined, extensions));
            }
        } else {
            let err = "No schema defined for service";
            errors.push(new GraphQLError(err, undefined, undefined, undefined, undefined, undefined, { noSchemaDefined: true, serviceName: key, message: err }));
        }
    }
    if (errors.length > 0) {
        return { errors } as CompositionFailure;
    } else {
        //This blocks UI thread, why I have no clue but it is overworking VS Code
        let compositionResults = composeAndValidate(sdls);

        if (Object.keys(workbenchFile.schemas).length == 0)
            compositionResults.errors = [new GraphQLError("No schemas defined in workbench yet", undefined, undefined, undefined, undefined, undefined, { noServicesDefined: true })];
        return { ...compositionResults } as CompositionResult;
    }
}

export function handleErrors(wb: ApolloWorkbenchFile, errors: GraphQLError[]) {
    let schemas = wb.schemas;
    let diagnosticsGroups: { [key: string]: Diagnostic[]; } = {};

    for (var i = 0; i < errors.length; i++) {
        let error = errors[i];
        let errorMessage = error.message;
        let diagnosticCode = '';
        let typeToIgnore = "";
        let range = new Range(0, 0, 0, 1);
        let serviceName = error.extensions?.serviceName ?? 'workbench';

        if (error.extensions) {
            if (error.extensions?.noServicesDefined) {
                let emptySchemas = `"schemas":{}`;
                let schemasIndex = 0;
                range = new Range(0, schemasIndex, 0, schemasIndex + emptySchemas.length);
            } else if (error.extensions?.noSchemaDefined || error.extensions?.invalidSchema) {
                if (error.extensions.unexpectedName) {
                    let unexpectedName = error.extensions.unexpectedName;
                    let location = error.extensions.locations[0];
                    let lineNumber = location.line - 1;
                    let textIndex = location.column - 1;

                    if (unexpectedName == '[')
                        diagnosticCode = 'makeArray:deleteRange';
                    else
                        diagnosticCode = 'deleteRange';

                    range = new Range(lineNumber, textIndex, lineNumber, textIndex + unexpectedName.length);
                } else if (error.extensions.noFieldsDefined) {
                    let location = error.extensions.locations[0];
                    let lineNumber = location.line - 1;

                    range = new Range(lineNumber - 1, 0, lineNumber, 0);
                } else {
                    // let doc = await workspace.openTextDocument(WorkbenchUri.parse(serviceName));
                    // let lastLine = doc.lineAt(doc.lineCount - 1);

                    // range = new Range(0, 0, lastLine.lineNumber, lastLine.text.length);
                }
            } else if (error.extensions?.code) {
                //We have a federation error with code
                let errSplit = error.message.split('] ');
                serviceName = errSplit[0].substring(1);

                switch (error.extensions.code) {
                    case "KEY_FIELDS_MISSING_EXTERNAL":
                    case "KEY_FIELDS_MISSING_ON_BASE":
                        typeToIgnore = errSplit[1].split(' ->')[0];
                        break;

                    case "EXECUTABLE_DIRECTIVES_IN_ALL_SERVICES":
                        serviceName = ""
                        let services = error.message.split(':')[1].split(',');
                        if (services.length > 1)
                            services.map(service => {
                                let sn = service.includes('.') ? service.substring(1, service.length - 1) : service.substring(1, service.length);
                                serviceName += `${sn}-:-`;
                            });
                        else serviceName = services[0];

                        typeToIgnore = serviceName;
                        break;
                }
            }
        } else if (errorMessage.includes('Type Query must define one or more fields')) {
            let serviceNames = Object.keys(schemas);
            if (serviceNames.length >= 1) {
                serviceName = serviceNames[0];
            }
        } else if (errorMessage.includes('Field "Query.') || errorMessage.includes('Field "Mutation.')) {
            let errorNodes = error.nodes ?? [];
            let fieldName = errorNodes[0].kind;
            serviceName = '';
            for (var sn in schemas)
                if (schemas[sn].sdl.includes(fieldName))
                    if (serviceName) serviceName += `${sn}-:-`;
                    else serviceName = sn;
        } else if (errorMessage.includes('There can be only one type named')) {
            let nameNode = error.nodes?.find(n => n.kind == "Name") as any;
            serviceName = '';

            for (var sn in schemas)
                if (schemas[sn].sdl.includes(nameNode.value))
                    serviceName += `${sn}-:-`;

            typeToIgnore = nameNode.value;
        } else if (errorMessage.includes('Field') && errorMessage.includes('can only be defined once')) {
            let splitMessage = errorMessage.split('.');
            typeToIgnore = splitMessage[0].split('"')[1];
        } else if (errorMessage.includes('Unknown type: ')) {
            let splitMessage = errorMessage.split('"');
            let fieldType = splitMessage[1];

            for (var sn in schemas)
                if (schemas[sn].sdl.includes(typeToIgnore))
                    serviceName = sn;

            // let typeRange = getRangeForFieldNamedType(fieldType, schemas[serviceName].sdl);
            // range = new Range(typeRange.startLine, typeRange.startColumn, typeRange.endLine, typeRange.endColumn);
        }

        //If we have a typeToIgnore, try getting a valid range for it
        if (typeToIgnore) {
            if (serviceName == 'workbench') {
                for (var sn in schemas)
                    if (schemas[sn].sdl.includes(typeToIgnore))
                        serviceName = sn;
            }

            // if (schemas[serviceName]) {
            //     let typeRange = getRangeForFieldNamedType(typeToIgnore, schemas[serviceName].sdl);
            //     range = new Range(typeRange.startLine, typeRange.startColumn, typeRange.endLine, typeRange.endColumn);
            // }
        }

        //If we have multiple services, we'll need to create multiple diagnostics
        if (serviceName.includes('-:-')) {
            let services = serviceName.split('-:-');
            services.map(s => {
                if (s) {
                    let schema = schemas[s].sdl;
                    let diagnostic = new Diagnostic(range, errorMessage, DiagnosticSeverity.Error);
                    if (!diagnosticsGroups[s]) diagnosticsGroups[s] = new Array<Diagnostic>();
                    // if (typeToIgnore && schema.includes(typeToIgnore)) {
                    //     let typeRange = getRangeForTypeDef(typeToIgnore, schema);
                    //     diagnostic = new Diagnostic(new Range(typeRange.startLine, typeRange.startColumn, typeRange.endLine, typeRange.endColumn), errorMessage, DiagnosticSeverity.Error);

                    //     if (diagnosticCode)
                    //         diagnostic.code = diagnosticCode;
                    // }

                    diagnosticsGroups[s].push(diagnostic);
                }
            })
        } else {
            let diagnostic = new Diagnostic(range, errorMessage, DiagnosticSeverity.Error);
            // if (typeToIgnore && schemas[serviceName] && schemas[serviceName].sdl.includes(typeToIgnore)) {
            //     let typeRange = getRangeForTypeDef(typeToIgnore, schemas[serviceName].sdl);
            //     diagnostic = new Diagnostic(new Range(typeRange.startLine, typeRange.startColumn, typeRange.endLine, typeRange.endColumn), errorMessage, DiagnosticSeverity.Error);
            // }

            if (diagnosticCode)
                diagnostic.code = diagnosticCode;

            if (!diagnosticsGroups[serviceName]) diagnosticsGroups[serviceName] = new Array<Diagnostic>();
            diagnosticsGroups[serviceName].push(diagnostic);
        }
    }

    return diagnosticsGroups;
}