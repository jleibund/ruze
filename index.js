var requirejs = require('requirejs');
requirejs.config({
    nodeRequire:require,
    baseUrl:__dirname+'/lib',
    paths: {
        plugin: '/Users/jpleibundguth/dev/ruze/lib/plugin'
    }
})

module.exports = requirejs('ruze')