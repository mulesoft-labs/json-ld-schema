import {applyMixins, JsonldHandler} from "../utils";
import * as jsonld from "jsonld";
/**
 * Manipulation of the JSON-LD context
 */
export class JsonldContext {

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

    /**
     * Expands the string for the provided context
     * @param property
     */
    async expand(property: string): Promise<string|undefined> {
        return new Promise<string|undefined>((resolve, reject) => {
            let obj: {[_:string]: any} = {
                "@context": this.context
            };
            obj[property] = "@target";
            jsonld.expand(obj, (e,vs) => {
                if (e) {
                    reject(e)
                } else {
                    let result = (vs as {[_:string]:any}[])[0] || {};
                    let found = Object.keys(result)[0];
                    resolve(found);
                }
            });
        });

    }
}
export interface JsonldContext extends JsonldHandler {}
applyMixins(JsonldContext, [JsonldHandler]);
