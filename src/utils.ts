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

    isObjectWithProperties(obj: Object): boolean {
        return this.isProperObject(obj) && Object.keys(obj).length !== 0;
    }

    deepCopy(obj: {[_:string]:any}): {[_:string]:any} {
        let copy: {[_:string]:any};

        // Handle the 3 simple types, and null or undefined
        if (null == obj || "object" != typeof obj) return obj;

        // Handle Date
        if (obj instanceof Date) {
            copy = new Date();
            copy.setTime(obj.getTime());
            return copy;
        }

        // Handle Array
        if (obj instanceof Array) {
            copy = [];
            for (var i = 0, len = obj.length; i < len; i++) {
                copy[i] = this.deepCopy(obj[i]);
            }
            return copy;
        }

        // Handle Object
        copy = {};
        for (var attr in obj) {
            if (obj.hasOwnProperty(attr)) {
                copy[attr] = this.deepCopy(obj[attr]);
            }
        }
        return copy;
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