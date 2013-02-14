var requirejs = require('requirejs');
requirejs.config({
    nodeRequire:require
})

module.exports = require('./lib/camel.js')