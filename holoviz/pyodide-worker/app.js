importScripts("https://cdn.jsdelivr.net/pyodide/v0.23.4/pyc/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/wheels/bokeh-3.3.0-py3-none-any.whl', 'https://cdn.holoviz.org/panel/1.3.0/dist/wheels/panel-1.3.0-py3-none-any.whl', 'pyodide-http==0.2.1', 'holoviews', 'hvplot', 'networkx', 'numpy', 'pandas']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

import numpy as np
import pandas as pd
import networkx as nx
import holoviews as hv
from holoviews import opts
import panel as pn
import hvplot.pandas

hv.extension('bokeh')

# nb: I've only had luck loading these from URLs. Not from local paths.
# TODO: use requests to load the gml into memory to cut out this boilerplate.
nodes = pd.read_csv("https://raw.githubusercontent.com/eric-mc2/test-viz/main/data/nodes.csv", index_col=False)
edges = pd.read_csv("https://raw.githubusercontent.com/eric-mc2/test-viz/main/data/edges.csv", index_col=False)

G = nx.DiGraph()
for row in nodes.to_dict(orient='index').values():
    rowdata = {k:v for k,v in row.items() if k != 'id'}
    G.add_node(row['id'], **rowdata)

for row in edges.to_dict(orient='index').values():
    rowdata = {k:v for k,v in row.items() if k == 'count' or k == 'amount' or k == 'logamount'}
    G.add_edge(row['source'], row['target'], **rowdata)


# Reposition LCC and non-LCC so they're not overlapping
x_max = max(dict(G.nodes('x')).values())
x_min = min(dict(G.nodes('x')).values())
x_pad = (x_max - x_min) * .1
for _, nodedata in G.nodes(data=True):
    if nodedata['lcc'] == 0:
        nodedata['x'] += x_max + x_pad

# removing 'x' and 'y' attributes. they are reserved in Panel/Bokeh
node_positions = {n: (d['x'],d['y']) for n,d in G.nodes(data=True)}
for node,node_data in G.nodes(data=True):
    del node_data['x']
    del node_data['y']

hv_opts = dict(
    tools=['hover'], 
    xaxis=None, 
    yaxis=None,
    height=600,
    width=800)

net = hv.Graph.from_networkx(G, positions=node_positions).opts(**hv_opts)
pn.panel(net).servable()

await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.globals.set('patch', msg.patch)
    self.pyodide.runPythonAsync(`
    state.curdoc.apply_json_patch(patch.to_py(), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.globals.set('location', msg.location)
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads(location)
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()