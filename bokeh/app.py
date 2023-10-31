import numpy as np
import pandas as pd
from bokeh.io import save
from bokeh.models import Range1d, Circle, ColumnDataSource, MultiLine, EdgesAndLinkedNodes, NodesAndLinkedEdges
from bokeh.plotting import figure
from bokeh.transform import linear_cmap, factor_cmap
from bokeh.models.graphs import StaticLayoutProvider
from bokeh.models.renderers import GraphRenderer

# nb: I've only had luck loading these from URLs. Not from local paths.
nodes = pd.read_csv("https://raw.githubusercontent.com/eric-mc2/test-viz/main/data/nodes.csv", index_col=False)
edges = pd.read_csv("https://raw.githubusercontent.com/eric-mc2/test-viz/main/data/edges.csv", index_col=False)

# Add integer indexes for bokeh
nodes.index.name = 'index'
nodes = nodes.reset_index()
edges['start'] = edges['source'].map(nodes.set_index('id')['index'])
edges['end'] = edges['target'].map(nodes.set_index('id')['index'])

# Reposition LCC and non-LCC so they're not overlapping
x_min, x_max = nodes['x'].min(), nodes['x'].max()
x_pad = (x_max - x_min) * .1
nodes.loc[nodes['lcc'] == 0, 'x'] += x_max + x_pad

# Compute degrees
in_degree = edges.groupby('target')['source'].nunique().rename('in_degree')
out_degree = edges.groupby('source')['target'].nunique().rename('out_degree')
degree = pd.concat([in_degree, out_degree], axis=1)
degree = degree['in_degree'].fillna(0) + degree['out_degree'].fillna(0)
nodes['degree'] = nodes['id'].map(degree).fillna(0)

# Style mappings
edge_color_attr = 'target_category'
edge_highlight_color = 'black'
node_highlight_color = 'white'
node_size_attr = 'node_size'
node_color_attr = 'pretty_category'
node_color_palette = {'Private-ish': "#668DE5",
    'LEOs' : "#062160",
    'Havens' : "#F2BE57",
    'Boosters' : "#901400",
    'Connectors' : "#40B363",
    'Other Foundations': "#D4D4D4",
    'Government': "#D4D4D4"}

# Node size
min_node_size = 2
max_node_size = 10
nodes['node_size'] = min_node_size + max_node_size * (nodes['degree']  - nodes['degree'].min()) / (nodes['degree'].max() - nodes['degree'].min())

# Edge colors
edges['target_category'] = edges['target'].map(nodes.set_index('id')['pretty_category'])

#Establish which categories will appear when hovering over each node
HOVER_TOOLTIPS = [
       ("Name", "@name"),
       ("Category", "@pretty_category"),
]

#Create a plot — set dimensions, toolbar, and title
plot = figure(tooltips = HOVER_TOOLTIPS,
            tools="pan,wheel_zoom,save,reset", 
            active_scroll='wheel_zoom',
            sizing_mode = "stretch_both",
            title='Police Foundation Donations')
plot.axis.visible = False

#Create a network graph object
graph_renderer = GraphRenderer()
graph_renderer.node_renderer.data_source.data = nodes.to_dict(orient='list')
graph_renderer.edge_renderer.data_source.data = edges.to_dict(orient='list')
graph_layout = {id:(x,y) for id,x,y in nodes[['index','x','y']].itertuples(index=False)}
graph_renderer.layout_provider = StaticLayoutProvider(graph_layout=graph_layout)

# Declare renderer styling
node_cmap = factor_cmap(node_color_attr, list(node_color_palette.values()), list(node_color_palette.keys()))
edge_cmap = factor_cmap(edge_color_attr, list(node_color_palette.values()), list(node_color_palette.keys()))
# graph_renderer.node_renderer.glyph = Circle(size=node_size_attr, fill_color=node_cmap, line_color=node_cmap)
graph_renderer.node_renderer.glyph = Circle(size=node_size_attr, fill_color='white', line_color='black')
graph_renderer.edge_renderer.glyph = MultiLine(line_color=edge_cmap, line_alpha=0.5, line_width=1)

# Declare interactive styling
graph_renderer.node_renderer.hover_glyph = Circle(size=node_size_attr, fill_color=node_highlight_color, line_width=2)
graph_renderer.node_renderer.selection_glyph = Circle(size=node_size_attr, fill_color=node_highlight_color, line_width=2)
graph_renderer.edge_renderer.hover_glyph = MultiLine(line_color=edge_highlight_color, line_width=2)
graph_renderer.edge_renderer.selection_glyph = MultiLine(line_color=edge_highlight_color, line_width=2)
graph_renderer.selection_policy = NodesAndLinkedEdges()
graph_renderer.inspection_policy = NodesAndLinkedEdges()

# Bokeh doesn't do arrows either :'(
# https://discourse.bokeh.org/t/how-to-draw-directed-network-graphs/2874/5

plot.renderers.append(graph_renderer)

save(plot, filename="app.html")