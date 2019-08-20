import {JsonldContext} from "../../schema_parsing/jsonld_context";

test("Can expand properties for the provided context", async () => {

    let context = {
        "@vocab": "http://test.com/base#",
        "a": "http://test.com/other/a",
        "t": "http://test.com/t#"
    };

    let ctx = new JsonldContext(context);
    let expanded = await ctx.expand("t:test");
    expect(expanded).toBe("http://test.com/t#test");
});