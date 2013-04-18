requirejs.config({
    baseUrl:    '/js',
    paths:      {
        conf:  '../conf'
    },
    waitSeconds:0
})

define(['require','ruze', 'jquery', 'text!conf/ruze.json', 'socket.io'], function (require) {

    Ruze = require('ruze'), $ = require('jquery'), json = require('text!conf/ruze.json'), io = require('socket.io');

    var ruze = new Ruze({io:io, debug:true, connect:{myserver:'http://localhost:4000/events'}});

    ruze.loaders.local.addPath('extras')

    //    ruze.configure(json);

    ruze.configure(function (from) {
        from('dom:h1.project?on=click')
            .expr('in.body={timestamp:in.body.timeStamp, text:in.body.currentTarget.outerText, type:in.body.type}')
            .to('myserver:direct:a')
//            .expr('in.body="event is " + in.body.type + ""')
//            .expr('properties.broadcast = true')

        from ('myserver:direct:b')
            .to('myserver:direct:c')
            .to('local:console:out')
            .to('myserver:console:out')
            .to('server2:direct:e')

        from ('server2:direct:f')
            .to('myserver:direct:g')
//
//        from('myserver:direct:g')
            .to('local:console:out');

    });
    ruze.start(function () {
        $('.diagnostics').html(ruze.print());
    })


});