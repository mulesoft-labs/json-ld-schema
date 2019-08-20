/***
 * Base class for all Schema parsers
 */
import {applyMixins, JsonldHandler} from "../utils";
import {JsonldContext} from "./jsonld_context";
const $RefParser = require("json-schema-ref-parser");

export abstract class JsonldSchemaParser {

    /**
     * Triggers the parsing of the provided schema
     */
    async parse(schema: any): Promise<any> {
        let resolvedJsonldSchema = await $RefParser.dereference(schema);
        let context = new JsonldContext();
        return this.parseSchema(resolvedJsonldSchema, context)
    }

    /**
     * Main parsing recursive function
     * @param jsonldSchema
     * @param context
     */
    protected async parseSchema(jsonldSchema: any, context: JsonldContext): Promise<any> {
        if (typeof jsonldSchema === "boolean") {
            return this.parseBoolean(jsonldSchema as boolean, context);
        } else if (this.isProperObject(jsonldSchema)) {
            // let's update the context first
            let objectSchema = jsonldSchema as Object;
            let updatedContext = context.updateContext(jsonldSchema);
            // delegate parsing of the object
            return this.parseObject(objectSchema, updatedContext)
        } else throw new Error("JSON Schemas must be only boolean or objects") // https://json-schema.org/latest/json-schema-core.html#rfc.section.4.3
    }

    protected abstract async parseBoolean(jsonldSchema: boolean, context: JsonldContext): Promise<any>;

    protected abstract async parseObject(jsonldSchema: Object, context: JsonldContext): Promise<any>;

    /**
     * Checks if this schema constraint properties of an object
     * @param jsonldSchema
     */
    protected hasProperties(jsonldSchema: any): boolean {
        return this.jsonldGet(jsonldSchema, "properties") != null;
    }

}
export interface JsonldSchemaParser extends JsonldHandler {}
applyMixins(JsonldSchemaParser, [JsonldHandler]);
