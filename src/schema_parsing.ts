

class JsonldHandler {

    jsonldGet(jsonld: Object, prop: string, defaultValue: any = undefined): any {
        if (typeof jsonld === "object") {
            return (jsonld as {[p: string]: any})[prop] || defaultValue;
        } else {
            return defaultValue
        }
    }

    ensureArray(value: any): any[] {
        if (value == null) {
            return [];
        } else if (Array.isArray(value)) {
            return value;
        } else {
            return [value];
        }
    }

    ensureUniqueArray(array: any[]): any[] {
        let acc = new Set();
        array.forEach((v) => acc.add(v) );
        let arr: any[] = [];
        acc.forEach((v) => arr.push(v));
        return arr;
    }

    isProperObject(jsonldSchema: any): boolean {
        return typeof jsonldSchema === "object" && !Array.isArray(jsonldSchema) && jsonldSchema != null
    }
}

class JsonldContext {

    readonly context: {[p:string]: any} = {};

    constructor(context?: Object) {
        if (context != null)
            this.context = context;
    }

    /**
     * Computes an updated JsonldContext for the input object schema
     * @param objectSchema
     */
    updateContext(objectSchema: Object): JsonldContext {
        let ctx = this.jsonldGet(objectSchema, "@context");
        if (ctx != null) {
            return new JsonldContext(this.merge(ctx));
        } else {
            return this;
        }
    }

    /**
     * Merges two jsonld contexts
     * @param ctx
     */
    private merge(ctx: any): Object {
        let acc: {[p:string]: any} = {};
        for (let p in this.context) {
            if (this.context.hasOwnProperty(p)) {
                acc[p] = this.context[p];
            }
        }
        for (let p in ctx) {
            if (ctx.hasOwnProperty(p)) {
                acc[p] = ctx[p];
            }
        }
        return acc;
    }
}
interface JsonldContext extends JsonldHandler {}
applyMixins(JsonldContext, [JsonldHandler]);

/***
 * Common class for all Schema parsers
 */
abstract class JsonldSchemaParser {
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
interface JsonldSchemaParser extends JsonldHandler {}
applyMixins(JsonldSchemaParser, [JsonldHandler]);


/**
 * Parser that generates a JSON-LD frame out of a JSONLD-Schema
 */
export class JsonldSchemaFrameParser extends JsonldSchemaParser{
    parse(): any {
        let parsed = super.parse();
        if (typeof parsed === "object") {
            delete parsed["@container"]; // we remove the top level @container property, just in case
        }
        let schemaContext = new JsonldContext(this.jsonldGet(this.schema, "@context", {}));
        let finalContext = schemaContext.updateContext(this.jsonldGet(parsed, "@context", {}));
        if (this.isProperFrame(finalContext)) {
            parsed["@context"] = finalContext.context;
        }
        return parsed;
    }

    protected parseBoolean(jsonldSchema: boolean, context: JsonldContext): any {
        if (jsonldSchema) {
            return {}; // we match any node
        }
    }

    protected parseObject(jsonldSchema: {}, context: JsonldContext): any {
        let nextFrameNode: {[p:string]: any} = {};
        // JSON-LD @type
        this.parseSemType(jsonldSchema, nextFrameNode);

        // Let's first nest the schema properties with nested schemas
        if (this.hasProperties(jsonldSchema)) {
            let props = this.jsonldGet(jsonldSchema, "properties", {});
            for (let property in props) {
                if (props.hasOwnProperty(property)) {
                    this.parseProperty(props[property], property, nextFrameNode, context);
                }
            }
        }
        // Now let's check if this is also describing an array schema, this can happen at the same time
        // than properties, we need to keep on adding constraints to select both types of nodes
        let items = this.items(jsonldSchema);
        if (items.length != 0) {
            this.parseItems(items,nextFrameNode, context);
            // let's tell the caller that this object needs to be requested
            // as an array
            nextFrameNode["@container"] = "@set";
        }
        // Now let's check combinations of schemas
        let combinators = this.combinators(jsonldSchema);
        if (combinators.length != 0) {
            this.parseCombinators(combinators, nextFrameNode, context);
        }

        return nextFrameNode;
    }

    /**
     * Parsed a new property in a schema
     * @param propertyElement
     * @param property
     * @param nextFrameNode
     * @param context
     */
    private parseProperty(propertyElement: any, property: string, nextFrameNode: {[p:string]: any}, context: JsonldContext) {
        let nestedFrame = this.parseSchema(propertyElement, context);
        let existingFrame = nextFrameNode[property];
        if (!this.isProperFrame(nestedFrame)) {
            return existingFrame;
        }
        if (existingFrame != null) {
            this.mergeObject(existingFrame, nestedFrame);
        } else {
            nextFrameNode[property] = nestedFrame;
        }
        if (nextFrameNode[property]["@container"] === "@set") {
            // Let's ensure we request the nested object as an array
            // we are communicating this by setting the [@container: @set] property/value in
            // the object we bubble up
            let currentContext = this.jsonldGet(nextFrameNode, "@context", {});
            if (currentContext[property] != null) {
                let propertyContext = currentContext[property];
                if (this.isProperObject(propertyContext)) {
                    propertyContext["@container"] = "@set";
                } else {
                    currentContext[property] = {
                        "@id": propertyContext,
                        "@container": "@set"
                    }
                }
            } else {
                currentContext["@container"] = "@set";
            }
            nextFrameNode["@context"] = currentContext;
            delete nextFrameNode[property]["@container"];
        }
        return nextFrameNode
    }

