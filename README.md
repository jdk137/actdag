dag based on jsplumb.
=======

Like https://github.com/jdk137/dag, but user can add link through interactives. User can adjust every node's location and linkage, to get the layout data.

You can diy any style and interactive callback as you wish.

![example image](https://raw.githubusercontent.com/jdk137/actdag/master/actDag.png)

There are 4 online demos:
[basic](https://cdn.rawgit.com/jdk137/actdag/master/demo/actDag/index.html) basic usage example.
[multi](https://cdn.rawgit.com/jdk137/actdag/master/demo/actDag/multiInstance.html) no conflict with multiComponent in one page.
[recover](https://cdn.rawgit.com/jdk137/actdag/master/demo/actDag/recovering.html) backward and forward of previous actions.
[no loc](https://cdn.rawgit.com/jdk137/actdag/master/demo/actDag/index.html) show how to layout nodes and links automatically.

the component provide these APIs:
drawNode,
addLink, deleteLink, addLinks, getLinks,
addNode, deleteNode, deleteNode, getNodes,
setSource,
getSaveData;

and these callbacks:
nodeAddedCallback
nodeDeletedCallback
nodeAddFailCallback
linkAddedCallback
linkDeletedCallback
linkAddFailCallback
linkRightClickCallback

the data structure with loc
```
{"nodes":[
	{"id":"opened","name":"opened","loc":{"left":"120","top":"60"}},
	{"id":"phone1","name":"phone1","loc":{"left":"420","top":"144"}},
	{"id":"phone2","name":"phone2","loc":{"left":"336","top":"288"}},
	{"id":"inperson","name":"inperson","loc":{"left":"144","top":"276"}},
	{"id":"rejected","name":"rejected","loc":{"left":"120","top":"420"}}
],
"links":[
	{"source":"opened","target":"phone1"},
	{"source":"phone1","target":"inperson"},
	{"source":"phone1","target":"phone2"}
]}
```

the data structure without loc (auto layout)
```
{"nodes":[
	{"id":"opened","name":"opened","testAttr":"test"},
	{"id":"phone1","name":"phone1"},
	{"id":"phone2","name":"phone2"},
	{"id":"inperson","name":"inperson"},
	{"id":"rejected","name":"rejected"}
],
"links":[
	{"source":"opened","target":"phone1"},
	{"source":"phone1","target":"inperson"},
	{"source":"phone1","target":"phone2"},
	{"source":"phone2","target":"rejected"}
]}
```

You can expand the json as you wish.

