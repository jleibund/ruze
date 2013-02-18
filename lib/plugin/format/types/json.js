if (typeof define !== 'function') { var define = require('amdefine')(module) }

define(function() {

    var JSONConverter = function(){}

    JSONConverter.config = function(options){
    }

    JSONConverter.to = function(obj){
        return JSON.parse(obj);
    }

    JSONConverter.from = function(obj){
        return JSON.stringify(obj)
    }

    return JSONConverter;

});