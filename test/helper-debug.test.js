/**
 Copyright (c) 2022 Klaus Landsdorf (http://node-red.plus/)
 All rights reserved.

 @author <a href="mailto:klaus.landsdorf@noderedplus.de">Klaus Landsdorf</a> (Node-RED PLUS)
 **/

/* see http://mochajs.org/ */

'use strict'

var assert = require('chai').assert

// TODO: tests with the node-red-node-test-helper
describe('Array', function () {
  describe('#indexOf()', function () {
    it('should return -1 when the value is not present', function (done) {
      assert.equal(-1, [1, 2, 3].indexOf(5))
      assert.equal(-1, [1, 2, 3].indexOf(0))
      assert.equal(1, [1, 2, 3].indexOf(2))

      done()
    })
  })
})
