var requirejs = require('requirejs');
requirejs.config({
    nodeRequire:require,
    baseUrl:__dirname + '/../lib'
})
var cutils = requirejs('cutils'), normalize = cutils.normalize, assert = requirejs('assert');
module.exports.testNormalize = function () {
    var flat = normalize({
        a:1,
        b:2,
        f:[1,2,1,3],
        d:{c:[
            {e:[
                {f:1},
                {g:2}
            ]}
        ]}});

    var flat2 = normalize({
        a:1,
        b:2,
        f:[3,2,1,1],
        d:{c:[
            {e:[
                {g:2},
                {f:1}
            ]}
        ]}});

//    console.log(flat);
//    console.log(flat2)
    assert.ok('f.3=3&f.2=1&f.1=2&f.0=1&d.c.0.e.1.g=2&d.c.0.e.0.f=1&b=2&a=1' == flat , 'Looks good');
    assert.ok("f.3=1&f.2=1&f.1=2&f.0=3&d.c.0.e.1.f=1&d.c.0.e.0.g=2&b=2&a=1" == flat2, 'Looks ok');
}
