if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

define(function () {
    "use strict";
    var splitPathRe =
        /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
    var splitPath = function (filename) {
        return splitPathRe.exec(filename).slice(1);
    };

    var dirname = function (path) {
        var result = splitPath(path),
            root = result[0],
            dir = result[1];

        if (!root && !dir) {
            // No dirname whatsoever
            return '.';
        }

        if (dir) {
            // It has a dirname, strip trailing slash
            dir = dir.substr(0, dir.length - 1);
        }

        return root + dir;
    };
    return {
        dirname: dirname
    }
});

