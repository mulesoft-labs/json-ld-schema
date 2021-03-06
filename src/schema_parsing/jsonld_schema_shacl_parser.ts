import {JsonldSchemaParser} from "./jsonld_schema_parser";
import {JsonldContext} from "./jsonld_context";

export class JsonldSchemaShaclParser extends JsonldSchemaParser {

    async parse(schema: any): Promise<any> {
        let parsed = await super.parse(schema);
        if (this.isProperObject(parsed)) {
            parsed["@context"] = {
                "sh": "http://www.w3.org/ns/shacl#",
                "xsd": "http://www.w3.org/2001/XMLSchema#"
            };
        }
        return parsed;
    }

    protected async parseBoolean(jsonldSchema: boolean, context: JsonldContext): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            resolve({}); // In this situation we will just emit an empty shape;
        })
    }

    protected async parseObject(jsonldSchema: Object, context: JsonldContext): Promise<any> {
        let shapes: any[] = [];

        shapes.push(await this.parseObjectSchema(jsonldSchema, context));
        shapes.push(await this.parseArraySchema(jsonldSchema, context));
        shapes.push(await this.parseStringSchema(jsonldSchema, context));
        shapes.push(await this.parseNumericSchema(jsonldSchema, context));
        shapes.push(await this.parseCombinatorsSchema(jsonldSchema, context));

        shapes = shapes.filter((shape) => shape != null);

        if (shapes.length  > 1) {
            return { "sh:and": { "@list": shapes}};
        } else {
            return shapes[0];
        }
    }

    /**
     * List of keywords constraining JSON objects
     */
    protected readonly  objectKeywords: string[] = [
        "properties", "maxProperties", "minProperties",
        "required", "patternProperties", "additionalProperties",
        "dependencies", "propertyNames"
    ];

    /**
     * Parsing of the object constraint properties in a JSON schema
     * @param jsonldSchema
     * @param context
     */
    private async parseObjectSchema(jsonldSchema: any, context: JsonldContext): Promise<{[_:string]:any}|null> {
        if (this.isSchemaReference(jsonldSchema)) {
            return {};
        } else if (this.isObjectValidation(jsonldSchema)) {
            // accumulator for the node shape we are building
            let nodeShape: {[_:string]: any} = {};
            let propertyShapes: {[_:string]: any} = {};

            // we first process the properties for the schema
            let properties = this.jsonldGet(jsonldSchema, "properties");
            if (properties != null) {
                propertyShapes = await this.parseNodeShapeProperties(properties, jsonldSchema, context);
            }

            // let's process the remaining properties
            for (const p in jsonldSchema) {
                if (jsonldSchema.hasOwnProperty(p)) {
                    switch (p) {
                        case "properties": {
                            // ignore already processed
                            break;
                        }
                        case "maxProperties": {
                            // not supported, requires custom validation
                            break;
                        }
                        case "minProperties": {
                            // not supported, requires custom validation
                            break;
                        }
                        case "required": {
                            await this.processRequiredProperties(propertyShapes, jsonldSchema[p], context);
                            break;
                        }
                        case "patternProperties": {
                            // not supported, requires custom validation
                            break;
                        }
                        case "additionalProperties": {
                            // only partially supported by default
                            this.processAdditionalProperties(nodeShape, jsonldSchema[p]);
                            break;
                        }
                        case "dependencies": {
                            // not supported, requires custom validation
                            break;
                        }
                        case "propertyNames": {
                            // not supported, requires custom validation
                            break;
                        }
                        default: {
                            break; // ignore keywords we don't know about
                        }
                    }
                }
            }

            // sh:class
            if (jsonldSchema["@type"] != null) {
                nodeShape["sh:class"] = { "@id": await context.expand(jsonldSchema["@type"]) };
            }

            // sh:property
            // we assign now the propertes once we have processed all the potential properties,
            // including the ones generated by required or additional properties
            if (this.isObjectWithProperties(propertyShapes)) {
                nodeShape["sh:property"] = Object.values(propertyShapes);
            }

            // @type
            nodeShape["@type"] = "sh:NodeShape";

            return nodeShape;
        } else {
            return null;
        }
    }

    /**
     * Check if this schema has object validations
     * @param jsonldSchema
     */
    protected isObjectValidation(jsonldSchema: any): boolean {
        return this.hasProperty(jsonldSchema, this.objectKeywords) || jsonldSchema["type"] === "object";
    }

    /**
     * Check if this schema is a reference to other schema
     * @param jsonldSchema
     */
    protected isSchemaReference(jsonldSchema: any): boolean {
        return this.isProperObject(jsonldSchema) && jsonldSchema['$ref'] != null;
    }

    /**
     * Checks if at least of the properties of the object is in the list provided
     * @param obj
     * @param props
     */
    protected hasProperty(obj: any, props: string[]): boolean {
        return props.find((p) => obj.hasOwnProperty(p)) != null;
    }

    /**
     * Parses properties in the JSON Schema and map them to SHACL property shapes
     * @param properties
     * @param jsonldSchema
     * @param context
     */
    private async parseNodeShapeProperties(properties: any, jsonldSchema: any, context: JsonldContext): Promise<{[_:string]: any}> {
        let keys = Object.keys(properties);
        let acc: {[_:string]: any} = {};

        for (let i=0; i<keys.length; i++) {
            let p = keys[i];
            // this is the property shape we are building
            let propertyShape: {[_:string]: any} = {};

            let propertySchema = properties[p];

            // sh:path
            propertyShape["sh:path"] = { "@id": await context.expand(p) };

            // sh:node
            const valueShape = await this.parseSchema(propertySchema, context);

            // push down the property if required, otherwise, just add the right target node
            acc[p] = this.mergeParentPropertyConstraints(propertyShape, valueShape);
        }

        return acc;
    }

    /**
     * Adds the minCount = 1 constraint for property shapes in a node shape.
     * we are expecting a map of property shapes where the key is the name of the property in the JSON Schema.
     * PropertyShapes are modified in-place.
     * @param propertyShapes
     * @param requiredProperties
     * @param context
     */
    private async processRequiredProperties(propertyShapes: { [_: string]: any }, requiredProperties: string[], context: JsonldContext) {
        for (let i=0; i<requiredProperties.length; i++) {
            let p = requiredProperties[i];
            let property = propertyShapes[p];
            if (property == null) { // this can be null because it is in the required array but has no other constraint
                property = {};
                property["sh:path"] = { "@id": await context.expand(p) };
            }
            if (property["sh:minCount"] == null || property["sh:minCount"] < 1) {
                property["sh:minCount"] = 1;
            }
            propertyShapes[p] = property;
        }
    }

    private processAdditionalProperties(nodeShape: { [p: string]: any }, schema: any) {
        let additionalProperties = this.jsonldGet(schema, "additionalProperties");
        if (additionalProperties === false) {
            nodeShape["sh:closed"] = true;
        } else {
            // not supported, requires custom validation
        }
    }

    /**
     * List of keywords constraining JSON arrays
     */
    protected readonly  arrayKeywords: string[] = [
        "items", "additionalItems", "maxItems",
        "minItems", "uniqueItems", "contains"
    ];

    private async parseArraySchema(jsonldSchema: {[_:string]: any}, context: JsonldContext): Promise<{[_:string]: any}|null> {
        if (this.isArrayValidation(jsonldSchema)) {

            // we first process the items for the schema
            // only individual schemas are supported.
            let itemsShape: {[_:string]: any} = await this.parseItems(jsonldSchema, context);
            // we store for the property shape linking this schema
            let propertyConstraints: {[_:string]: any} = {};

            for (const p in jsonldSchema) {
                if (jsonldSchema.hasOwnProperty(p)) {
                    switch (p) {
                        case "additionalItems": {
                            // not supported, requires custom validation
                            break;
                        }
                        case "maxItems": {
                            propertyConstraints["sh:maxCount"] = jsonldSchema[p];
                            break;
                        }
                        case "minItems": {
                            propertyConstraints["sh:minCount"] = jsonldSchema[p];
                            break;
                        }
                        case "uniqueItems": {
                            // not supported, requires custom validation
                            break;
                        }
                        case "contains": {
                            propertyConstraints["sh:hasValue"] = this.parseSchema(jsonldSchema[p], context);
                            break;
                        }
                        default: {
                            break;
                        }
                    }
                }
            }

            // we link the parent property constraints
            if (this.isObjectWithProperties(propertyConstraints)) {
                itemsShape[this.PARENT_PROPERTY_CONSTRAINTS] = propertyConstraints;
            }

            return itemsShape;
        } else {
            return null;
        }
    }


    /**
     * Process the items in an array schema.
     * @param jsonldSchema
     * @param context
     */
    protected async parseItems(jsonldSchema: {[_:string]: any}, context: JsonldContext) {
        let items = this.jsonldGet(jsonldSchema, "items");
        if (items != null) {
            if (Array.isArray(items)) {
                let acc = [];
                for (let i=0; i< items.length; i++) {
                    let itemShape = await this.parseSchema(items[i], context);
                    acc.push(itemShape)
                }
                return {"@list": acc}
            } else {
                return await this.parseSchema(items, context);
            }
        }
    }

    /**
     * Check if this schema has object validations
     * @param jsonldSchema
     */
    protected isArrayValidation(jsonldSchema: any): boolean {
        return this.hasProperty(jsonldSchema, this.arrayKeywords) || jsonldSchema["type"] === "array";
    }

    PARENT_PROPERTY_CONSTRAINTS = "parent-properties-constraints";

    /**
     * Checks if one shape has properties that should be applied to the parent property shape where
     * the shape is going to be linked.
     * If there are properties, it removes them from the shape and return them.
     *
     * @param shape
     */
    private extractPropertyConstraints(shape: { [p: string]: any }) {
        if (typeof(shape) === "object") {
            const constraints = shape[this.PARENT_PROPERTY_CONSTRAINTS];
            delete shape[this.PARENT_PROPERTY_CONSTRAINTS];
            return constraints;
        }
    }

    /**
     * Merges parent property constraints in the given property shape
     *
     * @param propertyShape
     * @param valueShape
     */
    private mergeParentPropertyConstraints(propertyShape: { [p: string]: any }, valueShape: any): {[_:string]:any} {
        if (this.isSchemaCombinator(valueShape)) {
            // the target is a logical combinator, we need to push the property shape
            if (valueShape["sh:and"] != null || valueShape["sh:or"] != null || valueShape["sh:xone"] != null) {
                let elem = "";
                if (valueShape["sh:and"] != null) {
                    elem = "sh:and";
                } else if (valueShape["sh:or"]) {
                    elem = "sh:or";
                } else if (valueShape["sh:xone"]) {
                    elem = "sh:xone";
                }
                let list = valueShape[elem];
                let elems = list["@list"];
                let mergedElems = elems.map((e: {[_:string]:any}) =>{
                    // copying the shape before pushing it in each clause
                    let copiedPropertyShape = this.deepCopy(propertyShape);
                    return this.mergeParentPropertyConstraints(copiedPropertyShape, e)
                });
                let result: {[_:string]: any} = {};
                result[elem] = {"@list": mergedElems};
                return result;
            } else if (valueShape["sh:not"] != null) {
                // negation, we push to merge property constraints.
                // We could also remove the property constraints from the negated shape
                // and put the negation in the target
                let negated = valueShape["sh:not"];
                let copiedPropertyShape = this.deepCopy(propertyShape);
                return {"sh:not": this.mergeParentPropertyConstraints(copiedPropertyShape, negated)};
            }
        }

        const parentPropertyConstraints = this.extractPropertyConstraints(valueShape);
        if (this.isObjectWithProperties(parentPropertyConstraints)) {
            for (let p in parentPropertyConstraints) {
                if (parentPropertyConstraints.hasOwnProperty(p)) {
                    propertyShape[p] = parentPropertyConstraints[p];
                }
            }
        }

        // we connect the target shape here if it is a node shape
        // sh:node
        if (this.isObjectWithProperties(valueShape)) {
            propertyShape["sh:node"] = valueShape;
        }

        return propertyShape
    }

    /**
     * List of keywords constraining string values
     */
    protected readonly  stringKeywords: string[] = [
        "maxLength", "minLength", "pattern"
    ];

    protected async parseStringSchema(jsonldSchema: any, context: JsonldContext): Promise<any|null> {
        return new Promise<any|null>((resolve, reject) => {
            if (this.isStringValidation(jsonldSchema)) {
                // sh:datatype
                let propertyConstraints: {[_:string]: any} = {"sh:datatype": {"@id": "xsd:string"} };

                // let's process the remaining properties
                for (const p in jsonldSchema) {
                    if (jsonldSchema.hasOwnProperty(p)) {
                        switch (p) {
                            case "maxLength": {
                                // sh:maxLength
                                propertyConstraints["sh:maxLength"] = jsonldSchema[p];
                                break;
                            }
                            case "minLength": {
                                // sh:minLength
                                propertyConstraints["sh:minLength"] = jsonldSchema[p];
                                break;
                            }
                            case "pattern": {
                                // sh:pattern
                                propertyConstraints["sh:pattern"] = jsonldSchema[p];
                                break;
                            }
                            default: {
                                break; // ignore keywords we don't know about
                            }
                        }
                    }
                }

                let constraints:{[_:string]: any} = {};
                constraints[this.PARENT_PROPERTY_CONSTRAINTS] = propertyConstraints;
                resolve(constraints);
            } else {
                resolve(null);
            }
        });
    }

    /**
     * Check if this schema has string validations
     * @param jsonldSchema
     */
    protected isStringValidation(jsonldSchema: any): boolean {
        return this.hasProperty(jsonldSchema, this.stringKeywords) || jsonldSchema["type"] === "string";
    }

    /**
     * List of keywords constraining string values
     */
    protected readonly  numericKeywords: string[] = [
        "multipleOf", "maximum", "minimum", "exclusiveMaximum", "exclusiveMinimum"
    ];

    protected async parseNumericSchema(jsonldSchema: any, context: JsonldContext): Promise<any|null> {
        return new Promise<any|null>((resolve, reject) => {
            if (this.isNumericValidation(jsonldSchema)) {
                let propertyConstraints: {[_:string]: any} = {};

                // let's process the remaining properties
                for (const p in jsonldSchema) {
                    if (jsonldSchema.hasOwnProperty(p)) {
                        switch (p) {
                            case "multipleOf": {
                                // not supported, requires custom validation
                                break;
                            }
                            case "maximum": {
                                // sh:maxInclusive
                                propertyConstraints["sh:maxInclusive"] = jsonldSchema[p];
                                break;
                            }
                            case "minimum": {
                                // sh:minInclusive
                                propertyConstraints["sh:minInclusive"] = jsonldSchema[p];
                                break;
                            }
                            case "exclusiveMaximum": {
                                // sh:pattern
                                propertyConstraints["sh:maxExclusive"] = jsonldSchema[p];
                                break;
                            }
                            case "exclusiveMinimum": {
                                // sh:pattern
                                propertyConstraints["sh:minExclusive"] = jsonldSchema[p];
                                break;
                            }
                            default: {
                                break; // ignore keywords we don't know about
                            }
                        }
                    }
                }

                let constraints:{[_:string]: any} = {};
                constraints[this.PARENT_PROPERTY_CONSTRAINTS] = propertyConstraints;
                resolve(constraints);
            } else {
                resolve(null);
            }
        });
    }

    /**
     * Check if this schema has string validations
     * @param jsonldSchema
     */
    protected isNumericValidation(jsonldSchema: any): boolean {
        return this.hasProperty(jsonldSchema, this.numericKeywords) || jsonldSchema["type"] === "number" || jsonldSchema["type"] === "integer";
    }

    /**
     * List of keywords constraining string values
     */
    protected readonly  combinatorKeywords: string[] = [
        "if", "then", "else", "allOf", "anyOf", "oneOf", "not"
    ];

    protected async parseCombinatorsSchema(jsonldSchema: any, context: JsonldContext): Promise<any|null> {

        let acc: any[] = [];
        if (this.isCombinatorsValidation(jsonldSchema)) {

            // let's process the remaining properties
            for (const p in jsonldSchema) {
                if (jsonldSchema.hasOwnProperty(p)) {
                    switch (p) {
                        case "if": {
                            // not supported
                            break;
                        }
                        case "then": {
                            // not supported
                            break;
                        }
                        case "else": {
                            // not supported
                            break;
                        }
                        case "allOf": {
                            // sh:and
                            let schemas = await this.computeSubSchemas(jsonldSchema["allOf"], context);
                            acc.push({"sh:and": { "@list": schemas}});
                            break;
                        }
                        case "anyOf": {
                            // sh:or
                            let schemas = await this.computeSubSchemas(jsonldSchema["anyOf"], context);
                            acc.push({"sh:or": { "@list": schemas}});
                            break;
                        }
                        case "oneOf": {
                            // sh:xone
                            let schemas = await this.computeSubSchemas(jsonldSchema["oneOf"], context);
                            acc.push({"sh:xone": { "@list": schemas}});
                            break;
                        }
                        case "not": {
                            // sh:not
                            let schema = await this.parseSchema(jsonldSchema["not"], context);
                            acc.push({"sh:not": schema});
                            break;
                        }
                        default: {
                            break; // ignore keywords we don't know about
                        }
                    }
                }
            }
        }

        if (acc.length > 0) {
            return acc;
        } else {
            return null;
        }

    }

    protected isSchemaCombinator(shape: {[_:string]:any}): boolean {
        return (
            shape["sh:and"] != null ||
            shape["sh:or"] != null ||
            shape["sh:xone"] != null ||
            shape["sh:not"]
        )
    }

    /**
     * Check if this schema has schema combinators
     * @param jsonldSchema
     */
    protected isCombinatorsValidation(jsonldSchema: any): boolean {
        return this.hasProperty(jsonldSchema, this.combinatorKeywords);
    }

    protected async computeSubSchemas(jsonldSchemaElement: any, context: JsonldContext) {
        let acc: Array<any> = [];
        if (Array.isArray(jsonldSchemaElement)) {
            let elems: Array<any> = jsonldSchemaElement as Array<any>;
            for (let i=0; i<elems.length; i++) {
                let nestedSchema = await this.parseSchema(elems[i], context);
                acc.push(nestedSchema);
            }
        }
        return acc;
    }
}