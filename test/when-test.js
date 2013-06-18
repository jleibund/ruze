
var Ruze =  require('../index.js'), _ = require('underscore');

var ruze;

module.exports.setUp = function(done){

    if (!ruze){
        ruze = new Ruze();
        ruze.configure(function(from){
            from('direct:a')
                .when('in.body=="3"')
                    .expr('out.body = "OK"')
                    .to('direct:b')
//                .when('in.body=="2"')
//                    .expr('out.body = "MAYBE"')
//                    .to('direct:b')
//                .otherwise()
//                    .expr('out.body = "MAYBE NOT"')
//                    .to('direct:b');

            from('direct:b')
                .to('console:log')
                .to('mock:out');
        });
        ruze.start(function(){
            console.log(ruze.print())
            done();
        });
    } else {
        done();
    }

}
module.exports.testOK = function(done){
    ruze.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        ruze.send('direct:a', '3');
        mockEnd.assert();
    }).then(function(){
            done.done()
        }).done();
}

module.exports.testMaybe = function(done){
    ruze.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        ruze.send('direct:a', '2');
        mockEnd.assert();
    }).then(function(){
            done.done()
        }).done();
}

module.exports.testNo = function(done){
    ruze.endpoint('mock:out', function(mockEnd){
        mockEnd.expectedMessageCount(1);
        ruze.send('direct:a', '1');
        mockEnd.assert();
    }).then(function(){
            done.done()
        }).done();
}


