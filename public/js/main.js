requirejs.config({
    baseUrl:    '/js',
    paths:      {
        ruze:  'ruze',
        cutils:'ruze/cutils',
        md5:   'ruze/md5',
        path:  'ruze/path',
        conf:  '../conf'
    },
    deps:       ['q', 'node-uuid', 'events', 'underscore', 'cutils', 'colors', 'exprjs', 'module', 'path', 'socket.io'],
    waitSeconds:0
})

define(['require','ruze/ruze', 'jquery', 'text!conf/ruze.json', 'socket.io'], function (require) {

    Ruze = require('ruze/ruze'), $ = require('jquery'), json = require('text!conf/ruze.json'), io = require('socket.io');

    var ruze = new Ruze({io:io, connect:{myserver:'http://localhost:4000/events'}});

    //    ruze.configure(json);

    ruze.configure(function (from) {
        from('dom:h1.project?on=click')
            .expr('in.body={timestamp:in.body.timeStamp, text:in.body.currentTarget.outerText, type:in.body.type}')
            .to('myserver:direct:a')
            .expr('in.body="event is " + in.body.type + ""')
            .to('local:console:out')
            .to('myserver:console:out');

        //        ruze.from('direct:a')
        //            .to('console:out')

    });
    ruze.start(function () {
        $('.diagnostics').html(ruze.print());
    })


});