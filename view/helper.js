$(function () {
  RED.i18n.init({ apiRootUrl: '../../' }, function () {
    const options = {
      messageMouseEnter: function (sourceId) {
        window.opener.postMessage({ event: 'mouseEnter', id: sourceId }, '*')
      },
      messageMouseLeave: function (sourceId) {
        window.opener.postMessage({ event: 'mouseLeave', id: sourceId }, '*')
      },
      messageSourceClick: function (sourceId, aliasId, path) {
        window.opener.postMessage({ event: 'mouseClick', id: sourceId, _alias: aliasId, path }, '*')
      },
      clear: function () {
        window.opener.postMessage({ event: 'clear' }, '*')
      }
    }

    try {
      const uiComponents = RED.helper.init(options)
      $('.red-ui-helper-window').append(uiComponents.content)

      window.addEventListener('message', function (evt) {
        if (evt.data.event === 'message') {
          RED.helper.handlehelperMessage(evt.data.msg)
        } else if (evt.data.event === 'workspaceChange') {
          RED.helper.refreshMessageList(evt.data.activeWorkspace)
        } else if (evt.data.event === 'projectChange') {
          RED.helper.clearMessageList(true)
        }
      }, false)
    } catch (err) {
      console.error(err)
    }
  })
})