    private isProperFrame(nestedFrame: any): boolean {
        if (this.isProperObject(nestedFrame)) {
            return Object.keys(nestedFrame).length !== 0;
        }
        return false;
    }

    /**
     * Parse nested items schemas and merge them in the current free if required
     * @param items
     * @param nextFrameNode
     * @param context
     */
    private parseItems(items: any[], nextFrameNode: {}, context: JsonldContext) {
        items.forEach(item => {
            let parsed = this.parseSchema(item, context);
            if (this.isProperObject(parsed)) {
                this.mergeObject(nextFrameNode, parsed);
            }
        });
        return nextFrameNode;
    }

    /**
     * Parse nested combinator schemas and merge them in the current free if required
     * @param items
     * @param nextFrameNode
     * @param context
     */
    private parseCombinators(items: any[], nextFrameNode: {}, context: JsonldContext) {
        items.forEach(item => {
            let parsed = this.parseSchema(item, context);
            if (this.isProperObject(parsed)) {
                this.mergeObject(nextFrameNode, parsed);
            }
        });
        return nextFrameNode;
    }

    /**
     *
     * @param jsonldSchema
     */
    protected hasProperties(jsonldSchema: any): boolean {
        return this.jsonldGet(jsonldSchema, "properties") != null;
    }

    /**
     * Returns the list of schema in items.
     * @param jsonldSchema
     */
    protected items(jsonldSchema: any): any[] {
        let items = this.jsonldGet(jsonldSchema, "items");
        if (items) {
            if (Array.isArray(items)) {
                return items;
            } else if (typeof items === "object") {
                return [items];
            } else {
                return [];
            }
        } else return [];
    }

    /**
     * Checks if the nested schemas are in defined within an array
     * @param jsonldSchema
     */
    protected itemsInArray(jsonldSchema: any): boolean {
        let items = this.jsonldGet(jsonldSchema, "items");
        if (items) {
            if (Array.isArray(items)) {
                return true;
            } else if (typeof items === "object") {
                return false;
            } else {
                return false;
            }
        } else return false;
    }

    protected combinators(jsonldSchema: {[p:string]: any}): any[] {
        let combinators = ["if", "then", "else", "allOf", "anyOf", "oneOf", "not"];
        let acc: any[] = [];
        combinators.forEach((combinator) => {
            let value = this.jsonldGet(jsonldSchema, combinator, []);
            value = this.ensureArray(value);
            acc = acc.concat(value);
        });

        return acc;
    }

    //TODO: deal with mixed literal and object properties => @type needs to be removed
    /**
     * Merges a nested into an existing frame, taking care of @contexts and @types
     * @param existingFrame
     * @param newFrame
     */
    private mergeObject(existingFrame: {[p:string]: any}, newFrame: any): {[p:string]: any} {
        if (typeof newFrame !== "object" || newFrame == null) {
            if (Array.isArray(newFrame)) {
                throw new Error("Cannot merge a JSON object with an Array");
            } else {
                return existingFrame;
            }
        }
        for (let prop in newFrame) {
            if (newFrame.hasOwnProperty(prop)) {
                if (existingFrame.hasOwnProperty(prop)) {
                    let existingValue = this.jsonldGet(existingFrame,prop);
                    let nestedValue = this.jsonldGet(newFrame, prop);
                    switch(prop) {
                        case "@type": {
                            let finalTypes = this.ensureArray(existingValue).concat(this.ensureArray(nestedValue));
                            existingFrame["@type"] = this.ensureUniqueArray(finalTypes);
                            break;
                        }
                        case "@context": {
                            let exitingContext = new JsonldContext(existingValue);
                            let finalContext = exitingContext.updateContext(exitingContext); // TODO: there can be collisions here
                            existingFrame["@frame"] = finalContext.context;
                            break;
                        }
                        default: {
                            existingFrame[prop] = this.mergeObject(existingValue, nestedValue);
                        }
                    }
                } else {
                    existingFrame[prop] = newFrame[prop];
                }
            }

        }
        return existingFrame;
    }

    /**
     * Parses the @type of the schema and add it to the frame as a type
     * @param jsonldSchema
     * @param nextFrameNode
     */
    private parseSemType(jsonldSchema: {}, nextFrameNode: { [p: string]: any }) {
        let semType = this.jsonldGet(jsonldSchema, "@type")
        if (semType) {
            nextFrameNode["@type"] = this.ensureArray(semType);
        }
    }
}




function extractContext(document: any): any|null {
    return document["@context"];
}

export function jsonldSchemaToFrame(jsonldschema: any): any {
    if (Array.isArray(jsonldschema)) {
        return (jsonldschema as any[]).map((e) => jsonldSchemaToFrame(e));
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

function applyMixins(derivedCtor: any, baseCtors: any[]) {
    baseCtors.forEach(baseCtor => {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
            // @ts-ignore
            Object.defineProperty(derivedCtor.prototype, name, Object.getOwnPropertyDescriptor(baseCtor.prototype, name));
        });
    });
}