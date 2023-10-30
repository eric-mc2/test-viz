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
  const env_spec = ['https://cdn.holoviz.org/panel/wheels/bokeh-3.3.0-py3-none-any.whl', 'https://cdn.holoviz.org/panel/1.3.0/dist/wheels/panel-1.3.0-py3-none-any.whl', 'pyodide-http==0.2.1', 'holoviews', 'numpy', 'pandas']
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
import holoviews as hv
import panel as pn

hv.extension('bokeh')

# nb: I've only had luck loading these from URLs. Not from local paths.
nodes = pd.read_csv("https://raw.githubusercontent.com/eric-mc2/test-viz/main/data/nodes.csv", index_col=False)
edges = pd.read_csv("https://raw.githubusercontent.com/eric-mc2/test-viz/main/data/edges.csv", index_col=False)

# # # I think hv edges need an actual integer source and target
# nodes.index.name = 'idx'
# nodes = nodes.reset_index()
# edges['source_idx'] = edges['source'].map(nodes.set_index('id')['idx'])
# edges['target_idx'] = edges['target'].map(nodes.set_index('id')['idx'])

# Reposition LCC and non-LCC so they're not overlapping
x_min, x_max = nodes['x'].min(), nodes['x'].max()
x_pad = (x_max - x_min) * .1
nodes.loc[nodes['lcc'] == 0, 'x'] += x_max + x_pad

# Select properties to view
nodes = nodes.drop(columns='category').rename(columns={'pretty_category':'category'})

# Create holoviews graph
# hv_nodes = hv.Nodes(nodes, kdims=['x','y','idx'], vdims=['name','category','state_abbrv'])
# hv_graph = hv.Graph(((edges['source_idx'], edges['target_idx'],edges['amount']), hv_nodes), vdims='amount')
hv_nodes = hv.Nodes(nodes, kdims=['x','y','id'], vdims=['name','category','state_abbrv'])
hv_graph = hv.Graph(((edges['source'], edges['target'],edges['amount']), hv_nodes), vdims='amount')

hv_opts = dict(
    # Holoviews arrowheads are all messed up:
    # https://github.com/holoviz/holoviews/issues/3562
    # Even using arrowhead_length = .01 and aspect='equal'
    # It's hard to tell an arrow vs an edge since it's not filled.
    directed=False,
    # Holoviews node sizes are zoom-invariant, which is annoying.
    node_size=8, 
    tools=['hover'], 
    xaxis=None, 
    yaxis=None,
    height=800,
    width=960,
    title="Police Foundation Donations")

pn.panel(hv_graph.opts(**hv_opts)).servable()

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