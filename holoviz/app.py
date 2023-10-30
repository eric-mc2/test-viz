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