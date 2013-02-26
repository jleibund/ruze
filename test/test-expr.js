
var Parser =  require('../lib/expr').Parser;

module.exports.testCrap = function(done){
    var parser = new Parser('1 + 1 / 3 % 0x00FA');
    console.log(parser.body[0].expression)
    done.done();
}
