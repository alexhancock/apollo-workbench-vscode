import { IMocks } from "apollo-server";

export interface RequiredHeader {
    key: string;
    value?: string;
}

export interface WorkbenchSchema {
    url?: string;
    sdl: string;
    shouldMock: boolean;
    autoUpdateSchemaFromUrl: boolean;
    requiredHeaders?: [RequiredHeader?],
    //this will be serialized into javascript using eval
    customMocks?: string
}

export class ApolloWorkbenchFile {
    graphName: string = "";
    operations: { [opName: string]: string } = {};
    queryPlans: { [opName: string]: string } = {};
    schemas: { [serviceName: string]: WorkbenchSchema } = {};
    composedSchema: string = "";
}

///This is the user facing settings displayed
export interface WorkbenchSettings {
    url: string;
    requiredHeaders?: [RequiredHeader?];
    mocks: {
        shouldMock: boolean;
        autoUpdateSchemaFromUrl: boolean;
    };
}