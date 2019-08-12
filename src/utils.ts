/**
 * Helper functions to manipulate JSON-LD documents
 */
export class JsonldHandler {

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

/**
 * Application of mixins
 * @param derivedCtor
 * @param baseCtors
 */
export function applyMixins(derivedCtor: any, baseCtors: any[]) {
    baseCtors.forEach(baseCtor => {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
            // @ts-ignore
            Object.defineProperty(derivedCtor.prototype, name, Object.getOwnPropertyDescriptor(baseCtor.prototype, name));
        });
    });
}