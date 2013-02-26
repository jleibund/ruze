
var expr =  require('../lib/expr');


module.exports.testCrap = function(done){
    expr.some('This is a statement ${this is not ${ inner }} and some more text','${','}');
    done.done();
}
