const assert = require('assert');

describe('parser-queryParams', () => {
  
  it('fill', () => {

    global.definition = require('../seeds/parserQueryParamsGood.json');

    const queryParams = require('../src/parser/queryParams.js')('GET','/pets');
    assert.deepStrictEqual(queryParams, [{
            "name": "tags",
            "prefix": "",
            "required": false,
            "type": "array"
         },
         {
            "name": "limit",
            "prefix": "",
            "required": false,
            "type": "integer"
         } ]);
  });

  it('void', () => {

    global.definition = require('../seeds/parserQueryParamsGood.json');

    const queryParams = require('../src/parser/queryParams.js')('POST','/pets');
    assert.deepStrictEqual(queryParams, []);
  });

});