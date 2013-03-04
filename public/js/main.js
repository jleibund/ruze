
requirejs.config({
    baseUrl:'/js',
    paths:{
        ruze:'ruze',
        cutils:'ruze/cutils',
        path:'ruze/path',
        conf:'../conf'
    },
    waitSeconds:0
})

requirejs(['ruze/ruze','jquery','text!conf/ruze.json','socket.io'], function(Ruze,$,json,io) {

    // todo - right now lazy loading and promises are driving me crazy, configuring with the options for preload

    var ruze = new Ruze({io:io, connect:{myserver:'http://localhost:4000/events'}});

//    ruze.configure(json);

    ruze.configure(function(){
        ruze.from('dom:h1.project?on=click')
            .expr('in.header.timeStamp=in.body.timeStamp')
            .to('myserver:direct:a')
            .to('console:out');

//        ruze.from('direct:a')
//            .to('console:out')

    });
    ruze.start(function(){
        $('.diagnostics').html(ruze.print());
    })


});