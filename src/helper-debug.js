module.exports = function (RED) {
  'use strict'
  const util = require('util')
  const events = require('events')
  const fs = require('fs-extra')
  const path = require('path')
  const debugLength = RED.settings.debugMaxLength || 1000
  const useColors = RED.settings.debugUseColors || false
  util.inspect.styles.boolean = 'red'
  const { hasOwnProperty } = Object.prototype

  function HelperNode (n) {
    const hasEditExpression = (n.targetType === 'jsonata')
    const editExpression = hasEditExpression ? n.complete : null
    RED.nodes.createNode(this, n)
    this.name = n.name
    this.complete = hasEditExpression ? null : (n.complete || 'payload').toString()
    if (this.complete === 'false') { this.complete = 'payload' }
    this.console = '' + (n.console || false)
    this.tostatus = n.tostatus || false
    this.statusType = n.statusType || 'auto'
    this.statusVal = n.statusVal || this.complete
    this.tosidebar = n.tosidebar
    this.counter = 0
    this.lastTime = new Date().getTime()
    this.timeout = null
    if (this.tosidebar === undefined) { this.tosidebar = true }
    this.active = (n.active === null || typeof n.active === 'undefined') || n.active
    if (this.tostatus) {
      this.status({ fill: 'grey', shape: 'ring' })
      this.oldState = '{}'
    }

    const hasStatExpression = (n.statusType === 'jsonata')
    const statExpression = hasStatExpression ? n.statusVal : null

    const node = this
    if (node.statusType === 'counter') {
      node.status({ fill: 'blue', shape: 'ring', text: node.counter })
    } else {
      node.status({ fill: '', shape: '', text: '' })
    }
    let preparedEditExpression = null
    let preparedStatExpression = null
    if (editExpression) {
      try {
        preparedEditExpression = RED.util.prepareJSONataExpression(editExpression, this)
      } catch (e) {
        node.error(RED._('helper.invalid-exp', { error: editExpression }))
        return
      }
    }
    if (statExpression) {
      try {
        preparedStatExpression = RED.util.prepareJSONataExpression(statExpression, this)
      } catch (e) {
        node.error(RED._('helper.invalid-exp', { error: editExpression }))
        return
      }
    }

    function prepareValue (msg, done) {
      // Either apply the jsonata expression or...
      if (preparedEditExpression) {
        RED.util.evaluateJSONataExpression(preparedEditExpression, msg, (err, value) => {
          if (err) { done(RED._('helper.invalid-exp', { error: editExpression })) } else { done(null, { id: node.id, z: node.z, _alias: node._alias, path: node._flow.path, name: node.name, topic: msg.topic, msg: value }) }
        })
      } else {
        // Extract the required message property
        let property = 'payload'
        let output = msg[property]
        if (node.complete !== 'false' && typeof node.complete !== 'undefined') {
          property = node.complete
          try { output = RED.util.getMessageProperty(msg, node.complete) } catch (err) { output = undefined }
        }
        done(null, { id: node.id, z: node.z, _alias: node._alias, path: node._flow.path, name: node.name, topic: msg.topic, property, msg: output })
      }
    }

    function prepareStatus (msg, done) {
      if (node.statusType === 'auto') {
        if (node.complete === 'true') {
          done(null, { msg: msg.payload })
        } else {
          prepareValue(msg, function (err, debugMsg) {
            if (err) { node.error(err); return }
            done(null, { msg: debugMsg.msg })
          })
        }
      } else {
        // Either apply the jsonata expression or...
        if (preparedStatExpression) {
          RED.util.evaluateJSONataExpression(preparedStatExpression, msg, (err, value) => {
            if (err) { done(RED._('helper.invalid-exp', { error: editExpression })) } else { done(null, { msg: value }) }
          })
        } else {
          // Extract the required message property
          let output
          try { output = RED.util.getMessageProperty(msg, node.statusVal) } catch (err) { output = undefined }
          done(null, { msg: output })
        }
      }
    }
    this.on('close', function () {
      if (this.oldState) {
        this.status({})
      }
      if (this.timeout) {
        clearTimeout(this.timeout)
      }
    })
    this.on('input', function (msg, send, done) {
      if (hasOwnProperty.call(msg, 'status') && hasOwnProperty.call(msg.status, 'source') && hasOwnProperty.call(msg.status.source, 'id') && (msg.status.source.id === node.id)) {
        done()
        return
      }
      if (node.tostatus === true) {
        if (node.statusType === 'counter') {
          const differenceOfTime = (new Date().getTime() - node.lastTime)
          node.lastTime = new Date().getTime()
          node.counter++
          if (differenceOfTime > 100) {
            node.status({ fill: 'blue', shape: 'ring', text: node.counter })
          } else {
            if (node.timeout) {
              clearTimeout(node.timeout)
            }
            node.timeout = setTimeout(() => {
              node.status({ fill: 'blue', shape: 'ring', text: node.counter })
            }, 200)
          }
        } else {
          prepareStatus(msg, function (err, debugMsg) {
            if (err) { node.error(err); return }
            const output = debugMsg.msg
            let st = (typeof output === 'string') ? output : util.inspect(output)
            let fill = 'grey'
            let shape = 'dot'
            if (typeof output === 'object' && hasOwnProperty.call(output, 'fill') && hasOwnProperty.call(output, 'shape') && hasOwnProperty.call(output, 'text')) {
              fill = output.fill
              shape = output.shape
              st = output.text
            }
            if (node.statusType === 'auto') {
              if (hasOwnProperty.call(msg, 'error')) {
                fill = 'red'
                st = msg.error.message
              }
              if (hasOwnProperty.call(msg, 'status')) {
                fill = msg.status.fill || 'grey'
                shape = msg.status.shape || 'ring'
                st = msg.status.text || ''
              }
            }

            if (st.length > 32) { st = st.substr(0, 32) + '...' }

            const newStatus = { fill, shape, text: st }
            if (JSON.stringify(newStatus) !== node.oldState) { // only send if we have to
              node.status(newStatus)
              node.oldState = JSON.stringify(newStatus)
            }
          })
        }
      }

      if (this.complete === 'true') {
        // debug complete msg object
        if (this.console === 'true') {
          node.log('\n' + util.inspect(msg, { colors: useColors, depth: 10 }))
        }
        if (this.active && this.tosidebar) {
          sendDebug({ id: node.id, z: node.z, _alias: node._alias, path: node._flow.path, name: node.name, topic: msg.topic, msg })
        }
        done()
      } else {
        prepareValue(msg, function (err, debugMsg) {
          if (err) {
            node.error(err)
            return
          }
          const output = debugMsg.msg
          if (node.console === 'true') {
            if (typeof output === 'string') {
              node.log((output.indexOf('\n') !== -1 ? '\n' : '') + output)
            } else if (typeof output === 'object') {
              node.log('\n' + util.inspect(output, { colors: useColors, depth: 10 }))
            } else {
              node.log(util.inspect(output, { colors: useColors }))
            }
          }
          if (node.active) {
            if (node.tosidebar === true) {
              sendDebug(debugMsg)
            }
          }
          done()
        })
      }
    })
  }

  RED.nodes.registerType('helper', HelperNode, {
    settings: {
      helperUseColors: {
        value: false
      },
      helperMaxLength: {
        value: 1000
      }
    }
  })

  function sendDebug (msg) {
    // don't put blank errors in sidebar (but do add to logs)
    // if ((msg.msg === "") && (hasOwnProperty.call(msg, "level")) && (msg.level === 20)) { return; }
    msg = RED.util.encodeObject(msg, { maxLength: debugLength })
    RED.comms.publish('helper', msg)
  }

  HelperNode.logHandler = new events.EventEmitter()
  HelperNode.logHandler.on('log', function (msg) {
    if (msg.level === RED.log.WARN || msg.level === RED.log.ERROR) {
      sendDebug(msg)
    }
  })
  RED.log.addHandler(HelperNode.logHandler)

  function setNodeState (node, state) {
    if (state) {
      node.active = true
    } else {
      node.active = false
    }
  }

  RED.httpAdmin.post('/helper/:state', RED.auth.needsPermission('helper.write'), function (req, res) {
    const state = req.params.state
    if (state !== 'enable' && state !== 'disable') {
      res.sendStatus(404)
      return
    }
    const nodes = req.body && req.body.nodes
    if (Array.isArray(nodes)) {
      nodes.forEach(function (id) {
        const node = RED.nodes.getNode(id)
        if (node !== null && typeof node !== 'undefined') {
          setNodeState(node, state === 'enable')
        }
      })
      res.sendStatus(state === 'enable' ? 200 : 201)
    } else {
      res.sendStatus(400)
    }
  })

  RED.httpAdmin.post('/helper/:id/:state', RED.auth.needsPermission('helper.write'), function (req, res) {
    const state = req.params.state
    if (state !== 'enable' && state !== 'disable') {
      res.sendStatus(404)
      return
    }
    const node = RED.nodes.getNode(req.params.id)
    if (node !== null && typeof node !== 'undefined') {
      setNodeState(node, state === 'enable')
      res.sendStatus(state === 'enable' ? 200 : 201)
    } else {
      res.sendStatus(404)
    }
  })

  let cachedDebugView
  RED.httpAdmin.get('/debug/view/view.html', function (req, res) {
    if (!cachedDebugView) {
      fs.readFile(path.join(__dirname, 'lib', 'view', 'view.html')).then(data => {
        let customStyles = ''
        try {
          const customStyleList = RED.settings.editorTheme.page._.css || []
          customStyleList.forEach(style => {
            customStyles += `<link rel="stylesheet" href="../../${style}">\n`
          })
        } catch (err) {}
        cachedDebugView = data.toString().replace('<!-- INSERT-THEME-CSS -->', customStyles)
        res.set('Content-Type', 'text/html')
        res.send(cachedDebugView).end()
      }).catch(err => {
        res.error = err
        res.sendStatus(404)
      })
    } else {
      res.send(cachedDebugView).end()
    }
  })

  // As debug/view/helper-utils.js is loaded via <script> tag, it won't get
  // the auth header attached. So do not use RED.auth.needsPermission here.
  RED.httpAdmin.get('/helper/view/*', function (req, res) {
    const options = {
      root: path.join(__dirname, 'lib', 'view'),
      dotfiles: 'deny'
    }
    try {
      res.sendFile(
        req.params[0],
        options,
        err => {
          if (err) {
            res.sendStatus(404)
          }
        }
      )
    } catch (err) {
      res.sendStatus(404)
    }
  })
}
