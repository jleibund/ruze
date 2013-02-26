
var Parser =  require('../lib/expr').Parser;
var p = new Parser();

module.exports.testMath = function(done){
    console.log(p.parse('1+1'));
    console.log(p.parse('1+2'));
    console.log(p.parse('1+2*8'));
    console.log(p.parse('1/2+2*8'));
    console.log(p.parse('1/2+2*8 + 0x0100'));
    console.log(p.parse('1/2+(2*8 + 0x0100)'));
    done.done();
}

module.exports.testLiterals = function(done){
    console.log(p.parse('1'));
    console.log(p.parse('"blue"'));
    console.log(p.parse('null'));
    console.log(p.parse('true'));
    console.log(p.parse('false'));
    console.log(p.parse('"do\?it"'));
    done.done();
}

module.exports.testConditionals = function(done){
    console.log(p.parse('(one && two || three == 7)'));
    done.done();
}

module.exports.testAssignment = function(done){
    console.log(p.parse('one = two'));
    console.log(p.parse('one = 2'));
    console.log(p.parse('one = {}'));
    done.done();
}

module.exports.testUnary = function(done){
    console.log(p.parse('one++'));
    console.log(p.parse('++one'));
    done.done();
}

module.exports.testTernary = function(done){
    console.log(p.parse('(one) ? two : three'));
    console.log(p.parse('one = (1==1) ? two : 7'));
    done.done();
}


module.exports.testObjects = function(done){
    console.log(p.parse('{}'));
    console.log(p.parse('{one:two.three, two:1}'));
    done.done();
}

module.exports.testCalls = function(done){
    console.log(p.parse('doIt()'));
    console.log(p.parse('doIt(1,2)'));
    console.log(p.parse('doIt(1,"blue")'));
    console.log(p.parse('doIt(1,obj.prop)'));
    console.log(p.parse('obj.doIt(1,66)'));
    console.log(p.parse('obj.doIt(1,66,{one:[1,2,3], two:"blue", three:3})'));
    done.done();
}
