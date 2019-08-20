import * as fs from "fs";
import {JsonldSchemaShaclParser} from "../schema_parsing/jsonld_schema_shacl_parser";

let files = fs.readdirSync("src/test/data/schema");
files.forEach((file) => {
    let fullPath = "src/test/data/schema/" + file;
    test("Checking frame for schema " + fullPath, async () => {
        let schema = JSON.parse(fs.readFileSync(fullPath).toString());
        let shape =  JSON.parse(fs.readFileSync(fullPath.replace("/schema/","/shapes/")).toString());
        let computed = await new JsonldSchemaShaclParser().parse(schema);
        // console.log("======================== " + fullPath + " =======================");
        // console.log(JSON.stringify(computed, null, 2));
        expect(JSON.stringify(computed, null,2)).toBe(JSON.stringify(shape, null, 2));
    });
});