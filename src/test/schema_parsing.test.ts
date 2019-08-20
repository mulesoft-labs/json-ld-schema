import * as fs from "fs";
import {jsonldSchemaToFrame} from "../schema_parsing";

let files = fs.readdirSync("src/test/data/schema");
files.forEach((file) => {
    let fullPath = "src/test/data/schema/" + file;
    test("Checking frame for schema " + fullPath, async () => {
        let schema = JSON.parse(fs.readFileSync(fullPath).toString());
        let frame =  JSON.parse(fs.readFileSync(fullPath.replace("/schema/","/frames/")).toString());
        let computed = await jsonldSchemaToFrame(schema);
        //console.log("======================== " + fullPath + " =======================");
        //console.log(JSON.stringify(computed, null, 2));
        expect(JSON.stringify(computed, null,2)).toBe(JSON.stringify(frame, null, 2));
    });
});