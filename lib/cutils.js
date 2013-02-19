if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

define(function () {
    "use strict";
     function flatten(obj, includePrototype, into, prefix) {

        into = into || {};
        prefix = prefix || "";

        for (var k in obj) {
            if (includePrototype || obj.hasOwnProperty(k)) {
                var prop = obj[k];
                if (prop && typeof prop === "object") {
                    flatten(prop || prop, includePrototype, into, prefix + k + ".");
                }
                else {
                    into[prefix + k] = prop;
                }
            }
        }

        return into;
    };
    function normalize(obj) {
        var flat = flatten(obj);
        var keys = Object.keys(flat);
        return keys.sort(function (a, b) {
            return a == b ? flat[a] < flat[b] : a < b;
        }).map(function (k) {
                return k + '=' + flat[k]
            }).join('&')
    };

    return {
        flatten:flatten,
        normalize:normalize
    }
});