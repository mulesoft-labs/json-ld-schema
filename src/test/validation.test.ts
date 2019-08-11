import * as jsonldSchema from "../init";
import * as fs from "fs";

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
        let res = await jsonldSchema.validate(input, schema);
        expect(specTest.validates).toBe(res.success);
        expect(specTest.totalErrors).toBe(res.totalErrors);
    });
}

loadTests().forEach((testSpec) => {
    runTest(testSpec);
});