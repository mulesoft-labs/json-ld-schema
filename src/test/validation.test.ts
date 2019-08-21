import * as jsonldSchema from "../init";
import * as fs from "fs";
import {JsonldSchemaShaclParser} from "../schema_parsing/jsonld_schema_shacl_parser";

const SHACLValidator = require("shacl-js");
const jsonld = require("jsonld");

declare type TestSpec = {
    name: string,
    input: string,
    schema: string,
    validates: boolean,
    totalErrors: number
};

function loadTests(): Array<TestSpec>  {
    const contents = fs.readFileSync("src/test/data/tests.json");
    const specs = JSON.parse(contents.toString());

    /*
    const specs: any = {

    };
    */

    let acc = [];
    for (let testName in specs) {
        if (specs.hasOwnProperty(testName)) {
            let spec = specs[testName];
            spec.name = testName;
            acc.push(spec)
        }
    }
    return acc;
}

async function runTest(specTest: TestSpec) {
    let input = JSON.parse(fs.readFileSync("src/test/data/" + specTest.input).toString());
    let schema = JSON.parse(fs.readFileSync("src/test/data/" + specTest.schema).toString());

    test(specTest.name, async() => {
        // JSON-Schema results
        let res = await jsonldSchema.validate(input, schema);
        expect(specTest.validates).toBe(res.success);
        expect(specTest.totalErrors).toBe(res.totalErrors);
        // SHACL results
        let shaclRes = await validateShacl(input, schema);
        expect(specTest.validates).toBe(shaclRes.conforms());
        // let shaclResults = <any[]> shaclRes.results();
        // expect(specTest.totalErrors).toBe(shaclResults.length);
    });
}


/**
 * We run a SHACL validation for the JSON-LD graph and the parsed SHACL data shapes
 * @param input
 * @param schema
 */
async function validateShacl(input: any, schema: any) {
    let inputNQuads = await jsonld.toRDF(input, {format: "application/n-quads"});
    let shapes = await new JsonldSchemaShaclParser().parse(schema);

    // we setup the target using the type of the top-level shape
    shapes["sh:targetClass"] = shapes["sh:class"];
    let shapesNQuads = await jsonld.toRDF(shapes, {format: "application/n-quads"});
    let validator = new SHACLValidator();
    return new Promise<any>(((resolve, reject) =>  {
        validator.validate(inputNQuads, "text/turtle", shapesNQuads, "text/turtle", (e: Error, report: any) => {
            if (e != null) {
                reject(e);
            } else {
                resolve(report);
            }
        });
    }));
}

loadTests().forEach((testSpec) => {
    runTest(testSpec);
});