import Ajv from "ajv";
import * as jsonld from "jsonld"
const $RefParser = require("json-schema-ref-parser");

const ajv = new Ajv({allErrors: true, schemaId: "auto"});

const DEBUG = false;

function extractContext(document: any): any|null {
    return document["@context"];
}

function jsonldSchemaToFrame(jsonldschema: any): any {
    if (Array.isArray(jsonldschema)) {
        return (jsonldschema as Array<any>).map((e) => jsonldSchemaToFrame(e));
    } else if (typeof(jsonldschema) !== 'object' || jsonldschema == null) {
        return null
    } else {
        let semType = jsonldschema['@type'];
        let ctx = extractContext(jsonldschema);
        let props = jsonldschema['properties'];
        let items = jsonldschema['items'];
        let acc: {[p:string]: any} = {};
        if (semType != null) {
            acc["@type"] = semType;
        }
        if (ctx != null) {
            acc["@context"] = ctx;
        }
        if (items != null) {
            return jsonldSchemaToFrame(items); // TODO: arrays in items
        } else if(props != null) {
            for (var p in props) {
                let nested = jsonldSchemaToFrame(props[p]);
                if (nested != null) {
                    acc[p] = nested;
                }
            }
            return  acc;
        } else if (semType != null || ctx != null) { // otherwise we would generate an empty map
            return acc;
        }
        // TODO: schema combinators
        // TODO: $refs
    }
}

async function applyFrame(document: any, jsonldSchema: any): Promise<any>  {
    let resolvedJsonldSchema = await $RefParser.dereference(jsonldSchema);
    return new Promise((resolve, reject) => {
        let frame = jsonldSchemaToFrame(resolvedJsonldSchema);
        if (DEBUG) {
            console.log("======================= FRAME: =========================");
            console.log(JSON.stringify(frame, null, 2));
        }
        jsonld.frame(document, frame, ((err, res) => {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        }))
    });
}

async function validateSchema(document: any, schema: any): Promise<any> {
    return new Promise((resolve, reject) => {
        if (DEBUG) {
            console.log("=====================SCHEMA:=====================");
            console.log(JSON.stringify(schema, null, 2));
            console.log("=====================DOCUMENT:=====================");
            console.log(JSON.stringify(document, null, 2));
        }
        let validate = ajv.compile(schema);
        let valid = validate(document);
        if (!valid) {
            reject(validate.errors);
        } else {
            resolve(document)
        }
    })
}

/*
function recontext(document: any, oldContext: any, newContext: any): any {
    jsonld.
}
*/
export async function validate(document: Document, jsonldSchema: Document) {
    let framed: any = await applyFrame(document, jsonldSchema);
    let nodes: Array<any> = framed["@graph"] || [];
    let acc: {[id:string]: any} = {};
    let success = true;
    let totalErrors = 0;
    for (const node of nodes) {
        try {
            await validateSchema(node, jsonldSchema);
            acc[node['@id'] as string] = { result: true, errors: []};
        } catch(errors) {
            success = false;
            totalErrors += 1;
            acc[node['@id']] = { result: false, errors: errors};
        }
    }
    const finalResult = {
        success: success,
        totalErrors: totalErrors,
        results: acc
    };

    if (DEBUG) {
        console.log("========================== FINAL RESULT ==========================");
        console.log(JSON.stringify(finalResult, null, 2));
    }

    return finalResult
}