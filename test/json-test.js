var _ = require('underscore');

console.log(typeof JSON.parse('{"one":"1"}').one)
console.log(typeof JSON.parse('{"one":true}').one)
console.log(typeof JSON.parse('{"one":"you"}').one)
console.log(Number('you'))
console.log(String('you'))
console.log(Boolean('you'))