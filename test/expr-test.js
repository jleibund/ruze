
var Ruze =  require('../index.js'), _ = require('underscore');

var ruze;

module.exports.setUp = function(done){

    if (!ruze){
        ruze = new Ruze();
        ruze.configure(function(from){
            from('direct:a')
                .expr('in.header.a="3"')
                .expr('in.body= (in.header.a) ? in.header.a + " " + in.body : in.body')
                .to('console:log')
                .to('mock:out');
            from('direct:b')
                .process(function(exchange,next){
//                console.log('process:  header contains-- ',exchange.in.header);
                    exchange.out.body = '{\"statement\":\"'+exchange.in.body+'\"}';
                    next();
                })
                .expr('bodyAs("json")')
                .to('mock:out');
        });
        ruze.start(function(){
            ruze.print();
            done();
        });
    } else {
        done();
    }

}
module.exports.testDirectAMock = function(done){

    ruze.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        ruze.send('direct:a', 'hello');
        mockEnd.assert();
    }).then(function(){
        done.done()
    }).done();
}

module.exports.testDirectBMock = function(done){

    ruze.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        ruze.send('direct:b', 'world');
        mockEnd.assert();
    }).then(function(){
        done.done()
    }).done();
}
