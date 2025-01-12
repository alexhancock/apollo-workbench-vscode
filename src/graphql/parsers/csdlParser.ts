import { FieldWithType } from "../../workbench/federationCompletionProvider";
import { FileProvider } from "../../workbench/file-system/fileProvider";
import { StateManager } from "../../workbench/stateManager";
import { visit, parse, ArgumentNode, EnumValueNode, StringValueNode } from 'graphql';

function getFieldTypeString(field): string {
    switch (field.kind) {
        case 'FieldDefinition':
            return getFieldTypeString(field.type);
        case 'ListType':
            return `[${getFieldTypeString(field.type)}]`;
        case 'NamedType':
            return field.name.value;
        //Need to add the ! for NonNull
        case 'NonNullType':
            switch (field.type.kind) {
                case 'ListType':
                    return `${getFieldTypeString(field.type)}!`;
                case 'NamedType':
                    return `${field.type.name.value}!`;
            }
        default: return "";
    }
}

export async function extractDefinedEntitiesByService(wbFilePath: string) {
    let extendables: { [serviceName: string]: { type: string, keys: { [key: string]: FieldWithType[] } }[] } = {};
    let joinGraphEnumValues: { [joinGraphEnum: string]: string } = {};

    try {
        const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);
        if (wbFile) {
            visit(parse(wbFile.supergraphSdl), {
                ObjectTypeDefinition(node) {
                    let joinOwnerDirective = node.directives?.find(d => d.name.value == 'join__owner');
                    if (joinOwnerDirective && joinOwnerDirective.arguments) {
                        let joinGraphEnumValue = ((joinOwnerDirective.arguments[0] as ArgumentNode).value as EnumValueNode).value;
                        let entity: { type: string, keys: { [key: string]: FieldWithType[] } } = { type: node.name.value, keys: {} };

                        let joinKeyDirectives = node.directives?.filter(d => d.name.value == 'join__type' && (d.arguments?.find(a => a.name.value == 'graph' && (a.value as StringValueNode)?.value == joinGraphEnumValue)?.value as EnumValueNode)?.value);
                        if (joinKeyDirectives) {
                            joinKeyDirectives?.forEach(jkd => {
                                let keyBlock = (jkd.arguments?.find(a => a.name.value == 'key')?.value as StringValueNode).value;
                                let parsedFields: string[] = [];
                                let startIndex = -1;
                                let notComposite = true;
                                for (var i = 0; i < keyBlock.length; i++) {
                                    let lastParsedField = '';
                                    let char = keyBlock[i];
                                    switch (char) {
                                        case ' ':
                                            if (startIndex != -1 && notComposite) {
                                                lastParsedField = keyBlock.substring(startIndex, i);
                                                parsedFields.push(lastParsedField);
                                            }

                                            startIndex = -1
                                            break;
                                        case '{':
                                            notComposite = false;
                                            break;
                                        case '}':
                                            notComposite = true;
                                            break;
                                        default:
                                            if (startIndex == 0 && i == keyBlock.length - 1)
                                                parsedFields.push(keyBlock);
                                            else if (i == keyBlock.length - 1)
                                                parsedFields.push(keyBlock.substring(startIndex));
                                            else if (startIndex == -1)
                                                startIndex = i;
                                            break;
                                    }
                                }

                                parsedFields.forEach(parsedField => {
                                    let finalKey = keyBlock.trim();
                                    let field = node.fields?.find(f => f.name.value == parsedField);
                                    let fieldType = '';
                                    if (field)
                                        fieldType = getFieldTypeString(field);

                                    if (entity.keys[finalKey])
                                        entity.keys[finalKey].push({ field: parsedField, type: fieldType });
                                    else
                                        entity.keys[finalKey] = [{ field: parsedField, type: fieldType }];
                                });
                            })
                        }


                        if (!extendables[joinGraphEnumValue]) {
                            extendables[joinGraphEnumValue] = [entity];
                        } else {
                            extendables[joinGraphEnumValue].push(entity);
                        }
                    }
                },
                EnumTypeDefinition(node) {
                    if (node.name.value == 'join__Graph') {
                        node.values?.forEach(enumValueDefinition => {
                            joinGraphEnumValues[enumValueDefinition.name.value] = (enumValueDefinition.directives?.find(d => d.name.value == 'join__graph')?.arguments?.find(a => a.name.value == 'name')?.value as StringValueNode)?.value;
                        })
                    }
                }
            });
            Object.keys(extendables).forEach(k => {
                extendables[joinGraphEnumValues[k]] = extendables[k];
                delete extendables[k];
            })
        }
    } catch (err) {
        console.log(err);
    }

    StateManager.instance.workspaceState_selectedWorkbenchAvailableEntities = extendables;

    return extendables;
}