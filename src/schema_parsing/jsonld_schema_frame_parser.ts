/**
 * Parser that generates a JSON-LD frame out of a JSONLD-Schema
 */
import {JsonldSchemaParser} from "./jsonld_schema_parser";
import {JsonldContext} from "./jsonld_context";

/**
 * Schema parser that generates a JSON-LD frame for the provided JSON-LD Schema
 */
export class JsonldSchemaFrameParser extends JsonldSchemaParser{
    async parse(schema: any): Promise<any> {
        let parsed = await super.parse(schema);
        if (typeof parsed === "object") {
            delete parsed["@container"]; // we remove the top level @container property, just in case
        }
        let schemaContext = new JsonldContext(this.jsonldGet(schema, "@context", {}));
        let finalContext = schemaContext.updateContext(this.jsonldGet(parsed, "@context", {}));
        if (this.isProperFrame(finalContext)) {
            parsed["@context"] = finalContext.context;
        }
        return parsed;
    }

    protected async parseBoolean(jsonldSchema: boolean, context: JsonldContext): Promise<any> {
        return new Promise<any>((resolve, rejects) => {
            if (jsonldSchema) {
                resolve({}); // we match any node
            } else {
                resolve(null);
            }
        })
    }

    protected async parseObject(jsonldSchema: {}, context: JsonldContext): Promise<any> {
        let nextFrameNode: {[p:string]: any} = {};
        // JSON-LD @type
        this.parseSemType(jsonldSchema, nextFrameNode);

        // Let's first nest the schema properties with nested schemas
        if (this.hasProperties(jsonldSchema)) {
            let props = this.jsonldGet(jsonldSchema, "properties", {});
            for (let property in props) {
                if (props.hasOwnProperty(property)) {
                    await this.parseProperty(props[property], property, nextFrameNode, context);
                }
            }
        }
        // Now let's check if this is also describing an array schema, this can happen at the same time
        // than properties, we need to keep on adding constraints to select both types of nodes
        let items = this.items(jsonldSchema);
        if (items.length != 0) {
            await this.parseItems(items,nextFrameNode, context);
            // let's tell the caller that this object needs to be requested
            // as an array
            nextFrameNode["@container"] = "@set";
        }
        // Now let's check combinations of schemas
        let combinators = this.combinators(jsonldSchema);
        if (combinators.length != 0) {
            await this.parseCombinators(combinators, nextFrameNode, context);
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
    private async parseProperty(propertyElement: any, property: string, nextFrameNode: {[p:string]: any}, context: JsonldContext): Promise<any> {
        let nestedFrame = await this.parseSchema(propertyElement, context);
        let existingFrame = nextFrameNode[property];
        if (!this.isProperFrame(nestedFrame)) {
            return existingFrame;
        }
        if (existingFrame != null) {
            await this.mergeObject(existingFrame, nestedFrame);
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
    private async parseItems(items: any[], nextFrameNode: {}, context: JsonldContext): Promise<any> {
        for (let i=0; i<items.length; i++) {
            let item = items[i];
            let parsed = await this.parseSchema(item, context);
            if (this.isProperObject(parsed)) {
                await  this.mergeObject(nextFrameNode, parsed);
            }
        }
        return nextFrameNode;
    }

    /**
     * Parse nested combinator schemas and merge them in the current free if required
     * @param items
     * @param nextFrameNode
     * @param context
     */
    private async parseCombinators(items: any[], nextFrameNode: {}, context: JsonldContext): Promise<any> {
        for (let i = 0; i<items.length; i++) {
            let item = items[i];
            let parsed = await this.parseSchema(item, context);
            if (this.isProperObject(parsed)) {
                await  this.mergeObject(nextFrameNode, parsed);
            }
        }
        return nextFrameNode;
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
    private async mergeObject(existingFrame: {[p:string]: any}, newFrame: any): Promise<{[p:string]: any}> {
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
