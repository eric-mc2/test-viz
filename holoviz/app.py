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