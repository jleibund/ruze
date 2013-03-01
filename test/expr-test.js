
var Camel =  require('../index.js'), _ = require('underscore');

var camel;

module.exports.setUp = function(done){

    if (!camel){
        camel = new Camel();
        camel.configure(function(){
            camel.from('direct:a')
                .expr('in.header.a="3"')
                .expr('in.body= (in.header.a) ? in.header.a + " " + in.body : in.body')
                .to('console:log')
                .to('mock:out');
            camel.from('direct:b')
                .process(function(exchange,next){
//                console.log('process:  header contains-- ',exchange.in.header);
                    exchange.out.body = '{\"statement\":\"'+exchange.in.body+'\"}';
                    next();
                })
                .expr('bodyAs("json")')
                .to('mock:out');
        });
        camel.start(function(){
            camel.print();
            done();
        });
    } else {
        done();
    }

}
module.exports.testDirectAMock = function(done){

    camel.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        camel.send('direct:a', 'hello');
        mockEnd.assert();
    }).then(function(){
        done.done()
    }).done();
}

module.exports.testDirectBMock = function(done){

    camel.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        camel.send('direct:b', 'world');
        mockEnd.assert();
    }).then(function(){
        done.done()
    }).done();
}
