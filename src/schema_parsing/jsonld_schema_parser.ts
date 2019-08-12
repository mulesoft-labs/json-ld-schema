/***
 * Common class for all Schema parsers
 */
import {applyMixins, JsonldHandler} from "../utils";
import {JsonldContext} from "./jsonld_context";

export abstract class JsonldSchemaParser {
    protected readonly schema: any;

    constructor(schema: any) {
        this.schema = schema;
    }

    /**
     * Triggers the parsing of the provided schema
     */
    parse(): any {
        let context = new JsonldContext();
        return this.parseSchema(this.schema, context)
    }

    /**
     * Main parsing recursive function
     * @param jsonldSchema
     * @param context
     */
    protected parseSchema(jsonldSchema: any, context: JsonldContext): any {
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

    protected abstract parseBoolean(jsonldSchema: boolean, context: JsonldContext): any;

    protected abstract parseObject(jsonldSchema: Object, context: JsonldContext): any;

}
export interface JsonldSchemaParser extends JsonldHandler {}
applyMixins(JsonldSchemaParser, [JsonldHandler]);
