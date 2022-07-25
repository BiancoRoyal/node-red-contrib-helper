/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

if (!RED) {
  var RED = {}
}
RED.helper = (function () {
  let config
  let messageList
  let messageTable
  let filterType = 'filterAll'
  let filteredNodes = {} // id->true means hide, so default to all visible

  let view = 'list'
  const messages = []
  const messagesByNode = {}
  let sbc
  let activeWorkspace
  const numMessages = 100 // Hardcoded number of message to show in helper window scrollback

  let helperNodeTreeList

  function init (_config) {
    config = _config

    const content = $('<div>').css({ position: 'relative', height: '100%' })
    const toolbar = $('<div class="red-ui-sidebar-header">' +
            '<span class="button-group">' +
                '<a id="red-ui-sidebar-helper-filter" style="padding-right: 5px" class="red-ui-sidebar-header-button" href="#"><i class="fa fa-filter"></i> <span></span> <i style="padding-left: 5px;" class="fa fa-caret-down"></i></a>' +
            '</span>' +
            '<span class="button-group">' +
                '<a id="red-ui-sidebar-helper-clear" style="border-right: none; padding-right: 6px" class="red-ui-sidebar-header-button" href="#" data-clear-type="all"><i class="fa fa-trash"></i> <span>all</span></a>' +
                '<a id="red-ui-sidebar-helper-clear-opts" style="padding: 5px; border-left: none;" class="red-ui-sidebar-header-button" href="#"><i class="fa fa-caret-down"></i></a>' +
            '</span></div>').appendTo(content)

    const footerToolbar = $('<div>' +
            '<span class="button-group"><a id="red-ui-sidebar-helper-open" class="red-ui-footer-button" href="#"><i class="fa fa-desktop"></i></a></span> ' +
            '</div>')

    messageList = $('<div class="red-ui-helper-content red-ui-helper-content-list"/>').appendTo(content)
    sbc = messageList[0]
    messageTable = $('<div class="red-ui-helper-content  red-ui-helper-content-table hide"/>').appendTo(content)

    let filterDialogCloseTimeout
    let filterDialogShown = false
    const filterDialog = $('<div class="red-ui-helper-filter-box hide"></div>').appendTo(toolbar)// content);
    filterDialog.on('mouseleave', function (evt) {
      if (filterDialogShown) {
        filterDialogCloseTimeout = setTimeout(function () {
          filterDialog.slideUp(200)
          filterDialogShown = false
        }, 500)
      }
    })
    filterDialog.on('mouseenter', function (evt) {
      clearTimeout(filterDialogCloseTimeout)
    })
    const filterToolbar = $('<div style="margin-bottom: 3px; display: flex;">' +
            '<span style="flex-grow:1; text-align: left;">' +
                '<span class="button-group"><button type="button" id="red-ui-sidebar-filter-select-all" class="red-ui-sidebar-header-button red-ui-button-small" data-i18n="node-red:debug.sidebar.selectAll"></button></span>' +
                '<span class="button-group"><button type="button" id="red-ui-sidebar-filter-select-none" class="red-ui-sidebar-header-button red-ui-button-small" data-i18n="node-red:debug.sidebar.selectNone"></button></span>' +
            '</span>' +
            '<span class="button-group"><button type="button" id="red-ui-sidebar-filter-select-close" class="red-ui-sidebar-header-button red-ui-button-small"><i class="fa fa-times"></i></button></span>' +
            '</div>').appendTo(filterDialog)

    filterToolbar.find('#red-ui-sidebar-filter-select-close').on('click', function (evt) {
      clearTimeout(filterDialogCloseTimeout)
      filterDialogShown = false
      filterDialog.slideUp(200)
    })

    filterToolbar.find('#red-ui-sidebar-filter-select-all').on('click', function (evt) {
      evt.preventDefault()
      const data = helperNodeTreeList.treeList('data')
      data.forEach(function (flow) {
        if (!flow.selected) {
          if (flow.treeList.checkbox) {
            flow.treeList.checkbox.trigger('click')
          }
        } else {
          flow.children.forEach(function (item) {
            if (!item.selected) {
              item.treeList.select()
            }
          })
        }
      })
      refreshMessageList()
    })

    filterToolbar.find('#red-ui-sidebar-filter-select-none').on('click', function (evt) {
      evt.preventDefault()
      helperNodeTreeList.treeList('clearSelection')
      const data = helperNodeTreeList.treeList('data')
      data.forEach(function (flow) {
        if (flow.children) {
          flow.children.forEach(function (item) {
            filteredNodes[item.node.id] = true
          })
        }
      })
      RED.settings.set('helper.filteredNodes', Object.keys(filteredNodes))
      refreshMessageList()
    })
    const helperNodeListRow = $('<div class="red-ui-helper-filter-row" id="red-ui-sidebar-helper-filter-node-list-row"></div>').appendTo(filterDialog)
    helperNodeTreeList = $('<div></div>').appendTo(helperNodeListRow).css({ width: '100%', height: '300px' })
      .treeList({ autoSelect: false }).on('treelistitemmouseover', function (e, item) {
        if (item.node) {
          item.node.highlighted = true
          item.node.dirty = true
          RED.view.redraw()
        }
      }).on('treelistitemmouseout', function (e, item) {
        if (item.node) {
          item.node.highlighted = false
          item.node.dirty = true
          RED.view.redraw()
        }
      }).on('treelistselect', function (e, item) {
        if (item.children) {
          item.children.forEach(function (child) {
            if (child.checkbox) {
              child.treeList.select(item.selected)
            }
          })
        } else {
          if (item.node) {
            if (item.selected) {
              delete filteredNodes[item.node.id]
            } else {
              filteredNodes[item.node.id] = true
            }
            RED.settings.set('helper.filteredNodes', Object.keys(filteredNodes))
            refreshMessageList()
          }
        }
      })

    try {
      content.i18n()
    } catch (err) {
      console.log('TODO: i18n library support')
    }

    toolbar.find('#red-ui-sidebar-helper-filter span').text(RED._('node-red:debug.sidebar.filterAll'))

    toolbar.find('#red-ui-sidebar-helper-filter').on('click', function (e) {
      e.preventDefault()
      const options = [
        { label: $('<span data-i18n="[append]node-red:debug.sidebar.filterAll"><input type="radio" value="filterAll" name="filter-type" style="margin-top:0"> </span>').i18n(), value: 'filterAll' },
        { label: $('<span><span data-i18n="[append]node-red:debug.sidebar.filterSelected"><input type="radio" value="filterSelected" name="filter-type" style="margin-top:0"> </span>...</span>').i18n(), value: 'filterSelected' },
        { label: $('<span data-i18n="[append]node-red:debug.sidebar.filterCurrent"><input type="radio" value="filterCurrent" name="filter-type" style="margin-top:0"> </span>').i18n(), value: 'filterCurrent' }
      ]
      const menu = RED.popover.menu({
        options,
        onselect: function (item) {
          if (item.value !== filterType) {
            filterType = item.value
            $('#red-ui-sidebar-helper-filter span').text(RED._('node-red:debug.sidebar.' + filterType))
            refreshMessageList()
            RED.settings.set('helper.filter', filterType)
          }
          if (filterType === 'filterSelected') {
            refreshhelperNodeList()
            filterDialog.slideDown(200)
            filterDialogShown = true
            helperNodeTreeList.focus()
          }
        }
      })
      menu.show({
        target: $('#red-ui-sidebar-helper-filter'),
        align: 'left',
        offset: [$('#red-ui-sidebar-helper-filter').outerWidth() - 2, -1]
      })
      $('input[name="filter-type"][value="' + RED.settings.get('helper.filter', 'filterAll') + '"]').prop('checked', true)
    })
    RED.popover.tooltip(toolbar.find('#red-ui-sidebar-helper-filter'), RED._('node-red:debug.sidebar.filterLog'))

    toolbar.find('#red-ui-sidebar-helper-clear').on('click', function (e) {
      e.preventDefault()
      const action = RED.settings.get('helper.clearType', 'all')
      clearMessageList(false, action === 'filtered')
    })
    const clearTooltip = RED.popover.tooltip(toolbar.find('#red-ui-sidebar-helper-clear'), RED._('node-red:debug.sidebar.clearLog'), 'core:clear-helper-messages')
    toolbar.find('#red-ui-sidebar-helper-clear-opts').on('click', function (e) {
      e.preventDefault()
      const options = [
        { label: $('<span data-i18n="[append]node-red:debug.sidebar.clearLog"><input type="radio" value="all" name="clear-type" style="margin-top:0"> </span>').i18n(), value: 'all' },
        { label: $('<span data-i18n="[append]node-red:debug.sidebar.clearFilteredLog"><input type="radio" value="filtered" name="clear-type" style="margin-top:0"> </span>').i18n(), value: 'filtered' }
      ]
      const menu = RED.popover.menu({
        options,
        onselect: function (item) {
          if (item.value === 'all') {
            $('#red-ui-sidebar-helper-clear > span').text(RED._('node-red:debug.sidebar.all'))
            clearTooltip.setAction('core:clear-helper-messages')
            clearTooltip.setContent(RED._('node-red:debug.sidebar.clearLog'))
            RED.settings.set('helper.clearType', 'all')
          } else {
            $('#red-ui-sidebar-helper-clear > span').text(RED._('node-red:debug.sidebar.filtered'))
            clearTooltip.setAction('core:clear-filtered-helper-messages')
            clearTooltip.setContent(RED._('node-red:debug.sidebar.clearFilteredLog'))
            RED.settings.set('helper.clearType', 'filtered')
          }
        }
      })
      menu.show({
        target: $('#red-ui-sidebar-helper-clear-opts'),
        align: 'left',
        offset: [$('#red-ui-sidebar-helper-clear-opts').outerWidth() - 2, -1]
      })
      $('input[name="clear-type"][value="' + RED.settings.get('helper.clearType', 'all') + '"]').prop('checked', true)
    })

    const clearType = RED.settings.get('helper.clearType', 'all')
    if (clearType === 'all') {
      toolbar.find('#red-ui-sidebar-helper-clear > span').text(RED._('node-red:debug.sidebar.all'))
      clearTooltip.setAction('core:clear-helper-messages')
      clearTooltip.setContent(RED._('node-red:debug.sidebar.clearLog'))
    } else {
      toolbar.find('#red-ui-sidebar-helper-clear > span').text(RED._('node-red:debug.sidebar.filtered'))
      clearTooltip.setAction('core:clear-filtered-helper-messages')
      clearTooltip.setContent(RED._('node-red:debug.sidebar.clearFilteredLog'))
    }

    filterType = RED.settings.get('helper.filter', 'filterAll')
    const filteredNodeList = RED.settings.get('helper.filteredNodes', [])
    filteredNodes = {}
    filteredNodeList.forEach(function (id) {
      filteredNodes[id] = true
    })
    toolbar.find('#red-ui-sidebar-helper-filter span').text(RED._('node-red:debug.sidebar.' + filterType))
    refreshMessageList()

    return {
      content,
      footer: footerToolbar
    }
  }

  function containshelper (sid, map) {
    const item = map[sid]
    if (item) {
      if (item.helper === undefined) {
        const sfs = Object.keys(item.subflows)
        let contain = false
        for (let i = 0; i < sfs.length; i++) {
          const sf = sfs[i]
          if (containshelper(sf, map)) {
            contain = true
            break
          }
        }
        item.helper = contain
      }
      return item.helper
    }
    return false
  }

  function refreshhelperNodeList () {
    const workspaceOrder = RED.nodes.getWorkspaceOrder()
    const workspaceOrderMap = {}
    workspaceOrder.forEach(function (ws, i) {
      workspaceOrderMap[ws] = i
    })

    const candidateNodes = []
    const candidateSFs = []
    const subflows = {}
    RED.nodes.eachNode(function (n) {
      const nt = n.type
      if (nt === 'helper') {
        if (n.z in workspaceOrderMap) {
          candidateNodes.push(n)
        } else {
          const sf = RED.nodes.subflow(n.z)
          if (sf) {
            subflows[sf.id] = {
              helper: true,
              subflows: {}
            }
          }
        }
      } else if (nt.substring(0, 8) === 'subflow:') {
        if (n.z in workspaceOrderMap) {
          candidateSFs.push(n)
        } else {
          const psf = RED.nodes.subflow(n.z)
          if (psf) {
            const sid = nt.substring(8)
            let item = subflows[psf.id]
            if (!item) {
              item = {
                helper: undefined,
                subflows: {}
              }
              subflows[psf.id] = item
            }
            item.subflows[sid] = true
          }
        }
      }
    })
    candidateSFs.forEach(function (sf) {
      const sid = sf.type.substring(8)
      if (containshelper(sid, subflows)) {
        candidateNodes.push(sf)
      }
    })

    candidateNodes.sort(function (A, B) {
      const wsA = workspaceOrderMap[A.z]
      const wsB = workspaceOrderMap[B.z]
      if (wsA !== wsB) {
        return wsA - wsB
      }
      const labelA = RED.utils.getNodeLabel(A, A.id)
      const labelB = RED.utils.getNodeLabel(B, B.id)
      return labelA.localeCompare(labelB)
    })
    let currentWs = null
    const data = []
    let currentFlow
    let currentSelectedCount = 0
    candidateNodes.forEach(function (node) {
      if (currentWs !== node.z) {
        if (currentFlow && currentFlow.checkbox) {
          currentFlow.selected = currentSelectedCount === currentFlow.children.length
        }
        currentSelectedCount = 0
        currentWs = node.z
        const parent = RED.nodes.workspace(currentWs) || RED.nodes.subflow(currentWs)
        currentFlow = {
          label: RED.utils.getNodeLabel(parent, currentWs)
        }
        if (!parent.disabled) {
          currentFlow.children = []
          currentFlow.checkbox = true
        } else {
          currentFlow.class = 'disabled'
        }
        data.push(currentFlow)
      }
      if (currentFlow.children) {
        if (!filteredNodes[node.id]) {
          currentSelectedCount++
        }
        currentFlow.children.push({
          label: RED.utils.getNodeLabel(node, node.id),
          node,
          checkbox: true,
          selected: !filteredNodes[node.id]
        })
      }
    })
    if (currentFlow && currentFlow.checkbox) {
      currentFlow.selected = currentSelectedCount === currentFlow.children.length
    }

    helperNodeTreeList.treeList('data', data)
  }

  function getTimestamp () {
    const d = new Date()
    return d.toLocaleString()
  }

  function sanitize (m) {
    return m.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  let refreshTimeout
  function refreshMessageList (_activeWorkspace) {
    if (refreshTimeout) {
      clearTimeout(refreshTimeout)
    }
    refreshTimeout = setTimeout(function () {
      _refreshMessageList(_activeWorkspace)
    }, 200)
  }
  function _refreshMessageList (_activeWorkspace) {
    if (_activeWorkspace) {
      activeWorkspace = _activeWorkspace.replace(/\./g, '_')
    }
    if (filterType === 'filterAll') {
      $('.red-ui-helper-msg').removeClass('hide')
    } else {
      $('.red-ui-helper-msg').each(function () {
        if (filterType === 'filterCurrent') {
          $(this).toggleClass('hide', !$(this).hasClass('red-ui-helper-msg-flow-' + activeWorkspace))
        } else if (filterType === 'filterSelected') {
          const id = $(this).data('source')
          if (id) {
            $(this).toggleClass('hide', !!filteredNodes[id])
          }
        }
      })
    }
  }
  function refreshMessageTable () {

  }

  function showMessageList () {
    view = 'list'
    messageTable.hide()
    messageTable.empty()

    messages.forEach(function (m) {
      messageList.append(m.el)
    })
    messageList.show()
  }
  function showMessageTable () {
    view = 'table'
    messageList.hide()
    messageList.empty()

    Object.keys(messagesByNode).forEach(function (id) {
      const m = messagesByNode[id]
      const msg = m.el
      const sourceNode = m.source
      if (sourceNode) {
        const wrapper = $('<div>', { id: 'red-ui-helper-msg-source-' + sourceNode.id.replace(/\./g, '_') }).appendTo(messageTable)
        wrapper.append(msg)
      }
    })
    messageTable.show()
  }
  function formatString (str) {
    return str.replace(/\n/g, '&crarr;').replace(/\t/g, '&rarr;')
  }

  let menuOptionMenu
  let activeMenuMessage
  function showMessageMenu (button, dbgMessage, sourceId) {
    activeMenuMessage = dbgMessage
    if (!menuOptionMenu) {
      const opts = [
        {
          id: 'red-ui-helper-msg-menu-item-collapse',
          label: RED._('node-red:debug.messageMenu.collapseAll'),
          onselect: function () {
            activeMenuMessage.collapse()
          }
        }
      ]
      if (activeMenuMessage.clearPinned) {
        opts.push(
          {
            id: 'red-ui-helper-msg-menu-item-clear-pins',
            label: RED._('node-red:debug.messageMenu.clearPinned'),
            onselect: function () {
              activeMenuMessage.clearPinned()
            }
          }
        )
      }
      opts.push(
        null,
        {
          id: 'red-ui-helper-msg-menu-item-filter',
          label: RED._('node-red:debug.messageMenu.filterNode'),
          onselect: function () {
            const candidateNodes = RED.nodes.filterNodes({ type: 'helper' })
            candidateNodes.forEach(function (n) {
              filteredNodes[n.id] = true
            })
            delete filteredNodes[sourceId]
            $('#red-ui-sidebar-helper-filterSelected').trigger('click')
            RED.settings.set('helper.filteredNodes', Object.keys(filteredNodes))
            refreshMessageList()
          }
        },
        {
          id: 'red-ui-helper-msg-menu-item-clear-filter',
          label: RED._('node-red:debug.messageMenu.clearFilter'),
          onselect: function () {
            $('#red-ui-sidebar-helper-filterAll').trigger('click')
            refreshMessageList()
          }
        }
      )

      menuOptionMenu = RED.menu.init({
        id: 'red-ui-helper-msg-option-menu',
        options: opts
      })
      menuOptionMenu.css({
        position: 'absolute'
      })
      menuOptionMenu.on('mouseleave', function () { $(this).hide() })
      menuOptionMenu.on('mouseup', function () { $(this).hide() })
      menuOptionMenu.appendTo('body')
    }

    let filterOptionDisabled = false
    const sourceNode = RED.nodes.node(sourceId)
    if (sourceNode && sourceNode.type !== 'helper') {
      filterOptionDisabled = true
    }
    RED.menu.setDisabled('red-ui-helper-msg-menu-item-filter', filterOptionDisabled)
    RED.menu.setDisabled('red-ui-helper-msg-menu-item-clear-filter', filterOptionDisabled)

    const elementPos = button.offset()
    menuOptionMenu.css({
      top: elementPos.top + 'px',
      left: (elementPos.left - menuOptionMenu.width() + 20) + 'px'
    })
    menuOptionMenu.show()
  }

  let stack = []
  let busy = false
  function handleDebugMessage (o) {
    if (o) { stack.push(o) }
    if (!busy && (stack.length > 0)) {
      busy = true
      processhelperMessage(stack.shift())
      setTimeout(function () {
        busy = false
        handleDebugMessage()
      }, 15) // every 15mS = 66 times a second
      if (stack.length > numMessages) { stack = stack.splice(-numMessages) }
    }
  }

  function processhelperMessage (o) {
    const msg = $('<div/>')
    const sourceNode = o._source

    msg.on('mouseenter', function () {
      msg.addClass('red-ui-helper-msg-hover')
      if (o._source) {
        // highlight the top-level node (could be subflow instance)
        config.messageMouseEnter(o._source.id)
        if (o._source._alias) {
          // this is inside a subflow - highlight the node itself
          config.messageMouseEnter(o._source._alias)
        }
        // if path.length > 2, we are nested - highlight subflow instances
        for (let i = 2; i < o._source.path.length; i++) {
          config.messageMouseEnter(o._source.path[i])
        }
      }
    })
    msg.on('mouseleave', function () {
      msg.removeClass('red-ui-helper-msg-hover')
      if (o._source) {
        config.messageMouseLeave(o._source.id)
        if (o._source._alias) {
          config.messageMouseLeave(o._source._alias)
        }
        for (let i = 2; i < o._source.path.length; i++) {
          config.messageMouseLeave(o._source.path[i])
        }
      }
    })
    const name = sanitize(((o.name ? o.name : o.id) || '').toString())
    const topic = sanitize((o.topic || '').toString())
    const property = sanitize(o.property ? o.property : '')
    let payload = o.msg
    const format = sanitize((o.format || '').toString())
    msg.attr('class', 'red-ui-helper-msg' + (o.level ? (' red-ui-helper-msg-level-' + o.level) : '') +
            (sourceNode
              ? (
                  ' red-ui-helper-msg-node-' + sourceNode.id.replace(/\./g, '_') +
                (sourceNode.z ? ' red-ui-helper-msg-flow-' + sourceNode.z.replace(/\./g, '_') : '')
                )
              : ''))

    if (sourceNode) {
      msg.data('source', sourceNode.id)
      if (filterType === 'filterCurrent' && activeWorkspace) {
        if (sourceNode.z && sourceNode.z.replace(/\./g, '_') !== activeWorkspace) {
          msg.addClass('hide')
        }
      } else if (filterType === 'filterSelected') {
        if (filteredNodes[sourceNode.id]) {
          msg.addClass('hide')
        }
      }
    }

    const metaRow = $('<div class="red-ui-helper-msg-meta"></div>').appendTo(msg)
    $('<span class="red-ui-helper-msg-date">' + getTimestamp() + '</span>').appendTo(metaRow)
    if (sourceNode) {
      const nodeLink = $('<a>', { href: '#', class: 'red-ui-helper-msg-name' }).text(RED._('node-red:debug.node') + ': ' + (o.name || sourceNode.name || sourceNode.id))
        .appendTo(metaRow)
        .on('click', function (evt) {
          evt.preventDefault()
          config.messageSourceClick(sourceNode.id, sourceNode._alias, sourceNode.path)
        })

      if (sourceNode.pathHierarchy) {
        RED.popover.create({
          tooltip: true,
          target: nodeLink,
          trigger: 'hover',
          size: 'small',
          direction: 'bottom',
          interactive: true,
          content: function () {
            const content = $('<div>')
            sourceNode.pathHierarchy.forEach((pathPart, idx) => {
              const link = $('<a>', { href: '#', style: 'display: block' })
                .css({
                  paddingLeft: ((idx * 10) + ((idx === sourceNode.pathHierarchy.length - 1) ? 10 : 0)) + 'px',
                  paddingRight: '2px'
                })
                .text(pathPart.label)
                .appendTo(content)
                .on('click', function (evt) {
                  evt.preventDefault()
                  config.messageSourceClick(pathPart.id)
                })
              if (idx < sourceNode.pathHierarchy.length - 1) {
                $('<i class="fa fa-angle-down" style="margin-right: 3px"></i>').prependTo(link)
              }
            })
            return content
          },
          delay: { show: 50, hide: 150 }
        })
      }
    } else if (name) {
      $('<span class="red-ui-helper-msg-name">' + name + '</span>').appendTo(metaRow)
    }

    payload = RED.utils.decodeObject(payload, format)

    const el = $('<span class="red-ui-helper-msg-payload"></span>').appendTo(msg)
    const path = o.property || ''
    const helperMessage = RED.utils.createObjectElement(payload, {
      key: /* true */null,
      typeHint: format,
      hideKey: false,
      path,
      sourceId: sourceNode && sourceNode.id,
      rootPath: path
    })
    // Do this in a separate step so the element functions aren't stripped
    helperMessage.appendTo(el)
    // NOTE: relying on function error to have a "type" that all other msgs don't
    if (o.hasOwnProperty('type') && (o.type === 'function')) {
      let errorLvlType = 'error'
      let errorLvl = 20
      if (o.hasOwnProperty('level') && o.level === 30) {
        errorLvl = 30
        errorLvlType = 'warn'
      }
      msg.addClass('red-ui-helper-msg-level-' + errorLvl)
      $('<span class="red-ui-helper-msg-topic">function : (' + errorLvlType + ')</span>').appendTo(metaRow)
    } else {
      const tools = $('<span class="red-ui-helper-msg-tools button-group"></span>').appendTo(metaRow)
      const filterMessage = $('<button class="red-ui-button red-ui-button-small"><i class="fa fa-caret-down"></i></button>').appendTo(tools)
      filterMessage.on('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
        showMessageMenu(filterMessage, helperMessage, sourceNode && sourceNode.id)
      })
      $('<span class="red-ui-helper-msg-topic">' +
                (o.topic ? topic + ' : ' : '') +
                (o.property ? 'msg.' + property : 'msg') + ' : ' + format +
                '</span>').appendTo(metaRow)
    }

    const atBottom = (sbc.scrollHeight - messageList.height() - sbc.scrollTop) < 5
    let m = {
      el: msg
    }
    messages.push(m)
    if (sourceNode) {
      m.source = sourceNode
      messagesByNode[sourceNode.id] = m
    }
    if (view === 'list') {
      messageList.append(msg)
    } else {
      if (sourceNode) {
        let wrapper = $('#red-ui-helper-msg-source-' + sourceNode.id.replace(/\./g, '_'))
        if (wrapper.length === 0) {
          wrapper = $('<div>', { id: 'red-ui-helper-msg-source-' + sourceNode.id.replace(/\./g, '_') }).appendTo(messageTable)
        }
        wrapper.empty()
        wrapper.append(msg)
      }
    }

    if (messages.length === numMessages) {
      m = messages.shift()
      if (view === 'list') {
        m.el.remove()
      }
    }
    if (atBottom) {
      messageList.scrollTop(sbc.scrollHeight)
    }
  }

  function clearMessageList (clearFilter, filteredOnly) {
    if (!filteredOnly) {
      $('.red-ui-helper-msg').remove()
    } else {
      $('.red-ui-helper-msg:not(.hide)').remove()
    }
    config.clear()
    if (clearFilter) {
      clearFilterSettings()
    }
    refreshhelperNodeList()
  }

  function clearFilterSettings () {
    filteredNodes = {}
    filterType = 'filterAll'
    RED.settings.set('helper.filter', filterType)
    RED.settings.set('helper.filteredNodes', Object.keys(filteredNodes))
    $('#red-ui-sidebar-helper-filter span').text(RED._('node-red:debug.sidebar.filterAll'))
  }

  return {
    init,
    refreshMessageList,
    handleDebugMessage,
    clearMessageList
  }
})()
