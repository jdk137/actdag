
d3.json("exampleStateMachine.json", function(fData) {

  /* store old layout */
  function createStore() {
    var top = 10; // max elements in store
    var index = 0;  // recent index in store.
    var head = 0; // how many useful elements in store.
    var array = [];
    var store = {};
    store.save = function (data) {
      array[index] = data;
      index += 1;
      if (index > top) {
        array = array.slice(1, top + 1);
        index = top;
      }
      head = index;
    };
    store.load = function () {
      return array[index - 1] || {nodes: [], links: []} ; // array[-1] === undefined
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
    store.getInfo = function () {
      return {
        top: top,
        index: index,
        head: head,
        array: array
      };
    };
    return store;
  }
  var setBackForwardButton = function () {
    $('#backward').attr('disabled', store.canGetBack() ? false : 'disabled');
    $('#forward').attr('disabled', store.canGetForward() ? false : 'disabled');
  };
  var store = createStore();
  $('#backward').click(function () {
    var t = store;
    if (store.canGetBack()) {
      store.getBack();
      store = createStore();//防止render时现有store被覆盖。
      dag = createDag(t.load());
      store = t;//回复现有store。
      setBackForwardButton();
    }
  });
  $('#forward').click(function () {
    var t = store;
    if (store.canGetForward()) {
      store.getForward();
      store = createStore();//防止render时现有store被覆盖。
      dag = createDag(t.load());
      store = t;//回复现有store。
      setBackForwardButton();
    }
  });

  var createDag = function (fData) {
    var container = "statemachine-demo";
    $(container).empty();
    var dag = new ActDag({
      data: {nodes: [], links: []}, //fData, 详细格式请参考具体数据示例
      container: container,
      nodeHeight: 40, //node height
      nodeWidth: 160, //node width
      /* 最重要的函数，用户可以自定义节点的内容。内容可以是html5的div dom 节点。可以绑定双击、单击事件。并可以将dom节点绑定到数据对象中*/
      drawNode: function (node) {
        var c = $('<div xmlns="http://www.w3.org/1999/xhtml"></div>')
            .attr("class", "foreignNode") // warning! to this app, class='foreignNode' is necessary.
            .css({
              'background-color': "green"
            });
        var top = $('<div class="node-content">'
            + '<div class="node-icon">&nbsp;</div>'
            + '<div class="node-name">' + node.name + '</div>'
            + '</div>'
            );
        var bottom = $('<div class="node-bar">'
            + '<div class="node-type">' + 'virtualNode' + '</div>'
            + '</div>'
            );
        $('<div/>').append(top).append(bottom).appendTo(c);
        node._elem = c; //将dom节点绑定到数据对象中
        return c;
      },
      nodeAddedCallback: function (node) {
        console.log('Node added. ' + JSON.stringify(node));
        store.save(dag.dump());
        setBackForwardButton();
      },
      nodeDeletedCallback: function (node) {
        console.log('Node deleted. ' + JSON.stringify(node));
        store.save(dag.dump());
        setBackForwardButton();
      },
      nodeAddFailCallback: function (info) {
        alert('Fail to add node. ' + JSON.stringify(info));
      },
      linkAddFailCallback: function (info) {
        if (info.message === 'looped') {
          alert('连线不能成环');
        } else if (info.message === 'existed') {
          alert('连线已存在');
        }
      },
      linkAddedCallback: function (link) {
        console.log('Link added. ' + JSON.stringify(link));
        var nodeDom = dag.getJQueryNodeById(link.source);
        var data = nodeDom.data('node');
        console.log(data);
        store.save(dag.dump());
        setBackForwardButton();
      },
      linkDeletedCallback: function (link) {
        console.log('Link deleted. ' + JSON.stringify(link));
        store.save(dag.dump());
        setBackForwardButton();
      },
      linkRightClickCallback: function (link) {
        /*
        console.log('Link deleted. ' + link.source + ', ' + link.target);
        console.log(link.event);
        dag.deleteLink({
          source: link.source,
          target: link.target
        });
        */
      }
    });
    dag.setSource(fData); //添加数据
    dag.render(); //渲染
    store.init();
    store.save(dag.dump());
    setBackForwardButton();
    return dag;
  };

  var dag = createDag(fData);

  //接口示例
  //添加多个节点
  $('#addNodes').click(function () {
    var random = Math.floor(Math.random() * 100000);
    dag.addNodes([
      {id: 'n-1-' + random, name: 'n-1-' + random},
      {id: 'n-2-' + random, name: 'n-2-' + random},
      {id: 'n-3-' + random, name: 'n-3-' + random}
    ]);
  });
  //添加单个节点
  $('#addNode').click(function () {
    var random = Math.floor(Math.random() * 100000);
    dag.addNode({id: 'n-' + random, name: 'n-' + random});
  });
  //添加已存在节点
  $('#addExistedNode').click(function () {
    var random = Math.floor(Math.random() * 100000);
    //dag.addNode({id: 'n-' + random, name: 'n-' + random});
    dag.addNode({id: 'phone1', name: 'phone1'});
  });
  //获取存储数据
  $('#save').click(function () {
    var data = dag.getSaveData();
    if (data.message === 'isolated') {
      alert('存在孤立节点或节点群，不能保存');
    } else if (data.message === 'looped') {
      alert('存在循环，不能保存');
    } else if (data.message === 'ok') {
      alert('可以保存。' + JSON.stringify(data));
    }
  });
  $('#dump').click(function () {
    var data = dag.dump();
    console.log(data);
  });

  // 用户自定义交互
  //click
  dag.container.on("click", '.w', function (e) {
    var node = $(this).data('node');
    var id = node.id;
    alert('click ' + id);
  });
  //right click 并删除节点
  dag.container.on("contextmenu", '.w', function (e) {
    var node = $(this).data('node');
    var id = node.id;
    alert('right click and delete ' + id);
    dag.deleteNode(node);
  });
  //mouseenter
  dag.container.on("mouseenter", '.w', function (e) {
    var node = $(this).data('node');
    var id = node.id;
    console.log('enter ' + id);
  });
  //mouseleave
  dag.container.on("mouseleave", '.w', function (e) {
    var node = $(this).data('node');
    var id = node.id;
    console.log('leave ' + id);
  });


  window.store = store;
});






