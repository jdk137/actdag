/* dag */
var ActDag = function (config) {
  this.config = config;
  //var container = config.containerId || "chart";
  var container = this.container = $(typeof config.container === "string" ? document.getElementById(config.container) : config.container); // id or dom node
  var containerDom = container[0];
  var containerId = container.attr('id');
  //config
  var nodeWidth = config.levelWidth || 160;            //节点宽度
  var nodeHeight = config.nodeHeight || 40;            //节点高度

  var margin = config.margin || {
      left: 160,
      right: 160,
      top: 40,
      bottom: 40
  };
  var getBackNumber = config.getBackNumber || 10;

  var flowData = config.data;

  var nodeHash = {}; // key: node id, value: node

  var instance; // jsplumb instance
  var prefix;
  var windows = [];
  var store = getStore();
  var rendering = false;
  var recovering = false;

  // config function
  // set draw content
  var drawNode = config.drawNode || function (node) {
    var c = $('<div>' + node.name + '</div>');
    node._elem = c; //将dom节点绑定到数据对象中
    return c;
  };
  var nodeAddedCallback = config.nodeAddedCallback || function (node) {
    console.log('Node added. ' + JSON.stringify(node));
  };
  var nodeDeletedCallback = config.nodeDeletedCallback || function (node) {
    console.log('Node deleted. ' + JSON.stringify(node));
  };
  var nodeAddFailCallback = config.nodeAddedFailCallback || function (info) {
    console.log('Fail to add node. ' + JSON.stringify(info));
  };
  var linkAddedCallback = config.linkAddedCallback || function (link) {
    console.log('Link added. ' + JSON.stringify(link));
  };
  var linkDeletedCallback = config.linkDeletedCallback || function (link) {
    console.log('Link deleted. ' + JSON.stringify(link));
  };
  var linkAddFailCallback = config.linkAddedFailCallback || function (info) {
    console.log('Fail to add link. ' + JSON.stringify(info));
  };

  // setSource
  var setSource = this.setSource = function (data, withoutLocation) {
    // 如果 withoutLocation is true, node没有loc位置信息，就会调用自动布局算法，给一个默认的位置。必须确保这些节点是连在一起的，而没有孤立的节点或群
    flowData = data;
    processData(flowData);
    if (withoutLocation) {
      layout(flowData);
    }
    if (!recovering) {
      store.init();
    }
  };

  this.clean = function () {
    $(container).empty();
  };

  //layout
  var layout = function (flowData) {
    // add loc attr to every node in flowData.nodes
    var nodeHash = {};
    var sankey = getSankey();
    var nodes = flowData.nodes.map(function (d) {
      nodeHash[d.id] = d;
      return {id: d.id};
    });
    var links = flowData.links.map(function (d) {
      return {source: d.source, target: d.target};
    });
    //layout
    sankey
        .nodes(nodes)
        .links(links)
        .margin(margin)
        .defaultNodeWidth(nodeWidth)
        .defaultNodeHeight(nodeHeight)
        .layout(40);

    sankey.nodes().forEach(function (d) {
      nodeHash[d.id].loc = {
        left: d.pos.x,
        top: d.pos.y
      };
    });
  };

  //processData
  var processData = function (data) {
    // all id set to string;
    data.nodes.forEach(function (d) {
      d.id = d.id + '';
    });
    data.links.forEach(function (d) {
      d.source = d.source + '';
      d.target = d.target + '';
    });
    //remove duplicate nodes and links; remove links without both nodes in nodes array;
    var nodeLinkData = computeNodeLinks(data);
    flowData.links = nodeLinkData.links.map(function (d) {
      return {source: d.source.id, target: d.target.id};
    });
    flowData.nodes = nodeLinkData.nodes;
  };

  var setPrefix = function () {
    if (jsPlumb._actdag_prefix_number) {
      jsPlumb._actdag_prefix_number += 1;
    } else {
      jsPlumb._actdag_prefix_number = 1;
    }
    prefix = 'actdag-' + jsPlumb._actdag_prefix_number + '-';
  };

  this.getPrefix = function () {
    return prefix;
  };

  this.getJQueryNodeById = function (id) {
    return $("#" + prefix + id);
  };

  //render
  var render = this.render = function () {
    if (checkLoop(flowData)) {
      alert('数据中有循环');
      return;
    }
    rendering = true;

    // setup some defaults for jsPlumb.
    instance = jsPlumb.getInstance({
      Endpoint : ["Rectangle", {width: 20, height: 20}],
      EndpointStyle : { fillStyle: "transparent"  },
      ConnectionOverlays : [
        [ "Arrow", {
          location:1,
          id:"arrow",
          length:11,
          width:7,
          foldback:1
        } ]
      ],
      Container: containerId
    });

    // add nodes
    container.html('');
    flowData.nodes.forEach(addNode);


    // connection attach listeners; 连线添加后触发
    var isMyConnect = false;
    var isMyDetach = false;
    instance.bind("connection", function(conn) {
      //通过交互添加连线之后，先删除该连线，再判断该连线是否合法。如果合法，再添加。
      if (isMyConnect) {
        isMyConnect = false;
        return;
      } else {
        // in not my connect, connect from outside
        isMyDetach = true;
        instance.detach(conn);// trigger detach event first then continue
        isMyDetach = false;
        var loop = checkCreateLoop(conn);
        var duplicated = checkDuplicate(conn);
        if (loop) {
          isMyConnect = false;
          //alert('连线不能成环');
          linkAddFailCallback({message: 'looped'});
        } else if (duplicated) {
          isMyConnect = false;
          linkAddFailCallback({message: 'existed'});
          //alert('该连接已存在');
        } else {
          isMyConnect = true;
          instance.connect({ source: conn.sourceId, target: conn.targetId, detachable: true});
          linkAddedCallback({
            source: conn.sourceId.split(prefix)[1],
            target: conn.targetId.split(prefix)[1]
          });
          //recover model
          if (!rendering) {
            store.save();
          }
        }
      }
    });

    instance.bind("connectionDetached", function(conn) {
      if (isMyDetach) { //组件内部的删除。
        return;
      }
      if (conn.sourceId.slice(0, prefix.length) === prefix &&
        conn.targetId.slice(0, prefix.length) === prefix) { //删除已有节点
        console.log(conn.sourceId, conn.targetId);
        //link deleted callback
        linkDeletedCallback({
          source: conn.sourceId.split(prefix)[1],
          target: conn.targetId.split(prefix)[1]
        });
        //recover model
        if (!rendering) {
          store.save();
        }
      }
    });

    // add links
    addLinks(flowData.links);

    // 节点拖动到边界外时，拉回边界内
    $( ".w" ).on( "dragstop", function( event, ui ) {
      if (ui.position.left < 0) {
        $(ui.helper[0]).css('left', 0);
      }
      if (ui.position.top < 0) {
        $(ui.helper[0]).css('top', 0);
      }
    } );
    rendering = false;
  };

  // some useful function
  var getLinks = function () {
    return instance.getConnections().map(function (d) {
      return {
        source: d.sourceId.split(prefix)[1],
        target: d.targetId.split(prefix)[1]
      };
    });
  };
  var getNodes = function () {
    var objs = [];
    container.find('.w').each(function() {
      //var id = $(this).attr('id').split(prefix)[1];
      var data = $(this).data('node');
      var left = parseFloat($(this).css('left').split('px')[0]);
      var top = parseFloat($(this).css('top').split('px')[0]);
      data.loc = { left: left, top: top };
      objs.push(data);
    });
    //console.log(objs);
    return objs;
  };


  var addNodes = this.addNodes = function (nodes) {
    // [{id: 'id1', name: 'name1'}, ...]
    nodes.forEach(function (d, i) {
      addNode({id: d.id, name: d.name, loc: { left: 10 * (i + 1), top: 10 * (i + 1) }});
    });
  };

  var newNodeIndex = 0; //标注新加的单个节点的初始位置，防止重合，提升体验。
  var addNode = this.addNode = function (d) {
    // if exist, ignore;
    if (nodeHash[d.id]) {
      nodeAddFailCallback({id: d.id, name: d.name, message: d.id + ' already existed'});
      return;
    } else {
      nodeHash[d.id] = d;
    }
    var nodeDom = $('<div class="w" id="' + prefix + d.id + '"><div class="ep"></div></div>');
    var contentNode = drawNode(d);
    nodeDom.append(contentNode);
    nodeDom.data('node', d); //绑定数据到dom节点
    var left = d.loc && d.loc.left;
    var top = d.loc && d.loc.top;
    if (typeof left === 'undefined' || typeof top === 'undefined') {
      left = top = newNodeIndex * 10;
      newNodeIndex += 1;
      if (newNodeIndex >= 10) {
        newNodeIndex = 0;
      }
    }
    nodeDom.css({
      width: nodeWidth,
      height: nodeHeight,
      position: 'absolute',
      left: left + 'px',
      top: top + 'px'
    });
    container.append(nodeDom);

    var w = instance.getSelector("#" + prefix + d.id);
    windows.push(w);
    // initialise draggable elements.
    instance.draggable([w]);

    instance.makeSource([w], {
      filter:".ep",       // only supported by jquery
      anchor:"BottomCenter",
      connector: ["Straight"],
      connectorStyle: {
          lineWidth: 1,
          strokeStyle: '#000' //"#5b9ada"
      },
      connectorHoverStyle: {
          strokeStyle: '#3cf' //"#5b9ada"
      }
    });
    instance.makeTarget([w], {
      dropOptions:{ hoverClass:"dragHover" },
      anchor:"Continuous",
      detachable: true
    });
    nodeAddedCallback({id: d.id, name: d.name});
    //recover model
    if (!rendering) {
      store.save();
    }
  };

  var deleteNode = this.deleteNode = function (node) {
    var id = node.id;
    if (id.slice(0, prefix.length) !== prefix) {
      id = prefix + id;
    }
    instance.detachAllConnections(id);
    instance.removeAllEndpoints(id);
    nodeHash[id] = null;
    $('#' + id).remove();
    nodeDeletedCallback({id: node.id, name: node.name});
    //recover model
    if (!rendering) {
      store.save();
    }
  };

  var addLinks = this.addLinks = function (links) {
    links.forEach(function (link) {
      addLink(link);
    });
  };

  var addLink = this.addLink = function (link) {
    instance.connect({
      source: prefix + link.source,
      target: prefix + link.target,
      detachable: true
    });
  };

  var deleteLink = this.deleteLink = function (link) {

  };

  this.getBack = function () {
    var that = this;
    recovering = true;
    if (store.canGetBack()) {
      store.getBack();
      that.setSource(store.load());
      that.render();
    }
    recovering = false;
    return {
      canGetBack: that.canGetBack(),
      canGetForward: that.canGetForward()
    };
  };

  this.getForward = function () {
    var that = this;
    recovering = true;
    if (store.canGetForward()) {
      store.getForward();
      that.setSource(store.load());
      that.render();
    }
    recovering = false;
    return {
      canGetBack: that.canGetBack(),
      canGetForward: that.canGetForward()
    };
  };

  var computeNodeLinks = function (data, test) {
    var nodes = data.nodes;
    var links = data.links;
    if (test) { //测试情况下使用硬拷贝的数据，防止修改原数据。
      nodes = data.nodes.map(function (d) {
        return {id: d.id, name: d.name, loc: d.loc};
      });
      links = data.links.map(function (d) {
        return {source: d.source, target: d.target};
      });
    }
    var nodeHash = {};
    var linkHash = {};
    // remove duplicated node
    nodes = nodes.filter(function (node) {
      if (typeof nodeHash[node.id] !== 'undefined') {
        $.extend(nodeHash[node.id], node);
        return false;
      }
      nodeHash[node.id] = node;
      return true;
    });
    // remove duplicated link
    links = links.filter(function (link) {
      var id1 = typeof link.source === 'string' ? link.source : link.source.id;
      var id2 = typeof link.target === 'string' ? link.target : link.target.id;
      if (typeof nodeHash[id1] === 'undefined' || typeof nodeHash[id2] === 'undefined') {
        return false;
      }
      var key = id1 + '_' + id2;
      if (typeof linkHash[key] !== 'undefined') {
        //$.extend(linkHash[key], link);
        return false;
      }
      linkHash[key] = link;
      return true;
    });

    nodes.forEach(function(node) {
      //nodeHash[node.id] = node;
      node.sourceLinks = [];
      node.targetLinks = [];
    });
    links.forEach(function(link) {
      var source = link.source,
          target = link.target;
      
      if (typeof source === "string") source = link.source = nodeHash[link.source];
      if (typeof target === "string") target = link.target = nodeHash[link.target];
      
      source.sourceLinks.push(link);
      target.targetLinks.push(link);
    });
    return {
      nodes: nodes,
      links: links,
      nodeHash: nodeHash,
      linkHash: linkHash
    };
  };

  // checkDuplicate
  var checkDuplicate = function (connect) {
    var sourceId = connect.sourceId.split(prefix)[1];
    var targetId = connect.targetId.split(prefix)[1];
    var data = dump();
    var nodes = data.nodes;
    var links = data.links;
    var duplicated = false;
    links.forEach(function (d) {
      if (d.source === sourceId && d.target === targetId) {
        duplicated = true;
      }
    });
    return duplicated;
  };

  // check whether adding a link will create a loop
  var checkCreateLoop = function (connect) {
    var sourceId = connect.sourceId.split(prefix)[1];
    var targetId = connect.targetId.split(prefix)[1];
    var data = dump();

    if (sourceId === targetId) {
      return true;
    }
    var nodeLinkData = computeNodeLinks(data, true);
    var loop = false;
    var visited = {};
    var recur = function (id) {
      if (id === sourceId) { // 下游节点的下游遍历到达了上游节点， 认为进入了循环
        loop = true;
        return;
      }
      if (visited[id]) { // is visited
        return;
      } else {
        visited[id] = 1;
      }
      var node = nodeLinkData.nodeHash[id];
      node.sourceLinks.forEach(function (d) { // search all target elements
        recur(d.target.id);
      });
    };
    recur(targetId);
    return loop;
  };

  // check isolate
  var checkIsolated = function (data) {
    var nodeLinkData = computeNodeLinks(data, true);
    var visited = {};
    var visitedArray = [];
    var recur = function (id) {
      if (visited[id]) { // is visited
        return;
      } else {
        visited[id] = 1;
        visitedArray.push(id);
      }
      var node = nodeLinkData.nodeHash[id];
      node.sourceLinks.forEach(function (d) { // search all target elements
        recur(d.target.id);
      });
      node.targetLinks.forEach(function (d) { // search all source elements
        recur(d.source.id);
      });
    };
    var nodeId = data && data.nodes && data.nodes[0].id;
    if (typeof nodeId !== undefined) {
      recur(nodeId);
    }
    return visitedArray.length < nodeLinkData.nodes.length;
  };

  // check Loop
  var checkLoop = function (data) {
    var nodeLinkData = computeNodeLinks(data, true);
    var topNodes = nodeLinkData.nodes.filter(function (node) {
      return node.targetLinks.length === 0;
    });
    var loop = false;
    var recur = function (id, level) {
      if (loop) {
        return;
      }
      if (level > nodeLinkData.nodes.length) { //下探层数超过节点总数，则认为进入循环。
        loop = true;
        return;
      }
      var node = nodeLinkData.nodeHash[id];
      node.sourceLinks.forEach(function (d) { // search all target elements
        recur(d.target.id, level + 1);
      });
    };
    topNodes.forEach(function (d) {
      recur(d.id, 1);
    });
    return loop;
  };


  //dump
  var dump = this.dump = function () {
    return {
      nodes: getNodes(),
      links: getLinks()
    };
  };

  // dump的数据是没有进过检测的，可能存在孤立的节点或者存在循环。getSaveData可确保用户每次保存时都有经过检测的数据。
  var getSaveData = this.getSaveData = function () {
    var dumpData = dump();
    var message = '';
    if (checkIsolated(dumpData)) {
      message = 'isolated'; //'存在孤立的节点或节点群';
    } else if (checkLoop(dumpData)) {
      message = 'looped'; //'存在循环';
    } else {
      message = 'ok';
    }
    return {
      message: message,
      data: dumpData
    };
  };

  /* interactive */
  // these interactive can be soluted by jquery event
  // click
  // right click
  // mouseover
  // mouseout
  // double click

  /* TODO ?*/
  // highlight node
  // lowlight node
  // highlight link
  // lowlight link
  // highlight nodelinks
  // lowlight nodelinks
  setPrefix();
  if (typeof flowData !== 'undefined') {
    render();
  }


  /* store old layout */
  function getStore() {
    var top = getBackNumber; // max elements in store
    var index = 0;  // recent index in store.
    var head = 0; // how many useful elements in store.
    var array = [];
    var store = {};
    store.array = array;
    store.save = function () {
      array[index] = dump();
      index += 1;
      if (index > top) {
        array = array.slice(1, top);
        index = top;
      }
      head = index;
    };
    store.load = function () {
      return array[index - 1]; // array[-1] === undefined
    };
    store.getBack = function () {
      if (store.canGetBack()) {
        index -= 1;
      }
    };
    store.getForward = function () {
      if (store.canGetForward()) {
        index += 1;
      }
    };
    store.canGetBack = function () {
      return index > 1;
    };
    store.canGetForward = function () {
      return index < head;
    };
    store.init = function () {
      index = 0;
      head = 0;
      array = [];
    };
  }

  /* sankey */
  function getSankey() {
    var sankey = {},
        paddingSpaceRatio = 0.2; // nodePadding / (nodePadding + nodeSpace);
        nodes = [],
        links = [];

    var nodePadding; // padding ratio between nodes in same level 
    var nodeSpace;   //node space ratio
    var nodesByLevel = [];
    var nodeLinkByLevel = [];
    var margin = {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0
    };
    var linkCombine = false;
    

    var width;
    var height;
    var nnSpace = 40;
    var nlSpace = 40;
    var llSpace = 60;

    var levelPadding = 40;
    var levelPaddings = [];

    var defaultNodeWidth = 160; 
    var defaultNodeHeight = 40; 
    var paddingLineSpace = 10;

    sankey.paddingSpaceRatio = function(_) {
      if (!arguments.length) return paddingSpaceRatio;
      paddingSpaceRatio = +_;
      return sankey;
    };

    sankey.nodes = function(_) {
      if (!arguments.length) return nodes;
      nodes = _;
      return sankey;
    };

    sankey.links = function(_) {
      if (!arguments.length) return links;
      links = _;
      return sankey;
    };

    sankey.margin = function(_) {
      if (!arguments.length) return margin;
      margin = _;
      return sankey;
    };

    sankey.linkCombine = function(_) {
      if (!arguments.length) return linkCombine;
      linkCombine = _;
      return sankey;
    };

    sankey.defaultNodeWidth = function(_) {
      if (!arguments.length) return defaultNodeWidth;
      defaultNodeWidth = _;
      return sankey;
    };

    sankey.defaultNodeHeight = function(_) {
      if (!arguments.length) return defaultNodeHeight;
      defaultNodeHeight = _;
      return sankey;
    };

    sankey.paddingLineSpace = function(_) {
      if (!arguments.length) return paddingLineSpace;
      paddingLineSpace = _;
      return sankey;
    };

    sankey.width = function(_) {
      return width;
    };

    sankey.height = function(_) {
      return height;
    };

    /*
    sankey.nodePadding = function() {
      return nodePadding;
    };

    sankey.nodeSpace = function() {
      return nodeSpace;
    };
    */

    sankey.nodesByLevel = function() {
      return nodesByLevel;
    };

    sankey.layout = function(iterations) {
      //init data structure
      computeNodeLinks();
      //init node level
      computeNodeLevels();
      //init node pos ratio
      computeNodeDepths(iterations);
      //init link pos ratio
      computeLinkDepths();

      var levelSpace = defaultNodeHeight;
      var levelPadding = defaultNodeHeight;
      var levelTotalSpace = levelSpace + levelPadding;
      var arrowSpace = 5;
      levelPaddings = [];
      nodeLinkByLevel.forEach(function (d, i) {
        if (i === nodeLinkByLevel.length - 1) {
          levelPaddings[i] = 0;
        } else {
          levelPaddings[i] = Math.max(arrowSpace + (d.nodesAsSourceNum + 1) * paddingLineSpace, levelPadding); 
        }
      });
      var paddingSum = [];
      var sum = 0;
      levelPaddings.forEach(function (d, i) {
        paddingSum[i] = sum;
        sum += d;
      });

      //height = nodesByLevel.length * levelTotalSpace - levelPadding + margin.top + margin.bottom;
      height = paddingSum[paddingSum.length - 1] + levelSpace * nodesByLevel.length + margin.top + margin.bottom;
      //to do: link's y also need to consider
      width = d3.max(nodes, function (d) { return d.y + d.w; }) - d3.min(nodes, function (d) { return d.y; }) + 2 * nlSpace + margin.left + margin.right;
      //width = 160 / nodeSpace + margin.left + margin.right;
      nodes.forEach(function (d, i) {
        var pos = d.pos = {
          level: d.x
        };
        // vertical
        pos.x = d.y + margin.left;
        pos.w = d.w;
        //pos.y = levelTotalSpace * pos.level + margin.top;
        pos.y = paddingSum[pos.level] + levelSpace * pos.level + margin.top;
        pos.h = levelSpace;
        pos.x2 = pos.x + pos.w;
        pos.y2 = pos.y + pos.h;
      });

      var getRatio = function (idx, length) {
        var newIdx = -(length - 1) + idx * 2;
        if (newIdx > 0) {
          newIdx -= 1;
        }
        newIdx = Math.abs(newIdx);
        return (newIdx + 1 ) / (length + 1);
      };
      links.forEach(function (d, i) {
        var pos = d.pos = {};
        // vertical
        var sp = d.source.pos;
        var tp = d.target.pos;
        pos.y0 = sp.y + sp.h;
        pos.y1 = tp.y;
        pos.x0 = sp.x + d.sr;
        pos.x1 = tp.x + d.tr;
        pos.turnY = pos.y0 + (levelPaddings[d.source.pos.level] - arrowSpace) * getRatio(d.source.linkLevelIndex, nodeLinkByLevel[d.source.pos.level].nodesAsSourceNum);
        //pos.turnY = pos.y0 + (levelPaddings[d.source.pos.level] - arrowSpace) * (1 + d.source.linkLevelIndex) / (nodeLinkByLevel[d.source.pos.level].nodesAsSourceNum + 1);
        //pos.turnY = pos.y0 + levelPadding * (1 + d.source.levelIndex)  / (d.source.levelEls.length + 1);
      });
      return sankey;
    };

    sankey.relayout = function() {
      computeLinkDepths();
      return sankey;
    };

    // Populate the sourceLinks and targetLinks for each node.
    // Also, if the source and target are not objects, assume they are indices.
    function computeNodeLinks() {
      var nodeHash = {};
      var linkHash = {};
      // remove duplicated node
      nodes = nodes.filter(function (node) {
        if (typeof nodeHash[node.id] !== 'undefined') {
          $.extend(nodeHash[node.id], node);
          return false;
        }
        nodeHash[node.id] = node;
        return true;
      });
      // remove duplicated link
      links = links.filter(function (link) {
        var id1 = typeof link.source === 'string' ? link.source : link.source.id;
        var id2 = typeof link.target === 'string' ? link.target : link.target.id;
        if (typeof nodeHash[id1] === 'undefined' || typeof nodeHash[id2] === 'undefined') {
          return false;
        }
        var key = id1 + '_' + id2;
        if (typeof linkHash[key] !== 'undefined') {
          //$.extend(linkHash[key], link);
          return false;
        }
        linkHash[key] = link;
        return true;
      });

      nodes.forEach(function(node) {
        //nodeHash[node.id] = node;
        node.sourceLinks = [];
        node.targetLinks = [];
      });
      links.forEach(function(link) {
        var source = link.source,
            target = link.target;
        
        if (typeof source === "string") source = link.source = nodeHash[link.source];
        if (typeof target === "string") target = link.target = nodeHash[link.target];
        
        source.sourceLinks.push(link);
        target.targetLinks.push(link);
      });
    }

    // Iteratively assign the breadth (x-position) for each node.
    // Nodes are assigned the maximum breadth of incoming neighbors plus one;
    // nodes with no incoming links are assigned breadth zero, while
    // nodes with no outgoing links are assigned the minimum breadth.
    function computeNodeLevels() {
      nodes.forEach(function (d) {
        d._linkNumber = d.sourceLinks.length + d.targetLinks.length;
        d._levelSetted = false;
      });
      var x = 0;
      var remainingNodes,
          nextNodes;
      var boneNodes;

      // get bone nodes
      var shrink = true;
      remainingNodes = nodes;
      while (shrink) {
        shrink = false;
        nextNodes = [];
        remainingNodes.forEach(function(node) {
          if (node._linkNumber === 1) {
            shrink = true;
            node._linkNumber = 0;
            node.sourceLinks.forEach(function (d) {
              if (d.target._linkNumber > 0) {
                d.target._linkNumber -= 1;
              }
            });
            node.targetLinks.forEach(function (d) {
              if (d.source._linkNumber > 0) {
                d.source._linkNumber -= 1;
              }
            });
          }
        });
        remainingNodes = remainingNodes.filter(function (d) {
          return d._linkNumber > 0;
        });
      }
      boneNodes = remainingNodes;

      if (boneNodes.length > 0) {
        //有环
        remainingNodes = boneNodes;
        x = 0;
        nextNodes = [];
        while (remainingNodes.length) {
          nextNodes = [];
          remainingNodes.forEach(function(node) {
            node.x = x;
            node.sourceLinks.forEach(function(link) {
              nextNodes.push(link.target);
            });
          });
          remainingNodes = nextNodes;
          ++x;
        }

        boneNodes.forEach(function (node) {
          node._isBone = true;
        });
        boneNodes.forEach(function (node) {
          var parentBoneNode = [];
          node.targetLinks.forEach(function (d) {
            if (d.source._isBone) {
              parentBoneNode.push(d.source);
            }
          });
          var childrenBoneNode = [];
          node.sourceLinks.forEach(function (d) {
            if (d.target._isBone) {
              childrenBoneNode.push(d.target);
            }
          });
          node._parentBoneNode = parentBoneNode;
          node._childrenBoneNode = childrenBoneNode;
        });
        // move down to make links to be shortest
        boneNodes.forEach(function (node) {
          var minChildrenLevel = d3.min(node._childrenBoneNode, function (d) {
            return d.x;
          });
          // not parent bone node
          if (node._parentBoneNode.length === 0) {
            node.x = minChildrenLevel - 1;
          }
          // target is far away
          if (minChildrenLevel - node.x > 1) {
            if (node._childrenBoneNode.length > node._parentBoneNode.length) {
              // parents more than children, do nothing
            } else if (node._childrenBoneNode.length < node._parentBoneNode.length) {
              // parents less than children, move to children
              node.x = minChildrenLevel - 1;
            } else {
              // parents = children, do nothing;
            }
          }
        });
      } else {
        //无环
        if (nodes.length > 0) {
          nodes[0].x = 0;
          boneNodes = [nodes[0]];
        } else {
          boneNodes = [];
        }
      }

      // 添加节点
      boneNodes.forEach(function (d) {
        d._levelSetted = true;
      });
      remainingNodes = boneNodes;
      nextNodes = [];
      while (remainingNodes.length) {
        nextNodes = [];
        remainingNodes.forEach(function(node) {
          node.sourceLinks.forEach(function(link) {
            var n = link.target;
            if (!n._levelSetted) {
              n.x = node.x + 1;
              node._levelSetted = true;
              nextNodes.push(n);
            }
          });
          node.targetLinks.forEach(function(link) {
            var n = link.source;
            if (!n._levelSetted) {
              n.x = node.x - 1;
              node._levelSetted = true;
              nextNodes.push(n);
            }
          });
        });
        remainingNodes = nextNodes;
      }
      //调整节点的最小层为0
      var minLevel = d3.min(nodes, function (d) { 
        return d.x;
      });
      nodes.forEach(function (d) {
        d.x -= minLevel;
      });
    }

    function moveSourcesRight() {
      nodes.forEach(function(node) {
        if (!node.targetLinks.length) {
          node.x = d3.min(node.sourceLinks, function(d) { return d.target.x; }) - 1;
        }
      });
    }

    function moveSinksRight(x) {
      nodes.forEach(function(node) {
        if (!node.sourceLinks.length) {
          node.x = x - 1;
        }
      });
    }

    function scaleNodeBreadths(kx) {
      nodes.forEach(function(node) {
        node.x *= kx;
      });
    }

    function computeNodeDepths(iterations) {
      nodesByLevel = d3.nest()
          .key(function(d) { return d.x; })
          //.sortKeys(d3.ascending)
          .sortKeys(function (a, b) { return a - b; })
          .entries(nodes)
          .map(function(d) { return d.values; });

      // get sequence;
      initializeNodeDepth();
      //force layout in y dimension to get sequence
      forceLayout(5);
      setNodeLinkByLevel();
      reorderNodeLink(50);
      // get location;
      //resolveCollisions();

      /*
      initializeNodeDepth();
      resolveCollisions();
      for (var alpha = 0.99; iterations > 0; --iterations) {
        relaxRightToLeft2(alpha *= .99);
        resolveCollisions();
        relaxLeftToRight2(alpha);
        resolveCollisions();
      }
      */

      function initializeNodeDepth() {
        nodeSpace = d3.min(nodesByLevel, function(nodes) {
          return 1 / (nodes.length - paddingSpaceRatio) * (1 - paddingSpaceRatio);
        });
        nodePadding = nodeSpace / (1 - paddingSpaceRatio) * paddingSpaceRatio;

        nodesByLevel.forEach(function(nodes) {
          nodes.forEach(function(node, i, arr) {
            //node.y = 0.5 + (i + 1 / 2 - arr.length / 2) * (nodeSpace + nodePadding) - nodeSpace / 2;
            node.y = (arr.length === 1) ? (0.5 - nodeSpace / 2) : i / (arr.length - 1) * (1 - nodeSpace);
            node.dy = nodeSpace;
          });
        });
      }

      function forceLayout (iteration) {
        nodes.forEach(function (d) {
          d.y -= 0.5;
          d._y = d.y + d.dy / 2;
        });
        // determin node sequence
        for (var alpha = 0.99; iterations > 0; --iterations) {
          alpha *= alpha;
          nodesByLevel.forEach(function (levelNodes) {
            levelNodes.forEach(function (node) {
              var y = d3.sum(node.sourceLinks, function (link) {
                return link.target._y * (1 + Math.abs(link.target.x - node.x) / 10);
              });
              y += d3.sum(node.targetLinks, function (link) {
                return link.source._y * (1 + Math.abs(link.source.x - node.x) / 10);
              });
              y = y / (node.sourceLinks.length + node.targetLinks.length);
              node._y += (y - node._y) * alpha;// * 2;
            });
          });
          nodes.forEach(function (node) {
            node.y = node._y;
          });
        }
        //
        /*
        console.log(nodes);
        nodesByLevel.forEach(function (levelNodes) {
          levelNodes.sort(function (a, b) {
            return a.y - b.y;
          });
          levelNodes.forEach(function (d, i) {
            d.levelNodeIndex = i;
          });
        });
        */
      }

      function setNodeLinkByLevel () {
        nodeLinkByLevel = [];
        nodesByLevel.forEach(function (levelNodes) {
          nodeLinkByLevel.push(levelNodes.slice(0));
        });
        nodesByLevel.forEach(function (levelNodes) {
          levelNodes.forEach(function (node) {
            node.sourceLinks.forEach(function (link) {
              var s = link.source;
              var t = link.target;
              link.levelEl = [];
              for (var i = s.x + 1, l = t.x; i < l; i++) {
                var linkLevelEl = {
                  level: i,
                  link: link,
                  w: 0,
                  //h: 0,
                  y: Math.abs(s.y) > Math.abs(t.y) ? s.y : t.y
                };
                link.levelEl.push(linkLevelEl);
                nodeLinkByLevel[i].push(linkLevelEl);
              }
            });
          });
        });
        nodeLinkByLevel.forEach(function (levelEls) {
          levelEls.sort(function (a, b) {
            return a.y - b.y;
          });
        });
        nodeLinkByLevel.forEach(function (levelEls) {
          var count = -1;
          levelEls.forEach(function (d, i) {
            if (typeof d.sourceLinks !== 'undefined' && d.sourceLinks.length > 0) {
              count += 1;
              d.linkLevelIndex = count;
            }
            
            d.levelIndex = i;
            d.levelEls = levelEls;
          });
          levelEls.nodesAsSourceNum = count + 1;
        });
      }

      //同级拉开间距
      function reorderNodeLink (times) {
        //init
        nodes.forEach(function (d) {
          d.w = d.w || defaultNodeWidth;
          d.h = d.h || defaultNodeHeight;
        });
        nodeLinkByLevel.forEach(function (levelEls) {
          levelEls.forEach(function (el, i) {
            if (i === 0 ) {
              el.y = 0;
            } else {
              var pre = levelEls[i - 1];
              var padding = getElsPadding(pre, el);
              pre._rightPadding = padding;
              pre._rightEl = el;
              el._leftPadding = padding;
              el._leftEl = pre;
              el.y = Math.max(el.y, pre.y + pre.w + padding);
            }
          });
        });
        
        var i;
        for (i = 0; i < times; i++) {
          levelMove();
        }

        //move
        function levelMove () {
          nodeLinkByLevel.forEach(function (levelEls) {
            //total Move
            var step = 10;
            var move = 0;
            var originDis = getLevelDis(levelEls, 0);
            var lastDis;
            var lastMove = 0;
            var recentDis;
            //total move left
            lastDis = originDis;
            move = -step;
            while ((recentDis = getLevelDis(levelEls, move)) < lastDis) {
              lastMove = move;
              move -= step;
              lastDis = recentDis;
            }
            //total move right
            lastDis = originDis;
            move = step;
            while ((recentDis = getLevelDis(levelEls, move)) < lastDis) {
              lastMove = move;
              move += step;
              lastDis = recentDis;
            }
            levelEls.forEach(function (d) {
              //d._y = d.y + lastMove;
              d.y = d.y + lastMove;
            });
    
            //single El move 
            levelEls.forEach(function (el) {
              var step = 10;
              var move = 0;
              var originDis = getElLevelDis(el, 0);
              var lastDis;
              var lastMove = 0;
              var recentDis;
              //single move left
              lastDis = originDis;
              move = -step;
              var leftBound = (typeof el._leftEl === 'undefined')
                            ? -Infinity
                            : el._leftEl.y + el._leftEl.w + el._leftPadding;
              while ((recentDis = getElLevelDis(el, move)) < lastDis && (el.y + move >= leftBound)) {
                lastMove = move;
                move -= step;
                lastDis = recentDis;
              }
              //single move right
              lastDis = originDis;
              move = step;
              var rightBound = (typeof el._rightEl === 'undefined')
                            ? Infinity
                            : el._rightEl.y - el.w - el._rightPadding;
              while ((recentDis = getElLevelDis(el, move)) < lastDis && (el.y + move <= rightBound)) {
                lastMove = move;
                move += step;
                lastDis = recentDis;
              }
              el.y = el.y + lastMove;
              //el._y = el._y + lastMove;
            });
          });

          /*
          nodeLinkByLevel.forEach(function (levelEls) {
            levelEls.forEach(function (el) {
              el.y = el._y;
            });
          });
          */
        };

        function getLevelDis (levelEls, move) {
          return d3.sum(levelEls, function (d) {
            return getElLevelDis(d, move);
          });
        }
        function getElLevelDis (el, move) {
          var getCenter = function (el) {
            return el.y + el.w / 2;
          };
          var getTwoElsDis = function (el1, el2) {
            return Math.abs(getCenter(el1) + move - getCenter(el2));
          };
          //If node has more links, then it's links are more powerful
          var getElPower = function (el) {
            return  1 + (el.sourceLinks.length + el.targetLinks.length) / 100;
          };
          var dis = 0;
          if (typeof el.sourceLinks !== 'undefined') {
            //node
            el.targetLinks.forEach(function (link, i) {
              if (link.levelEl.length === 0) {
                // to node;   
                dis += getTwoElsDis(el, link.source) * getElPower(link.source); 
              } else {
                // to long link
                dis += getTwoElsDis(el, link.levelEl[link.levelEl.length - 1]) * 2;
              }
            });
            el.sourceLinks.forEach(function (link, i) {
              if (link.levelEl.length === 0) {
                // to node
                dis += getTwoElsDis(el, link.target) * getElPower(link.target);
              } else {
                // to long link
                dis += getTwoElsDis(el, link.levelEl[0]) * 2;
              }
            });
          } else {
            //level link
            var sourceLevel = el.link.source.x;
            var preIsNode = el.level === sourceLevel + 1;
            var pre = preIsNode ? el.link.source : el.link.levelEl[el.level - (sourceLevel + 1) - 1];
            var targetLevel = el.link.target.x;
            var proIsNode = el.level === targetLevel - 1;
            var pro = proIsNode ? el.link.target : el.link.levelEl[el.level - (sourceLevel + 1) + 1];
            dis += getTwoElsDis(el, pre) * (preIsNode ? 2 : 3);
            dis += getTwoElsDis(el, pro) * (proIsNode ? 2 : 3);
          }
          return dis;
        }
      }

      function getElsPadding (el1, el2) {
        var type1 = typeof el1.sourceLinks !== 'undefined' ? 'node' : 'link';
        var type2 = typeof el2.sourceLinks !== 'undefined' ? 'node' : 'link';
        if (type1 === 'node' && type2 === 'node') {
          return nnSpace;
        } else if (type1 === 'link' && type2 === 'link') {
          return llSpace;
        } else {
          return nlSpace;
        }
      }

      function relaxLeftToRight2(alpha) {
        nodesByLevel.forEach(function(nodes, breadth) {
          nodes.forEach(function(node) {
            if (node.sourceLinks.length + node.targetLinks.length > 0) {
              var y = (d3.sum(node.sourceLinks, weightedTarget) + d3.sum(node.targetLinks, weightedSource)) / (node.sourceLinks.length + node.targetLinks.length);
              node.y += (y - center(node)) * alpha;
            }
          });
        });

        function weightedTarget(link) {
          return center(link.target);
        }
        function weightedSource(link) {
          return center(link.source);
        }
      }

      function relaxRightToLeft2(alpha) {
        nodesByLevel.slice().reverse().forEach(function(nodes, breadth) {
          nodes.forEach(function(node) {
            if (node.sourceLinks.length + node.targetLinks.length > 0) {
              var y = (d3.sum(node.sourceLinks, weightedTarget) + d3.sum(node.targetLinks, weightedSource)) / (node.sourceLinks.length + node.targetLinks.length);
              node.y += (y - center(node)) * alpha;
            }
          });
        });

        function weightedTarget(link) {
          return center(link.target);
        }
        function weightedSource(link) {
          return center(link.source);
        }
      }

      function relaxLeftToRight(alpha) {
        nodesByLevel.forEach(function(nodes, breadth) {
          nodes.forEach(function(node) {
            if (node.sourceLinks.length) {
              var y = d3.sum(node.sourceLinks, weightedTarget) / node.sourceLinks.length;
              node.y += (y - center(node)) * alpha;
            }
          });
        });

        function weightedTarget(link) {
          return center(link.target);
        }
      }

      function relaxRightToLeft(alpha) {
        nodesByLevel.slice().reverse().forEach(function(nodes) {
          nodes.forEach(function(node) {
            if (node.targetLinks.length) {
              var y = d3.sum(node.targetLinks, weightedSource) / node.targetLinks.length;
              node.y += (y - center(node)) * alpha;
            }
          });
        });

        function weightedSource(link) {
          return center(link.source);
        }
      }

      function ascendingDepth(a, b) {
        return a.y - b.y;
      }
    }

    function computeLinkDepths() {
      nodes.forEach(function(node) {
        node.sourceLinks.sort(ascendingTargetDepth);
        node.targetLinks.sort(ascendingSourceDepth);
      });
      nodes.forEach(function(node) {
        // source ratio and target ratio
        node.sourceLinks.forEach(function(link, i, arr) {
          if (linkCombine === true) {
            link.sr = 0.5 * link.source.w;
          } else {
            link.sr = (((i + 1) / (arr.length + 1) - 0.5) * 0.6 + 0.5) * link.source.w;
          }
        });
        node.targetLinks.forEach(function(link, i, arr) {
          if (linkCombine === true) {
            link.tr = 0.5 * link.target.w;
          } else {
            link.tr = (((i + 1) / (arr.length + 1) - 0.5) * 0.6 + 0.5) * link.target.w;
          }
        });
      });

      function ascendingSourceDepth(a, b) {
        return a.source.y - b.source.y;
      }

      function ascendingTargetDepth(a, b) {
        return a.target.y - b.target.y;
      }
    }

    function center(node) {
      return node.y + node.dy / 2;
    }

    return sankey;
  };











};
window.ActDag = ActDag;




